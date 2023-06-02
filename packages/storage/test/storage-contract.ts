import type { StorageAdapter } from '@tessera/core';
import { describe, expect, it } from 'vitest';

interface Card {
  title: string;
  column: string;
  rank: number;
  done?: boolean;
}

/**
 * Behaviour every StorageAdapter must share. Adapters run this suite so that kits can swap
 * them without surprises.
 */
export function storageContract(
  name: string,
  make: () => StorageAdapter | Promise<StorageAdapter>,
): void {
  describe(`${name} (storage contract)`, () => {
    it('returns null for missing docs and creates docs at version 1', async () => {
      const s = await make();
      expect(await s.get('kanban.cards', 'nope')).toBeNull();
      const doc = await s.put<Card>('kanban.cards', {
        id: 'a',
        data: { title: 'A', column: 'todo', rank: 1 },
      });
      expect(doc).toMatchObject({ id: 'a', version: 1 });
      expect(new Date(doc.updatedAt).toString()).not.toBe('Invalid Date');
      expect(await s.get<Card>('kanban.cards', 'a')).toEqual(doc);
    });

    it('increments the version on every put', async () => {
      const s = await make();
      await s.put('c', { id: 'a', data: { n: 1 } });
      const second = await s.put('c', { id: 'a', data: { n: 2 } });
      expect(second.version).toBe(2);
      expect((await s.get<{ n: number }>('c', 'a'))?.data.n).toBe(2);
    });

    it('rejects stale versions with CONFLICT and the current doc', async () => {
      const s = await make();
      const v1 = await s.put('c', { id: 'a', data: { n: 1 } });
      await s.put('c', { id: 'a', data: { n: 2 }, version: v1.version });
      await expect(
        s.put('c', { id: 'a', data: { n: 3 }, version: v1.version }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { current: { version: 2, data: { n: 2 } } },
      });
    });

    it('treats version 0 as create-only', async () => {
      const s = await make();
      await s.put('c', { id: 'a', data: { n: 1 }, version: 0 });
      await expect(s.put('c', { id: 'a', data: { n: 2 }, version: 0 })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('deletes docs, honouring the optional version check', async () => {
      const s = await make();
      const doc = await s.put('c', { id: 'a', data: {} });
      await expect(s.delete('c', 'a', doc.version + 5)).rejects.toMatchObject({ code: 'CONFLICT' });
      await s.delete('c', 'a', doc.version);
      expect(await s.get('c', 'a')).toBeNull();
      await expect(s.delete('c', 'a')).resolves.toBeUndefined();
    });

    it('lists with where, orderBy and pagination', async () => {
      const s = await make();
      const rows: Card[] = [
        { title: 'c', column: 'todo', rank: 3 },
        { title: 'a', column: 'todo', rank: 1 },
        { title: 'b', column: 'doing', rank: 2 },
        { title: 'd', column: 'todo', rank: 4, done: true },
      ];
      for (const [i, row] of rows.entries()) await s.put('cards', { id: `id${i}`, data: row });

      const todo = await s.list<Card>('cards', {
        where: { column: 'todo' },
        orderBy: { field: 'rank' },
      });
      expect(todo.items.map((d) => d.data.title)).toEqual(['a', 'c', 'd']);

      const desc = await s.list<Card>('cards', { orderBy: { field: 'rank', dir: 'desc' } });
      expect(desc.items.map((d) => d.data.title)).toEqual(['d', 'c', 'b', 'a']);

      const done = await s.list<Card>('cards', { where: { done: true } });
      expect(done.items.map((d) => d.data.title)).toEqual(['d']);

      const first = await s.list<Card>('cards', { orderBy: { field: 'rank' }, limit: 3 });
      expect(first.items).toHaveLength(3);
      expect(first.nextCursor).toBeTypeOf('string');
      const rest = await s.list<Card>('cards', {
        orderBy: { field: 'rank' },
        limit: 3,
        cursor: first.nextCursor!,
      });
      expect(rest.items.map((d) => d.data.title)).toEqual(['d']);
      expect(rest.nextCursor).toBeUndefined();
    });

    it('keeps collections separate', async () => {
      const s = await make();
      await s.put('a', { id: '1', data: 'x' });
      await s.put('b', { id: '1', data: 'y' });
      expect((await s.get('a', '1'))?.data).toBe('x');
      expect((await s.list('b')).items).toHaveLength(1);
    });

    it('rejects malformed cursors', async () => {
      const s = await make();
      await expect(s.list('c', { cursor: '%%%' })).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('notifies watchers about local writes and deletes', async () => {
      const s = await make();
      const seen: Array<[string, number, boolean | undefined]> = [];
      const stop = s.watch?.('c', (c) => seen.push([c.id, c.version, c.deleted]));
      expect(stop).toBeTypeOf('function');
      await s.put('c', { id: 'a', data: 1 });
      await s.put('c', { id: 'a', data: 2 });
      await s.delete('c', 'a');
      await s.put('other', { id: 'a', data: 1 });
      stop?.();
      await s.put('c', { id: 'b', data: 1 });
      expect(seen).toEqual([
        ['a', 1, undefined],
        ['a', 2, undefined],
        ['a', 3, true],
      ]);
    });
  });
}
