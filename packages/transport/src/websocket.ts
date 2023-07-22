import {
  type AuthProvider,
  type Clock,
  createStore,
  type IdGenerator,
  type Logger,
  type Peer,
  type ReconnectPolicy,
  type Room,
  TesseraError,
  type Transport,
  type TransportState,
  type UserInfo,
} from '@tessera/core';
import {
  type ClientMessage,
  decodeServerFrame,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '@tessera/protocol';
import { createMergeThrottle, createPeerList, type PeerList } from './util.js';

/** The subset of the WebSocket API the transport needs, so tests can inject sockets. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export const DEFAULT_RECONNECT: ReconnectPolicy = {
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: 0.3,
  maxQueue: 200,
};

export interface WebSocketTransportOptions {
  url: string;
  appId: string;
  auth: AuthProvider;
  ids: IdGenerator;
  clock: Clock;
  logger: Logger;
  reconnect?: Partial<ReconnectPolicy> | undefined;
  createSocket?: (url: string) => WebSocketLike;
  /** Time to wait for `welcome` after the socket opens. Default 10 s. */
  helloTimeoutMs?: number;
  /** Interval between `ping` frames. Default 25 s. */
  heartbeatMs?: number;
  /** Time to wait for `pong` before reconnecting. Default 10 s. */
  pongTimeoutMs?: number;
  /** A connection must stay open this long before the backoff resets. Default 10 s. */
  stableMs?: number;
  /** How long a request may wait for a connection before failing. Default 30 s. */
  queuedRequestTimeoutMs?: number;
  /** Default request timeout. Default 10 s. */
  requestTimeoutMs?: number;
  random?: () => number;
}

const OPEN = 1;
/** Close code the reference server uses for a rejected token. Reconnecting would not help. */
const CLOSE_UNAUTHORIZED = 4003;

interface QueuedFrame {
  frame: ClientMessage;
  /** Broadcast-style frames may be dropped when the queue is full; requests never are. */
  droppable: boolean;
}

