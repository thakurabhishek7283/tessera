import {
  type AuthProvider,
  type IdGenerator,
  TesseraError,
  type UploadAdapter,
  type UploadResult,
} from '@tessera/core';
import { UploadRes } from '@tessera/protocol';
import { errorFromResponse, joinUrl } from './http.js';

export const DEFAULT_ACCEPT: string[] = ['image/*', 'application/pdf'];

/** True when `mime` matches an allowlist entry such as `image/*` or `application/pdf`. */
export function matchesAccept(mime: string, accept: string[]): boolean {
  const type = mime.toLowerCase();
  return accept.some((rule) => {
    const r = rule.toLowerCase();
    return r.endsWith('/*') ? type.startsWith(r.slice(0, -1)) : type === r;
  });
}

function assertUploadable(
  file: Blob,
  adapter: Pick<UploadAdapter, 'accept' | 'maxBytes'>,
  size = file.size,
): void {
  if (!matchesAccept(file.type, adapter.accept)) {
    throw new TesseraError(
      'VALIDATION',
      `Files of type "${file.type || 'unknown'}" are not allowed`,
      {
        details: { accept: adapter.accept },
      },
    );
  }
  if (size > adapter.maxBytes) {
    throw new TesseraError(
      'UPLOAD_TOO_LARGE',
      `File is ${size} bytes; the limit is ${adapter.maxBytes}`,
      {
        details: { size, maxBytes: adapter.maxBytes },
      },
    );
  }
}

// ---------- data URL uploads (default; demos) ----------

export interface ImageInfo {
  blob: Blob;
  width: number;
  height: number;
}

/** Reads dimensions and, when larger than `maxDimension`, returns a downscaled copy. */
export type ImageProcessor = (blob: Blob, maxDimension: number) => Promise<ImageInfo | null>;

/** Default processor: uses `createImageBitmap` + `OffscreenCanvas` where available. */
export const browserImageProcessor: ImageProcessor = async (blob, maxDimension) => {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 || typeof OffscreenCanvas !== 'function' || blob.type === 'image/gif') {
      return { blob, width: bitmap.width, height: bitmap.height };
    }
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob, width: bitmap.width, height: bitmap.height };
    ctx.drawImage(bitmap, 0, 0, width, height);
    const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return { blob: await canvas.convertToBlob({ type, quality: 0.85 }), width, height };
  } finally {
    bitmap.close();
  }
};

export interface DataUrlUploadsOptions {
  ids: IdGenerator;
  maxBytes?: number;
  accept?: string[];
  /** Longest side after downscaling. */
  maxDimension?: number;
  imageProcessor?: ImageProcessor;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

/** Inlines small files as `data:` URLs. Images are downscaled first. No server needed. */
export function createDataUrlUploads(opts: DataUrlUploadsOptions): UploadAdapter {
  const adapter: UploadAdapter = {
    maxBytes: opts.maxBytes ?? 1_000_000,
    accept: opts.accept ?? DEFAULT_ACCEPT,
    async upload(file, uploadOpts) {
      uploadOpts?.signal?.throwIfAborted();
      assertUploadable(file, { accept: adapter.accept, maxBytes: Number.POSITIVE_INFINITY });
      let blob = file;
      let dimensions: { width: number; height: number } | undefined;
      if (file.type.startsWith('image/')) {
        const processed = await (opts.imageProcessor ?? browserImageProcessor)(
          file,
          opts.maxDimension ?? 1600,
        );
        if (processed) {
          blob = processed.blob;
          dimensions = { width: processed.width, height: processed.height };
        }
      }
      // The size limit applies to what is actually stored, i.e. after downscaling.
      assertUploadable(blob, adapter);
      uploadOpts?.onProgress?.(0.5);
      const url = await blobToDataUrl(blob);
      uploadOpts?.signal?.throwIfAborted();
      uploadOpts?.onProgress?.(1);
      const result: UploadResult = {
        id: opts.ids.next(),
        url,
        mime: blob.type,
        size: blob.size,
        ...dimensions,
      };
      return result;
    },
  };
  return adapter;
}

// ---------- REST uploads ----------

export interface RestUploadsOptions {
  baseUrl: string;
  appId: string;
  auth: AuthProvider;
  maxBytes?: number;
  accept?: string[];
  fetch?: typeof fetch;
  /** Factory for progress-capable requests; defaults to `new XMLHttpRequest()` when available. */
  createXhr?: () => XMLHttpRequest;
}

/** Uploads multipart to `POST {baseUrl}/v1/uploads/{appId}`; reports progress through XHR. */
export function createRestUploads(opts: RestUploadsOptions): UploadAdapter {
  const adapter: UploadAdapter = {
    maxBytes: opts.maxBytes ?? 5 * 1024 * 1024,
    accept: opts.accept ?? DEFAULT_ACCEPT,
    async upload(file, uploadOpts) {
      uploadOpts?.signal?.throwIfAborted();
      assertUploadable(file, adapter);
      const url = joinUrl(opts.baseUrl, `v1/uploads/${encodeURIComponent(opts.appId)}`);
      const form = new FormData();
      form.append('file', file, uploadOpts?.name ?? (file instanceof File ? file.name : 'upload'));
      const token = await opts.auth.getToken();

      const createXhr =
        opts.createXhr ??
        (typeof XMLHttpRequest === 'undefined' ? undefined : () => new XMLHttpRequest());
      const body =
        uploadOpts?.onProgress && createXhr
          ? await postWithProgress(
              createXhr(),
              url,
              form,
              token,
              uploadOpts.onProgress,
              uploadOpts.signal,
            )
          : await postWithFetch(
              opts.fetch ?? ((...a) => globalThis.fetch(...a)),
              url,
              form,
              token,
              uploadOpts?.signal,
            );

      const parsed = UploadRes.safeParse(body);
      if (!parsed.success) {
        throw new TesseraError('UNKNOWN', 'The upload endpoint returned an unexpected response');
      }
      const { width, height, ...rest } = parsed.data;
      const result: UploadResult = {
        ...rest,
        url: new URL(parsed.data.url, opts.baseUrl).href,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      };
      return result;
    },
  };
  return adapter;
}

async function postWithFetch(
  doFetch: typeof fetch,
  url: string,
  form: FormData,
  token: string | null,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const res = await doFetch(url, {
    method: 'POST',
    body: form,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw await errorFromResponse(res);
  return res.json();
}

function postWithProgress(
  xhr: XMLHttpRequest,
  url: string,
  form: FormData,
  token: string | null,
  onProgress: (fraction: number) => void,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    xhr.open('POST', url);
    xhr.responseType = 'text';
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        parsed = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(parsed);
        return;
      }
      void errorFromResponse(
        new Response(JSON.stringify(parsed ?? null), {
          status: xhr.status,
          statusText: xhr.statusText,
        }),
      ).then(reject);
    };
    xhr.onerror = () => reject(new TesseraError('TRANSPORT_CLOSED', 'Network error during upload'));
    xhr.onabort = () => reject(signal?.reason ?? new DOMException('Upload aborted', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
