export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Scoped logger. Library code logs through this instead of using `console` directly. */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(scope: string): Logger;
}

export interface LogSink {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

/** Creates a logger that writes to `sink` (default `console`) at or above `level`. */
export function createLogger(level: LogLevel, sink: LogSink = console, scope = 'tessera'): Logger {
  const emit =
    (name: keyof LogSink) =>
    (...args: unknown[]): void => {
      if (ORDER[name] >= ORDER[level]) sink[name](`[${scope}]`, ...args);
    };
  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    child: (child) => createLogger(level, sink, `${scope}:${child}`),
  };
}
