import {
  createStore,
  definePlugin,
  type PluginLoader,
  type TesseraConfig,
  type TesseraInstance,
} from '@tessera/core';
import { TesseraElement } from '@tessera/elements';
import { html } from 'lit';
import { act, Component, type ReactNode, StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  TesseraProvider,
  useBusEvent,
  useFeature,
  useStore,
  useTessera,
  useTranslate,
} from '../src/index.js';
import { cleanup, flush, render } from './helpers.js';

declare module '@tessera/core' {
  interface FeatureApiMap {
    counter: { value: number };
  }
}

const log: string[] = [];
const counterPlugin = definePlugin({
  id: 'counter',
  version: '1.0.0',
  configSchema: z.object({ enabled: z.boolean(), start: z.number().default(0) }),
  messages: { en: { 'counter.title': 'Counter' }, de: { 'counter.title': 'Zähler' } },
  setup(_ctx, cfg) {
    log.push('setup');
    return { value: cfg.start };
  },
  teardown() {
    log.push('teardown');
  },
});
const plugins: Record<string, PluginLoader> = {
  counter: async () => ({ default: counterPlugin as never }),
};
const config = (enabled = true): TesseraConfig => ({
  appId: 'react-test',
  auth: { type: 'static', user: { id: 'u1', name: 'Ada' } },
  features: { counter: { enabled, start: 7 } },
});

class CounterElement extends TesseraElement {
  protected readonly featureId: string | null = 'counter';
  protected override renderFeature() {
    return html`<b>${this.t('counter.title')}</b>`;
  }
}
if (!customElements.get('react-test-counter'))
  customElements.define('react-test-counter', CounterElement);

afterEach(async () => {
  await cleanup();
  log.length = 0;
});

describe('TesseraProvider', () => {
  it('shows the fallback until the instance is ready, then the children', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: Record<string, PluginLoader> = {
      counter: async () => {
        await gate;
        return { default: counterPlugin as never };
      },
    };
    const { container } = await render(
      <TesseraProvider config={config()} plugins={slow} fallback={<p>loading…</p>}>
        <p>ready</p>
      </TesseraProvider>,
    );
    await flush();
    expect(container.textContent).toBe('loading…');
    release();
    await flush();
    expect(container.textContent).toBe('ready');
    expect(container.querySelector('tessera-root')).not.toBeNull();
  });

  it('provides the instance to hooks and to Lit elements inside <tessera-root>', async () => {
    let seen: TesseraInstance | undefined;
    function Probe() {
      seen = useTessera();
      return <react-test-counter />;
    }
    const { container } = await render(
      <TesseraProvider config={config()} plugins={plugins}>
        <Probe />
      </TesseraProvider>,
    );
    await flush();
    expect(seen?.featureStatus('counter')).toBe('enabled');
    const el = container.querySelector('react-test-counter') as CounterElement;
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).toBe('Counter');
    expect(container.querySelector('tessera-root')).toHaveProperty('tessera', seen);
  });

  it('destroys an instance it created on unmount, but not one it was given', async () => {
    const view = await render(
      <TesseraProvider config={config()} plugins={plugins}>
        <span />
      </TesseraProvider>,
    );
    await flush();
    expect(log).toEqual(['setup']);
    await view.unmount();
    await flush();
    expect(log).toEqual(['setup', 'teardown']);

    log.length = 0;
    const { createTessera } = await import('@tessera/core');
    const mine = createTessera(config(), { plugins });
    const second = await render(
      <TesseraProvider instance={mine}>
        <span />
      </TesseraProvider>,
    );
    await flush();
    await second.unmount();
    await flush();
    expect(log).toEqual(['setup']);
    expect(mine.featureStatus('counter')).toBe('enabled');
    await mine.destroy();
  });

  it('leaves exactly one live instance under StrictMode double effects', async () => {
    await render(
      <StrictMode>
        <TesseraProvider config={config()} plugins={plugins}>
          <span />
        </TesseraProvider>
      </StrictMode>,
    );
    await flush(5);
    const live =
      log.filter((l) => l === 'setup').length - log.filter((l) => l === 'teardown').length;
    expect(live).toBe(1);
  });

  it('surfaces setup mistakes to an error boundary', async () => {
    const errors: Error[] = [];
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error: Error) {
        errors.push(error);
      }
      render() {
        return this.state.failed ? <p>failed</p> : this.props.children;
      }
    }
    const original = console.error;
    console.error = () => {};
    try {
      const missing = await render(
        <Boundary>
          <TesseraProvider>
            <span />
          </TesseraProvider>
        </Boundary>,
      );
      expect(missing.container.textContent).toBe('failed');

      const invalid = await render(
        <Boundary>
          <TesseraProvider config={{ appId: 'Bad ID', features: {} }}>
            <span />
          </TesseraProvider>
        </Boundary>,
      );
      await flush();
      expect(invalid.container.textContent).toBe('failed');
    } finally {
      console.error = original;
    }
    expect(errors[0]?.message).toMatch(/config.*instance/);
    expect(errors[1]).toMatchObject({ code: 'CONFIG_INVALID' });
  });
});

