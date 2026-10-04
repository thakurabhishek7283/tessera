import { createStore, type Doc, type Peer, type Room, type Transport } from '@tessera-kit/core';
import { describe, expect, it } from 'vitest';
import { createRestStorage } from '../src/rest.js';

interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

function fakeServer(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, fetchFn };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const auth = (token: string | null) => ({
  getUser: () => null,
  getToken: async () => token,
  onChange: () => () => {},
});

const doc = (version: number): Doc<{ n: number }> => ({
  id: 'a',
  data: { n: version },
  version,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('RestStorage', () => {
  it('GETs a doc with a bearer token and returns null on 404', async () => {
    const { calls, fetchFn } = fakeServer((c) =>
      c.url.pathname.endsWith('/missing') ? json(404, {}) : json(200, doc(1)),
    );
    const s = createRestStorage({
      baseUrl: 'https://api.test/',
      appId: 'demo',
      auth: auth('tok'),
      fetch: fetchFn,
    });
    expect((await s.get('kanban.cards', 'a'))?.version).toBe(1);
    expect(await s.get('kanban.cards', 'missing')).toBeNull();
    expect(calls[0]?.url.href).toBe('https://api.test/v1/docs/demo/kanban.cards/a');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer tok');
  });

  it('omits the authorization header when there is no token', async () => {
    const { calls, fetchFn } = fakeServer(() => json(200, doc(1)));
    const s = createRestStorage({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: fetchFn,
    });
    await s.get('c', 'a');
    expect(calls[0]?.headers.has('authorization')).toBe(false);
  });

  it('encodes list queries as where[field], orderBy, dir, limit and cursor', async () => {
    const { calls, fetchFn } = fakeServer(() => json(200, { items: [], nextCursor: 'n' }));
    const s = createRestStorage({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: fetchFn,
    });
    const page = await s.list('c', {
      where: { column: 'todo', done: false, owner: null, rank: 2 },
      orderBy: { field: 'rank', dir: 'desc' },
      limit: 10,
      cursor: 'abc',
    });
    expect(page.nextCursor).toBe('n');
    const q = calls[0]?.url.searchParams;
    expect(q?.get('where[column]')).toBe('todo');
    expect(q?.get('where[done]')).toBe('false');
    expect(q?.get('where[owner]')).toBe('null');
    expect(q?.get('where[rank]')).toBe('2');
    expect(q?.get('orderBy')).toBe('rank');
    expect(q?.get('dir')).toBe('desc');
    expect(q?.get('limit')).toBe('10');
    expect(q?.get('cursor')).toBe('abc');
  });

  it('PUTs data with If-Match when a version is given', async () => {
    const { calls, fetchFn } = fakeServer(() => json(200, doc(4)));
    const s = createRestStorage({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: fetchFn,
    });
    await s.put('c', { id: 'a', data: { n: 1 }, version: 3 });
    await s.put('c', { id: 'b', data: { n: 1 } });
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { data: { n: 1 } } });
    expect(calls[0]?.headers.get('if-match')).toBe('3');
    expect(calls[1]?.headers.has('if-match')).toBe(false);
  });

  it('turns a 409 into CONFLICT carrying the server copy', async () => {
    const current = doc(7);
    const { fetchFn } = fakeServer(() =>
      json(409, { error: { code: 'CONFLICT', message: 'stale' }, current }),
    );
    const s = createRestStorage({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: fetchFn,
    });
    await expect(s.put('c', { id: 'a', data: { n: 1 }, version: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'stale',
      details: { current },
    });
  });

  it('maps HTTP statuses without an envelope to error codes', async () => {
    for (const [status, code] of [
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [429, 'RATE_LIMITED'],
      [500, 'UNKNOWN'],
    ] as const) {
      const { fetchFn } = fakeServer(() => new Response('oops', { status }));
      const s = createRestStorage({
        baseUrl: 'https://api.test',
        appId: 'demo',
        auth: auth(null),
        fetch: fetchFn,
      });
      await expect(s.get('c', 'a')).rejects.toMatchObject({ code });
    }
  });

  it('DELETE sends If-Match and ignores 404', async () => {
    const { calls, fetchFn } = fakeServer((c) =>
      c.url.pathname.endsWith('/gone') ? json(404, {}) : new Response(null, { status: 204 }),
    );
    const s = createRestStorage({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: fetchFn,
    });
    await s.delete('c', 'a', 2);
    await expect(s.delete('c', 'gone')).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'DELETE' });
    expect(calls[0]?.headers.get('if-match')).toBe('2');
  });

  it('url-encodes path segments', async () => {
    const { calls, fetchFn } = fakeServer(() => json(200, doc(1)));
    const s = createRestStorage({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: fetchFn,
    });
    await s.get('c', 'a/b c');
    expect(calls[0]?.url.pathname).toBe('/v1/docs/demo/c/a%2Fb%20c');
  });

  describe('watch', () => {
    function fakeTransport() {
      const handlers = new Map<string, (data: unknown, from: Peer | 'server') => void>();
      const joined: string[] = [];
      let left = 0;
      const room = {
        name: 'docs:c',
        on: (topic: string, fn: (data: unknown, from: Peer | 'server') => void) => {
          handlers.set(topic, fn);
          return () => handlers.delete(topic);
        },
        leave: async () => {
          left++;
        },
      } as unknown as Room;
      const transport = {
        state: createStore('open' as const),
        capabilities: {
          serverHistory: true,
          serverPersistence: true,
          directMessages: true as const,
        },
        connect: async () => {},
        disconnect: () => {},
        join: async (name: string) => {
          joined.push(name);
          return room;
        },
      } as Transport;
      return { transport, handlers, joined, left: () => left };
    }

    it('maps doc.changed broadcasts for the collection and ignores junk', async () => {
      const t = fakeTransport();
      const s = createRestStorage({
        baseUrl: 'https://api.test',
        appId: 'demo',
        auth: auth(null),
        transport: () => t.transport,
      });
      const seen: DocChangeLike[] = [];
      const stop = s.watch?.('c', (c) => seen.push(c));
      await new Promise((r) => setTimeout(r, 0));
      expect(t.joined).toEqual(['docs:c']);
      const handler = t.handlers.get('doc.changed');
      handler?.({ collection: 'c', id: 'a', version: 2 }, 'server');
      handler?.({ collection: 'other', id: 'a', version: 2 }, 'server');
      handler?.({ nonsense: true }, 'server');
      stop?.();
      await new Promise((r) => setTimeout(r, 0));
      expect(seen).toEqual([{ collection: 'c', id: 'a', version: 2 }]);
      expect(t.left()).toBe(1);
    });

    it('does nothing without a transport', () => {
      const s = createRestStorage({
        baseUrl: 'https://api.test',
        appId: 'demo',
        auth: auth(null),
        transport: () => null,
      });
      expect(() => s.watch?.('c', () => {})()).not.toThrow();
    });

    it('leaves the room if unsubscribed before the join completes', async () => {
      const t = fakeTransport();
      const s = createRestStorage({
        baseUrl: 'https://api.test',
        appId: 'demo',
        auth: auth(null),
        transport: () => t.transport,
      });
      s.watch?.('c', () => {})();
      await new Promise((r) => setTimeout(r, 0));
      expect(t.left()).toBe(1);
      expect(t.handlers.size).toBe(0);
    });
  });
});

type DocChangeLike = { collection: string; id: string; version: number };
