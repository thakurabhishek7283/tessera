import {
  type AdapterFactories,
  createStore,
  createTessera,
  type PluginLoader,
  type StorageAdapter,
  type TesseraConfig,
  type TesseraContext,
  TesseraError,
  type TesseraInstance,
  type Transport,
  type TransportConfig,
  type TransportState,
  type UploadAdapter,
} from '@tessera-kit/core';

const implicitPlugins: Record<string, PluginLoader> = {};
let instance: TesseraInstance | undefined;
let overrides: Omit<Partial<TesseraConfig>, 'features'> = {};

/**
 * Called by each kit's `elements` entry so a bare `<tessera-kanban>` can switch its own feature
 * on in the implicit default instance. Registering after the instance exists is fine.
 */
export function registerImplicitPlugin(id: string, loader: PluginLoader): void {
  implicitPlugins[id] = loader;
}

/** Overrides the implicit instance's config. Must run before the first element needs it. */
export function configureDefaultInstance(config: Omit<Partial<TesseraConfig>, 'features'>): void {
  if (instance) {
    throw new TesseraError(
      'VALIDATION',
      'The default Tessera instance already exists; configure it before any element connects.',
    );
  }
  overrides = config;
}

/** The implicit instance: app id `default`, IndexedDB storage and the BroadcastChannel transport. */
export function getDefaultInstance(): TesseraInstance {
  instance ??= createTessera(
    {
      appId: 'default',
      storage: { type: 'indexeddb' },
      transport: { type: 'local' },
      ...overrides,
      features: {},
    },
    { plugins: implicitPlugins, adapters: lazyAdapters },
  );
  return instance;
}

export function isDefaultInstance(candidate: TesseraInstance): boolean {
  return candidate === instance;
}

/** Tears the implicit instance down (tests, hot reload). */
export async function resetDefaultInstance(): Promise<void> {
  const current = instance;
  instance = undefined;
  overrides = {};
  await current?.destroy();
}

// ---------- adapters loaded on demand so `@tessera-kit/elements` stays small ----------

function lazyStorage(...args: Parameters<AdapterFactories['storage']>): StorageAdapter {
  const [cfg, ctx] = args;
  let real: Promise<StorageAdapter> | undefined;
  const load = (): Promise<StorageAdapter> =>
    (real ??= import('@tessera-kit/storage').then((m) => m.createStorage(cfg, ctx)));
  return {
    get: async (collection, id) => (await load()).get(collection, id),
    list: async (collection, q) => (await load()).list(collection, q),
    put: async (collection, doc) => (await load()).put(collection, doc),
    delete: async (collection, id, version) => (await load()).delete(collection, id, version),
    watch(collection, fn) {
      let stopped = false;
      let off: (() => void) | undefined;
      void load().then((adapter) => {
        if (!stopped) off = adapter.watch?.(collection, fn);
      });
      return () => {
        stopped = true;
        off?.();
      };
    },
  };
}

function lazyUploads(...args: Parameters<AdapterFactories['uploads']>): UploadAdapter {
  const [cfg, ctx] = args;
  let real: Promise<UploadAdapter> | undefined;
  const load = (): Promise<UploadAdapter> =>
    (real ??= import('@tessera-kit/storage').then((m) => m.createUploads(cfg, ctx)));
  // Limits are known from config before the module loads; the real adapter enforces them again.
  const maxBytes =
    cfg.type === 'custom'
      ? cfg.adapter.maxBytes
      : (cfg.maxBytes ?? (cfg.type === 'rest' ? 5 * 1024 * 1024 : 1_000_000));
  return {
    maxBytes,
    accept: cfg.type === 'custom' ? cfg.adapter.accept : ['image/*', 'application/pdf'],
    upload: async (file, opts) => (await load()).upload(file, opts),
  };
}

function lazyTransport(cfg: TransportConfig, ctx: TesseraContext): Transport | null {
  if (cfg.type === 'none') return null;
  const state = createStore<TransportState>('idle');
  const handlers = new Map<string, Parameters<NonNullable<LocalLike['registerHandler']>>[1]>();
  type LocalLike = {
    registerHandler?: (topic: string, fn: (data: unknown, c: never) => unknown) => () => void;
  };
  let real: Promise<Transport> | undefined;

  const load = (): Promise<Transport> =>
    (real ??= import('@tessera-kit/transport').then(({ createTransport, isLocalTransport }) => {
      const t = createTransport(cfg, ctx);
      if (!t) throw new TesseraError('ADAPTER_MISSING', 'The transport factory returned nothing');
      t.state.subscribe((s) => state.set(s));
      state.set(t.state.get());
      if (isLocalTransport(t))
        for (const [topic, fn] of handlers) t.registerHandler(topic, fn as never);
      return t;
    }));

  const serverBacked = cfg.type === 'websocket';
  const lazy: Transport & LocalLike = {
    state,
    capabilities: {
      serverHistory: serverBacked,
      serverPersistence: serverBacked,
      directMessages: true,
    },
    connect: async () => (await load()).connect(),
    disconnect() {
      void real?.then((t) => t.disconnect());
    },
    join: async (room, opts) => (await load()).join(room, opts),
  };
  if (cfg.type === 'local') {
    // Mirrors LocalTransport so kits can register in-tab server emulators before the module loads.
    lazy.registerHandler = (topic, fn) => {
      handlers.set(topic, fn as never);
      let off: (() => void) | undefined;
      void real?.then(async (t) => {
        const { isLocalTransport } = await import('@tessera-kit/transport');
        if (isLocalTransport(t)) off = t.registerHandler(topic, fn as never);
      });
      return () => {
        handlers.delete(topic);
        off?.();
      };
    };
  }
  return lazy;
}

const lazyAdapters: AdapterFactories = {
  transport: lazyTransport,
  storage: lazyStorage,
  uploads: lazyUploads,
};
