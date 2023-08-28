import { TesseraError } from '@tessera/core';
import { describe, expect, it, vi } from 'vitest';
import { alice, bob, carol, FakeHub } from '../src/index.js';

const setup = async () => {
  const hub = new FakeHub();
  const [ta, tb, tc] = [hub.transport(alice), hub.transport(bob), hub.transport(carol)];
  return { hub, ta, tb, tc };
};

describe('FakeHub presence', () => {
  it('lists existing peers on join and tells others about newcomers and leavers', async () => {
    const { hub, ta, tb } = await setup();
    const ra = await ta.join('chat:general', { presence: { status: 'online' } });
    const rb = await tb.join('chat:general');
    expect(ra.peers.get().map((p) => p.user.id)).toEqual(['bob']);
    expect(rb.peers.get().map((p) => [p.user.id, p.presence])).toEqual([
      ['alice', { status: 'online' }],
    ]);
    expect(rb.self.user.id).toBe('bob');
    await rb.leave();
    expect(ra.peers.get()).toEqual([]);
    expect(hub.rooms()).toEqual(['chat:general']);
    await ra.leave();
    expect(hub.rooms()).toEqual([]);
  });

  it('merges presence patches and broadcasts them', async () => {
    const { ta, tb } = await setup();
    const ra = await ta.join('chat:x');
    const rb = await tb.join('chat:x');
    ra.setPresence({ typing: true });
    ra.setPresence({ cursor: 3 });
    expect(rb.peers.get()[0]?.presence).toEqual({ typing: true, cursor: 3 });
    expect(ra.self.presence).toEqual({ typing: true, cursor: 3 });
  });

  it('removes a peer from all rooms on disconnect', async () => {
    const { hub, ta, tb } = await setup();
    const ra = await ta.join('chat:x');
    await tb.join('chat:x');
    tb.disconnect();
    expect(ra.peers.get()).toEqual([]);
    expect(tb.state.get()).toBe('closed');
    await expect(tb.join('chat:y')).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });
    expect(hub.members('chat:x').map((p) => p.user.id)).toEqual(['alice']);
  });

  it('enforces the call room capacity of six', async () => {
    const hub = new FakeHub();
    for (let i = 0; i < 6; i++)
      await hub.transport({ id: `u${i}`, name: `U${i}` }).join('call:big');
    await expect(hub.transport(alice).join('call:big')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'room-full' },
    });
    await expect(hub.transport(alice).join('chat:big')).resolves.toBeDefined();
  });
});

describe('FakeHub messaging', () => {
  it('publish reaches others (not the sender), direct reaches one peer, payloads are cloned', async () => {
    const { hub, ta, tb, tc } = await setup();
    const [ra, rb, rc] = [
      await ta.join('call:x'),
      await tb.join('call:x'),
      await tc.join('call:x'),
    ];
    const got: Record<string, unknown[]> = { a: [], b: [], c: [] };
    ra.on('rtc.signal', (d) => got.a?.push(d));
    rb.on('rtc.signal', (d, from) => got.b?.push([d, (from as { user: { id: string } }).user.id]));
    rc.on('rtc.signal', (d) => got.c?.push(d));

    const payload = { n: 1 };
    ra.publish('rtc.signal', payload);
    payload.n = 99;
    await hub.settle();
    expect(got).toEqual({ a: [], b: [[{ n: 1 }, 'alice']], c: [{ n: 1 }] });

    const bobPeer = ra.peers.get().find((p) => p.user.id === 'bob');
    ra.send(bobPeer?.peerId ?? '', 'rtc.signal', { n: 2 });
    await hub.settle();
    expect(got.b).toHaveLength(2);
    expect(got.c).toHaveLength(1);
  });

  it('rejects malformed topics and oversized frames early', async () => {
    const { ta } = await setup();
    const room = await ta.join('chat:x');
    expect(() => room.publish('NotATopic', {})).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
    expect(() => room.publish('chat.big', 'x'.repeat(70_000))).toThrowError(/too large/);
  });

  it('server broadcasts arrive with from = "server"', async () => {
    const { hub, ta } = await setup();
    const room = await ta.join('chat:x');
    const seen = vi.fn();
    room.on('chat.message', seen);
    hub.broadcast('chat:x', 'chat.message', { id: 'm1' });
    await hub.settle();
    expect(seen).toHaveBeenCalledWith({ id: 'm1' }, 'server');
  });

  it('runs request handlers with the requester context and maps errors', async () => {
    const { hub, ta, tb } = await setup();
    const ra = await ta.join('chat:general');
    const rb = await tb.join('chat:general');
    const received: unknown[] = [];
    rb.on('chat.message', (d) => received.push(d));
    hub.handle('chat.send', (data, ctx) => {
      const message = { text: (data as { text: string }).text, by: ctx.user.id, room: ctx.room };
      ctx.broadcast('chat.message', message);
      return message;
    });
    hub.handle('chat.fail', () => {
      throw new TesseraError('FORBIDDEN', 'nope');
    });
    hub.handle('chat.crash', () => {
      throw new Error('boom');
    });

    expect(await ra.request('chat.send', { text: 'hi' })).toEqual({
      text: 'hi',
      by: 'alice',
      room: 'chat:general',
    });
    await hub.settle();
    expect(received).toEqual([{ text: 'hi', by: 'alice', room: 'chat:general' }]);
    await expect(ra.request('chat.fail', {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(ra.request('chat.crash', {})).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'boom',
    });
    await expect(ra.request('chat.missing', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps a log of frames for assertions', async () => {
    const { hub, ta, tb } = await setup();
    const ra = await ta.join('chat:x');
    await tb.join('chat:x');
    ra.publish('chat.typing', { on: true });
    expect(hub.log.map((e) => e.type)).toEqual(['join', 'join', 'pub']);
  });
});

describe('FakeHub outages', () => {
  it('drop() silences a peer and restore() re-syncs peers and emits $reconnected', async () => {
    const { hub, ta, tb, tc } = await setup();
    const ra = await ta.join('chat:x');
    await tb.join('chat:x');
    const reconnected = vi.fn();
    ra.on('$reconnected', reconnected);
    const seen = vi.fn();
    ra.on('chat.note', seen);

    ta.drop();
    expect(ta.state.get()).toBe('reconnecting');
    hub.broadcast('chat:x', 'chat.note', 'missed');
    await tc.join('chat:x'); // joins while alice is offline
    await hub.settle();
    expect(seen).not.toHaveBeenCalled();
    expect(ra.peers.get().map((p) => p.user.id)).toEqual(['bob']);
    await expect(ra.request('chat.send', {})).rejects.toMatchObject({ code: 'TRANSPORT_CLOSED' });

    ta.restore();
    expect(ta.state.get()).toBe('open');
    expect(
      ra.peers
        .get()
        .map((p) => p.user.id)
        .sort(),
    ).toEqual(['bob', 'carol']);
    expect(reconnected).toHaveBeenCalledTimes(1);
    ta.restore();
    expect(reconnected).toHaveBeenCalledTimes(1);
  });
});
