import { type ErrorCode, TesseraError } from '@tessera/core';
import { ErrorEnvelope } from '@tessera/protocol';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'UPLOAD_TOO_LARGE',
  422: 'VALIDATION',
  429: 'RATE_LIMITED',
};

/** Converts a non-2xx response into a {@link TesseraError}, preferring the server's envelope. */
export async function errorFromResponse(res: Response): Promise<TesseraError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const envelope = ErrorEnvelope.safeParse(body);
  const code = envelope.success
    ? envelope.data.error.code
    : (STATUS_CODES[res.status] ?? 'UNKNOWN');
  const message = envelope.success
    ? envelope.data.error.message
    : `HTTP ${res.status} ${res.statusText}`.trim();
  const current = (body as { current?: unknown } | undefined)?.current;
  const details =
    res.status === 409
      ? { current: current ?? null }
      : envelope.success
        ? envelope.data.error.details
        : undefined;
  return new TesseraError(code, message, details === undefined ? {} : { details });
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
