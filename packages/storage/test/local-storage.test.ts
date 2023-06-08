import { describe, expect, it, vi } from 'vitest';
import { createLocalStorageAdapter } from '../src/local-storage.js';
import { storageContract } from './storage-contract.js';

/** A Storage stand-in plus an EventTarget that can simulate another tab's writes. */
function fakeEnv() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  const events = new EventTarget();
  const remoteWrite = (key: string, value: string | null) => {
    if (value === null) data.delete(key);
    else data.set(key, value);
    const e = new Event('storage') as Event & { key: string; newValue: string | null };
    e.key = key;
    e.newValue = value;
    events.dispatchEvent(e);
  };
  return { data, storage, events, remoteWrite };
}

storageContract('LocalStorageAdapter', () => {
  const env = fakeEnv();
  return createLocalStorageAdapter({ appId: 'demo', storage: env.storage, events: env.events });
});

describe('LocalStorageAdapter', () => {
  it('namespaces keys by app and collection', async () => {
    const env = fakeEnv();
    const s = createLocalStorageAdapter({
      appId: 'demo',
      storage: env.storage,
      events: env.events,
    });
    await s.put('kanban.cards', { id: 'a', data: 1 });
    expect([...env.data.keys()]).toEqual(['tessera:demo:kanban.cards']);
  });

  it('survives a new adapter instance (persistence)', async () => {
    const env = fakeEnv();
    const make = () =>
      createLocalStorageAdapter({ appId: 'demo', storage: env.storage, events: env.events });
    await make().put('c', { id: 'a', data: 'kept' });
    expect((await make().get('c', 'a'))?.data).toBe('kept');
  });

  it('tolerates corrupt JSON by treating the collection as empty', async () => {
    const env = fakeEnv();
    env.data.set('tessera:demo:c', '{not json');
    const warn = vi.fn();
    const s = createLocalStorageAdapter({
      appId: 'demo',
      storage: env.storage,
      events: env.events,
      logger: { debug() {}, info() {}, warn, error() {}, child: () => ({}) as never },
    });
    expect((await s.list('c')).items).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('reports changes written by other tabs through storage events', async () => {
    const env = fakeEnv();
    const s = createLocalStorageAdapter({
      appId: 'demo',
      storage: env.storage,
      events: env.events,
    });
    const seen: Array<[string, number, boolean | undefined]> = [];
    const stop = s.watch?.('c', (c) => seen.push([c.id, c.version, c.deleted]));

    const doc = (id: string, version: number) => ({ id, data: 1, version, updatedAt: 'x' });
    env.remoteWrite('tessera:demo:c', JSON.stringify({ a: doc('a', 1) }));
    env.remoteWrite('tessera:demo:c', JSON.stringify({ a: doc('a', 2), b: doc('b', 1) }));
    env.remoteWrite('tessera:demo:c', JSON.stringify({ b: doc('b', 1) }));
    env.remoteWrite('tessera:demo:other', JSON.stringify({ z: doc('z', 1) }));
    stop?.();
    env.remoteWrite('tessera:demo:c', JSON.stringify({}));

    expect(seen).toEqual([
      ['a', 1, undefined],
      ['a', 2, undefined],
      ['b', 1, undefined],
      ['a', 3, true],
    ]);
  });
});
