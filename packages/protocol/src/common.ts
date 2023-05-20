import { z } from 'zod';

/** Any JSON-serialisable value. */
export const Json = z.json();
export type JsonValue = z.infer<typeof Json>;

/** `<appId>/<kind>:<id>` — the on-the-wire room name. */
export const RoomName = z
  .string()
  .regex(/^[a-z0-9-]{1,40}\/[a-z]+:[A-Za-z0-9_.:-]{1,120}$/, 'must look like "app/kind:id"');

/** Dotted lower-case topic, e.g. `chat.message-updated`. */
export const Topic = z.string().regex(/^[a-z]+(\.[a-z-]+)+$/, 'must look like "kind.event"');

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
  details: Json.optional(),
});
export type WireError = z.infer<typeof ErrorSchema>;

export const UserInfoSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  avatarUrl: z.string().max(2048).optional(),
  color: z.string().max(64).optional(),
  roles: z.array(z.string().max(64)).max(32).optional(),
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
