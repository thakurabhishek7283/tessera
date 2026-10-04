import type { Unsubscribe } from './bus.js';
import { TesseraError } from './errors.js';

/**
 * Well-known cross-kit services. Kits extend this through declaration merging:
 *
 * ```ts
 * declare module '@tessera-kit/core' {
 *   interface ServiceMap { editor: EditorService }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: extended by kits via declaration merging
export interface ServiceMap {}

/** Feature APIs by feature id, extended by kits via declaration merging. */
// biome-ignore lint/suspicious/noEmptyInterface: extended by kits via declaration merging
export interface FeatureApiMap {}

export interface ServiceRegistry {
  /** Throws if `id` is already registered. Returns an unregister function. */
  register<K extends keyof ServiceMap>(id: K, impl: ServiceMap[K]): Unsubscribe;
  get<K extends keyof ServiceMap>(id: K): ServiceMap[K] | undefined;
  /** Like `get` but throws `SERVICE_MISSING`. */
  require<K extends keyof ServiceMap>(id: K): ServiceMap[K];
  /** Calls `fn` now and whenever the service is registered or unregistered. */
  watch<K extends keyof ServiceMap>(
    id: K,
    fn: (impl: ServiceMap[K] | undefined) => void,
  ): Unsubscribe;
}

/** Creates an empty {@link ServiceRegistry}. */
export function createServiceRegistry(): ServiceRegistry {
  const services = new Map<string, unknown>();
  const watchers = new Map<string, Set<(impl: unknown) => void>>();

  const notify = (id: string, impl: unknown): void => {
    for (const fn of [...(watchers.get(id) ?? [])]) fn(impl);
  };

  return {
    register(id, impl) {
      const key = id as string;
      if (services.has(key)) {
        throw new TesseraError('VALIDATION', `Service "${key}" is already registered`);
      }
      services.set(key, impl);
      notify(key, impl);
      return () => {
        if (services.get(key) === impl) {
          services.delete(key);
          notify(key, undefined);
        }
      };
    },
    get: (id) => services.get(id as string) as never,
    require(id) {
      const impl = services.get(id as string);
      if (impl === undefined) {
        throw new TesseraError('SERVICE_MISSING', `Service "${String(id)}" is not registered`);
      }
      return impl as never;
    },
    watch(id, fn) {
      const key = id as string;
      let set = watchers.get(key);
      if (!set) {
        set = new Set();
        watchers.set(key, set);
      }
      const cb = fn as (impl: unknown) => void;
      set.add(cb);
      cb(services.get(key));
      return () => {
        set.delete(cb);
      };
    },
  };
}
