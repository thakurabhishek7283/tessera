import { z } from 'zod';
import { ErrorSchema, Json, UserInfoSchema } from './common.js';

/** Error envelope returned by every REST endpoint. */
export const ErrorEnvelope = z.object({ error: ErrorSchema });

export const DocDto = z.object({
  id: z.string(),
  data: Json,
  version: z.number().int().positive(),
  updatedAt: z.string(),
  updatedBy: z.string().optional(),
});
export type DocResponse = z.infer<typeof DocDto>;

export const PageDto = z.object({ items: z.array(DocDto), nextCursor: z.string().optional() });

const FIELD = /^[A-Za-z0-9_]{1,40}$/;

/** Path params shared by the /v1/docs routes. */
export const DocParams = z.object({
  appId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  collection: z.string().regex(/^[a-z][A-Za-z0-9_.-]{0,79}$/),
  id: z.string().min(1).max(200).optional(),
});

/** Query for `GET /v1/docs/:appId/:collection` (`where[field]=value`). */
export const DocListQuery = z.object({
  where: z.record(z.string().regex(FIELD), z.string()).optional(),
  orderBy: z.string().regex(FIELD).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(512).optional(),
});

export const DocPutBody = z.object({ data: Json });

export const ConflictBody = z.object({
  error: ErrorSchema,
  current: DocDto,
});

export const GuestAuthBody = z.object({ name: z.string().min(1).max(60) });
export const GuestAuthRes = z.object({ token: z.string(), user: UserInfoSchema });

export const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export const IceRes = z.object({ iceServers: z.array(IceServer) });

export const UploadRes = z.object({
  id: z.string(),
  url: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
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
