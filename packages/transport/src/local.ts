import {
  type Clock,
  createStore,
  type IdGenerator,
  type Logger,
  type Peer,
  type Room,
  TesseraError,
  type Transport,
  type TransportState,
  type Unsubscribe,
  type UserInfo,
} from '@tessera/core';
import { createMergeThrottle, createPeerList, withTimeout } from './util.js';

/** What a local request handler can do. It plays the role of the server for one request. */
export interface LocalHandlerContext {
  /** Room name without the app prefix, e.g. `chat:general`. */
  room: string;
  peerId: string;
  user: UserInfo;
  /** Delivers `topic` to everyone in the room, this tab included (like a server broadcast). */
  broadcast(topic: string, data: unknown): void;
}

export type LocalHandler = (data: unknown, ctx: LocalHandlerContext) => unknown | Promise<unknown>;

/** A transport that connects browser tabs of the same origin through `BroadcastChannel`. */
export interface LocalTransport extends Transport {
  readonly peerId: string;
  /** Registers an in-tab emulation of a server topic, used by `Room.request`. */
  registerHandler(topic: string, fn: LocalHandler): Unsubscribe;
}

/** Type guard for kits that want to register local emulators. */
export function isLocalTransport(t: Transport | null | undefined): t is LocalTransport {
  return !!t && typeof (t as Partial<LocalTransport>).registerHandler === 'function';
}

interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', fn: (event: MessageEvent) => void): void;
  close(): void;
}

export interface LocalTransportOptions {
  appId: string;
  channel?: string;
  user: () => UserInfo | null;
  ids: IdGenerator;
  clock: Clock;
  logger: Logger;
  /** Heartbeat and sweep interval. Default 5 s. */
  heartbeatMs?: number;
  /** A peer silent for this long is dropped. Default 15 s. */
  peerTimeoutMs?: number;
  createChannel?: (name: string) => ChannelLike;
}

type Envelope =
  | { k: 'announce'; room: string; peer: Peer }
  | { k: 'here'; room: string; to: string; peer: Peer }
  | { k: 'bye'; room: string; peerId: string }
  | { k: 'beat'; peerId: string }
  | { k: 'presence'; room: string; peerId: string; patch: Record<string, unknown> }
  | { k: 'msg'; room: string; topic: string; data: unknown; from: string; to?: string };

const KINDS = new Set(['announce', 'here', 'bye', 'beat', 'presence', 'msg']);
const isEnvelope = (v: unknown): v is Envelope =>
  typeof v === 'object' && v !== null && KINDS.has((v as { k?: string }).k ?? '');

interface RoomState {
  room: Room;
  selfPeer: Peer;
  peers: ReturnType<typeof createPeerList>;
  handlers: Map<string, Set<(data: unknown, from: Peer | 'server') => void>>;
  throttle: ReturnType<typeof createMergeThrottle>;
}

/**
 * Creates the `local` transport. Every tab is one peer; peers discover each other through
 * announce/here messages and heartbeats, and `request` is answered in-tab by registered handlers.
 */
