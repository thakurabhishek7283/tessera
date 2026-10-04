import type { FeatureApiMap, ReadonlyStore, TesseraEvents, TesseraInstance } from '@tessera-kit/core';
import { useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { TesseraReactContext } from './context.js';

/** The instance from the nearest {@link TesseraProvider}. */
export function useTessera(): TesseraInstance {
  const instance = useContext(TesseraReactContext);
  if (!instance) throw new Error('useTessera must be used inside <TesseraProvider>');
  return instance;
}

/**
 * The API of a feature, or `undefined` while it is disabled. Re-renders when the feature is
 * enabled or disabled at runtime.
 */
export function useFeature<K extends keyof FeatureApiMap>(id: K): FeatureApiMap[K] | undefined {
  const instance = useTessera();
  const subscribe = useCallback(
    (notify: () => void) => {
      const offs = [
        instance.on('tessera:feature-changed', notify),
        instance.on('tessera:ready', notify),
      ];
      return () => {
        for (const off of offs) off();
      };
    },
    [instance],
  );
  return useSyncExternalStore(
    subscribe,
    () => instance.feature(id),
    () => undefined,
  );
}

/** Subscribes to a Tessera store with `useSyncExternalStore`. */
export function useStore<T>(store: ReadonlyStore<T>): T {
  const subscribe = useCallback((notify: () => void) => store.subscribe(() => notify()), [store]);
  return useSyncExternalStore(subscribe, store.get, store.get);
}

/** Runs `fn` for every `event` on the bus. The latest `fn` is always used; no resubscribing. */
export function useBusEvent<E extends keyof TesseraEvents>(
  event: E,
  fn: (payload: TesseraEvents[E]) => void,
): void {
  const instance = useTessera();
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => instance.on(event, (payload) => latest.current(payload)), [instance, event]);
}

/** Translation helper bound to the instance. Re-renders when the locale changes. */
export function useTranslate(): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
} {
  const instance = useTessera();
  const subscribe = useCallback(
    (notify: () => void) => instance.on('tessera:locale-changed', notify),
    [instance],
  );
  const locale = useSyncExternalStore(
    subscribe,
    () => instance.ctx.i18n.locale,
    () => instance.ctx.i18n.locale,
  );
  return { t: (key, params) => instance.ctx.i18n.t(key, params), locale };
}
