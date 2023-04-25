import type { Logger } from './logger.js';

export type Unsubscribe = () => void;

type VoidKeys<M> = { [K in keyof M]: M[K] extends void ? K : never }[keyof M];

/** Typed in-process event bus. Event maps are extended by kits through declaration merging. */
export interface EventBus<M> {
  on<K extends keyof M>(type: K, fn: (payload: M[K]) => void): Unsubscribe;
  once<K extends keyof M>(type: K, fn: (payload: M[K]) => void): Unsubscribe;
  /** Synchronous. Listener errors are caught and logged so one bad listener cannot break others. */
  emit<K extends Exclude<keyof M, VoidKeys<M>>>(type: K, payload: M[K]): void;
  emit<K extends VoidKeys<M>>(type: K): void;
  /** Receives every event; meant for debugging and devtools. */
  onAny(fn: (type: keyof M, payload: unknown) => void): Unsubscribe;
  clear(): void;
}

/** Creates an {@link EventBus}. */
export function createEventBus<M>(logger?: Logger): EventBus<M> {
  const listeners = new Map<keyof M, Set<(payload: never) => void>>();
  const any = new Set<(type: keyof M, payload: unknown) => void>();

  const safe = (fn: (...args: never[]) => void, ...args: unknown[]): void => {
    try {
      (fn as (...a: unknown[]) => void)(...args);
    } catch (error) {
      logger?.error('event listener threw', error);
    }
  };

  const on: EventBus<M>['on'] = (type, fn) => {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(fn as (payload: never) => void);
    return () => {
      set.delete(fn as (payload: never) => void);
    };
  };

  return {
    on,
    once(type, fn) {
      const off = on(type, (payload) => {
        off();
        fn(payload);
      });
      return off;
    },
    emit(type: keyof M, payload?: unknown): void {
      // Copy so listeners may unsubscribe during dispatch.
      for (const fn of [...(listeners.get(type) ?? [])]) safe(fn, payload);
      for (const fn of [...any]) safe(fn, type, payload);
    },
    onAny(fn) {
      any.add(fn);
      return () => {
        any.delete(fn);
      };
    },
    clear() {
      listeners.clear();
      any.clear();
    },
  } as EventBus<M>;
}
