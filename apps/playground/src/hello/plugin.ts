import { createStore, definePlugin, type ReadonlyStore, TesseraError } from '@tessera/core';
import { createCollection } from '@tessera/storage';
import { z } from 'zod';

/** Everything the host and the element can do with the `hello` feature. */
export interface HelloApi {
  /** The shared counter. */
  readonly count: ReadonlyStore<number>;
  /** How many tabs have the counter open, this one included. */
  readonly viewers: ReadonlyStore<number>;
  increment(): Promise<void>;
  reset(): Promise<void>;
}

// Kits extend the core maps through declaration merging, so everything stays typed end to end.
declare module '@tessera/core' {
  interface FeatureApiMap {
    hello: HelloApi;
  }
  interface ServiceMap {
    hello: HelloApi;
  }
  interface TesseraEvents {
    'hello:changed': { count: number };
  }
}

/** Options for the feature. `{ enabled: true }` alone is valid: every other field has a default. */
export const HelloConfig = z.object({
  enabled: z.boolean(),
  label: z.string().default('Hello').describe('Heading shown above the counter'),
  step: z.number().int().min(1).max(100).default(1).describe('How much one click adds'),
});

const CounterDoc = z.object({ value: z.number() });
const dispose = new WeakMap<HelloApi, () => void>();

export const helloPlugin = definePlugin({
  id: 'hello',
  version: '0.1.0',
  configSchema: HelloConfig,
  // Setup fails with a clear error when the host configured no transport or storage.
  requires: ['transport', 'storage'],
  messages: {
    en: {
      'hello.add': 'Add {step}',
      'hello.reset': 'Reset',
      'hello.viewers.one': '{count} tab open',
      'hello.viewers.other': '{count} tabs open',
    },
    de: {
      'hello.add': '{step} addieren',
      'hello.reset': 'Zurücksetzen',
      'hello.viewers.one': '{count} Tab offen',
      'hello.viewers.other': '{count} Tabs offen',
    },
  },

  async setup(ctx, config): Promise<HelloApi> {
    const docs = createCollection(ctx, 'hello.counters', CounterDoc);
    const count = createStore(0);
    const viewers = createStore(1);

    const refresh = async (): Promise<void> => {
      count.set((await docs.get('main'))?.data.value ?? 0);
    };
    await refresh();
    // Storage adapters report writes from other tabs, so every tab sees the same number.
    const stopWatching = docs.watch((change) => {
      if (change.id === 'main') void refresh();
    });

    // The transport tells us who else is here.
    const room = await ctx.transport()?.join('hello:counter');
    const stopPeers = room?.peers.subscribe((peers) => viewers.set(peers.length + 1));
    if (room) viewers.set(room.peers.get().length + 1);

    // Optimistic concurrency: read the version, write against it, retry on conflict.
    const change = async (next: (current: number) => number): Promise<void> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const current = await docs.get('main');
        const value = next(current?.data.value ?? 0);
        try {
          const saved = await docs.put({
            id: 'main',
            data: { value },
            version: current?.version ?? 0,
          });
          count.set(saved.data.value);
          ctx.bus.emit('hello:changed', { count: saved.data.value });
          return;
        } catch (error) {
          if (!TesseraError.is(error, 'CONFLICT')) throw error;
        }
      }
      throw new TesseraError('CONFLICT', 'Could not update the counter after 5 attempts');
    };

    const api: HelloApi = {
      count,
      viewers,
      increment: () => change((v) => v + config.step),
      reset: () => change(() => 0),
    };
    dispose.set(api, () => {
      stopWatching();
      stopPeers?.();
      void room?.leave();
    });
    return api;
  },

  teardown(api) {
    dispose.get(api)?.();
  },
});

export default helloPlugin;
