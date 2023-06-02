import type { Clock, Doc, StorageAdapter } from '@tessera/core';
import { systemClock } from '@tessera/core';
import { createEngine, type DocBackend } from './engine.js';

export interface MemoryStorageOptions {
  clock?: Clock;
  userId?: () => string | undefined;
}

/** Volatile storage. Used by tests and as the fallback when nothing else is configured. */
export function createMemoryStorage(opts: MemoryStorageOptions = {}): StorageAdapter {
  const tables = new Map<string, Map<string, Doc<unknown>>>();
  const table = (collection: string): Map<string, Doc<unknown>> => {
    let t = tables.get(collection);
    if (!t) {
      t = new Map();
      tables.set(collection, t);
    }
    return t;
  };

  const backend: DocBackend = {
    get: async (collection, id) => tables.get(collection)?.get(id) ?? null,
    all: async (collection) => [...(tables.get(collection)?.values() ?? [])],
    mutate: async (collection, id, fn) => {
      const t = table(collection);
      const next = fn(t.get(id) ?? null);
      if (next) t.set(id, next);
      else t.delete(id);
    },
  };

  return createEngine(backend, {
    clock: opts.clock ?? systemClock,
    userId: opts.userId ?? (() => undefined),
  });
}
