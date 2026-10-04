import {
  createStore,
  type IdGenerator,
  type Peer,
  type Room,
  type Store,
  TesseraError,
  type Transport,
  type TransportCapabilities,
  type TransportState,
  type Unsubscribe,
  type UserInfo,
} from '@tessera-kit/core';
import { MAX_FRAME_BYTES, Topic } from '@tessera-kit/protocol';
import { createFakeClock, createSequentialIds, type FakeClock } from './clock.js';

export interface HubRequestContext {
  user: UserInfo;
  peerId: string;
  /** Room name as the client wrote it, e.g. `chat:general`. */
  room: string;
  appId: string;
  /** Delivers to everyone in the room, the requester included (like the real server). */
  broadcast(topic: string, data: unknown): void;
  hub: FakeHub;
}

export type HubHandler = (data: unknown, ctx: HubRequestContext) => unknown | Promise<unknown>;

export interface FakeHubOptions {
  appId?: string;
  clock?: FakeClock;
  ids?: IdGenerator;
  /** Maximum members per room kind. Defaults to `{ call: 6 }`, like tessera-server. */
  capacity?: Record<string, number>;
}

/** One entry of {@link FakeHub.log}: every frame that went through the hub. */
export interface HubLogEntry {
  type: 'join' | 'leave' | 'pub' | 'direct' | 'presence' | 'req' | 'broadcast';
  room: string;
  topic?: string;
  from?: string;
  data?: unknown;
}

/** A transport created by {@link FakeHub.transport} with hooks to simulate network trouble. */
export interface FakeTransport extends Transport {
  readonly peerId: string;
  readonly user: UserInfo;
  /** Simulates losing the connection: state becomes `reconnecting`, nothing is delivered. */
  drop(): void;
  /** Ends the outage: state is `open`, rooms are re-synced and `$reconnected` is emitted. */
  restore(): void;
}

interface Member {
  transport: FakeTransportImpl;
  presence: Record<string, unknown>;
}

/**
 * An in-memory stand-in for tessera-server. Rooms, presence, publish, direct messages and
 * request handlers behave like the real thing, so realtime kits can be tested with several
 * simulated peers and no network. Delivery happens on microtasks; `await hub.settle()` flushes it.
 */
export class FakeHub {
  readonly appId: string;
  readonly clock: FakeClock;
  readonly ids: IdGenerator;
  readonly log: HubLogEntry[] = [];
  readonly handlers: Map<string, HubHandler> = new Map();
  readonly #rooms = new Map<string, Map<string, Member>>();
  readonly #capacity: Record<string, number>;

  constructor(opts: FakeHubOptions = {}) {
    this.appId = opts.appId ?? 'test';
    this.clock = opts.clock ?? createFakeClock();
    this.ids = opts.ids ?? createSequentialIds('p');
    this.#capacity = opts.capacity ?? { call: 6 };
  }

  /** Creates a new connection (one simulated browser tab) for `user`. */
  transport(
    user: UserInfo,
    opts: { capabilities?: Partial<TransportCapabilities> } = {},
  ): FakeTransport {
    return new FakeTransportImpl(this, user, opts.capabilities);
  }

  /** Registers a server-side request handler, like a tessera-server module. */
  handle(topic: string, fn: HubHandler): Unsubscribe {
    this.handlers.set(topic, fn);
    return () => {
      if (this.handlers.get(topic) === fn) this.handlers.delete(topic);
    };
  }

