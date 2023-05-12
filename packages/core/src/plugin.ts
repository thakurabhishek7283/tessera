import type { z } from 'zod';
import type { ServiceMap } from './services.js';
import type { FeatureConfigBase, TesseraContext } from './types.js';

/** What a kit exports (as `default`) so the host can load it lazily. */
export interface TesseraPlugin<Cfg extends FeatureConfigBase = FeatureConfigBase, Api = unknown> {
  /** Feature id, e.g. `'kanban'`. */
  id: string;
  version: string;
  /** Must accept `{ enabled: true }` alone — every other option needs a default. */
  configSchema: z.ZodType<Cfg>;
  requires?: Array<'transport' | 'storage' | 'uploads' | keyof ServiceMap>;
  optional?: Array<keyof ServiceMap>;
  /** Default i18n catalog, merged beneath the host's own messages. */
  messages?: Record<string, Record<string, string>>;
  setup(ctx: TesseraContext, config: Cfg): Api | Promise<Api>;
  teardown?(api: Api): void | Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: loaders are heterogeneous by design
export type PluginLoader = () => Promise<{ default: TesseraPlugin<any, any> }>;

/** Identity helper that gives plugin authors full type inference. */
export function definePlugin<Cfg extends FeatureConfigBase, Api>(
  plugin: TesseraPlugin<Cfg, Api>,
): TesseraPlugin<Cfg, Api> {
  return plugin;
}
