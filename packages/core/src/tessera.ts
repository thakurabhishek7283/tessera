import type { StorageAdapter, Transport, UploadAdapter } from './adapters.js';
import { resolveAuth } from './auth.js';
import { createEventBus, type Unsubscribe } from './bus.js';
import { type Clock, systemClock } from './clock.js';
import { parseConfig, TesseraConfigSchema } from './config.js';
import { TesseraError } from './errors.js';
import { createI18n } from './i18n.js';
import { createIdGenerator, type IdGenerator } from './ids.js';
import { createLogger } from './logger.js';
import type { PluginLoader, TesseraPlugin } from './plugin.js';
import { createServiceRegistry, type FeatureApiMap, type ServiceMap } from './services.js';
import type {
  AdapterFactories,
  FeatureStatus,
  TesseraConfig,
  TesseraContext,
  TesseraEvents,
  TesseraInstance,
  ThemeMode,
} from './types.js';

export interface CreateTesseraOptions {
  /** Feature id → lazy loader. A loader is only invoked for enabled features. */
  plugins: Record<string, PluginLoader>;
  /** Factories from `@tessera-kit/transport` and `@tessera-kit/storage`. */
  adapters?: Partial<AdapterFactories>;
  /** For tests. */
  clock?: Clock;
  ids?: IdGenerator;
}

interface FeatureState {
  status: FeatureStatus;
  api?: unknown;
  plugin?: TesseraPlugin;
  config?: Record<string, unknown>;
  disposers: Unsubscribe[];
}

const ADAPTER_HINTS = {
  transport: "import { createTransport } from '@tessera-kit/transport'",
  storage: "import { createStorage } from '@tessera-kit/storage'",
  uploads: "import { createUploads } from '@tessera-kit/storage'",
} as const;

/**
 * Creates a Tessera instance: validates the config, builds the shared context and sets up every
 * enabled feature through its lazily-loaded plugin.
 *
 * @example
 * const tessera = createTessera(
 *   { appId: 'my-app', features: { kanban: { enabled: true } } },
 *   { plugins: { kanban: () => import('@tessera-kit/kanban') }, adapters },
 * );
 * await tessera.ready;
 */
