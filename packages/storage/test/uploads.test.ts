import { type AuthProvider, createIdGenerator } from '@tessera/core';
import { describe, expect, it, vi } from 'vitest';
import {
  blobToDataUrl,
  createDataUrlUploads,
  createRestUploads,
  matchesAccept,
} from '../src/uploads.js';

const ids = createIdGenerator();
const png = (bytes = 10) => new Blob([new Uint8Array(bytes)], { type: 'image/png' });
const auth = (token: string | null): AuthProvider => ({
  getUser: () => null,
  getToken: async () => token,
  onChange: () => () => {},
});

describe('matchesAccept', () => {
  it('supports wildcards and exact types, case-insensitively', () => {
    expect(matchesAccept('image/png', ['image/*'])).toBe(true);
    expect(matchesAccept('IMAGE/PNG', ['image/png'])).toBe(true);
    expect(matchesAccept('application/pdf', ['image/*'])).toBe(false);
    expect(matchesAccept('imagex/png', ['image/*'])).toBe(false);
  });
});

describe('blobToDataUrl', () => {
  it('encodes bytes as base64 including large blobs', async () => {
    expect(await blobToDataUrl(new Blob(['hello'], { type: 'text/plain' }))).toBe(
      'data:text/plain;base64,aGVsbG8=',
    );
    const big = new Blob([new Uint8Array(100_000).fill(65)], { type: 'text/plain' });
    const url = await blobToDataUrl(big);
    expect(atob(url.split(',')[1] ?? '')).toBe('A'.repeat(100_000));
  });
});

describe('DataUrlUploads', () => {
  it('returns a data URL with id, mime and size', async () => {
    const up = createDataUrlUploads({ ids, imageProcessor: async () => null });
    const progress: number[] = [];
    const res = await up.upload(png(20), { onProgress: (f) => progress.push(f) });
    expect(res.url).toMatch(/^data:image\/png;base64,/);
    expect(res).toMatchObject({ mime: 'image/png', size: 20 });
    expect(res.id).toHaveLength(26);
    expect(progress.at(-1)).toBe(1);
  });

  it('rejects disallowed types and oversized files with distinct codes', async () => {
    const up = createDataUrlUploads({ ids, maxBytes: 100, imageProcessor: async () => null });
    await expect(up.upload(new Blob(['x'], { type: 'text/html' }))).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(up.upload(png(101))).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
  });

  it('applies the size limit after downscaling and reports dimensions', async () => {
    const up = createDataUrlUploads({
      ids,
      maxBytes: 100,
      imageProcessor: async () => ({ blob: png(50), width: 1600, height: 900 }),
    });
    const res = await up.upload(png(5000));
    expect(res).toMatchObject({ width: 1600, height: 900, size: 50 });
  });

  it('honours an already-aborted signal', async () => {
    const up = createDataUrlUploads({ ids, imageProcessor: async () => null });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(up.upload(png(), { signal: ctrl.signal })).rejects.toBeDefined();
  });
});

describe('RestUploads', () => {
  const okBody = { id: 'u1', url: '/uploads/u1.png', mime: 'image/png', size: 10 };

  it('posts multipart with auth and resolves relative URLs against baseUrl', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(okBody),
    );
    const up = createRestUploads({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth('tok'),
      fetch: fetchFn as never,
    });
    const res = await up.upload(png(), { name: 'pic.png' });
    expect(res.url).toBe('https://api.test/uploads/u1.png');
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.test/v1/uploads/demo');
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe('Bearer tok');
    expect((init?.body as FormData | undefined)?.get('file')).toBeInstanceOf(Blob);
  });

  it('validates locally before sending anything', async () => {
    const fetchFn = vi.fn();
    const up = createRestUploads({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: fetchFn as never,
      maxBytes: 5,
    });
    await expect(up.upload(png(6))).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps server errors and malformed responses', async () => {
    const err = createRestUploads({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: (async () =>
        Response.json({ error: { code: 'FORBIDDEN', message: 'nope' } }, { status: 403 })) as never,
    });
    await expect(err.upload(png())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const bad = createRestUploads({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth(null),
      fetch: (async () => Response.json({ nope: 1 })) as never,
    });
    await expect(bad.upload(png())).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('reports progress through XHR when requested', async () => {
    class FakeXhr {
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      status = 200;
      statusText = 'OK';
      responseText = JSON.stringify(okBody);
      responseType = '';
      headers: Record<string, string> = {};
      open = vi.fn();
      setRequestHeader = (k: string, v: string) => {
        this.headers[k] = v;
      };
      abort = vi.fn();
      send = () => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
        this.onload?.();
      };
    }
    const xhr = new FakeXhr();
    const up = createRestUploads({
      baseUrl: 'https://api.test',
      appId: 'demo',
      auth: auth('tok'),
      createXhr: () => xhr as never,
    });
    const progress: number[] = [];
    const res = await up.upload(png(), { onProgress: (f) => progress.push(f) });
    expect(progress).toEqual([0.5, 1]);
    expect(xhr.headers.authorization).toBe('Bearer tok');
    expect(res.id).toBe('u1');
  });
});
