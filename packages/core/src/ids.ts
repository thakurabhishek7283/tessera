import type { Clock } from './clock.js';
import { systemClock } from './clock.js';

/** Produces unique, lexicographically sortable ids. */
export interface IdGenerator {
  next(): string;
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function defaultRandom(): Uint8Array {
  const bytes = new Uint8Array(RANDOM_LEN);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Creates a ULID-style generator: 10 chars of time + 16 chars of randomness in Crockford
 * base32. Ids created within the same millisecond are strictly increasing.
 */
export function createIdGenerator(
  opts: { clock?: Clock; random?: () => Uint8Array } = {},
): IdGenerator {
  const clock = opts.clock ?? systemClock;
  const random = opts.random ?? defaultRandom;
  let lastTime = -1;
  let lastRandom: number[] = [];

  return {
    next(): string {
      const time = clock.now();
      if (time === lastTime) {
        // Increment the random part (little carry loop) to stay monotonic.
        const next = [...lastRandom];
        let i = RANDOM_LEN - 1;
        while (i >= 0) {
          const v = next[i] ?? 0;
          if (v < 31) {
            next[i] = v + 1;
            break;
          }
          next[i] = 0;
          i--;
        }
        lastRandom = next;
      } else {
        lastTime = time;
        lastRandom = Array.from(random(), (b) => b & 31);
      }
      return encodeTime(time) + lastRandom.map((v) => ALPHABET[v]).join('');
    },
  };
}

function encodeTime(time: number): string {
  let t = Math.max(0, Math.floor(time));
  let out = '';
  for (let i = 0; i < TIME_LEN; i++) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

/** Deterministic hue-based colour for a user id, so avatars are stable without storage. */
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 62% 42%)`;
}
