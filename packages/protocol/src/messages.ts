import * as z from 'zod/mini';
import {
  ErrorSchema,
  Json,
  PeerSchema,
  PROTOCOL_VERSION,
  RoomName,
  Topic,
  UserInfoSchema,
} from './common.js';

const v = z.literal(PROTOCOL_VERSION);

/** Frames sent by clients. */
export const ClientMsg = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), v, token: z.nullable(z.string()), appId: z.string() }),
  z.object({ t: z.literal('join'), id: z.string(), room: RoomName, presence: z.optional(Json) }),
  z.object({ t: z.literal('leave'), room: RoomName }),
  z.object({ t: z.literal('pub'), room: RoomName, topic: Topic, data: Json }),
  z.object({ t: z.literal('direct'), room: RoomName, to: z.string(), topic: Topic, data: Json }),
  z.object({ t: z.literal('presence'), room: RoomName, patch: Json }),
  z.object({ t: z.literal('req'), id: z.string(), room: RoomName, topic: Topic, data: Json }),
  z.object({ t: z.literal('ping'), ts: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMsg>;

/** Frames sent by the server. */
export const ServerMsg = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('welcome'),
    v,
    peerId: z.string(),
    user: UserInfoSchema,
    serverTime: z.number(),
  }),
  z.object({ t: z.literal('joined'), id: z.string(), room: RoomName, peers: z.array(PeerSchema) }),
  z.object({ t: z.literal('peer-join'), room: RoomName, peer: PeerSchema }),
  z.object({ t: z.literal('peer-leave'), room: RoomName, peerId: z.string() }),
  z.object({ t: z.literal('presence'), room: RoomName, peerId: z.string(), patch: Json }),
  z.object({
    t: z.literal('msg'),
    room: RoomName,
    topic: Topic,
    data: Json,
    /** A peerId, or `'server'`. */
    from: z.string(),
    ts: z.number(),
  }),
  // One `res` shape for success and failure: discriminated unions need unique tags.
  z
    .object({
      t: z.literal('res'),
      id: z.string(),
      ok: z.boolean(),
      data: z.optional(Json),
      error: z.optional(ErrorSchema),
    })
    .check(
      z.refine((m) => (m.ok ? m.data !== undefined : m.error !== undefined), {
        message: 'ok responses need `data`, failed responses need `error`',
      }),
    ),
  z.object({ t: z.literal('error'), error: ErrorSchema, ref: z.optional(z.string()) }),
  z.object({ t: z.literal('pong'), ts: z.number(), serverTime: z.number() }),
]);
export type ServerMessage = z.infer<typeof ServerMsg>;

/** Close codes used by the reference server. */
export const CloseCode = {
  HelloTimeout: 4001,
  Unauthorized: 4003,
  ProtocolViolation: 4008,
  FrameTooLarge: 1009,
  GoingAway: 1001,
} as const;

/** Encodes a frame, enforcing the size limit. */
export function encodeFrame(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

/** Result of {@link decodeFrame}. */
export type DecodeResult<T> = { ok: true; msg: T } | { ok: false; reason: string };

/** Parses raw text into a validated client frame. */
export function decodeClientFrame(raw: string): DecodeResult<ClientMessage> {
  return decode(raw, ClientMsg);
}

/** Parses raw text into a validated server frame. */
export function decodeServerFrame(raw: string): DecodeResult<ServerMessage> {
  return decode(raw, ServerMsg);
}

function decode<T>(raw: string, schema: z.ZodMiniType<T>): DecodeResult<T> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid JSON' };
  }
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, msg: parsed.data }
    : {
        ok: false,
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
}