describe('hooks', () => {
  it('useTessera throws outside a provider', async () => {
    function Bad() {
      useTessera();
      return null;
    }
    const original = console.error;
    console.error = () => {};
    try {
      await expect(render(<Bad />)).rejects.toThrow(/inside <TesseraProvider>/);
    } finally {
      console.error = original;
    }
  });

  it('useFeature follows enable/disable at runtime', async () => {
    let instance: TesseraInstance | undefined;
    function Show() {
      instance = useTessera();
      const api = useFeature('counter');
      return <p>{api ? `on:${api.value}` : 'off'}</p>;
    }
    const { container } = await render(
      <TesseraProvider config={config(false)} plugins={plugins}>
        <Show />
      </TesseraProvider>,
    );
    await flush();
    expect(container.textContent).toBe('off');
    await act(async () => {
      await instance?.enable('counter', { start: 3 });
    });
    expect(container.textContent).toBe('on:3');
    await act(async () => {
      await instance?.disable('counter');
    });
    expect(container.textContent).toBe('off');
  });

  it('useStore reflects store updates', async () => {
    const store = createStore(1);
    function Value() {
      return <p>{useStore(store)}</p>;
    }
    const { container } = await render(<Value />);
    expect(container.textContent).toBe('1');
    await act(async () => store.set(2));
    expect(container.textContent).toBe('2');
  });

  it('useBusEvent always calls the latest callback and unsubscribes on unmount', async () => {
    const calls: string[] = [];
    let instance: TesseraInstance | undefined;
    function Listener({ tag }: { tag: string }) {
      instance = useTessera();
      useBusEvent('tessera:theme-changed', (e) => calls.push(`${tag}:${e.mode}`));
      return null;
    }
    const view = await render(
      <TesseraProvider config={config()} plugins={plugins}>
        <Listener tag="a" />
      </TesseraProvider>,
    );
    await flush();
    await act(async () => instance?.setTheme('dark'));
    await view.rerender(
      <TesseraProvider config={config()} plugins={plugins}>
        <Listener tag="b" />
      </TesseraProvider>,
    );
    await act(async () => instance?.setTheme('light'));
    expect(calls).toEqual(['a:dark', 'b:light']);
    const held = instance;
    await view.unmount();
    held?.setTheme('dark');
    expect(calls).toHaveLength(2);
  });

  it('useTranslate re-renders on locale change', async () => {
    let instance: TesseraInstance | undefined;
    function Title() {
      instance = useTessera();
      const { t, locale } = useTranslate();
      return <p>{`${locale}:${t('counter.title')}`}</p>;
    }
    const { container } = await render(
      <TesseraProvider config={{ ...config(), locale: 'en' }} plugins={plugins}>
        <Title />
      </TesseraProvider>,
    );
    await flush();
    expect(container.textContent).toBe('en:Counter');
    await act(async () => instance?.setLocale('de'));
    expect(container.textContent).toBe('de:Zähler');
  });
});
