import { describe, expect, it } from 'vitest';
import { decodeClientFrame, decodeServerFrame } from '../src/index.js';

// Wire frames come from the network, so validation stays complete in production. Each frame type
// is broken in ways that must be rejected: a required key removed, a key given the wrong type, an
// unknown tag, a bad room name or a non-object frame. Seeded, so a failure reproduces.

let seed = 7;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

const room = 'demo/chat:general';
const user = { id: 'u1', name: 'Ann' };
const peer = { peerId: 'p1', user, presence: {} };
const error = { code: 'NOT_FOUND', message: 'nope' };

type Frame = Record<string, unknown>;
const client: Frame[] = [
  { t: 'hello', v: 1, token: null, appId: 'demo' },
  { t: 'join', id: '1', room, presence: {} },
  { t: 'leave', room },
  { t: 'pub', room, topic: 'chat.typing', data: { on: true } },
  { t: 'direct', room, to: 'p2', topic: 'rtc.signal', data: {} },
  { t: 'presence', room, patch: { x: 1 } },
  { t: 'req', id: '2', room, topic: 'chat.history', data: {} },
  { t: 'ping', ts: 1 },
];
const server: Frame[] = [
  { t: 'welcome', v: 1, peerId: 'p1', user, serverTime: 1 },
  { t: 'joined', id: '1', room, peers: [peer] },
  { t: 'peer-join', room, peer },
  { t: 'peer-leave', room, peerId: 'p1' },
  { t: 'presence', room, peerId: 'p1', patch: {} },
  { t: 'msg', room, topic: 'chat.message', data: {}, from: 'server', ts: 1 },
  { t: 'res', id: '3', ok: true, data: {} },
  { t: 'res', id: '3', ok: false, error },
  { t: 'error', error, ref: '4' },
  { t: 'pong', ts: 1, serverTime: 2 },
];

// Keys whose value may be any JSON, and keys that may be left out.
const ANY_JSON = new Set(['data', 'patch', 'presence']);
const OPTIONAL: Record<string, string[]> = { join: ['presence'], error: ['ref'] };

function wrongType(value: unknown): unknown {
  if (typeof value === 'string') return pick([42, null, true, {}, []]);
  if (typeof value === 'number') return pick(['42', null, true, {}, Number.NaN]);
  if (typeof value === 'boolean') return pick(['true', 1, null]);
  if (value === null) return pick([42, {}, []]);
  return pick(['x', 42, null, true]);
}

function malformed(frames: Frame[]): unknown {
  const frame = pick(frames);
  const t = frame.t as string;
  const keys = Object.keys(frame).filter((k) => k !== 't');
  switch (Math.floor(rand() * 6)) {
    case 0: {
      const required = keys.filter((k) => !OPTIONAL[t]?.includes(k));
      const copy = { ...frame };
      // 'res' keeps either data or error, so removing it breaks the ok/data/error rule.
      delete copy[pick(required.length ? required : ['t'])];
      return copy;
    }
    case 1: {
      const typed = keys.filter((k) => !ANY_JSON.has(k));
      if (typed.length === 0) return { ...frame, t: 42 };
      const k = pick(typed);
      return { ...frame, [k]: wrongType(frame[k]) };
    }
    case 2:
      return { ...frame, t: pick(['', 'HELLO', 'nope', 'msg ', 'res2']) };
    case 3:
      return 'room' in frame
        ? { ...frame, room: pick(['', 'chat:general', 'Demo/chat:x', 'demo/chat', 'a/b:c d']) }
        : { ...frame, t: pick(['unknown', 'x']) };
    case 4:
      return pick([null, 42, 'frame', [], [frame], true]);
    default:
      // A nested shape broken: an empty user id or an unknown error code where there is one.
      if ('user' in frame) return { ...frame, user: { id: '', name: 'Ann' } };
      if ('error' in frame) return { ...frame, error: { code: 'WAT', message: 'x' } };
      if ('peers' in frame) return { ...frame, peers: [{ peerId: 'p' }] };
      return { ...frame, t: null };
  }
}

describe('wire fuzz', () => {
  it.each([
    ['client', client, decodeClientFrame],
    ['server', server, decodeServerFrame],
  ] as const)('rejects 1000 malformed %s frames without throwing', (_, frames, decode) => {
    for (const valid of frames)
      expect(decode(JSON.stringify(valid)).ok, String(valid.t)).toBe(true);
    for (let i = 0; i < 1000; i++) {
      const input = malformed(frames);
      const raw = JSON.stringify(input);
      const result = decode(raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects random bytes', () => {
    for (let i = 0; i < 1000; i++) {
      const raw = Array.from({ length: Math.floor(rand() * 40) }, () =>
        String.fromCharCode(32 + Math.floor(rand() * 95)),
      ).join('');
      expect(decodeClientFrame(raw).ok).toBe(false);
      expect(decodeServerFrame(raw).ok).toBe(false);
    }
  });
});
