import type { Clock, Doc, DocChange, Logger, StorageAdapter } from '@tessera-kit/core';
import { systemClock } from '@tessera-kit/core';
import { createEngine, type DocBackend } from './engine.js';

const SOFT_LIMIT_BYTES = 2 * 1024 * 1024;

export interface LocalStorageOptions {
  appId: string;
  clock?: Clock;
  userId?: () => string | undefined;
  logger?: Logger;
  /** Defaults to `globalThis.localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Defaults to `globalThis`; must dispatch `storage` events written by other tabs. */
  events?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

type Table = Record<string, Doc<unknown>>;

/** Persists collections as one JSON map per collection in `localStorage`. Small data only. */
export function createLocalStorageAdapter(opts: LocalStorageOptions): StorageAdapter {
  const store = opts.storage ?? globalThis.localStorage;
  const events = opts.events ?? (globalThis as unknown as EventTarget);
  const keyOf = (collection: string): string => `tessera:${opts.appId}:${collection}`;

  const read = (collection: string): Table => {
    try {
      const raw = store.getItem(keyOf(collection));
      return raw ? (JSON.parse(raw) as Table) : {};
    } catch (error) {
      opts.logger?.warn(`could not read collection "${collection}"`, error);
      return {};
    }
  };

  const write = (collection: string, table: Table): void => {
    const raw = JSON.stringify(table);
    if (raw.length > SOFT_LIMIT_BYTES) {
      opts.logger?.warn(
        `collection "${collection}" is ${(raw.length / 1024 / 1024).toFixed(1)} MB; use the indexeddb storage for larger data`,
      );
    }
    store.setItem(keyOf(collection), raw);
  };

  const backend: DocBackend = {
    get: async (collection, id) => read(collection)[id] ?? null,
    all: async (collection) => Object.values(read(collection)),
    mutate: async (collection, id, fn) => {
      const table = read(collection);
      const next = fn(table[id] ?? null);
      if (next) table[id] = next;
      else delete table[id];
      write(collection, table);
    },
    external(collection, fn) {
      // Another tab wrote the key: diff against what we last saw to report precise changes.
      let known = read(collection);
      const listener = (event: Event): void => {
        const e = event as unknown as { key: string | null; newValue: string | null };
        if (e.key !== keyOf(collection)) return;
        const next: Table = e.newValue ? (JSON.parse(e.newValue) as Table) : {};
        for (const [id, doc] of Object.entries(next)) {
          if (known[id]?.version !== doc.version) {
            fn({
              collection,
              id,
              version: doc.version,
              ...(doc.updatedBy ? { by: doc.updatedBy } : {}),
            });
          }
        }
        for (const [id, doc] of Object.entries(known)) {
          if (!(id in next))
            fn({ collection, id, version: doc.version + 1, deleted: true } satisfies DocChange);
        }
        known = next;
      };
      events.addEventListener('storage', listener);
      return () => events.removeEventListener('storage', listener);
    },
  };

  return createEngine(backend, {
    clock: opts.clock ?? systemClock,
    userId: opts.userId ?? (() => undefined),
  });
}
