import { z } from 'zod';
import { TesseraError } from './errors.js';
import type { TesseraConfig } from './types.js';

const fn = z.custom<(...args: never[]) => unknown>(
  (v) => typeof v === 'function',
  'must be a function',
);
const obj = z.custom<object>((v) => typeof v === 'object' && v !== null, 'must be an object');

const UserInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().optional(),
  color: z.string().optional(),
  roles: z.array(z.string()).optional(),
});

const ThemeModeSchema = z.enum(['light', 'dark', 'auto']);

/** Validates a {@link TesseraConfig}. Feature options are validated later by each plugin. */
export const TesseraConfigSchema: z.ZodType<TesseraConfig> = z.object({
  appId: z.string().regex(/^[a-z0-9-]{1,40}$/, 'must match /^[a-z0-9-]{1,40}$/'),
  auth: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('static'), user: UserInfoSchema, token: z.string().optional() }),
      z.object({ type: z.literal('guest'), name: z.string().optional() }),
      z.object({ type: z.literal('custom'), provider: obj }),
    ])
    .optional(),
  transport: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('none') }),
      z.object({ type: z.literal('local'), channel: z.string().optional() }),
      z.object({
        type: z.literal('websocket'),
        url: z.string().regex(/^wss?:\/\//, 'must start with ws:// or wss://'),
        reconnect: z
          .object({
            initialDelayMs: z.number().positive(),
            maxDelayMs: z.number().positive(),
            factor: z.number().min(1),
            jitter: z.number().min(0).max(1),
            maxQueue: z.number().int().nonnegative(),
          })
          .partial()
          .optional(),
      }),
      z.object({ type: z.literal('custom'), create: fn }),
    ])
    .optional(),
  storage: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('memory') }),
      z.object({ type: z.literal('local') }),
      z.object({ type: z.literal('indexeddb'), dbName: z.string().optional() }),
      z.object({ type: z.literal('rest'), baseUrl: z.string().min(1) }),
      z.object({ type: z.literal('custom'), adapter: obj }),
    ])
    .optional(),
  uploads: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('dataurl'), maxBytes: z.number().int().positive().optional() }),
      z.object({
        type: z.literal('rest'),
        baseUrl: z.string().min(1),
        maxBytes: z.number().int().positive().optional(),
      }),
      z.object({ type: z.literal('custom'), adapter: obj }),
    ])
    .optional(),
  theme: z
    .object({
      mode: ThemeModeSchema.optional(),
      tokens: z.record(z.string().regex(/^--/, 'must start with --'), z.string()).optional(),
    })
    .optional(),
  locale: z.string().min(2).optional(),
  messages: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  features: z.record(z.string(), z.looseObject({ enabled: z.boolean() })),
  debug: z.boolean().optional(),
}) as unknown as z.ZodType<TesseraConfig>;

/** Formats zod issues as readable `path: message` lines. */
export function formatIssues(prefix: string, issues: ReadonlyArray<z.core.$ZodIssue>): string {
  return issues
    .map((issue) => {
      const path = [prefix, ...issue.path.map(String)].filter(Boolean).join('.');
      return `${path || '(root)'}: ${issue.message}`;
    })
    .join('\n');
}

/** Parses `input` with `schema`, throwing `CONFIG_INVALID` with readable paths. */
export function parseConfig<T>(schema: z.ZodType<T>, input: unknown, prefix = ''): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new TesseraError(
    'CONFIG_INVALID',
    `Invalid configuration:\n${formatIssues(prefix, result.error.issues)}`,
    { details: result.error.issues },
  );
}
