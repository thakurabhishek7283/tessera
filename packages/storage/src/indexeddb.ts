import type { Clock, Doc, DocChange, StorageAdapter } from '@tessera-kit/core';
import { systemClock } from '@tessera-kit/core';
import { type IDBPDatabase, openDB } from 'idb';
import { createEngine, type DocBackend } from './engine.js';

export interface IndexedDbOptions {
  appId: string;
  dbName?: string;
  clock?: Clock;
  userId?: () => string | undefined;
}

interface Row extends Doc<unknown> {
  collection: string;
}

const STORE = 'docs';

interface Announcement {
  origin: string;
  change: DocChange;
}

/**
 * IndexedDB-backed storage for demo-scale data. Writes are atomic per document; other tabs are
 * told about changes through a BroadcastChannel so `watch` works across tabs.
 */
export function createIndexedDbStorage(opts: IndexedDbOptions): StorageAdapter {
  const dbName = opts.dbName ?? `tessera-${opts.appId}`;
  const channelName = `tessera-db:${opts.appId}`;
  const origin = Math.random().toString(36).slice(2);
  let dbPromise: Promise<IDBPDatabase> | undefined;

  const db = (): Promise<IDBPDatabase> => {
    dbPromise ??= openDB(dbName, 1, {
      upgrade(database) {
        const store = database.createObjectStore(STORE, { keyPath: ['collection', 'id'] });
        store.createIndex('collection', 'collection');
      },
    });
    return dbPromise;
  };

  const strip = ({ collection: _c, ...doc }: Row): Doc<unknown> => doc;

  const backend: DocBackend = {
    async get(collection, id) {
      const row = (await (await db()).get(STORE, [collection, id])) as Row | undefined;
      return row ? strip(row) : null;
    },
    async all(collection) {
      const rows = (await (await db()).getAllFromIndex(STORE, 'collection', collection)) as Row[];
      return rows.map(strip);
    },
    async mutate(collection, id, fn) {
      const tx = (await db()).transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const existing = (await store.get([collection, id])) as Row | undefined;
      let next: Doc<unknown> | null;
      try {
        next = fn(existing ? strip(existing) : null);
      } catch (error) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw error;
      }
      if (next) await store.put({ ...next, collection } satisfies Row);
      else await store.delete([collection, id]);
      await tx.done;
    },
    external(collection, fn) {
      if (typeof BroadcastChannel === 'undefined') return () => {};
      const channel = new BroadcastChannel(channelName);
      channel.onmessage = (event: MessageEvent<Announcement>) => {
        // A channel object in the same tab also hears our own announcer: skip those.
        if (event.data.origin !== origin && event.data.change.collection === collection) {
          fn(event.data.change);
        }
      };
      return () => channel.close();
    },
  };

  const announcer =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName);

  return createEngine(backend, {
    clock: opts.clock ?? systemClock,
    userId: opts.userId ?? (() => undefined),
    announce: (change) => announcer?.postMessage({ origin, change } satisfies Announcement),
  });
}
