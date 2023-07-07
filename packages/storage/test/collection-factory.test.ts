import { createStore, createTessera, type Transport } from '@tessera/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCollection } from '../src/collection.js';
import { createStorage, createUploads } from '../src/factory.js';
import { createMemoryStorage } from '../src/memory.js';

const Card = z.object({ title: z.string().min(1), rank: z.number() });
const logger = () => {
  const warn = vi.fn();
  return { warn, logger: { debug() {}, info() {}, warn, error() {}, child: () => ({}) as never } };
};

describe('createCollection', () => {
  it('requires a namespaced name', () => {
    const { logger: l } = logger();
    const ctx = { storage: () => createMemoryStorage(), logger: l };
    expect(() => createCollection(ctx, 'cards', Card)).toThrowError(/<featureId>\.<collection>/);
    expect(() => createCollection(ctx, 'kanban.cards', Card)).not.toThrow();
  });

  it('validates on write and keeps stored data typed', async () => {
    const { logger: l } = logger();
    const storage = createMemoryStorage();
    const cards = createCollection({ storage: () => storage, logger: l }, 'kanban.cards', Card);
    await expect(cards.put({ id: 'a', data: { title: '', rank: 1 } })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    const doc = await cards.put({ id: 'a', data: { title: 'Write tests', rank: 1 } });
    expect(doc.version).toBe(1);
    expect((await cards.get('a'))?.data.title).toBe('Write tests');
  });

  it('drops and logs invalid documents on read instead of throwing', async () => {
    const storage = createMemoryStorage();
    const { logger: l, warn } = logger();
    await storage.put('kanban.cards', { id: 'good', data: { title: 'ok', rank: 1 } });
    await storage.put('kanban.cards', { id: 'bad', data: { title: 5 } });
    const cards = createCollection({ storage: () => storage, logger: l }, 'kanban.cards', Card);
    expect(await cards.get('bad')).toBeNull();
    const page = await cards.list();
    expect(page.items.map((d) => d.id)).toEqual(['good']);
    expect(warn).toHaveBeenCalled();
  });

  it('passes conflicts through and watch degrades to a no-op without adapter support', async () => {
    const storage = createMemoryStorage();
    const { logger: l } = logger();
    const cards = createCollection(
      {
        storage: () => ({
          get: storage.get,
          list: storage.list,
          put: storage.put,
          delete: storage.delete,
        }),
        logger: l,
      },
      'kanban.cards',
      Card,
    );
    const doc = await cards.put({ id: 'a', data: { title: 't', rank: 1 } });
    await expect(
      cards.put({ id: 'a', data: { title: 'u', rank: 1 }, version: doc.version + 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(() => cards.watch(() => {})()).not.toThrow();
  });
});

describe('adapter factories with createTessera', () => {
  const transport = { state: createStore('open' as const) } as unknown as Transport;

  it('builds every storage type from config', async () => {
    for (const type of ['memory', 'local'] as const) {
      const t = createTessera(
        { appId: 'demo', features: {}, storage: { type } },
        {
          plugins: {},
          adapters: {
            storage: (cfg, ctx) =>
              type === 'local' ? createStorage(cfg, { ...ctx }) : createStorage(cfg, ctx),
          },
        },
      );
      if (type === 'memory') {
        const doc = await t.ctx.storage().put('c', { id: 'a', data: 1 });
        expect(doc.updatedBy).toMatch(/^guest-/);
      }
    }
    expect(transport).toBeDefined();
  });

  it('creates rest storage and dataurl uploads', () => {
    const t = createTessera(
      {
        appId: 'demo',
        features: {},
        storage: { type: 'rest', baseUrl: 'https://api.test' },
        uploads: { type: 'dataurl', maxBytes: 10 },
      },
      { plugins: {}, adapters: { storage: createStorage, uploads: createUploads } },
    );
    expect(typeof t.ctx.storage().get).toBe('function');
    expect(t.ctx.uploads().maxBytes).toBe(10);
  });
});