export function createLocalTransport(opts: LocalTransportOptions): LocalTransport {
  const peerId = opts.ids.next();
  const state = createStore<TransportState>('idle');
  const channelName = `tessera:${opts.appId}:${opts.channel ?? 'default'}`;
  const heartbeatMs = opts.heartbeatMs ?? 5000;
  const peerTimeoutMs = opts.peerTimeoutMs ?? 15000;
  const handlers = new Map<string, LocalHandler>();
  const rooms = new Map<string, RoomState>();
  const lastSeen = new Map<string, number>();
  let channel: ChannelLike | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const prefix = `${opts.appId}/`;
  const wire = (name: string): string => `${prefix}${name}`;
  const unwire = (name: string): string | null =>
    name.startsWith(prefix) ? name.slice(prefix.length) : null;
  const me = (): UserInfo => opts.user() ?? { id: peerId, name: 'Anonymous' };
  const post = (env: Envelope): void => channel?.postMessage(env);
  const touch = (id: string): void => void lastSeen.set(id, opts.clock.now());

  const dispatch = (r: RoomState, topic: string, data: unknown, from: Peer | 'server'): void => {
    for (const fn of [...(r.handlers.get(topic) ?? [])]) {
      try {
        fn(data, from);
      } catch (error) {
        opts.logger.error(`handler for "${topic}" threw`, error);
      }
    }
  };

  const onHide = (): void => {
    for (const name of rooms.keys()) post({ k: 'bye', room: wire(name), peerId });
  };

  const onMessage = (event: MessageEvent): void => {
    const env: unknown = event.data;
    if (!isEnvelope(env)) return;
    switch (env.k) {
      case 'beat':
        touch(env.peerId);
        return;
      case 'announce': {
        const name = unwire(env.room);
        const r = name ? rooms.get(name) : undefined;
        if (!r) return;
        touch(env.peer.peerId);
        r.peers.upsert(env.peer);
        post({ k: 'here', room: env.room, to: env.peer.peerId, peer: { ...r.selfPeer } });
        return;
      }
      case 'here': {
        if (env.to !== peerId) return;
        const name = unwire(env.room);
        const r = name ? rooms.get(name) : undefined;
        if (!r) return;
        touch(env.peer.peerId);
        r.peers.upsert(env.peer);
        return;
      }
      case 'bye': {
        const name = unwire(env.room);
        const r = name ? rooms.get(name) : undefined;
        r?.peers.remove(env.peerId);
        return;
      }
      case 'presence': {
        const name = unwire(env.room);
        const r = name ? rooms.get(name) : undefined;
        if (!r) return;
        touch(env.peerId);
        r.peers.patch(env.peerId, env.patch);
        return;
      }
      case 'msg': {
        if (env.to !== undefined && env.to !== peerId) return;
        const name = unwire(env.room);
        const r = name ? rooms.get(name) : undefined;
        if (!r) return;
        if (env.from === 'server') {
          dispatch(r, env.topic, env.data, 'server');
          return;
        }
        touch(env.from);
        const from = r.peers.get(env.from) ?? {
          peerId: env.from,
          user: { id: env.from, name: 'Unknown' },
          presence: {},
        };
        dispatch(r, env.topic, env.data, from);
      }
    }
  };

  const sweep = (): void => {
    post({ k: 'beat', peerId });
    const now = opts.clock.now();
    for (const [id, seen] of lastSeen) {
      if (now - seen <= peerTimeoutMs) continue;
      lastSeen.delete(id);
      for (const r of rooms.values()) r.peers.remove(id);
    }
  };

  const createRoom = (name: string, presence: Record<string, unknown>): Room => {
    const r: RoomState = {
      selfPeer: { peerId, user: me(), presence: { ...presence } },
      peers: createPeerList(),
      handlers: new Map(),
      throttle: createMergeThrottle(100, (patch) =>
        post({ k: 'presence', room: wire(name), peerId, patch }),
      ),
      room: undefined as unknown as Room,
    };
    const handlerCtx = (): LocalHandlerContext => ({
      room: name,
      peerId,
      user: me(),
      broadcast(topic, data) {
        post({ k: 'msg', room: wire(name), topic, data, from: 'server' });
        dispatch(r, topic, data, 'server');
      },
    });

    r.room = {
      name,
      get self() {
        return r.selfPeer;
      },
      peers: r.peers.store,
      publish: (topic, data) => post({ k: 'msg', room: wire(name), topic, data, from: peerId }),
      send: (to, topic, data) =>
        post({ k: 'msg', room: wire(name), topic, data, from: peerId, to }),
      async request<T>(topic: string, data: unknown, o?: { timeoutMs?: number }) {
        const handler = handlers.get(topic);
        if (!handler) {
          throw new TesseraError(
            'NOT_FOUND',
            `No local handler for "${topic}". The kit that owns this topic must call registerHandler() on the local transport.`,
          );
        }
        const run = Promise.resolve().then(() => handler(data, handlerCtx()));
        return (await withTimeout(run, o?.timeoutMs ?? 10_000, `request "${topic}"`)) as T;
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
        r.selfPeer = { ...r.selfPeer, presence: { ...r.selfPeer.presence, ...patch } };
        r.throttle(patch);
      },
      async leave() {
        if (rooms.get(name) !== r) return;
        r.throttle.cancel();
        post({ k: 'bye', room: wire(name), peerId });
        rooms.delete(name);
        r.peers.clear();
      },
    };
    rooms.set(name, r);
    post({ k: 'announce', room: wire(name), peer: { ...r.selfPeer } });
    return r.room;
  };

  const transport: LocalTransport = {
    peerId,
    state,
    capabilities: { serverHistory: false, serverPersistence: false, directMessages: true },
    registerHandler(topic, fn) {
      handlers.set(topic, fn);
      return () => {
        if (handlers.get(topic) === fn) handlers.delete(topic);
      };
    },
    async connect() {
      if (state.get() === 'open') return;
      if (state.get() === 'closed') {
        throw new TesseraError('TRANSPORT_CLOSED', 'The local transport was disconnected');
      }
      if (typeof BroadcastChannel === 'undefined' && !opts.createChannel) {
        throw new TesseraError(
          'ADAPTER_MISSING',
          'BroadcastChannel is not available in this environment',
        );
      }
      channel = opts.createChannel?.(channelName) ?? new BroadcastChannel(channelName);
      channel.addEventListener('message', onMessage);
      timer = setInterval(sweep, heartbeatMs);
      globalThis.addEventListener?.('pagehide', onHide);
      state.set('open');
    },
    disconnect() {
      if (state.get() === 'closed') return;
      onHide();
      globalThis.removeEventListener?.('pagehide', onHide);
      if (timer !== undefined) clearInterval(timer);
      for (const r of rooms.values()) {
        r.throttle.cancel();
        r.peers.clear();
      }
      rooms.clear();
      lastSeen.clear();
      channel?.close();
      channel = null;
      state.set('closed');
    },
    async join(name, o) {
      if (state.get() === 'closed') {
        throw new TesseraError('TRANSPORT_CLOSED', 'The local transport was disconnected');
      }
      if (state.get() === 'idle') await transport.connect();
      return rooms.get(name)?.room ?? createRoom(name, o?.presence ?? {});
    },
  };
  return transport;
}
