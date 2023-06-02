import {
  type Clock,
  type Doc,
  type DocChange,
  type ListQuery,
  type Page,
  type StorageAdapter,
  TesseraError,
  type Unsubscribe,
} from '@tessera/core';

/**
 * Minimal persistence primitive. Every local adapter implements this and gets identical
 * versioning, filtering, sorting, pagination and change notification from {@link createEngine}.
 */
export interface DocBackend {
  get(collection: string, id: string): Promise<Doc<unknown> | null>;
  all(collection: string): Promise<Array<Doc<unknown>>>;
  /**
   * Atomic read-modify-write. `fn` receives the current doc (or null) and returns the doc to
   * store, or null to delete it. It must be synchronous so it can run inside a transaction.
   */
  mutate(
    collection: string,
    id: string,
    fn: (current: Doc<unknown> | null) => Doc<unknown> | null,
  ): Promise<void>;
  /** Changes made elsewhere (other tabs). Optional. */
  external?(collection: string, fn: (change: DocChange) => void): Unsubscribe;
}

export interface EngineOptions {
  clock: Clock;
  /** Id recorded in `updatedBy`. */
  userId: () => string | undefined;
  /** Called after each local write so cross-tab backends can notify other tabs. */
  announce?: (change: DocChange) => void;
}

/** Builds a {@link StorageAdapter} on top of a {@link DocBackend}. */
export function createEngine(backend: DocBackend, opts: EngineOptions): StorageAdapter {
  const watchers = new Map<string, Set<(change: DocChange) => void>>();

  const emitLocal = (change: DocChange): void => {
    for (const fn of [...(watchers.get(change.collection) ?? [])]) fn(change);
  };

  return {
    async get<T>(collection: string, id: string) {
      return (await backend.get(collection, id)) as Doc<T> | null;
    },

    async list<T>(collection: string, q: ListQuery = {}): Promise<Page<Doc<T>>> {
      const docs = await backend.all(collection);
      return paginate(docs, q) as Page<Doc<T>>;
    },

    async put<T>(collection: string, input: { id: string; data: T; version?: number }) {
      let stored: Doc<unknown> | undefined;
      await backend.mutate(collection, input.id, (current) => {
        if (input.version !== undefined) {
          const expected = current?.version ?? 0;
          if (input.version !== expected) {
            throw new TesseraError(
              'CONFLICT',
              `Version mismatch for ${collection}/${input.id}: expected ${input.version}, found ${expected}`,
              { details: { current } },
            );
          }
        }
        const by = opts.userId();
        stored = {
          id: input.id,
          data: input.data,
          version: (current?.version ?? 0) + 1,
          updatedAt: new Date(opts.clock.now()).toISOString(),
          ...(by ? { updatedBy: by } : {}),
        };
        return stored;
      });
      const doc = stored as Doc<unknown>;
      const change: DocChange = {
        collection,
        id: doc.id,
        version: doc.version,
        ...(doc.updatedBy ? { by: doc.updatedBy } : {}),
      };
      emitLocal(change);
      opts.announce?.(change);
      return doc as Doc<T>;
    },

    async delete(collection, id, version) {
      let removed: Doc<unknown> | null = null;
      await backend.mutate(collection, id, (current) => {
        if (version !== undefined && version !== (current?.version ?? 0)) {
          throw new TesseraError('CONFLICT', `Version mismatch for ${collection}/${id}`, {
            details: { current },
          });
        }
        removed = current;
        return null;
      });
      const gone = removed as Doc<unknown> | null;
      if (!gone) return;
      const by = opts.userId();
      const change: DocChange = {
        collection,
        id,
        version: gone.version + 1,
        deleted: true,
        ...(by ? { by } : {}),
      };
      emitLocal(change);
      opts.announce?.(change);
    },

    watch(collection, fn) {
      let set = watchers.get(collection);
      if (!set) {
        set = new Set();
        watchers.set(collection, set);
      }
      set.add(fn);
      const stopExternal = backend.external?.(collection, fn);
      return () => {
        set.delete(fn);
        stopExternal?.();
      };
    },
  };
}

// ---------- query helpers (shared by every adapter that lists in memory) ----------

function readField(data: unknown, field: string): unknown {
  return data !== null && typeof data === 'object'
    ? (data as Record<string, unknown>)[field]
    : undefined;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1; // missing values sort last
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

export function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ offset })).replace(/=+$/, '');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor)) as { offset?: unknown };
    return typeof parsed.offset === 'number' && parsed.offset >= 0 ? Math.floor(parsed.offset) : 0;
  } catch {
    throw new TesseraError('VALIDATION', 'Invalid cursor');
  }
}

/** Applies `where`, `orderBy`, `limit` and `cursor` to an in-memory document list. */
export function paginate(docs: Array<Doc<unknown>>, q: ListQuery): Page<Doc<unknown>> {
  let items = docs;
  if (q.where) {
    const entries = Object.entries(q.where);
    items = items.filter((doc) =>
      entries.every(([field, value]) => readField(doc.data, field) === value),
    );
  }
  const field = q.orderBy?.field;
  const sign = q.orderBy?.dir === 'desc' ? -1 : 1;
  items = [...items].sort((a, b) => {
    const primary = field ? compare(readField(a.data, field), readField(b.data, field)) * sign : 0;
    return primary || compare(a.id, b.id);
  });

  const offset = decodeCursor(q.cursor);
  const limit = q.limit ?? items.length;
  const page = items.slice(offset, offset + limit);
  const next = offset + limit;
  return { items: page, ...(next < items.length ? { nextCursor: encodeCursor(next) } : {}) };
}
