import {
  type Doc,
  type DocChange,
  formatIssues,
  type ListQuery,
  type Page,
  type TesseraContext,
  TesseraError,
  type Unsubscribe,
} from '@tessera/core';
import type { z } from 'zod';

/** A typed, validated view of one storage collection. */
export interface Collection<T> {
  /** Fully qualified name, `<featureId>.<collection>`. */
  readonly name: string;
  get(id: string): Promise<Doc<T> | null>;
  list(q?: ListQuery): Promise<Page<Doc<T>>>;
  put(doc: { id: string; data: T; version?: number }): Promise<Doc<T>>;
  delete(id: string, version?: number): Promise<void>;
  /** No-op when the storage adapter cannot report changes. */
  watch(fn: (change: DocChange) => void): Unsubscribe;
}

const NAME = /^[a-z][a-z0-9-]*\.[A-Za-z0-9_.-]+$/;

/**
 * Wraps `ctx.storage()` for one collection. Data is validated with `schema` on every read
 * (invalid documents are logged and dropped) and before every write (`VALIDATION` error).
 *
 * @param name namespaced as `<featureId>.<collection>`, e.g. `'kanban.cards'`
 */
export function createCollection<T>(
  ctx: Pick<TesseraContext, 'storage' | 'logger'>,
  name: string,
  schema: z.ZodType<T>,
): Collection<T> {
  if (!NAME.test(name)) {
    throw new TesseraError(
      'VALIDATION',
      `Collection name "${name}" must be "<featureId>.<collection>"`,
    );
  }

  const parse = (doc: Doc<unknown>): Doc<T> | null => {
    const result = schema.safeParse(doc.data);
    if (result.success) return { ...doc, data: result.data };
    ctx.logger.warn(
      `dropping invalid document ${name}/${doc.id}\n${formatIssues('', result.error.issues)}`,
    );
    return null;
  };

  return {
    name,
    async get(id) {
      const doc = await ctx.storage().get<unknown>(name, id);
      return doc ? parse(doc) : null;
    },
    async list(q) {
      const page = await ctx.storage().list<unknown>(name, q);
      const items = page.items.map(parse).filter((d): d is Doc<T> => d !== null);
      return { items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
    },
    async put(doc) {
      const result = schema.safeParse(doc.data);
      if (!result.success) {
        throw new TesseraError(
          'VALIDATION',
          `Invalid data for ${name}/${doc.id}\n${formatIssues('', result.error.issues)}`,
          {
            details: result.error.issues,
          },
        );
      }
      const stored = await ctx.storage().put<T>(name, { ...doc, data: result.data });
      return stored;
    },
    delete: (id, version) => ctx.storage().delete(name, id, version),
    watch: (fn) => ctx.storage().watch?.(name, fn) ?? (() => {}),
  };
}
