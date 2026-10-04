import type {
  AuthProvider,
  Doc,
  DocChange,
  ListQuery,
  Page,
  StorageAdapter,
  Transport,
  Unsubscribe,
} from '@tessera-kit/core';
import { DocChangedEvent, encodeWhereValue } from '@tessera-kit/protocol';
import { errorFromResponse, joinUrl } from './http.js';

export interface RestStorageOptions {
  baseUrl: string;
  appId: string;
  auth: AuthProvider;
  /** Used by `watch` to receive `doc.changed` broadcasts. Without it, `watch` is a no-op. */
  transport?: () => Transport | null;
  fetch?: typeof fetch;
}

/**
 * Storage backed by the `/v1/docs` REST API (see tessera-server). Optimistic concurrency uses
 * `If-Match: <version>`; a 409 becomes a `CONFLICT` error carrying the server's copy.
 */
export function createRestStorage(opts: RestStorageOptions): StorageAdapter {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const docsUrl = (collection: string, id?: string): string =>
    joinUrl(
      opts.baseUrl,
      `v1/docs/${encodeURIComponent(opts.appId)}/${encodeURIComponent(collection)}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`,
    );

  const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    const token = await opts.auth.getToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
    return doFetch(url, { ...init, headers });
  };

  return {
    async get<T>(collection: string, id: string) {
      const res = await request(docsUrl(collection, id));
      if (res.status === 404) return null;
      if (!res.ok) throw await errorFromResponse(res);
      return (await res.json()) as Doc<T>;
    },

    async list<T>(collection: string, q: ListQuery = {}) {
      const params = new URLSearchParams();
      for (const [field, value] of Object.entries(q.where ?? {})) {
        params.set(`where[${field}]`, encodeWhereValue(value));
      }
      if (q.orderBy) {
        params.set('orderBy', q.orderBy.field);
        params.set('dir', q.orderBy.dir ?? 'asc');
      }
      if (q.limit !== undefined) params.set('limit', String(q.limit));
      if (q.cursor) params.set('cursor', q.cursor);
      const query = params.toString();
      const res = await request(`${docsUrl(collection)}${query ? `?${query}` : ''}`);
      if (!res.ok) throw await errorFromResponse(res);
      return (await res.json()) as Page<Doc<T>>;
    },

    async put<T>(collection: string, doc: { id: string; data: T; version?: number }) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (doc.version !== undefined) headers['if-match'] = String(doc.version);
      const res = await request(docsUrl(collection, doc.id), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ data: doc.data }),
      });
      if (!res.ok) throw await errorFromResponse(res);
      return (await res.json()) as Doc<T>;
    },

    async delete(collection, id, version) {
      const headers: Record<string, string> = {};
      if (version !== undefined) headers['if-match'] = String(version);
      const res = await request(docsUrl(collection, id), { method: 'DELETE', headers });
      if (res.status === 404) return;
      if (!res.ok) throw await errorFromResponse(res);
    },

    watch(collection, fn): Unsubscribe {
      const transport = opts.transport?.();
      if (!transport) return () => {};
      let stopped = false;
      let leave: (() => Promise<void>) | undefined;
      let off: Unsubscribe | undefined;

      void transport
        .join(`docs:${collection}`)
        .then((room) => {
          if (stopped) return room.leave();
          off = room.on('doc.changed', (data) => {
            const parsed = DocChangedEvent.safeParse(data);
            if (parsed.success && parsed.data.collection === collection)
              fn(parsed.data as DocChange);
          });
          leave = () => room.leave();
          return undefined;
        })
        .catch(() => {
          // Live updates are best effort; reads and writes keep working without them.
        });

      return () => {
        stopped = true;
        off?.();
        void leave?.();
      };
    },
  };
}
