import { type core, safeParse } from 'zod/mini';
import { TesseraError } from './errors.js';
import type { TesseraConfig } from './types.js';

/** Formats zod issues as readable `path: message` lines. */
export function formatIssues(
  prefix: string,
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string {
  return issues
    .map((issue) => {
      const path = [prefix, ...issue.path.map(String)].filter(Boolean).join('.');
      return `${path || '(root)'}: ${issue.message}`;
    })
    .join('\n');
}

function invalid(
  prefix: string,
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): TesseraError {
  return new TesseraError(
    'CONFIG_INVALID',
    `Invalid configuration:\n${formatIssues(prefix, issues)}`,
    { details: issues },
  );
}

/**
 * Parses `input` with a zod schema (classic or mini), throwing `CONFIG_INVALID` with readable
 * paths.
 */
export function parseConfig<T>(schema: core.$ZodType<T>, input: unknown, prefix = ''): T {
  const result = safeParse(schema, input);
  if (result.success) return result.data;
  throw invalid(prefix, result.error.issues);
}

const kind = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const ADAPTER_TYPES: Record<string, string[]> = {
  auth: ['static', 'guest', 'custom'],
  transport: ['none', 'local', 'websocket', 'custom'],
  storage: ['memory', 'local', 'indexeddb', 'rest', 'custom'],
  uploads: ['dataurl', 'rest', 'custom'],
};

/**
 * The production check: the few mistakes that would otherwise fail far from their cause (a bad
 * `appId`, a missing `features` object, an unknown adapter `type`). Development builds run the full
 * schema instead (see config-schema.ts). Messages match the schema's for the same input.
 */
export function checkConfig(config: unknown): TesseraConfig {
  const issues: Array<{ path: string[]; message: string }> = [];
  const add = (path: string[], message: string) => issues.push({ path, message });
  const c = isObject(config) ? config : {};
  const { appId, features } = c;
  if (typeof appId !== 'string') {
    add(['appId'], `Invalid input: expected string, received ${kind(appId)}`);
  } else if (!/^[a-z0-9-]{1,40}$/.test(appId)) {
    add(['appId'], 'must match /^[a-z0-9-]{1,40}$/');
  }
  for (const [key, types] of Object.entries(ADAPTER_TYPES)) {
    const value = c[key];
    if (value === undefined) continue;
    if (!isObject(value)) {
      add([key], `Invalid input: expected object, received ${kind(value)}`);
    } else if (!types.includes(value.type as string)) {
      add([key, 'type'], `Invalid discriminator value. Expected '${types.join("' | '")}'`);
    }
  }
  if (!isObject(features)) {
    add(['features'], `Invalid input: expected record, received ${kind(features)}`);
  }
  if (issues.length > 0) throw invalid('', issues);
  return config as TesseraConfig;
}
