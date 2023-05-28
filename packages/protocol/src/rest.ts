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
