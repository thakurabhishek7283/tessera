import { describe, expect, it } from 'vitest';
import {
  ClientMsg,
  decodeClientFrame,
  decodeServerFrame,
  ERROR_CODES,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  RoomName,
  ServerMsg,
  Topic,
} from '../src/index.js';

describe('RoomName / Topic', () => {
  it('accepts app/kind:id and rejects malformed names', () => {
    expect(RoomName.safeParse('my-app/chat:general').success).toBe(true);
    expect(RoomName.safeParse('my-app/call:abc.DEF_1:x').success).toBe(true);
    for (const bad of ['chat:general', 'My-App/chat:x', 'app/chat', 'app/Chat:x', 'app/chat:']) {
      expect(RoomName.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('accepts dotted lower-case topics', () => {
    for (const ok of ['chat.send', 'chat.message-updated', 'doc.changed', 'a.b.c']) {
      expect(Topic.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['chat', 'Chat.send', 'chat..send', '.send', 'chat.send_x']) {
      expect(Topic.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('ClientMsg', () => {
  const room = 'demo/chat:general';

  it('accepts every client frame type', () => {
    const frames = [
      { t: 'hello', v: PROTOCOL_VERSION, token: null, appId: 'demo' },
      { t: 'join', id: '1', room, presence: { typing: false } },
      { t: 'leave', room },
      { t: 'pub', room, topic: 'chat.typing', data: { on: true } },
      { t: 'direct', room, to: 'peer-1', topic: 'rtc.signal', data: { candidate: null } },
      { t: 'presence', room, patch: { cursor: [1, 2] } },
      { t: 'req', id: '2', room, topic: 'chat.history', data: {} },
      { t: 'ping', ts: 1 },
    ];
    for (const f of frames) expect(ClientMsg.safeParse(f).success, f.t).toBe(true);
  });

  it('rejects wrong versions, unknown tags and bad rooms', () => {
    expect(ClientMsg.safeParse({ t: 'hello', v: 2, token: null, appId: 'a' }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: 'nope' }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: 'leave', room: 'bad' }).success).toBe(false);
  });

  it('decodeClientFrame reports invalid JSON and validation failures', () => {
    expect(decodeClientFrame('{')).toEqual({ ok: false, reason: 'invalid JSON' });
    const bad = decodeClientFrame(JSON.stringify({ t: 'leave', room: 'x' }));
    expect(bad.ok).toBe(false);
    const good = decodeClientFrame(JSON.stringify({ t: 'ping', ts: 5 }));
    expect(good).toEqual({ ok: true, msg: { t: 'ping', ts: 5 } });
  });
});

describe('ServerMsg', () => {
  const room = 'demo/chat:general';
  const user = { id: 'u1', name: 'Ada' };
  const peer = { peerId: 'p1', user, presence: {} };

  it('accepts every server frame type', () => {
    const frames = [
      { t: 'welcome', v: 1, peerId: 'p1', user, serverTime: 1 },
      { t: 'joined', id: '1', room, peers: [peer] },
      { t: 'peer-join', room, peer },
      { t: 'peer-leave', room, peerId: 'p1' },
      { t: 'presence', room, peerId: 'p1', patch: { typing: true } },
      { t: 'msg', room, topic: 'chat.message', data: { id: 'm1' }, from: 'server', ts: 1 },
      { t: 'res', id: '2', ok: true, data: { hasMore: false } },
      { t: 'res', id: '3', ok: false, error: { code: 'NOT_FOUND', message: 'nope' } },
      { t: 'error', error: { code: 'RATE_LIMITED', message: 'slow down' }, ref: '4' },
      { t: 'pong', ts: 1, serverTime: 2 },
    ];
    for (const f of frames) expect(ServerMsg.safeParse(f).success, f.t).toBe(true);
  });

  it('enforces the res ok/data/error invariant', () => {
    expect(ServerMsg.safeParse({ t: 'res', id: '1', ok: true }).success).toBe(false);
    expect(ServerMsg.safeParse({ t: 'res', id: '1', ok: false }).success).toBe(false);
    expect(ServerMsg.safeParse({ t: 'res', id: '1', ok: true, data: null }).success).toBe(true);
  });

  it('decodeServerFrame ignores nothing: unknown error codes are rejected', () => {
    const r = decodeServerFrame(
      JSON.stringify({ t: 'error', error: { code: 'WAT', message: 'x' } }),
    );
    expect(r.ok).toBe(false);
  });
});

describe('constants', () => {
  it('keeps the frame limit at 64 KiB', () => {
    expect(MAX_FRAME_BYTES).toBe(65536);
  });

  it('mirrors the error codes declared in @tessera-kit/core', async () => {
    const core = await import('@tessera-kit/core');
    const sample = core.TesseraError.from(new Error('x'));
    expect(ERROR_CODES).toContain(sample.code);
    // The compile-time check below fails if core adds a code that protocol lacks.
    const _check: (typeof ERROR_CODES)[number] = sample.code;
    expect(_check).toBeDefined();
  });
});
