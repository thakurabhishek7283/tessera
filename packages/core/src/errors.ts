/** Stable machine-readable error codes used across all Tessera packages. */
export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'PLUGIN_NOT_FOUND'
  | 'PLUGIN_SETUP_FAILED'
  | 'ADAPTER_MISSING'
  | 'SERVICE_MISSING'
  | 'TRANSPORT_CLOSED'
  | 'TIMEOUT'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'UPLOAD_TOO_LARGE'
  | 'UNKNOWN';

/** Error type thrown or emitted by Tessera. Always carries a {@link ErrorCode}. */
export class TesseraError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, opts: { details?: unknown; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'TesseraError';
    this.code = code;
    if (opts.details !== undefined) this.details = opts.details;
  }

  /** Narrowing helper that also works across duplicated package instances. */
  static is(value: unknown, code?: ErrorCode): value is TesseraError {
    return (
      value instanceof Error &&
      value.name === 'TesseraError' &&
      (code === undefined || (value as TesseraError).code === code)
    );
  }

  /** Wraps any thrown value into a TesseraError. */
  static from(value: unknown, fallback: ErrorCode = 'UNKNOWN'): TesseraError {
    if (TesseraError.is(value)) return value;
    const message = value instanceof Error ? value.message : String(value);
    return new TesseraError(fallback, message, { cause: value });
  }

  toJSON(): { code: ErrorCode; message: string; details?: unknown } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}
