import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { TesseraManifest } from './types.js';

interface PluginLike {
  id: string;
  configSchema: z.core.$ZodType;
  requires?: string[];
  optional?: string[];
  setup: unknown;
}

const isPlugin = (value: unknown): value is PluginLike =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PluginLike).id === 'string' &&
  typeof (value as PluginLike).setup === 'function' &&
  typeof (value as PluginLike).configSchema === 'object';

/**
 * Imports a built plugin entry and describes its feature. The config schema becomes JSON Schema
 * with `z.toJSONSchema`; descriptions added with `.check(z.describe(…))` (or `.describe()`) live in
 * zod's global registry and come along.
 */
export async function featureFromPlugin(file: string): Promise<TesseraManifest['feature']> {
  const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
  const plugin = mod.default;
  if (!isPlugin(plugin)) return undefined;
  return {
    id: plugin.id,
    configSchema: configJsonSchema(plugin.configSchema),
    requires: plugin.requires ?? [],
    optional: plugin.optional ?? [],
  };
}

/** A plugin config schema (zod or zod/mini) as JSON Schema, describing what users may write. */
export function configJsonSchema(schema: z.core.$ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', target: 'draft-2020-12' });
}