  /** Server-originated broadcast to a room. Recipients see `from === 'server'`. */
  broadcast(room: string, topic: string, data: unknown): void {
    this.log.push({ type: 'broadcast', room, topic, data });
    for (const member of this.#members(room)) member.transport.deliver(room, topic, data, 'server');
  }

  /** Names of rooms that currently have members. */
  rooms(): string[] {
    return [...this.#rooms.keys()];
  }

  /** Peers currently in `room`. */
  members(room: string): Peer[] {
    return this.#members(room).map((m) => m.transport.peerOf(room));
  }

  /** Waits for queued deliveries (and anything they trigger) to finish. */
  async settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // ---- used by FakeTransportImpl ----

  newPeerId(): string {
    return this.ids.next();
  }

  #members(room: string): Member[] {
    return [...(this.#rooms.get(room)?.values() ?? [])];
  }

  join(room: string, member: Member, peerId: string): Peer[] {
    const kind = room.split(':')[0] ?? '';
    const limit = this.#capacity[kind];
    let members = this.#rooms.get(room);
    if (limit !== undefined && (members?.size ?? 0) >= limit && !members?.has(peerId)) {
      throw new TesseraError('FORBIDDEN', `Room ${room} is full`, {
        details: { reason: 'room-full' },
      });
    }
    if (!members) {
      members = new Map();
      this.#rooms.set(room, members);
    }
    const others = [...members.values()].map((m) => m.transport.peerOf(room));
    members.set(peerId, member);
    this.log.push({ type: 'join', room, from: peerId });
    for (const other of members.values()) {
      if (other !== member) other.transport.onPeerJoin(room, member.transport.peerOf(room));
    }
    return others;
  }

  leave(room: string, peerId: string): void {
    const members = this.#rooms.get(room);
    if (!members?.delete(peerId)) return;
    this.log.push({ type: 'leave', room, from: peerId });
    for (const other of members.values()) other.transport.onPeerLeave(room, peerId);
    if (members.size === 0) this.#rooms.delete(room);
  }

  publish(room: string, from: Member, peerId: string, topic: string, data: unknown): void {
    this.log.push({ type: 'pub', room, topic, from: peerId, data });
    for (const [id, member] of this.#rooms.get(room) ?? []) {
      if (id !== peerId) member.transport.deliver(room, topic, data, peerId);
    }
    void from;
  }

  direct(room: string, peerId: string, to: string, topic: string, data: unknown): void {
    this.log.push({ type: 'direct', room, topic, from: peerId, data });
    this.#rooms.get(room)?.get(to)?.transport.deliver(room, topic, data, peerId);
  }

  presence(room: string, peerId: string, patch: Record<string, unknown>): void {
    this.log.push({ type: 'presence', room, from: peerId, data: patch });
    for (const [id, member] of this.#rooms.get(room) ?? []) {
      if (id !== peerId) member.transport.onPresence(room, peerId, patch);
    }
  }

  async request(
    room: string,
    transport: FakeTransportImpl,
    topic: string,
    data: unknown,
  ): Promise<unknown> {
    this.log.push({ type: 'req', room, topic, from: transport.peerId, data });
    const handler = this.handlers.get(topic);
    if (!handler) throw new TesseraError('NOT_FOUND', `No server handler for "${topic}"`);
    try {
      const result = await handler(structuredClone(data), {
        user: transport.user,
        peerId: transport.peerId,
        room,
        appId: this.appId,
        hub: this,
        broadcast: (t, d) => this.broadcast(room, t, d),
      });
      return result === undefined ? null : structuredClone(result);
    } catch (error) {
      throw TesseraError.is(error)
        ? error
        : new TesseraError('UNKNOWN', String((error as Error)?.message ?? error), { cause: error });
    }
  }
}

type RoomHandlers = Map<string, Set<(data: unknown, from: Peer | 'server') => void>>;

class FakeTransportImpl implements FakeTransport {
  readonly state: Store<TransportState> = createStore<TransportState>('idle');
  readonly capabilities: TransportCapabilities;
  readonly peerId: string;
  readonly #rooms = new Map<
    string,
    { room: Room; peers: Store<Peer[]>; presence: Record<string, unknown>; handlers: RoomHandlers }
  >();
  readonly #member: Member = { transport: this, presence: {} };
  #dropped = false;

  constructor(
    private readonly hub: FakeHub,
    readonly user: UserInfo,
    caps: Partial<TransportCapabilities> = {},
  ) {
    this.peerId = hub.newPeerId();
    this.capabilities = {
      serverHistory: true,
      serverPersistence: true,
      directMessages: true,
      ...caps,
    };
  }

  async connect(): Promise<void> {
    if (this.state.get() === 'closed')
      throw new TesseraError('TRANSPORT_CLOSED', 'The transport was disconnected');
    this.state.set('open');
  }

  disconnect(): void {
    for (const name of [...this.#rooms.keys()]) {
      this.hub.leave(name, this.peerId);
      this.#rooms.get(name)?.peers.set([]);
    }
    this.#rooms.clear();
    this.state.set('closed');
  }

  drop(): void {
    this.#dropped = true;
    this.state.set('reconnecting');
  }

  restore(): void {
    if (!this.#dropped) return;
    this.#dropped = false;
    this.state.set('open');
    for (const [name, entry] of this.#rooms) {
      // Rejoin like a real client: fresh peer list, then let kits gap-fill.
      this.hub.leave(name, this.peerId);
      const others = this.hub.join(name, this.#member, this.peerId);
      entry.peers.set(others.filter((p) => p.peerId !== this.peerId));
      for (const fn of entry.handlers.get('$reconnected') ?? []) fn(undefined, 'server');
    }
  }

  async join(name: string, opts: { presence?: Record<string, unknown> } = {}): Promise<Room> {
    if (this.state.get() === 'closed')
      throw new TesseraError('TRANSPORT_CLOSED', 'The transport was disconnected');
    if (this.state.get() === 'idle') this.state.set('open');
    const existing = this.#rooms.get(name);
    if (existing) return existing.room;

    const peers = createStore<Peer[]>([]);
    const handlers: RoomHandlers = new Map();
    const entry = {
      room: undefined as unknown as Room,
      peers,
      presence: { ...opts.presence },
      handlers,
    };
    const self = this;

    const guard = (topic: string, data: unknown): void => {
      if (!Topic.safeParse(topic).success)
        throw new TesseraError('VALIDATION', `"${topic}" is not a valid topic`);
      if (JSON.stringify(data ?? null).length > MAX_FRAME_BYTES)
        throw new TesseraError('VALIDATION', 'Frame too large');
    };

    entry.room = {
      name,
      get self(): Peer {
        return self.peerOf(name);
      },
      peers,
      publish: (topic, data) => {
        guard(topic, data);
        if (!self.#dropped)
          hub().publish(name, self.#member, self.peerId, topic, structuredClone(data));
      },
      send: (to, topic, data) => {
        guard(topic, data);
        if (!self.#dropped) hub().direct(name, self.peerId, to, topic, structuredClone(data));
      },
      async request<T>(topic: string, data: unknown): Promise<T> {
        guard(topic, data);
        if (self.#dropped) throw new TesseraError('TRANSPORT_CLOSED', 'The connection is down');
        return (await hub().request(name, self, topic, data)) as T;
      },
      on(topic, fn) {
        let set = handlers.get(topic);
        if (!set) {
          set = new Set();
          handlers.set(topic, set);
        }
        const cb = fn as (d: unknown, f: Peer | 'server') => void;
        set.add(cb);
        return () => {
          set.delete(cb);
        };
      },
      setPresence: (patch) => {
        entry.presence = { ...entry.presence, ...patch };
        self.#member.presence = entry.presence;
        if (!self.#dropped) hub().presence(name, self.peerId, patch);
      },
      async leave() {
        if (self.#rooms.delete(name)) {
          hub().leave(name, self.peerId);
          peers.set([]);
        }
      },
    };
    const hub = (): FakeHub => this.hub;

    const others = this.hub.join(name, this.#member, this.peerId); // throws FORBIDDEN when full
    this.#rooms.set(name, entry);
    peers.set(others);
    return entry.room;
  }

  // ---- called by the hub ----

  peerOf(room: string): Peer {
    return {
      peerId: this.peerId,
      user: this.user,
      presence: this.#rooms.get(room)?.presence ?? {},
    };
  }

  deliver(room: string, topic: string, data: unknown, from: string): void {
    if (this.#dropped) return;
    const entry = this.#rooms.get(room);
    if (!entry) return;
    const sender: Peer | 'server' =
      from === 'server'
        ? 'server'
        : (entry.peers.get().find((p) => p.peerId === from) ?? {
            peerId: from,
            user: { id: from, name: from },
            presence: {},
          });
    const payload = structuredClone(data);
    queueMicrotask(() => {
      for (const fn of [...(entry.handlers.get(topic) ?? [])]) fn(payload, sender);
    });
  }

  onPeerJoin(room: string, peer: Peer): void {
    if (this.#dropped) return;
    const entry = this.#rooms.get(room);
    entry?.peers.set((all) => [...all.filter((p) => p.peerId !== peer.peerId), peer]);
  }

  onPeerLeave(room: string, peerId: string): void {
    if (this.#dropped) return;
    this.#rooms.get(room)?.peers.set((all) => all.filter((p) => p.peerId !== peerId));
  }

  onPresence(room: string, peerId: string, patch: Record<string, unknown>): void {
    if (this.#dropped) return;
    this.#rooms
      .get(room)
      ?.peers.set((all) =>
        all.map((p) => (p.peerId === peerId ? { ...p, presence: { ...p.presence, ...patch } } : p)),
      );
  }
}
