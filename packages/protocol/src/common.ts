import * as z from 'zod/mini';

/** Any JSON-serialisable value. */
export const Json = z.json();
export type JsonValue = z.infer<typeof Json>;

/** `<appId>/<kind>:<id>` — the on-the-wire room name. */
export const RoomName = z
  .string()
  .check(
    z.regex(/^[a-z0-9-]{1,40}\/[a-z]+:[A-Za-z0-9_.:-]{1,120}$/, 'must look like "app/kind:id"'),
  );

/** Dotted lower-case topic, e.g. `chat.message-updated`. */
export const Topic = z
  .string()
  .check(z.regex(/^[a-z]+(\.[a-z-]+)+$/, 'must look like "kind.event"'));

export const ERROR_CODES = [
  'CONFIG_INVALID',
  'PLUGIN_NOT_FOUND',
  'PLUGIN_SETUP_FAILED',
  'ADAPTER_MISSING',
  'SERVICE_MISSING',
  'TRANSPORT_CLOSED',
  'TIMEOUT',
  'CONFLICT',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'VALIDATION',
  'UPLOAD_TOO_LARGE',
  'UNKNOWN',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const ErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.optional(Json),
});
export type WireError = z.infer<typeof ErrorSchema>;

export const UserInfoSchema = z.object({
  id: z.string().check(z.minLength(1), z.maxLength(200)),
  name: z.string().check(z.minLength(1), z.maxLength(200)),
  avatarUrl: z.optional(z.string().check(z.maxLength(2048))),
  color: z.optional(z.string().check(z.maxLength(64))),
  roles: z.optional(z.array(z.string().check(z.maxLength(64))).check(z.maxLength(32))),
});

export const PeerSchema = z.object({
  peerId: z.string(),
  user: UserInfoSchema,
  presence: z.record(z.string(), Json),
});
export type WirePeer = z.infer<typeof PeerSchema>;

export const PROTOCOL_VERSION = 1 as const;
/** Largest accepted frame in bytes. */
export const MAX_FRAME_BYTES: number = 64 * 1024;
/** Largest accepted presence patch (serialised) in bytes. */
export const MAX_PRESENCE_BYTES: number = 2 * 1024;
