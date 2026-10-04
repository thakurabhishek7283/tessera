// The full schema of TesseraConfig, written with zod/mini. createTessera runs it in development
// builds only: production bundles drop this module (the package has no side effects and the only
// use sits behind a `process.env.NODE_ENV` check), and run the small check in config.ts instead.
// The docs generator and the JSON Schema for editors are built from it too.
import * as z from 'zod/mini';
import type { TesseraConfig } from './types.js';

// zod/mini ships without message text ("Invalid input"). Development builds want the same readable
// messages as classic zod, so the English locale is loaded here, with the schema.
z.config(z.locales.en());

/** Attaches a description for the docs generator and JSON Schema (classic zod's `.describe`). */
const describe = <T extends z.ZodMiniType>(schema: T, description: string): T =>
  schema.check(z.describe(description));

const fn = () =>
  z.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', 'must be a function');
const obj = () => z.custom<object>((v) => typeof v === 'object' && v !== null, 'must be an object');
const nonEmpty = () => z.string().check(z.minLength(1));
const positiveInt = () => z.int().check(z.positive());

const UserInfoSchema = z.object({
  id: describe(nonEmpty(), 'Stable user id.'),
  name: describe(nonEmpty(), 'Display name.'),
  avatarUrl: describe(z.optional(z.string()), 'Image URL. Initials are shown when missing.'),
  color: describe(z.optional(z.string()), 'CSS colour. Derived from the id when missing.'),
  roles: describe(z.optional(z.array(z.string())), 'Role names such as `moderator`.'),
});

const ThemeModeSchema = z.enum(['light', 'dark', 'auto']);

/** Validates a {@link TesseraConfig}. Feature options are validated later by each plugin. */
export const TesseraConfigSchema: z.ZodMiniType<TesseraConfig> = z.object({
  appId: describe(
    z.string().check(z.regex(/^[a-z0-9-]{1,40}$/, 'must match /^[a-z0-9-]{1,40}$/')),
    'Namespace for storage keys and room names. Lower-case letters, digits and dashes, up to 40 characters.',
  ),
  auth: describe(
    z.optional(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('static'),
          user: describe(UserInfoSchema, 'The signed-in user.'),
          token: describe(
            z.optional(z.string()),
            'Bearer token sent to the server and REST storage.',
          ),
        }),
        z.object({
          type: z.literal('guest'),
          name: describe(z.optional(z.string()), 'Display name. Random when omitted.'),
        }),
        z.object({
          type: z.literal('custom'),
          provider: describe(obj(), 'An AuthProvider implementation.'),
        }),
      ]),
    ),
    'Who the current user is. Default `guest`: a random identity remembered in localStorage.',
  ),
  transport: describe(
    z.optional(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('none') }),
        z.object({
          type: z.literal('local'),
          channel: describe(
            z.optional(z.string()),
            'BroadcastChannel name suffix; tabs on the same channel see each other.',
          ),
        }),
        z.object({
          type: z.literal('websocket'),
          url: describe(
            z.string().check(z.regex(/^wss?:\/\//, 'must start with ws:// or wss://')),
            'WebSocket endpoint of tessera-server, e.g. `wss://example.com/v1/ws`.',
          ),
          reconnect: describe(
            z.optional(
              z.partial(
                z.object({
                  initialDelayMs: describe(
                    z.number().check(z.positive()),
                    'First reconnect delay. Default 500.',
                  ),
                  maxDelayMs: describe(
                    z.number().check(z.positive()),
                    'Upper bound for the delay. Default 30000.',
                  ),
                  factor: describe(
                    z.number().check(z.gte(1)),
                    'Delay multiplier per failed attempt. Default 2.',
                  ),
                  jitter: describe(
                    z.number().check(z.gte(0), z.lte(1)),
                    'Random spread as a fraction of the delay. Default 0.3.',
                  ),
                  maxQueue: describe(
                    z.int().check(z.nonnegative()),
                    'Outbound messages kept while offline. Default 200.',
                  ),
                }),
              ),
            ),
            'Backoff tuning. Every field is optional.',
          ),
        }),
        z.object({
          type: z.literal('custom'),
          create: describe(fn(), 'Factory `(ctx) => Transport`.'),
        }),
      ]),
    ),
    'How tabs and servers talk to each other. Default `none`.',
  ),
  storage: describe(
    z.optional(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('memory') }),
        z.object({ type: z.literal('local') }),
        z.object({
          type: z.literal('indexeddb'),
          dbName: describe(z.optional(z.string()), 'Database name. Defaults to `tessera-<appId>`.'),
        }),
        z.object({
          type: z.literal('rest'),
          baseUrl: describe(nonEmpty(), 'Base URL of a server implementing `/v1/docs`.'),
        }),
        z.object({
          type: z.literal('custom'),
          adapter: describe(obj(), 'A StorageAdapter implementation.'),
        }),
      ]),
    ),
    'Where documents live. Default `memory`.',
  ),
  uploads: describe(
    z.optional(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('dataurl'),
          maxBytes: describe(z.optional(positiveInt()), 'Size limit per file. Default 1000000.'),
        }),
        z.object({
          type: z.literal('rest'),
          baseUrl: describe(nonEmpty(), 'Base URL of a server implementing `/v1/uploads`.'),
          maxBytes: describe(z.optional(positiveInt()), 'Size limit per file. Default 5242880.'),
        }),
        z.object({
          type: z.literal('custom'),
          adapter: describe(obj(), 'An UploadAdapter implementation.'),
        }),
      ]),
    ),
    'How files are stored. Default `dataurl`: small files are inlined and no server is needed.',
  ),
  theme: z.optional(
    z.object({
      mode: describe(
        z.optional(ThemeModeSchema),
        '`light`, `dark` or `auto` (follow the OS). Default `auto`.',
      ),
      tokens: describe(
        z.optional(z.record(z.string().check(z.regex(/^--/, 'must start with --')), z.string())),
        'CSS custom property overrides, e.g. `{ "--tessera-color-primary": "#0a7" }`.',
      ),
    }),
  ),
  locale: describe(
    z.optional(z.string().check(z.minLength(2))),
    'BCP 47 tag such as `en` or `de-CH`. Defaults to the browser language, then `en`.',
  ),
  messages: describe(
    z.optional(z.record(z.string(), z.record(z.string(), z.string()))),
    'Message overrides as locale → key → template. These win over every plugin catalog.',
  ),
  features: describe(
    z.record(
      z.string(),
      z.looseObject({
        enabled: describe(
          z.boolean(),
          'Turn the feature on. A disabled feature never loads its code.',
        ),
      }),
    ),
    'Feature id → options. Each plugin validates its own options when it is set up.',
  ),
  debug: describe(z.optional(z.boolean()), 'Log debug output through the instance logger.'),
}) as unknown as z.ZodMiniType<TesseraConfig>;
