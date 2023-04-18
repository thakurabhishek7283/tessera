import { describe, expect, it } from 'vitest';
import { TesseraError } from '../src/errors.js';
import { colorForId, createIdGenerator } from '../src/ids.js';
import { createLogger } from '../src/logger.js';

describe('createIdGenerator', () => {
  it('produces 26-char Crockford base32 ids', () => {
    const id = createIdGenerator().next();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('is strictly increasing, including within the same millisecond', () => {
    const ids = createIdGenerator({ clock: { now: () => 1_700_000_000_000 } });
    const seen = Array.from({ length: 200 }, () => ids.next());
    expect([...seen].sort()).toEqual(seen);
    expect(new Set(seen).size).toBe(200);
  });

  it('sorts by time across milliseconds', () => {
    let t = 1000;
    const ids = createIdGenerator({ clock: { now: () => t } });
    const a = ids.next();
    t = 1001;
    const b = ids.next();
    expect(a < b).toBe(true);
  });

  it('carries over when the random part overflows', () => {
    const max = () => new Uint8Array(16).fill(31);
    const ids = createIdGenerator({ clock: { now: () => 5 }, random: max });
    const a = ids.next();
    const b = ids.next();
    expect(a.endsWith('Z'.repeat(16))).toBe(true);
    expect(b.endsWith('0'.repeat(16))).toBe(true);
  });
});

describe('colorForId', () => {
  it('is deterministic', () => {
    expect(colorForId('u1')).toBe(colorForId('u1'));
    expect(colorForId('u1')).not.toBe(colorForId('u2'));
  });
});

describe('TesseraError', () => {
  it('carries code, details and cause', () => {
    const cause = new Error('boom');
    const err = new TesseraError('CONFLICT', 'stale', { details: { v: 2 }, cause });
    expect(err.code).toBe('CONFLICT');
    expect(err.details).toEqual({ v: 2 });
    expect(err.cause).toBe(cause);
    expect(TesseraError.is(err, 'CONFLICT')).toBe(true);
    expect(TesseraError.is(err, 'TIMEOUT')).toBe(false);
    expect(err.toJSON()).toEqual({ code: 'CONFLICT', message: 'stale', details: { v: 2 } });
  });

  it('wraps unknown values', () => {
    expect(TesseraError.from('x').code).toBe('UNKNOWN');
    const e = new TesseraError('TIMEOUT', 't');
    expect(TesseraError.from(e)).toBe(e);
  });
});

describe('createLogger', () => {
  it('filters by level and prefixes scope', () => {
    const calls: unknown[][] = [];
    const sink = {
      debug: (...a: unknown[]) => calls.push(['debug', ...a]),
      info: (...a: unknown[]) => calls.push(['info', ...a]),
      warn: (...a: unknown[]) => calls.push(['warn', ...a]),
      error: (...a: unknown[]) => calls.push(['error', ...a]),
    };
    const log = createLogger('warn', sink).child('kanban');
    log.debug('no');
    log.warn('yes');
    expect(calls).toEqual([['warn', '[tessera:kanban]', 'yes']]);
  });
});
