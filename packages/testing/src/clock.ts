import type { Clock, IdGenerator } from '@tessera/core';

/** A clock that only moves when told to. Pair with Vitest fake timers when code uses `setTimeout`. */
export interface FakeClock extends Clock {
  advance(ms: number): number;
  set(time: number): void;
}

/** Creates a {@link FakeClock} starting at 2026-01-01T00:00:00Z unless `start` is given. */
export function createFakeClock(start: number = Date.UTC(2026, 0, 1)): FakeClock {
  let time = start;
  return {
    now: () => time,
    advance(ms) {
      time += ms;
      return time;
    },
    set(next) {
      time = next;
    },
  };
}

/**
 * Deterministic ids: 26 characters, strictly increasing, so they sort like real ones.
 * `createSequentialIds().next()` → `00000000000000000000000001`.
 */
export function createSequentialIds(prefix = ''): IdGenerator {
  let n = 0;
  return {
    next() {
      n += 1;
      return `${prefix}${String(n).padStart(26 - prefix.length, '0')}`;
    },
  };
}
