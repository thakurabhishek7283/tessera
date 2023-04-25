import type { Unsubscribe } from './bus.js';

export interface ReadonlyStore<T> {
  get(): T;
  subscribe(fn: (value: T, prev: T) => void): Unsubscribe;
  select<U>(selector: (value: T) => U, equals?: (a: U, b: U) => boolean): ReadonlyStore<U>;
}

export interface Store<T> extends ReadonlyStore<T> {
  /** No-op when the next value is `Object.is`-equal to the current one. */
  set(next: T | ((prev: T) => T)): void;
}

let batchDepth = 0;
const pending = new Map<() => void, true>();

/** Coalesces store notifications raised inside `fn` into one notification per store. */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const run = [...pending.keys()];
      pending.clear();
      for (const flush of run) flush();
    }
  }
}

/** Creates a tiny framework-agnostic observable value. Use immutable updates. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<(value: T, prev: T) => void>();
  let batchedPrev: { prev: T } | null = null;

  const notify = (prev: T): void => {
    for (const fn of [...subs]) fn(value, prev);
  };

  const flush = (): void => {
    const captured = batchedPrev;
    batchedPrev = null;
    if (captured && !Object.is(captured.prev, value)) notify(captured.prev);
  };

  const store: Store<T> = {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      const prev = value;
      value = resolved;
      if (batchDepth > 0) {
        batchedPrev ??= { prev };
        pending.set(flush, true);
      } else {
        notify(prev);
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    select: (selector, equals) => deriveSelect(store, selector, equals),
  };
  return store;
}

function deriveSelect<T, U>(
  source: ReadonlyStore<T>,
  selector: (value: T) => U,
  equals: (a: U, b: U) => boolean = Object.is,
): ReadonlyStore<U> {
  let cachedSource: T = source.get();
  let cached: U = selector(cachedSource);

  const read = (): U => {
    const current = source.get();
    if (current !== cachedSource) {
      cachedSource = current;
      const next = selector(current);
      if (!equals(cached, next)) cached = next;
    }
    return cached;
  };

  const derived: ReadonlyStore<U> = {
    get: read,
    subscribe(fn) {
      let last = read();
      return source.subscribe(() => {
        const next = read();
        if (next !== last) {
          const prev = last;
          last = next;
          fn(next, prev);
        }
      });
    },
    select: (nextSelector, nextEquals) => deriveSelect(derived, nextSelector, nextEquals),
  };
  return derived;
}
