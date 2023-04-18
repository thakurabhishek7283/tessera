/** Time source. Injectable so tests can control time. */
export interface Clock {
  now(): number;
}

/** Real wall-clock time. */
export const systemClock: Clock = { now: () => Date.now() };