interface PendingRequest {
  resolve(data: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout> | undefined;
  queueTimer: ReturnType<typeof setTimeout> | undefined;
  timeoutMs: number;
  sent: boolean;
}

interface WsRoomState {
  name: string;
  wire: string;
  peers: PeerList;
  presence: Record<string, unknown>;
  handlers: Map<string, Set<(data: unknown, from: Peer | 'server') => void>>;
  throttle: ReturnType<typeof createMergeThrottle>;
  room: Room;
  /** Settles when the server first acknowledges the join. */
  joined: Promise<Room>;
  /** Present until the first acknowledgement; later joins are automatic rejoins. */
  waiter:
    | {
        resolve(room: Room): void;
        reject(error: unknown): void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
}

/**
 * Transport for `tessera-server` (or any server speaking `@tessera/protocol`). Handles
 * reconnecting with jittered backoff, rejoining rooms, queueing while offline, heartbeats and
 * request/response correlation.
 */
export function createWebSocketTransport(opts: WebSocketTransportOptions): Transport {
  const policy: ReconnectPolicy = { ...DEFAULT_RECONNECT, ...opts.reconnect };
  const helloTimeoutMs = opts.helloTimeoutMs ?? 10_000;
  const heartbeatMs = opts.heartbeatMs ?? 25_000;
  const pongTimeoutMs = opts.pongTimeoutMs ?? 10_000;
  const stableMs = opts.stableMs ?? 10_000;
  const queuedRequestTimeoutMs = opts.queuedRequestTimeoutMs ?? 30_000;
  const defaultRequestTimeoutMs = opts.requestTimeoutMs ?? 10_000;
  const random = opts.random ?? Math.random;
  const log = opts.logger;

  const state = createStore<TransportState>('idle');
  const rooms = new Map<string, WsRoomState>();
  /** Outstanding join frames: join id → room. */
  const pendingJoins = new Map<string, WsRoomState>();
  const pendingRequests = new Map<string, PendingRequest>();
  let queue: QueuedFrame[] = [];

  let socket: WebSocketLike | null = null;
  let selfId = '';
  let selfUser: UserInfo = { id: '', name: '' };
  let attempt = 0;
  let everOpen = false;
  let userClosed = false;
  let fatal: TesseraError | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let welcomeTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;
  const connectWaiters: Array<{ resolve(): void; reject(error: unknown): void }> = [];

  // ---------- sending ----------

  const encode = (frame: ClientMessage): string => {
    const text = JSON.stringify(frame);
    if (new TextEncoder().encode(text).length > MAX_FRAME_BYTES) {
      throw new TesseraError('VALIDATION', `Frame exceeds the ${MAX_FRAME_BYTES} byte limit`);
    }
    return text;
  };

  const isOpen = (): boolean => state.get() === 'open' && socket?.readyState === OPEN;

  const sendNow = (frame: ClientMessage): void => socket?.send(encode(frame));

  /** The bound applies to droppable frames only; queued requests expire on their own timer. */
  const enqueue = (entry: QueuedFrame): void => {
    queue.push(entry);
    if (queue.filter((q) => q.droppable).length <= policy.maxQueue) return;
    const at = queue.findIndex((q) => q.droppable);
    if (at >= 0) queue.splice(at, 1);
  };

  /** Sends now when connected, otherwise queues (or drops, for frames that are stale on reconnect). */
  const dispatchFrame = (
    frame: ClientMessage,
    onOffline: 'queue' | 'queue-droppable' | 'drop',
  ): void => {
    encode(frame); // validate size eagerly so callers see the error at the call site
    if (isOpen()) {
      sendNow(frame);
    } else if (onOffline !== 'drop') {
      enqueue({ frame, droppable: onOffline === 'queue-droppable' });
    }
  };

  const flushQueue = (): void => {
    const pending = queue;
    queue = [];
    for (const { frame } of pending) {
      if (frame.t === 'req') startRequestClock(frame.id);
      try {
        sendNow(frame);
      } catch (error) {
        log.warn('could not flush queued frame', error);
      }
    }
  };

  // ---------- requests ----------

  const settleRequest = (id: string): PendingRequest | undefined => {
    const p = pendingRequests.get(id);
    if (!p) return undefined;
    pendingRequests.delete(id);
    if (p.timer) clearTimeout(p.timer);
    if (p.queueTimer) clearTimeout(p.queueTimer);
    return p;
  };

  const startRequestClock = (id: string): void => {
    const p = pendingRequests.get(id);
    if (!p) return;
    p.sent = true;
    if (p.queueTimer) clearTimeout(p.queueTimer);
    p.queueTimer = undefined;
    p.timer = setTimeout(() => {
      settleRequest(id)?.reject(
        new TesseraError('TIMEOUT', `Request timed out after ${p.timeoutMs} ms`),
      );
    }, p.timeoutMs);
  };

  const failSentRequests = (): void => {
    for (const [id, p] of [...pendingRequests]) {
      if (!p.sent) continue;
      settleRequest(id)?.reject(
        new TesseraError('TRANSPORT_CLOSED', 'The connection was lost before the server answered'),
      );
    }
  };

  // ---------- rooms ----------

  const lookupPeer = (r: WsRoomState, peerId: string): Peer =>
    r.peers.get(peerId) ?? { peerId, user: { id: peerId, name: 'Unknown' }, presence: {} };

  const dispatchToRoom = (
    r: WsRoomState,
    topic: string,
    data: unknown,
    from: Peer | 'server',
  ): void => {
    for (const fn of [...(r.handlers.get(topic) ?? [])]) {
      try {
        fn(data, from);
      } catch (error) {
        log.error(`handler for "${topic}" threw`, error);
      }
    }
  };

  const sendJoin = (r: WsRoomState): void => {
    const id = opts.ids.next();
    pendingJoins.set(id, r);
    sendNow({ t: 'join', id, room: r.wire, presence: r.presence as never });
  };

  const settleWaiter = (r: WsRoomState, error?: unknown): void => {
    const waiter = r.waiter;
    if (!waiter) return;
    r.waiter = undefined;
    clearTimeout(waiter.timer);
    if (error === undefined) waiter.resolve(r.room);
    else waiter.reject(error);
  };

  const dropRoom = (r: WsRoomState): void => {
    rooms.delete(r.wire);
    r.throttle.cancel();
    r.peers.clear();
  };

  const createRoom = (name: string, presence: Record<string, unknown>): WsRoomState => {
    const wire = `${opts.appId}/${name}`;
    const r: WsRoomState = {
      name,
      wire,
      peers: createPeerList(),
      presence: { ...presence },
      handlers: new Map(),
      throttle: createMergeThrottle(100, (patch) => {
        if (isOpen()) sendNow({ t: 'presence', room: wire, patch: patch as never });
      }),
      room: undefined as unknown as Room,
      joined: undefined as unknown as Promise<Room>,
      waiter: undefined,
    };
    r.joined = new Promise<Room>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (isOpen()) sendNow({ t: 'leave', room: wire });
        dropRoom(r);
        r.waiter = undefined;
        reject(new TesseraError('TIMEOUT', `Joining "${name}" timed out`));
      }, queuedRequestTimeoutMs);
      r.waiter = { resolve, reject, timer };
    });
    // Rejections are delivered to whoever awaits `join()`; avoid an unhandled-rejection warning here.
    r.joined.catch(() => undefined);
    r.room = {
      name,
      get self(): Peer {
        return { peerId: selfId, user: selfUser, presence: r.presence };
      },
      peers: r.peers.store,
      publish: (topic, data) =>
        dispatchFrame({ t: 'pub', room: wire, topic, data: data as never }, 'queue-droppable'),
      send: (to, topic, data) =>
        dispatchFrame(
          { t: 'direct', room: wire, to, topic, data: data as never },
          'queue-droppable',
        ),
      request<T>(topic: string, data: unknown, o?: { timeoutMs?: number }): Promise<T> {
        if (state.get() === 'closed') {
          return Promise.reject(new TesseraError('TRANSPORT_CLOSED', 'The transport is closed'));
        }
        const id = opts.ids.next();
        const frame: ClientMessage = { t: 'req', id, room: wire, topic, data: data as never };
        try {
          encode(frame);
        } catch (error) {
          return Promise.reject(error);
        }
        return new Promise<T>((resolve, reject) => {
          const entry: PendingRequest = {
            resolve: resolve as (d: unknown) => void,
            reject,
            timer: undefined,
            queueTimer: undefined,
            timeoutMs: o?.timeoutMs ?? defaultRequestTimeoutMs,
            sent: false,
          };
          pendingRequests.set(id, entry);
          if (isOpen()) {
            startRequestClock(id);
            sendNow(frame);
          } else {
            entry.queueTimer = setTimeout(() => {
              queue = queue.filter((q) => !(q.frame.t === 'req' && q.frame.id === id));
              settleRequest(id)?.reject(
                new TesseraError(
                  'TRANSPORT_CLOSED',
                  `Not connected; gave up after ${queuedRequestTimeoutMs} ms`,
                ),
              );
            }, queuedRequestTimeoutMs);
            enqueue({ frame, droppable: false });
          }
        });
      },
      on(topic, fn) {
        let set = r.handlers.get(topic);
        if (!set) {
          set = new Set();
          r.handlers.set(topic, set);
        }
        const cb = fn as (data: unknown, from: Peer | 'server') => void;
        set.add(cb);
        return () => {
          set.delete(cb);
        };
      },
      setPresence(patch) {
        r.presence = { ...r.presence, ...patch };
        r.throttle(patch);
      },
      async leave() {
        if (rooms.get(wire) !== r) return;
        rooms.delete(wire);
        r.throttle.cancel();
        if (isOpen()) sendNow({ t: 'leave', room: wire });
        r.peers.clear();
      },
    };
    rooms.set(wire, r);
    return r;
  };

  // ---------- inbound frames ----------

  const handleFrame = (msg: ServerMessage): void => {
    switch (msg.t) {
      case 'welcome': {
        if (welcomeTimer) clearTimeout(welcomeTimer);
        selfId = msg.peerId;
        selfUser = msg.user as UserInfo;
        const reconnected = everOpen;
        everOpen = true;
        state.set('open');
        stableTimer = setTimeout(() => {
          attempt = 0;
        }, stableMs);
        heartbeatTimer = setInterval(sendPing, heartbeatMs);
        for (const r of rooms.values()) sendJoin(r);
        flushQueue();
        for (const waiter of connectWaiters.splice(0)) waiter.resolve();
        if (reconnected) log.info('reconnected');
        return;
      }
      case 'joined': {
        const r = pendingJoins.get(msg.id);
        pendingJoins.delete(msg.id);
        if (!r || rooms.get(r.wire) !== r) return;
        r.peers.set(msg.peers.filter((p) => p.peerId !== selfId) as Peer[]);
        if (r.waiter) settleWaiter(r);
        else dispatchToRoom(r, '$reconnected', undefined, 'server');
        return;
      }
      case 'peer-join':
        rooms.get(msg.room)?.peers.upsert(msg.peer as Peer);
        return;
      case 'peer-leave':
        rooms.get(msg.room)?.peers.remove(msg.peerId);
        return;
      case 'presence':
        rooms.get(msg.room)?.peers.patch(msg.peerId, msg.patch as Record<string, unknown>);
        return;
      case 'msg': {
        const r = rooms.get(msg.room);
        if (!r) return;
        dispatchToRoom(
          r,
          msg.topic,
          msg.data,
          msg.from === 'server' ? 'server' : lookupPeer(r, msg.from),
        );
        return;
      }
      case 'res': {
        const p = settleRequest(msg.id);
        if (!p) return;
        if (msg.ok) p.resolve(msg.data);
        else {
          const e = msg.error;
          p.reject(
            new TesseraError(
              e?.code ?? 'UNKNOWN',
              e?.message ?? 'Request failed',
              e?.details === undefined ? {} : { details: e.details },
            ),
          );
        }
        return;
      }
      case 'error': {
        const e = new TesseraError(
          msg.error.code,
          msg.error.message,
          msg.error.details === undefined ? {} : { details: msg.error.details },
        );
        const failedJoin = msg.ref ? pendingJoins.get(msg.ref) : undefined;
        if (msg.ref && failedJoin) {
          pendingJoins.delete(msg.ref);
          dropRoom(failedJoin);
          if (failedJoin.waiter) settleWaiter(failedJoin, e);
          else log.warn(`rejoining "${failedJoin.name}" failed`, e);
          return;
        }
        if (msg.ref && pendingRequests.has(msg.ref)) {
          settleRequest(msg.ref)?.reject(e);
          return;
        }
        log.warn('server error', e);
        return;
      }
      case 'pong':
        if (pongTimer) clearTimeout(pongTimer);
        pongTimer = undefined;
        return;
    }
  };

  // ---------- connection management ----------

  const clearConnectionTimers = (): void => {
    for (const t of [welcomeTimer, pongTimer, stableTimer]) if (t) clearTimeout(t);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    welcomeTimer = pongTimer = stableTimer = undefined;
    heartbeatTimer = undefined;
  };

  const sendPing = (): void => {
    if (!isOpen()) return;
    sendNow({ t: 'ping', ts: opts.clock.now() });
    pongTimer ??= setTimeout(() => {
      log.warn('no pong received; reconnecting');
      loseSocket(0);
    }, pongTimeoutMs);
  };

  const backoffDelay = (): number => {
    const base = Math.min(policy.maxDelayMs, policy.initialDelayMs * policy.factor ** attempt);
    return Math.max(0, Math.round(base * (1 + (random() * 2 - 1) * policy.jitter)));
  };

  const scheduleReconnect = (): void => {
    state.set('reconnecting');
    const delay = backoffDelay();
    attempt++;
    reconnectTimer = setTimeout(openSocket, delay);
  };

  const failEverything = (error: TesseraError): void => {
    for (const id of [...pendingRequests.keys()]) settleRequest(id)?.reject(error);
    pendingJoins.clear();
    for (const r of rooms.values()) settleWaiter(r, error);
    queue = [];
    for (const waiter of connectWaiters.splice(0)) waiter.reject(error);
  };

  /** Called when the socket closed, errored out or was declared dead. */
  const loseSocket = (code: number): void => {
    const dead = socket;
    socket = null;
    if (dead) {
      dead.onopen = dead.onmessage = dead.onclose = dead.onerror = null;
      try {
        dead.close();
      } catch {
        // Already closed.
      }
    }
    clearConnectionTimers();
    if (userClosed) return;
    failSentRequests();
    // Join acknowledgements from the dead connection will never arrive; rooms are rejoined on welcome.
    pendingJoins.clear();
    if (code === CLOSE_UNAUTHORIZED) {
      fatal = new TesseraError('UNAUTHORIZED', 'The server rejected the authentication token');
      state.set('closed');
      failEverything(fatal);
      return;
    }
    scheduleReconnect();
  };

  const openSocket = (): void => {
    reconnectTimer = undefined;
    if (userClosed) return;
    if (state.get() !== 'reconnecting') state.set('connecting');
    let ws: WebSocketLike;
    try {
      ws = opts.createSocket
        ? opts.createSocket(opts.url)
        : (new WebSocket(opts.url) as unknown as WebSocketLike);
    } catch (error) {
      log.warn('could not create socket', error);
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      welcomeTimer = setTimeout(() => {
        log.warn('no welcome from server; reconnecting');
        loseSocket(0);
      }, helloTimeoutMs);
      opts.auth
        .getToken()
        .then((token) => {
          if (socket !== ws) return;
          ws.send(
            JSON.stringify({
              t: 'hello',
              v: PROTOCOL_VERSION,
              token,
              appId: opts.appId,
            } satisfies ClientMessage),
          );
        })
        .catch((error: unknown) => {
          log.warn('could not get an auth token', error);
          if (socket === ws) loseSocket(0);
        });
    };
    ws.onmessage = (event) => {
      if (socket !== ws || typeof event.data !== 'string') return;
      const decoded = decodeServerFrame(event.data);
      if (!decoded.ok) {
        log.warn('ignoring invalid server frame:', decoded.reason);
        return;
      }
      handleFrame(decoded.msg);
    };
    ws.onclose = (event) => {
      if (socket === ws) loseSocket(event.code);
    };
    ws.onerror = () => {
      // Some runtimes (Node's built-in WebSocket) report a failed connect as `error` only,
      // without a following `close`. Treat it as a lost socket; `loseSocket` is idempotent.
      if (socket === ws) loseSocket(1006);
    };
  };

  const wakeUp = (): void => {
    if (state.get() === 'reconnecting' && reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      openSocket();
    } else if (isOpen()) {
      sendPing();
    }
  };
  const onVisibility = (): void => {
    if (
      (globalThis as { document?: { visibilityState?: string } }).document?.visibilityState ===
      'visible'
    )
      wakeUp();
  };

  const transport: Transport = {
    state,
    capabilities: { serverHistory: true, serverPersistence: true, directMessages: true },

    connect() {
      if (state.get() === 'open') return Promise.resolve();
      if (state.get() === 'closed') {
        return Promise.reject(
          fatal ?? new TesseraError('TRANSPORT_CLOSED', 'The transport was disconnected'),
        );
      }
      const promise = new Promise<void>((resolve, reject) =>
        connectWaiters.push({ resolve, reject }),
      );
      if (state.get() === 'idle') {
        globalThis.addEventListener?.('online', wakeUp);
        (globalThis as { document?: EventTarget }).document?.addEventListener?.(
          'visibilitychange',
          onVisibility,
        );
        openSocket();
      }
      return promise;
    },

    disconnect() {
      if (state.get() === 'closed') return;
      userClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearConnectionTimers();
      globalThis.removeEventListener?.('online', wakeUp);
      (globalThis as { document?: EventTarget }).document?.removeEventListener?.(
        'visibilitychange',
        onVisibility,
      );
      const ws = socket;
      socket = null;
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        try {
          ws.close(1000, 'client disconnect');
        } catch {
          // Already closed.
        }
      }
      failEverything(new TesseraError('TRANSPORT_CLOSED', 'The transport was disconnected'));
      for (const r of rooms.values()) {
        r.throttle.cancel();
        r.peers.clear();
      }
      rooms.clear();
      state.set('closed');
    },

    async join(name, o) {
      if (state.get() === 'closed') {
        throw fatal ?? new TesseraError('TRANSPORT_CLOSED', 'The transport was disconnected');
      }
      const existing = rooms.get(`${opts.appId}/${name}`);
      if (existing) return existing.joined;
      const r = createRoom(name, o?.presence ?? {});
      if (isOpen()) sendJoin(r);
      else if (state.get() === 'idle') void transport.connect().catch(() => undefined);
      // Otherwise the join frame goes out right after `welcome`, together with all rejoins.
      return r.joined;
    },
  };

  return transport;
}
