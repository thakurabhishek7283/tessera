import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createIndexedDbStorage } from '../src/indexeddb.js';
import { storageContract } from './storage-contract.js';

let counter = 0;
const uniqueApp = () => `app-${++counter}-${Math.random().toString(36).slice(2, 8)}`;

storageContract('IndexedDbStorage', () => createIndexedDbStorage({ appId: uniqueApp() }));

describe('IndexedDbStorage', () => {
  it('persists across adapter instances sharing a database', async () => {
    const appId = uniqueApp();
    await createIndexedDbStorage({ appId }).put('c', { id: 'a', data: { kept: true } });
    expect(
      (await createIndexedDbStorage({ appId }).get<{ kept: boolean }>('c', 'a'))?.data.kept,
    ).toBe(true);
  });

  it('does not leave a partial write behind when a version check fails', async () => {
    const s = createIndexedDbStorage({ appId: uniqueApp() });
    await s.put('c', { id: 'a', data: 1 });
    await expect(s.put('c', { id: 'a', data: 2, version: 9 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await s.get('c', 'a'))?.data).toBe(1);
  });

  it('lets a second "tab" watch changes made by the first via BroadcastChannel', async () => {
    const appId = uniqueApp();
    const tabA = createIndexedDbStorage({ appId });
    const tabB = createIndexedDbStorage({ appId });
    const seen: Array<[string, number]> = [];
    const stop = tabB.watch?.('c', (c) => seen.push([c.id, c.version]));
    await tabA.put('c', { id: 'x', data: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop?.();
    expect(seen).toEqual([['x', 1]]);
  });

  it('resolves concurrent puts without losing version increments', async () => {
    const s = createIndexedDbStorage({ appId: uniqueApp() });
    await Promise.all(Array.from({ length: 5 }, (_, i) => s.put('c', { id: 'a', data: i })));
    expect((await s.get('c', 'a'))?.version).toBe(5);
  });
});
