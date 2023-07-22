import {
  createIdGenerator,
  createLogger,
  type Peer,
  systemClock,
  type Transport,
  type TransportState,
} from '@tessera/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebSocketTransport, type WebSocketTransportOptions } from '../src/websocket.js';
import { TestServer } from './helpers/test-server.js';

const fast = { initialDelayMs: 20, maxDelayMs: 100, jitter: 0 };

describe('WebSocketTransport (real ws server)', () => {
  const servers: TestServer[] = [];
  const clients: Transport[] = [];

  afterEach(async () => {
    for (const c of clients.splice(0)) c.disconnect();
    for (const s of servers.splice(0)) await s.stop().catch(() => undefined);
  });

  const start = async (options = {}) => {
    const s = await TestServer.start(options);
    servers.push(s);
    return s;
  };

  const client = (
    server: TestServer,
    token: string | null,
    extra: Partial<WebSocketTransportOptions> = {},
  ) => {
    const t = createWebSocketTransport({
      url: server.url,
      appId: 'demo',
      auth: { getUser: () => null, getToken: async () => token, onChange: () => () => {} },
      ids: createIdGenerator(),
      clock: systemClock,
      logger: createLogger('silent'),
      reconnect: fast,
      ...extra,
    });
    clients.push(t);
    return t;
  };

  it('connects: idle → connecting → open, and sends hello with the token', async () => {
    const server = await start();
    const t = client(server, 'ada');
    const states: TransportState[] = [t.state.get()];
    t.state.subscribe((s) => states.push(s));
    await t.connect();
    expect(states).toEqual(['idle', 'connecting', 'open']);
    expect(server.framesOf('hello')[0]).toMatchObject({ v: 1, token: 'ada', appId: 'demo' });
    expect(t.capabilities.serverHistory).toBe(true);
  });

  it('joins rooms, sees peers join and leave, and prefixes the app id on the wire', async () => {
    const server = await start();
    const a = client(server, 'ada');
    const b = client(server, 'bob');
    const ra = await a.join('chat:general', { presence: { status: 'online' } });
    expect(server.framesOf('join')[0]?.room).toBe('demo/chat:general');
    expect(ra.self.user.id).toBe('ada');
    expect(ra.peers.get()).toEqual([]);

    const rb = await b.join('chat:general');
    expect(rb.peers.get().map((p) => [p.user.id, p.presence])).toEqual([
      ['ada', { status: 'online' }],
    ]);
    await vi.waitFor(() => expect(ra.peers.get().map((p) => p.user.id)).toEqual(['bob']));

    await rb.leave();
    await vi.waitFor(() => expect(ra.peers.get()).toHaveLength(0));
  });

  it('delivers publish to others, direct to one peer, and presence patches', async () => {
    const server = await start();
    const [a, b, c] = [client(server, 'ada'), client(server, 'bob'), client(server, 'cy')];
    const ra = await a.join('call:x');
    const rb = await b.join('call:x');
    const rc = await c.join('call:x');
    const seenB: Array<[unknown, string]> = [];
    const seenC: unknown[] = [];
    rb.on('rtc.signal', (d, from) => seenB.push([d, (from as Peer).user.id]));
    rc.on('rtc.signal', (d) => seenC.push(d));

    ra.publish('rtc.signal', { n: 1 });
    await vi.waitFor(() => expect(seenB).toEqual([[{ n: 1 }, 'ada']]));
    await vi.waitFor(() => expect(seenC).toEqual([{ n: 1 }]));

    const bobAsSeenByAda = ra.peers.get().find((p) => p.user.id === 'bob');
    ra.send(bobAsSeenByAda?.peerId ?? '', 'rtc.signal', { n: 2 });
    await vi.waitFor(() => expect(seenB).toHaveLength(2));
    expect(seenC).toHaveLength(1);

    rb.setPresence({ typing: true });
    await vi.waitFor(() =>
      expect(ra.peers.get().find((p) => p.user.id === 'bob')?.presence).toEqual({ typing: true }),
    );
    expect(rb.self.presence).toEqual({ typing: true });
  });

  it('does not deliver a room to clients that have not joined it', async () => {
    const server = await start();
    const a = client(server, 'ada');
    const b = client(server, 'bob');
    const ra = await a.join('chat:one');
    const rb = await b.join('chat:two');
    const seen = vi.fn();
    rb.on('x.y', seen);
    ra.publish('x.y', 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).not.toHaveBeenCalled();
  });

  it('answers requests, maps server errors and times out silent handlers', async () => {
    const server = await start();
    server.handlers.set('chat.echo', (data) => ({ echoed: data }));
    server.handlers.set('chat.fail', () => {
      throw new Error('nope');
    });
    server.handlers.set('chat.hang', () => new Promise(() => {}));
    const room = await client(server, 'ada').join('chat:general');

    expect(await room.request('chat.echo', { a: 1 })).toEqual({ echoed: { a: 1 } });
    await expect(room.request('chat.fail', {})).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(room.request('chat.unknown', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(room.request('chat.hang', {}, { timeoutMs: 60 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('receives server-originated broadcasts with from = "server"', async () => {
    const server = await start();
    const room = await client(server, 'ada').join('chat:general');
    const seen: Array<[unknown, unknown]> = [];
    room.on('chat.message', (d, from) => seen.push([d, from]));
    server.broadcast('demo/chat:general', 'chat.message', { id: 'm1' });
    await vi.waitFor(() => expect(seen).toEqual([[{ id: 'm1' }, 'server']]));
  });

  it('rejects a join the server refuses and forgets the room', async () => {
    const server = await start();
    const t = client(server, 'ada');
    await expect(t.join('chat:forbidden')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // A later join of a valid room still works.
    await expect(t.join('chat:ok')).resolves.toBeDefined();
  });

  it('closes permanently without retrying when the token is rejected', async () => {
    const server = await start();
    const t = client(server, 'bad');
    await expect(t.connect()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(t.state.get()).toBe('closed');
    await new Promise((r) => setTimeout(r, 120));
    expect(server.framesOf('hello')).toHaveLength(1);
    await expect(t.join('chat:x')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('reconnects after a server restart, rejoins rooms, signals $reconnected and delivers queued pubs', async () => {
    const server = await start();
    const t = client(server, 'ada');
    const room = await t.join('chat:general', { presence: { status: 'online' } });
    const reconnected = vi.fn();
    room.on('$reconnected', reconnected);

    await server.stop();
    await vi.waitFor(() => expect(t.state.get()).toBe('reconnecting'));
    room.publish('chat.note', { queued: 1 });
    room.publish('chat.note', { queued: 2 });

    await server.restart();
    await vi.waitFor(() => expect(t.state.get()).toBe('open'), { timeout: 3000 });
    await vi.waitFor(() => expect(reconnected).toHaveBeenCalledTimes(1));

    const joins = server.framesOf('join');
    expect(joins.at(-1)).toMatchObject({
      room: 'demo/chat:general',
      presence: { status: 'online' },
    });
    const pubs = server.framesOf('pub').map((f) => f.data);
    expect(pubs).toEqual([{ queued: 1 }, { queued: 2 }]);
    // The queued frames are sent after the room was rejoined, never before.
    const order = server.received.map((f) => f.t);
    expect(order.lastIndexOf('join')).toBeLessThan(order.indexOf('pub'));
  });

  it('fails in-flight requests on disconnect but retries queued ones after reconnect', async () => {
    const server = await start();
    server.handlers.set('chat.hang', () => new Promise(() => {}));
    server.handlers.set('chat.echo', (d) => d);
    const t = client(server, 'ada');
    const room = await t.join('chat:general');

    const inFlight = room.request('chat.hang', {});
    await vi.waitFor(() => expect(server.framesOf('req')).toHaveLength(1));
    const inFlightResult = expect(inFlight).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });
    await server.stop();
    await inFlightResult;

    const queued = room.request('chat.echo', { again: true });
    await server.restart();
    expect(await queued).toEqual({ again: true });
  });

  it('gives up on requests that wait too long for a connection', async () => {
    const server = await start();
    const t = client(server, 'ada', { queuedRequestTimeoutMs: 80 });
    const room = await t.join('chat:general');
    await server.stop();
    await vi.waitFor(() => expect(t.state.get()).toBe('reconnecting'));
    await expect(room.request('chat.echo', {})).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });
  });

  it('drops the oldest publishes beyond maxQueue but never requests', async () => {
    const server = await start();
    server.handlers.set('chat.echo', (d) => d);
    const t = client(server, 'ada', { reconnect: { ...fast, maxQueue: 3 } });
    const room = await t.join('chat:general');
    await server.stop();
    await vi.waitFor(() => expect(t.state.get()).toBe('reconnecting'));
    const reply = room.request('chat.echo', 'kept');
    for (let i = 1; i <= 5; i++) room.publish('chat.note', i);
    await server.restart();
    expect(await reply).toBe('kept');
    await vi.waitFor(() => expect(server.framesOf('pub').length).toBeGreaterThan(0));
    expect(server.framesOf('pub').map((f) => f.data)).toEqual([3, 4, 5]);
  });

  it('reconnects when the server stops answering pings', async () => {
    const server = await start({ ignorePing: true });
    const t = client(server, 'ada', { heartbeatMs: 30, pongTimeoutMs: 30 });
    await t.connect();
    await vi.waitFor(() => expect(server.framesOf('hello').length).toBeGreaterThanOrEqual(2), {
      timeout: 3000,
    });
  });

  it('reconnects when the server never sends welcome', async () => {
    const server = await start({ ignoreHello: true });
    const t = client(server, 'ada', { helloTimeoutMs: 40 });
    void t.connect().catch(() => undefined);
    await vi.waitFor(() => expect(server.framesOf('hello').length).toBeGreaterThanOrEqual(2), {
      timeout: 3000,
    });
  });

  it('rejects oversized frames at the call site', async () => {
    const server = await start();
    const room = await client(server, 'ada').join('chat:general');
    expect(() => room.publish('chat.note', 'x'.repeat(70_000))).toThrowError(/byte limit/);
    await expect(room.request('chat.echo', 'x'.repeat(70_000))).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('disconnect() rejects pending work, closes the socket and blocks new joins', async () => {
    const server = await start();
    server.handlers.set('chat.hang', () => new Promise(() => {}));
    const t = client(server, 'ada');
    const room = await t.join('chat:general');
    const pending = room.request('chat.hang', {});
    await vi.waitFor(() => expect(server.framesOf('req')).toHaveLength(1));
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });
    t.disconnect();
    await rejected;
    expect(t.state.get()).toBe('closed');
    await expect(t.join('chat:y')).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });
    await vi.waitFor(() => expect(server.members_('demo/chat:general')).toHaveLength(0));
  });
});

// ---------------------------------------------------------------------------------------------
// Deterministic edge cases with an injected socket.

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

describe('WebSocketTransport (fake socket)', () => {
  const make = (extra: Partial<WebSocketTransportOptions> = {}) => {
    FakeSocket.instances = [];
    return createWebSocketTransport({
      url: 'ws://fake',
      appId: 'demo',
      auth: { getUser: () => null, getToken: async () => 't', onChange: () => () => {} },
      ids: createIdGenerator(),
      clock: systemClock,
      logger: createLogger('silent'),
      createSocket: (url) => new FakeSocket(url),
      random: () => 0.5,
      ...extra,
    });
  };
  const last = () => FakeSocket.instances.at(-1) as FakeSocket;
  const welcome = (s: FakeSocket) =>
    s.receive({ t: 'welcome', v: 1, peerId: 'p1', user: { id: 'u', name: 'U' }, serverTime: 1 });

  afterEach(() => vi.useRealTimers());

  it('backs off exponentially up to the cap with no jitter', async () => {
    vi.useFakeTimers();
    const t = make({ reconnect: { initialDelayMs: 500, maxDelayMs: 2000, factor: 2, jitter: 0 } });
    void t.connect().catch(() => undefined);
    const attempts: number[] = [];
    const expected = [500, 1000, 2000, 2000];
    for (const delay of expected) {
      attempts.push(FakeSocket.instances.length);
      last().drop();
      expect(t.state.get()).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(FakeSocket.instances.length).toBe(attempts.at(-1));
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeSocket.instances.length).toBe((attempts.at(-1) ?? 0) + 1);
    }
  });

  it('applies jitter within ±30 %', async () => {
    vi.useFakeTimers();
    const lows = make({ random: () => 0, reconnect: { initialDelayMs: 1000, jitter: 0.3 } });
    void lows.connect().catch(() => undefined);
    last().drop();
    await vi.advanceTimersByTimeAsync(699);
    expect(FakeSocket.instances.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances.length).toBe(2);
  });

  it('resets the backoff only after a connection stayed up long enough', async () => {
    vi.useFakeTimers();
    const t = make({
      reconnect: { initialDelayMs: 100, maxDelayMs: 10_000, factor: 2, jitter: 0 },
      stableMs: 1000,
    });
    void t.connect().catch(() => undefined);
    // Flapping: opens, then drops before it is stable → delay keeps growing.
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    welcome(last());
    last().drop();
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeSocket.instances.length).toBe(2);
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    welcome(last());
    last().drop();
    await vi.advanceTimersByTimeAsync(199);
    expect(FakeSocket.instances.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances.length).toBe(3);
    // Stable: stays up ≥ stableMs → next drop starts from the initial delay again.
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    welcome(last());
    await vi.advanceTimersByTimeAsync(1000);
    last().drop();
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeSocket.instances.length).toBe(4);
  });

  it('ignores invalid and non-string frames', async () => {
    const t = make();
    void t.connect();
    const s = last();
    s.open();
    await Promise.resolve();
    s.receive('{not json');
    s.receive({ t: 'nonsense' });
    s.onmessage?.({ data: new ArrayBuffer(2) });
    welcome(s);
    expect(t.state.get()).toBe('open');
  });

  it('ignores events from a socket that has been replaced', async () => {
    vi.useFakeTimers();
    const t = make({ reconnect: { initialDelayMs: 10, jitter: 0 } });
    void t.connect().catch(() => undefined);
    const first = last();
    first.drop();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeSocket.instances).toHaveLength(2);
    first.onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('reconnects immediately on the online event when waiting for a backoff', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    vi.stubGlobal('addEventListener', target.addEventListener.bind(target));
    vi.stubGlobal('removeEventListener', target.removeEventListener.bind(target));
    const t = make({ reconnect: { initialDelayMs: 60_000, jitter: 0 } });
    void t.connect().catch(() => undefined);
    last().drop();
    expect(FakeSocket.instances).toHaveLength(1);
    target.dispatchEvent(new Event('online'));
    expect(FakeSocket.instances).toHaveLength(2);
    t.disconnect();
    vi.unstubAllGlobals();
  });
});
