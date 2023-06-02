import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../src/memory.js';
import { storageContract } from './storage-contract.js';

storageContract('MemoryStorage', () => createMemoryStorage());

describe('MemoryStorage', () => {
  it('stamps updatedAt from the injected clock and updatedBy from the user', async () => {
    const s = createMemoryStorage({
      clock: { now: () => Date.UTC(2026, 0, 2) },
      userId: () => 'u1',
    });
    const doc = await s.put('c', { id: 'a', data: 1 });
    expect(doc.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(doc.updatedBy).toBe('u1');
  });
});
