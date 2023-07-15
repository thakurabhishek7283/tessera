import {
  createIdGenerator,
  createLogger,
  type Peer,
  systemClock,
  type UserInfo,
} from '@tessera/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalTransport, isLocalTransport, type LocalTransport } from '../src/local.js';
import { FakeChannelBus } from './helpers/fake-channel.js';

const ada: UserInfo = { id: 'ada', name: 'Ada' };
const bob: UserInfo = { id: 'bob', name: 'Bob' };

function tab(
  user: UserInfo,
  bus: FakeChannelBus,
  extra: { channel?: string; appId?: string; clock?: { now(): number } } = {},
) {
  return createLocalTransport({
    appId: extra.appId ?? 'demo',
    ...(extra.channel ? { channel: extra.channel } : {}),
    user: () => user,
    ids: createIdGenerator(),
    clock: extra.clock ?? systemClock,
    logger: createLogger('silent'),
    createChannel: bus.create,
  });
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('LocalTransport (deterministic channel)', () => {
  let bus: FakeChannelBus;
  beforeEach(() => {
    vi.useFakeTimers();
    bus = new FakeChannelBus();
  });
  afterEach(() => vi.useRealTimers());

  it('auto-connects on join and exposes capabilities', async () => {
    const t = tab(ada, bus);
    expect(t.state.get()).toBe('idle');
    await t.join('chat:general');
    expect(t.state.get()).toBe('open');
    expect(t.capabilities).toEqual({
      serverHistory: false,
      serverPersistence: false,
      directMessages: true,
    });
    expect(isLocalTransport(t)).toBe(true);
  });

  it('lets two tabs see each other with user and presence', async () => {
    const a = tab(ada, bus);
    const b = tab(bob, bus);
    const roomA = await a.join('chat:general', { presence: { status: 'online' } });
    const roomB = await b.join('chat:general', { presence: { status: 'away' } });
    await flush();
    expect(roomA.peers.get().map((p) => [p.user.id, p.presence])).toEqual([
      ['bob', { status: 'away' }],
    ]);
    expect(roomB.peers.get().map((p) => [p.user.id, p.presence])).toEqual([
      ['ada', { status: 'online' }],
    ]);
    expect(roomA.self.user.id).toBe('ada');
  });

  it('does not mix rooms, channels or apps', async () => {
    const a = tab(ada, bus);
    const sameRoom = tab(bob, bus);
    const otherRoom = tab(bob, bus);
    const otherChannel = tab(bob, bus, { channel: 'other' });
    const otherApp = tab(bob, bus, { appId: 'another' });
    const roomA = await a.join('chat:general');
    await sameRoom.join('chat:general');
    await otherRoom.join('chat:random');
    await otherChannel.join('chat:general');
    await otherApp.join('chat:general');
    await flush();
    expect(roomA.peers.get()).toHaveLength(1);
  });

  it('publish reaches other peers but not the sender; send reaches only its target', async () => {
    const [a, b, c] = [tab(ada, bus), tab(bob, bus), tab({ id: 'cy', name: 'Cy' }, bus)];
    const [ra, rb, rc] = [await a.join('call:x'), await b.join('call:x'), await c.join('call:x')];
    await flush();
    const got: Record<string, Array<[unknown, string]>> = { a: [], b: [], c: [] };
    const record = (key: string) => (data: unknown, from: Peer | 'server') =>
      got[key]?.push([data, from === 'server' ? 'server' : from.user.id]);
    ra.on('rtc.signal', record('a'));
    rb.on('rtc.signal', record('b'));
    rc.on('rtc.signal', record('c'));

    ra.publish('rtc.signal', { n: 1 });
    await flush();
    expect(got).toEqual({ a: [], b: [[{ n: 1 }, 'ada']], c: [[{ n: 1 }, 'ada']] });

    const target = ra.peers.get().find((p) => p.user.id === 'cy');
    ra.send(target?.peerId ?? '', 'rtc.signal', { n: 2 });
    await flush();
    expect(got.b).toHaveLength(1);
    expect(got.c?.at(-1)).toEqual([{ n: 2 }, 'ada']);
  });

  it('stops delivering to unsubscribed handlers and survives throwing handlers', async () => {
    const a = tab(ada, bus);
    const b = tab(bob, bus);
    const ra = await a.join('chat:x');
    const rb = await b.join('chat:x');
    await flush();
    const seen: unknown[] = [];
    rb.on('t.a', () => {
      throw new Error('boom');
    });
    const off = rb.on('t.a', (d) => seen.push(d));
    ra.publish('t.a', 1);
    await flush();
    off();
    ra.publish('t.a', 2);
    await flush();
    expect(seen).toEqual([1]);
  });

  it('throttles presence: leading edge immediately, the rest merged', async () => {
    const a = tab(ada, bus);
    const b = tab(bob, bus);
    const ra = await a.join('chat:x');
    const rb = await b.join('chat:x');
    await flush();
    ra.setPresence({ typing: true });
    await flush();
    expect(rb.peers.get()[0]?.presence).toEqual({ typing: true });
    ra.setPresence({ cursor: 1 });
    ra.setPresence({ cursor: 2, typing: false });
    await flush();
    expect(rb.peers.get()[0]?.presence).toEqual({ typing: true });
    await vi.advanceTimersByTimeAsync(100);
    expect(rb.peers.get()[0]?.presence).toEqual({ typing: false, cursor: 2 });
    expect(ra.self.presence).toEqual({ typing: false, cursor: 2 });
  });

  it('removes a peer on leave and on disconnect (bye)', async () => {
    const a = tab(ada, bus);
    const b = tab(bob, bus);
    const c = tab({ id: 'cy', name: 'Cy' }, bus);
    const ra = await a.join('chat:x');
    const rb = await b.join('chat:x');
    await c.join('chat:x');
    await flush();
    expect(ra.peers.get()).toHaveLength(2);
    await rb.leave();
    await flush();
    expect(ra.peers.get().map((p) => p.user.id)).toEqual(['cy']);
    c.disconnect();
    await flush();
    expect(ra.peers.get()).toHaveLength(0);
    expect(c.state.get()).toBe('closed');
    await expect(c.join('chat:y')).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });
  });

  it('drops a peer that stops sending heartbeats after 15 s', async () => {
    const clock = { now: () => Date.now() };
    const a = tab(ada, bus, { clock });
    const b = tab(bob, bus, { clock });
    const ra = await a.join('chat:x');
    await b.join('chat:x');
    const bobChannel = bus.last;
    await flush();
    expect(ra.peers.get()).toHaveLength(1);

    // Bob's tab freezes: no heartbeat, no bye.
    if (bobChannel) bus.muted.add(bobChannel);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ra.peers.get()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ra.peers.get()).toHaveLength(0);
  });

  it('keeps a live peer across many heartbeat cycles', async () => {
    const a = tab(ada, bus);
    const b = tab(bob, bus);
    const ra = await a.join('chat:x');
    await b.join('chat:x');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ra.peers.get()).toHaveLength(1);
  });

  describe('request handlers', () => {
    let t: LocalTransport;
    beforeEach(() => {
      t = tab(ada, bus);
    });

    it('answers requests in-tab and broadcasts like a server', async () => {
      const b = tab(bob, bus);
      const ra = await t.join('chat:general');
      const rb = await b.join('chat:general');
      await flush();
      t.registerHandler('chat.send', (data, ctx) => {
        const msg = { text: (data as { text: string }).text, by: ctx.user.id };
        ctx.broadcast('chat.message', msg);
        return msg;
      });
      const onA: unknown[] = [];
      const onB: Array<[unknown, unknown]> = [];
      ra.on('chat.message', (d) => onA.push(d));
      rb.on('chat.message', (d, from) => onB.push([d, from]));

      const res = await ra.request('chat.send', { text: 'hi' });
      await flush();
      expect(res).toEqual({ text: 'hi', by: 'ada' });
      expect(onA).toEqual([{ text: 'hi', by: 'ada' }]);
      expect(onB).toEqual([[{ text: 'hi', by: 'ada' }, 'server']]);
    });

    it('fails with NOT_FOUND for unknown topics and propagates handler errors', async () => {
      const room = await t.join('chat:general');
      await expect(room.request('chat.send', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const off = t.registerHandler('boom.now', () => {
        throw new Error('handler exploded');
      });
      await expect(room.request('boom.now', {})).rejects.toThrow('handler exploded');
      off();
      await expect(room.request('boom.now', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('times out slow handlers', async () => {
      const room = await t.join('chat:general');
      t.registerHandler('slow.op', () => new Promise(() => {}));
      const pending = expect(room.request('slow.op', {}, { timeoutMs: 500 })).rejects.toMatchObject(
        { code: 'TIMEOUT' },
      );
      await vi.advanceTimersByTimeAsync(600);
      await pending;
    });
  });
});

describe('LocalTransport (real BroadcastChannel)', () => {
  it('connects two transports in one page', async () => {
    const make = (user: UserInfo) =>
      createLocalTransport({
        appId: 'real',
        user: () => user,
        ids: createIdGenerator(),
        clock: systemClock,
        logger: createLogger('silent'),
      });
    const a = make(ada);
    const b = make(bob);
    const ra = await a.join('chat:x');
    const rb = await b.join('chat:x');
    const received = new Promise<unknown>((resolve) => rb.on('greet.hello', resolve));
    await vi.waitFor(() => expect(ra.peers.get()).toHaveLength(1));
    ra.publish('greet.hello', { hi: true });
    expect(await received).toEqual({ hi: true });
    a.disconnect();
    await vi.waitFor(() => expect(rb.peers.get()).toHaveLength(0));
    b.disconnect();
  });
});