export function createTessera(config: TesseraConfig, opts: CreateTesseraOptions): TesseraInstance {
  const validated = parseConfig(TesseraConfigSchema, config);
  const logger = createLogger(validated.debug ? 'debug' : 'warn');
  const clock = opts.clock ?? systemClock;
  const ids = opts.ids ?? createIdGenerator({ clock });
  const bus = createEventBus<TesseraEvents>(logger);
  const services = createServiceRegistry();
  const locale = validated.locale ?? globalThis.navigator?.language ?? 'en';
  const i18n = createI18n({ locale, messages: validated.messages, now: () => clock.now() });
  const auth = resolveAuth(validated.auth, () => ids.next());
  const stopAuth = auth.onChange((user) => bus.emit('auth:user-changed', user));

  const featureConfigs = new Map<string, Record<string, unknown>>(
    Object.entries(validated.features),
  );
  const states = new Map<string, FeatureState>();
  const setupOrder: string[] = [];

  // ---------- lazily created adapters ----------
  let transport: Transport | null | undefined;
  let storage: StorageAdapter | undefined;
  let uploads: UploadAdapter | undefined;

  const missing = (kind: keyof typeof ADAPTER_HINTS, type: string): TesseraError =>
    new TesseraError(
      'ADAPTER_MISSING',
      `${kind} type "${type}" needs a factory. Add \`${ADAPTER_HINTS[kind]}\` and pass it as adapters.${kind} to createTessera().`,
    );

  const baseCtx: TesseraContext = {
    appId: validated.appId,
    config: validated,
    bus,
    services,
    auth,
    logger,
    i18n,
    clock,
    ids,
    transport() {
      if (transport !== undefined) return transport;
      const cfg = validated.transport ?? { type: 'none' as const };
      if (cfg.type === 'none') {
        transport = null;
        return null;
      }
      let created: Transport | null;
      if (cfg.type === 'custom') created = cfg.create(baseCtx);
      else if (opts.adapters?.transport) created = opts.adapters.transport(cfg, baseCtx);
      else throw missing('transport', cfg.type);
      transport = created;
      if (created) {
        created.state.subscribe((state) => bus.emit('transport:state', state));
        created.connect().catch((error: unknown) => {
          bus.emit('tessera:error', TesseraError.from(error, 'TRANSPORT_CLOSED'));
        });
      }
      return created;
    },
    storage() {
      if (storage) return storage;
      const cfg = validated.storage ?? { type: 'memory' as const };
      if (cfg.type === 'custom') storage = cfg.adapter as StorageAdapter;
      else if (opts.adapters?.storage) storage = opts.adapters.storage(cfg, baseCtx);
      else throw missing('storage', cfg.type);
      return storage;
    },
    uploads() {
      if (uploads) return uploads;
      const cfg = validated.uploads ?? { type: 'dataurl' as const };
      if (cfg.type === 'custom') uploads = cfg.adapter as UploadAdapter;
      else if (opts.adapters?.uploads) uploads = opts.adapters.uploads(cfg, baseCtx);
      else throw missing('uploads', cfg.type);
      return uploads;
    },
    isEnabled: (id) => states.get(id)?.status === 'enabled',
    featureConfig: <T>(id: string): T | undefined =>
      (states.get(id)?.config ?? featureConfigs.get(id)) as T | undefined,
  };

  const scopedCtx = (id: string, disposers: Unsubscribe[]): TesseraContext => ({
    ...baseCtx,
    logger: logger.child(id),
    services: {
      ...services,
      register(serviceId, impl) {
        const off = services.register(serviceId, impl);
        disposers.push(off);
        return off;
      },
    },
  });

  // ---------- feature lifecycle ----------
  const wrap = (id: string, error: unknown): TesseraError =>
    TesseraError.is(error)
      ? error
      : new TesseraError(
          'PLUGIN_SETUP_FAILED',
          `Feature "${id}" failed to set up: ${String((error as Error)?.message ?? error)}`,
          { cause: error },
        );

  const loadPlugin = async (id: string): Promise<TesseraPlugin> => {
    const loader = opts.plugins[id];
    if (!loader) {
      throw new TesseraError('PLUGIN_NOT_FOUND', `No plugin loader registered for feature "${id}"`);
    }
    const mod = await loader();
    if (!mod?.default) {
      throw new TesseraError('PLUGIN_NOT_FOUND', `Plugin "${id}" has no default export`);
    }
    return mod.default;
  };

  const setupFeature = async (id: string, plugin: TesseraPlugin, raw: Record<string, unknown>) => {
    const cfg = parseConfig(plugin.configSchema, raw, `features.${id}`) as unknown as Record<
      string,
      unknown
    >;
    for (const need of plugin.requires ?? []) {
      if (need === 'transport') {
        if (!baseCtx.transport()) {
          throw new TesseraError(
            'ADAPTER_MISSING',
            `Feature "${id}" requires a transport, but config.transport is "none". Use { type: 'local' } or { type: 'websocket', url }.`,
          );
        }
      } else if (need === 'storage') {
        baseCtx.storage();
      } else if (need === 'uploads') {
        baseCtx.uploads();
      } else if (!services.get(need as keyof ServiceMap)) {
        throw new TesseraError(
          'SERVICE_MISSING',
          `Feature "${id}" requires the "${String(need)}" service, which is not available. Enable the "${String(need)}" feature first.`,
        );
      }
    }
    if (plugin.messages) i18n.addCatalog(plugin.messages);

    const disposers: Unsubscribe[] = [];
    const api = await plugin.setup(scopedCtx(id, disposers), cfg as never);
    if (!services.get(id as keyof ServiceMap)) {
      disposers.push(services.register(id as keyof ServiceMap, api as never));
    }
    states.set(id, { status: 'enabled', api, plugin, config: cfg, disposers });
    setupOrder.push(id);
    bus.emit('tessera:feature-changed', { id, enabled: true });
  };

  const markFailed = (id: string, error: TesseraError): void => {
    logger.error(`feature "${id}" failed`, error);
    states.set(id, { status: 'failed', disposers: [] });
    bus.emit('tessera:error', error);
  };

  const teardownFeature = async (id: string): Promise<void> => {
    const state = states.get(id);
    if (state?.status !== 'enabled') return;
    try {
      await state.plugin?.teardown?.(state.api);
    } catch (error) {
      logger.error(`teardown of "${id}" failed`, error);
    }
    for (const off of state.disposers.splice(0).reverse()) off();
    states.set(id, { status: 'disabled', disposers: [] });
    const at = setupOrder.indexOf(id);
    if (at >= 0) setupOrder.splice(at, 1);
    bus.emit('tessera:feature-changed', { id, enabled: false });
  };

  /** Serialises enable/disable per feature so rapid toggling cannot interleave. */
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(id: string, job: () => Promise<T>): Promise<T> => {
    const run = (queues.get(id) ?? Promise.resolve()).then(job, job);
    queues.set(
      id,
      run.catch(() => undefined),
    );
    return run;
  };

  // ---------- boot ----------
  const boot = async (): Promise<void> => {
    const enabledIds = [...featureConfigs.entries()].filter(([, c]) => c.enabled).map(([id]) => id);
    const loaded = new Map<string, TesseraPlugin>();

    await Promise.all(
      enabledIds.map(async (id) => {
        try {
          loaded.set(id, await loadPlugin(id));
        } catch (error) {
          markFailed(id, wrap(id, error));
        }
      }),
    );

    const depsOf = (id: string): string[] => {
      const plugin = loaded.get(id);
      return [...(plugin?.requires ?? []), ...(plugin?.optional ?? [])]
        .map(String)
        .filter((dep) => dep !== id && loaded.has(dep));
    };

    // Kahn's algorithm: whatever cannot be ordered is part of (or hangs off) a cycle.
    const remaining = new Map([...loaded.keys()].map((id) => [id, new Set(depsOf(id))]));
    for (let progress = true; progress && remaining.size; ) {
      progress = false;
      for (const [id, deps] of remaining) {
        if ([...deps].every((d) => !remaining.has(d))) {
          remaining.delete(id);
          progress = true;
        }
      }
    }
    const cyclic = new Set(remaining.keys());
    for (const id of cyclic) {
      markFailed(
        id,
        new TesseraError(
          'PLUGIN_SETUP_FAILED',
          `Feature "${id}" is part of a dependency cycle (${[...cyclic].join(' → ')})`,
        ),
      );
    }

    const done = new Map<string, Promise<void>>();
    const run = (id: string): Promise<void> => {
      const existing = done.get(id);
      if (existing) return existing;
      const job = (async () => {
        if (cyclic.has(id)) return;
        const plugin = loaded.get(id);
        if (!plugin) return;
        await Promise.all(depsOf(id).map(run));
        try {
          await setupFeature(id, plugin, featureConfigs.get(id) ?? { enabled: true });
        } catch (error) {
          markFailed(id, wrap(id, error));
        }
      })();
      done.set(id, job);
      return job;
    };
    await Promise.all([...loaded.keys()].map(run));
    bus.emit('tessera:ready');
  };
  const ready = boot();

  // ---------- theme ----------
  const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  let mode: ThemeMode = validated.theme?.mode ?? 'auto';
  const resolveTheme = (): 'light' | 'dark' =>
    mode === 'auto' ? (media?.matches ? 'dark' : 'light') : mode;
  const emitTheme = (): void =>
    bus.emit('tessera:theme-changed', { mode, resolved: resolveTheme() });
  const onMediaChange = (): void => {
    if (mode === 'auto') emitTheme();
  };
  media?.addEventListener?.('change', onMediaChange);

  return {
    ctx: baseCtx,
    ready,
    feature: <K extends keyof FeatureApiMap>(id: K) => {
      const state = states.get(id as string);
      return state?.status === 'enabled' ? (state.api as FeatureApiMap[K]) : undefined;
    },
    featureStatus: (id) => states.get(id)?.status ?? 'disabled',
    async enable(id, patch) {
      await ready;
      return serial(id, async () => {
        if (states.get(id)?.status === 'enabled') return;
        const raw = { ...featureConfigs.get(id), ...patch, enabled: true };
        try {
          const plugin = await loadPlugin(id);
          await setupFeature(id, plugin, raw);
          featureConfigs.set(id, raw);
        } catch (error) {
          const wrapped = wrap(id, error);
          markFailed(id, wrapped);
          throw wrapped;
        }
      });
    },
    async disable(id) {
      await ready;
      return serial(id, async () => {
        const raw = featureConfigs.get(id);
        if (raw) featureConfigs.set(id, { ...raw, enabled: false });
        if (states.get(id)?.status === 'enabled') await teardownFeature(id);
        else states.set(id, { status: 'disabled', disposers: [] });
      });
    },
    on: (event, fn) => bus.on(event, fn),
    getTheme: () => ({ mode, resolved: resolveTheme() }),
    setTheme(next) {
      mode = next;
      emitTheme();
    },
    setLocale(next) {
      i18n.setLocale(next);
      bus.emit('tessera:locale-changed', { locale: next });
    },
    async destroy() {
      await ready;
      for (const id of [...setupOrder].reverse()) await serial(id, () => teardownFeature(id));
      media?.removeEventListener?.('change', onMediaChange);
      stopAuth();
      transport?.disconnect();
      bus.clear();
    },
  };
}
