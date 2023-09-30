import { z } from 'zod';
import { TesseraError } from './errors.js';
import type { TesseraConfig } from './types.js';

const fn = z.custom<(...args: never[]) => unknown>(
  (v) => typeof v === 'function',
  'must be a function',
);
const obj = z.custom<object>((v) => typeof v === 'object' && v !== null, 'must be an object');

const UserInfoSchema = z.object({
  id: z.string().min(1).describe('Stable user id.'),
  name: z.string().min(1).describe('Display name.'),
  avatarUrl: z.string().optional().describe('Image URL. Initials are shown when missing.'),
  color: z.string().optional().describe('CSS colour. Derived from the id when missing.'),
  roles: z.array(z.string()).optional().describe('Role names such as `moderator`.'),
});

const ThemeModeSchema = z.enum(['light', 'dark', 'auto']);

/** Validates a {@link TesseraConfig}. Feature options are validated later by each plugin. */
export const TesseraConfigSchema: z.ZodType<TesseraConfig> = z.object({
  appId: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, 'must match /^[a-z0-9-]{1,40}$/')
    .describe(
      'Namespace for storage keys and room names. Lower-case letters, digits and dashes, up to 40 characters.',
    ),
  auth: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('static'),
        user: UserInfoSchema.describe('The signed-in user.'),
        token: z.string().optional().describe('Bearer token sent to the server and REST storage.'),
      }),
      z.object({
        type: z.literal('guest'),
        name: z.string().optional().describe('Display name. Random when omitted.'),
      }),
      z.object({
        type: z.literal('custom'),
        provider: obj.describe('An AuthProvider implementation.'),
      }),
    ])
    .optional()
    .describe(
      'Who the current user is. Default `guest`: a random identity remembered in localStorage.',
    ),
  transport: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('none') }),
      z.object({
        type: z.literal('local'),
        channel: z
          .string()
          .optional()
          .describe('BroadcastChannel name suffix; tabs on the same channel see each other.'),
      }),
      z.object({
        type: z.literal('websocket'),
        url: z
          .string()
          .regex(/^wss?:\/\//, 'must start with ws:// or wss://')
          .describe('WebSocket endpoint of tessera-server, e.g. `wss://example.com/v1/ws`.'),
        reconnect: z
          .object({
            initialDelayMs: z.number().positive().describe('First reconnect delay. Default 500.'),
            maxDelayMs: z.number().positive().describe('Upper bound for the delay. Default 30000.'),
            factor: z.number().min(1).describe('Delay multiplier per failed attempt. Default 2.'),
            jitter: z
              .number()
              .min(0)
              .max(1)
              .describe('Random spread as a fraction of the delay. Default 0.3.'),
            maxQueue: z
              .number()
              .int()
              .nonnegative()
              .describe('Outbound messages kept while offline. Default 200.'),
          })
          .partial()
          .optional()
          .describe('Backoff tuning. Every field is optional.'),
      }),
      z.object({ type: z.literal('custom'), create: fn.describe('Factory `(ctx) => Transport`.') }),
    ])
    .optional()
    .describe('How tabs and servers talk to each other. Default `none`.'),
  storage: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('memory') }),
      z.object({ type: z.literal('local') }),
      z.object({
        type: z.literal('indexeddb'),
        dbName: z.string().optional().describe('Database name. Defaults to `tessera-<appId>`.'),
      }),
      z.object({
        type: z.literal('rest'),
        baseUrl: z.string().min(1).describe('Base URL of a server implementing `/v1/docs`.'),
      }),
      z.object({
        type: z.literal('custom'),
        adapter: obj.describe('A StorageAdapter implementation.'),
      }),
    ])
    .optional()
    .describe('Where documents live. Default `memory`.'),
  uploads: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('dataurl'),
        maxBytes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Size limit per file. Default 1000000.'),
      }),
      z.object({
        type: z.literal('rest'),
        baseUrl: z.string().min(1).describe('Base URL of a server implementing `/v1/uploads`.'),
        maxBytes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Size limit per file. Default 5242880.'),
      }),
      z.object({
        type: z.literal('custom'),
        adapter: obj.describe('An UploadAdapter implementation.'),
      }),
    ])
    .optional()
    .describe(
      'How files are stored. Default `dataurl`: small files are inlined and no server is needed.',
    ),
  theme: z
    .object({
      mode: ThemeModeSchema.optional().describe(
        '`light`, `dark` or `auto` (follow the OS). Default `auto`.',
      ),
      tokens: z
        .record(z.string().regex(/^--/, 'must start with --'), z.string())
        .optional()
        .describe('CSS custom property overrides, e.g. `{ "--tessera-color-primary": "#0a7" }`.'),
    })
    .optional(),
  locale: z
    .string()
    .min(2)
    .optional()
    .describe('BCP 47 tag such as `en` or `de-CH`. Defaults to the browser language, then `en`.'),
  messages: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional()
    .describe('Message overrides as locale → key → template. These win over every plugin catalog.'),
  features: z
    .record(
      z.string(),
      z.looseObject({
        enabled: z
          .boolean()
          .describe('Turn the feature on. A disabled feature never loads its code.'),
      }),
    )
    .describe('Feature id → options. Each plugin validates its own options when it is set up.'),
  debug: z.boolean().optional().describe('Log debug output through the instance logger.'),
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
