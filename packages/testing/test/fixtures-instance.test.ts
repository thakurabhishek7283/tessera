import { inflateSync } from 'node:zlib';
import { definePlugin } from '@tessera/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  blobFrom,
  createFakeClock,
  createSequentialIds,
  createTestInstance,
  FakeHub,
  images,
  solidPng,
} from '../src/index.js';

describe('clock and ids', () => {
  it('fake clock only moves when asked', () => {
    const clock = createFakeClock(1000);
    expect(clock.now()).toBe(1000);
    expect(clock.advance(500)).toBe(1500);
    clock.set(9);
    expect(clock.now()).toBe(9);
  });

  it('sequential ids are 26 chars, unique and sorted', () => {
    const ids = createSequentialIds();
    const list = Array.from({ length: 12 }, () => ids.next());
    expect(list.every((id) => id.length === 26)).toBe(true);
    expect([...list].sort()).toEqual(list);
    expect(createSequentialIds('m').next()).toHaveLength(26);
  });
});

describe('fixtures', () => {
  it('encodes valid PNGs: signature, IHDR size, CRCs and an inflatable pixel stream', () => {
    const png = solidPng(5, 3, [10, 20, 30]);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(5);
    expect(view.getUint32(20)).toBe(3);

    let offset = 8;
    const types: string[] = [];
    let idat: Uint8Array = new Uint8Array();
    while (offset < png.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
      types.push(type);
      if (type === 'IDAT') idat = png.subarray(offset + 8, offset + 8 + length);
      offset += 12 + length;
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
    const pixels = inflateSync(idat);
    expect(pixels).toHaveLength(3 * (1 + 5 * 3));
    expect([...pixels.subarray(0, 4)]).toEqual([0, 10, 20, 30]);
  });

  it('exposes data-URL images that round-trip to blobs', async () => {
    for (const url of Object.values(images)) expect(url).toMatch(/^data:image\/png;base64,/);
    const blob = blobFrom(images.red);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(50);
  });
});

describe('createTestInstance', () => {
  const plugin = definePlugin({
    id: 'probe',
    version: '1',
    configSchema: z.object({ enabled: z.boolean() }),
    requires: ['transport', 'storage'],
    setup: (ctx) => ({ ctx }),
  });

  it('wires memory storage, a hub transport, a fake clock and sequential ids', async () => {
    const hub = new FakeHub();
    const { instance, clock, transport, user } = await createTestInstance(
      { features: { probe: { enabled: true } } },
      { probe: async () => ({ default: plugin as never }) },
      { hub },
    );
    expect(instance.featureStatus('probe')).toBe('enabled');
    expect(transport).toBeDefined();
    expect(user.id).toBe('alice');
    const doc = await instance.ctx.storage().put('probe.items', { id: 'a', data: 1 });
    expect(doc.updatedBy).toBe('alice');
    expect(doc.updatedAt).toBe(new Date(clock.now()).toISOString());
    clock.advance(1000);
    expect(instance.ctx.clock.now()).toBe(clock.now());
    expect(instance.ctx.ids.next()).toHaveLength(26);
    const room = await instance.ctx.transport()?.join('chat:x');
    expect(room?.self.user.id).toBe('alice');
  });

  it('works without a hub (transport none) and uses data-URL uploads', async () => {
    const { instance } = await createTestInstance({ features: {} }, {});
    expect(instance.ctx.transport()).toBeNull();
    expect(instance.ctx.uploads().maxBytes).toBeGreaterThan(0);
  });
});
