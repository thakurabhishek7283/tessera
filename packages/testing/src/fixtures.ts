import type { UserInfo } from '@tessera/core';
import { deflateStored } from './png.js';

export const alice: UserInfo = { id: 'alice', name: 'Alice Archer', color: 'hsl(210 62% 42%)' };
export const bob: UserInfo = { id: 'bob', name: 'Bob Baker', color: 'hsl(30 62% 42%)' };
export const carol: UserInfo = {
  id: 'carol',
  name: 'Carol Chen',
  color: 'hsl(140 62% 42%)',
  roles: ['moderator'],
};
export const users: Record<'alice' | 'bob' | 'carol', UserInfo> = { alice, bob, carol };

/** Encodes an uncompressed solid-colour PNG. Tiny, valid and dependency-free. */
export function solidPng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Uint8Array {
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) raw.set(row, y * row.length);
  return encodePng(width, height, raw);
}

function encodePng(width: number, height: number, raw: Uint8Array): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(
      [...type].map((c) => c.charCodeAt(0)),
      4,
    );
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateStored(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Small solid-colour images as data URLs, handy for avatars and attachments. */
export const images: { red: string; green: string; blue: string } = {
  red: toDataUrl(solidPng(8, 8, [220, 38, 38]), 'image/png'),
  green: toDataUrl(solidPng(8, 8, [22, 163, 74]), 'image/png'),
  blue: toDataUrl(solidPng(8, 8, [37, 99, 235]), 'image/png'),
};

export function blobFrom(dataUrl: string): Blob {
  const [head, body = ''] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream';
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes as BlobPart], { type: mime });
}

/** Generic sample documents: neutral shapes that fit most kits' collections. */
export const sampleDocs: {
  cards: Array<{ id: string; data: { title: string; column: string; rank: string } }>;
  notes: Array<{ id: string; data: { text: string; color: string; x: number; y: number } }>;
} = {
  cards: [
    { id: 'c1', data: { title: 'Design the schema', column: 'todo', rank: 'a0' } },
    { id: 'c2', data: { title: 'Write the protocol', column: 'doing', rank: 'a0' } },
    { id: 'c3', data: { title: 'Ship v0.1', column: 'done', rank: 'a0' } },
  ],
  notes: [
    { id: 'n1', data: { text: 'Remember the milk', color: '#fde68a', x: 40, y: 40 } },
    { id: 'n2', data: { text: 'Call Bob', color: '#bbf7d0', x: 260, y: 80 } },
  ],
};
