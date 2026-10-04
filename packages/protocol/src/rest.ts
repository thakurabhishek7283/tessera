import * as z from 'zod/mini';
import { ErrorSchema, Json, UserInfoSchema } from './common.js';

/** Error envelope returned by every REST endpoint. */
export const ErrorEnvelope = z.object({ error: ErrorSchema });

export const DocDto = z.object({
  id: z.string(),
  data: Json,
  version: z.int().check(z.positive()),
  updatedAt: z.string(),
  updatedBy: z.optional(z.string()),
});
export type DocResponse = z.infer<typeof DocDto>;

export const PageDto = z.object({ items: z.array(DocDto), nextCursor: z.optional(z.string()) });

const FIELD = /^[A-Za-z0-9_]{1,40}$/;

/** Path params shared by the /v1/docs routes. */
export const DocParams = z.object({
  appId: z.string().check(z.regex(/^[a-z0-9-]{1,40}$/)),
  collection: z.string().check(z.regex(/^[a-z][A-Za-z0-9_.-]{0,79}$/)),
  id: z.optional(z.string().check(z.minLength(1), z.maxLength(200))),
});

/** Query for `GET /v1/docs/:appId/:collection` (`where[field]=value`). */
export const DocListQuery = z.object({
  where: z.optional(z.record(z.string().check(z.regex(FIELD)), z.string())),
  orderBy: z.optional(z.string().check(z.regex(FIELD))),
  dir: z._default(z.enum(['asc', 'desc']), 'asc'),
  limit: z._default(z.coerce.number().check(z.int(), z.gte(1), z.lte(200)), 50),
  cursor: z.optional(z.string().check(z.maxLength(512))),
});

export const DocPutBody = z.object({ data: Json });

export const ConflictBody = z.object({
  error: ErrorSchema,
  current: DocDto,
});

export const GuestAuthBody = z.object({ name: z.string().check(z.minLength(1), z.maxLength(60)) });
export const GuestAuthRes = z.object({ token: z.string(), user: UserInfoSchema });

export const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.optional(z.string()),
  credential: z.optional(z.string()),
});
export const IceRes = z.object({ iceServers: z.array(IceServer) });

export const UploadRes = z.object({
  id: z.string(),
  url: z.string(),
  mime: z.string(),
  size: z.int().check(z.nonnegative()),
  width: z.optional(z.int().check(z.positive())),
  height: z.optional(z.int().check(z.positive())),
});

export const HealthRes = z.object({ ok: z.literal(true), version: z.string(), uptime: z.number() });

/** A `where` value as the client sends it: query strings carry no type information. */
export type WhereValue = string | number | boolean | null;

/** Encodes a typed filter value for a `where[field]=…` query parameter. */
export function encodeWhereValue(value: WhereValue): string {
  return value === null ? 'null' : String(value);
}

/**
 * Typed values a raw query-string filter may stand for, e.g. `"1"` → `["1", 1]`. Servers match a
 * document if its field equals any candidate, which keeps `where: { rank: 1 }` working over HTTP.
 */
export function whereCandidates(raw: string): WhereValue[] {
  const out: WhereValue[] = [raw];
  if (raw === 'null') out.push(null);
  else if (raw === 'true') out.push(true);
  else if (raw === 'false') out.push(false);
  else if (raw.trim() !== '' && Number.isFinite(Number(raw))) out.push(Number(raw));
  return out;
}
