import {
  type AdapterFactories,
  createTessera,
  type PluginLoader,
  type TesseraConfig,
  type TesseraInstance,
  type UserInfo,
} from '@tessera-kit/core';
import { createMemoryStorage, createUploads } from '@tessera-kit/storage';
import { createFakeClock, createSequentialIds, type FakeClock } from './clock.js';
import { alice } from './fixtures.js';
import type { FakeHub, FakeTransport } from './hub.js';

export interface TestInstanceOptions {
  /** Connect the instance to a hub; it then gets a transport for `user`. */
  hub?: FakeHub;
  user?: UserInfo;
  clock?: FakeClock;
  /** Extra adapter factories, e.g. a custom storage. */
  adapters?: Partial<AdapterFactories>;
}

export interface TestInstance {
  instance: TesseraInstance;
  clock: FakeClock;
  /** Present when a hub was given. */
  transport: FakeTransport | undefined;
  user: UserInfo;
}

/**
 * A Tessera instance wired for tests: memory storage, a controllable clock, deterministic ids
 * and, optionally, a {@link FakeHub} transport. Resolves `instance.ready` before returning.
 *
 * @example
 * const hub = new FakeHub();
 * const { instance } = await createTestInstance({ features: { chat: { enabled: true } } }, { chat: () => import('@tessera-kit/chat') }, { hub });
 */
export async function createTestInstance(
  config: Partial<TesseraConfig> & Pick<TesseraConfig, 'features'>,
  plugins: Record<string, PluginLoader>,
  opts: TestInstanceOptions = {},
): Promise<TestInstance> {
  const user = opts.user ?? alice;
  const clock = opts.clock ?? opts.hub?.clock ?? createFakeClock();
  const ids = createSequentialIds();
  const transport = opts.hub?.transport(user);

  const instance = createTessera(
    {
      appId: opts.hub?.appId ?? 'test',
      auth: { type: 'static', user },
      storage: { type: 'memory' },
      uploads: { type: 'dataurl' },
      ...(transport
        ? { transport: { type: 'custom', create: () => transport } }
        : { transport: { type: 'none' } }),
      ...config,
    },
    {
      plugins,
      clock,
      ids,
      adapters: {
        storage: (cfg, ctx) =>
          cfg.type === 'memory'
            ? createMemoryStorage({ clock: ctx.clock, userId: () => ctx.auth.getUser()?.id })
            : cfg.type === 'custom'
              ? cfg.adapter
              : unsupported(cfg.type),
        uploads: createUploads,
        ...opts.adapters,
      },
    },
  );
  await instance.ready;
  return { instance, clock, transport, user };
}

function unsupported(type: string): never {
  throw new Error(`createTestInstance only supports memory and custom storage, got "${type}"`);
}
