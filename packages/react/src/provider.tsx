import type { AdapterFactories, PluginLoader, TesseraConfig, TesseraInstance } from '@tessera/core';
import { createTessera } from '@tessera/core';
import {
  createElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { TesseraReactContext } from './context.js';

export interface TesseraProviderProps {
  /** Read once when the provider mounts. Change `key` to create a new instance. */
  config?: TesseraConfig;
  plugins?: Record<string, PluginLoader>;
  adapters?: Partial<AdapterFactories>;
  /** Use an instance you created yourself. The provider will not destroy it. */
  instance?: TesseraInstance;
  /** Rendered on the server and until every feature has been set up. */
  fallback?: ReactNode;
  children?: ReactNode;
}

interface Ready {
  instance: TesseraInstance;
  ready: boolean;
}

/**
 * Creates (or adopts) a Tessera instance and provides it to hooks and to Tessera elements below.
 * Renders `fallback` on the server and until the instance is ready, so it is SSR-safe: nothing
 * touches `window` or `customElements` until after mount.
 *
 * @example
 * <TesseraProvider config={config} plugins={plugins} fallback={<Spinner />}>…</TesseraProvider>
 */
export function TesseraProvider(props: TesseraProviderProps): ReactElement {
  const [state, setState] = useState<Ready | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const latest = useRef(props);
  latest.current = props;
  const { instance: external } = props;

  useEffect(() => {
    let cancelled = false;
    let owned: TesseraInstance | undefined;

    void (async () => {
      try {
        // Elements are defined lazily so importing this module on the server stays harmless.
        await import('@tessera/elements/define');
        if (cancelled) return;
        const { config, plugins, adapters } = latest.current;
        let instance = external;
        if (!instance) {
          if (!config) return;
          instance = owned = createTessera(config, {
            plugins: plugins ?? {},
            ...(adapters ? { adapters } : {}),
          });
        }
        setState({ instance, ready: false });
        await instance.ready;
        if (!cancelled) setState({ instance, ready: true });
      } catch (error) {
        // Re-thrown during render so an error boundary can handle it (e.g. CONFIG_INVALID).
        if (!cancelled) setFailure(error);
      }
    })();

    return () => {
      cancelled = true;
      setState(null);
      void owned?.destroy();
    };
  }, [external]);

  if (!props.config && !props.instance) {
    throw new Error('TesseraProvider needs either `config` or `instance`');
  }
  if (failure) throw failure;
  if (!state?.ready) return <>{props.fallback ?? null}</>;
  const { instance } = state;
  return (
    <TesseraReactContext.Provider value={instance}>
      {createElement(
        'tessera-root',
        {
          ref: (el: (HTMLElement & { tessera?: TesseraInstance }) | null) => {
            if (el) el.tessera = instance;
          },
        },
        props.children,
      )}
    </TesseraReactContext.Provider>
  );
}
