import {
  createStore,
  createTessera,
  definePlugin,
  type PluginLoader,
  type TesseraInstance,
} from '@tessera/core';
import { html, LitElement } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  getDefaultInstance,
  registerImplicitPlugin,
  resetDefaultInstance,
  TesseraElement,
  TesseraRoot,
} from '../src/index.js';

declare module '@tessera/core' {
  interface FeatureApiMap {
    demo: { hello(): string };
  }
}

class DemoElement extends TesseraElement {
  protected readonly featureId: string | null = 'demo';
  static override properties = { count: { type: Number } };
  count = 0;
  protected override renderFeature() {
    return html`<span id="out">${this.t('demo.title')}:${this.count}</span>`;
  }
  poke(): boolean {
    return this.emit('demo-poke', { n: 1 }, { cancelable: true });
  }
}

class PrimitiveElement extends TesseraElement {
  protected readonly featureId: string | null = null;
  protected override render() {
    return html`<b>${this.t('ui.close')}</b>`;
  }
}

class StoreElement extends TesseraElement {
  protected readonly featureId: string | null = null;
  store = createStore(0);
  readonly bound = this.useStore(this.store);
  protected override render() {
    return html`<i>${this.bound.value}</i>`;
  }
}

for (const [tag, ctor] of [
  ['tessera-root', TesseraRoot],
  ['test-demo', DemoElement],
  ['test-primitive', PrimitiveElement],
  ['test-store', StoreElement],
] as const) {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

const demoPlugin = definePlugin({
  id: 'demo',
  version: '1.0.0',
  configSchema: z.object({ enabled: z.boolean() }),
  messages: { en: { 'demo.title': 'Demo' }, de: { 'demo.title': 'Beispiel' } },
  setup: () => ({ hello: () => 'hi' }),
});
const loaders: Record<string, PluginLoader> = {
  demo: async () => ({ default: demoPlugin as never }),
};

const instance = (enabled: boolean, extra = {}): TesseraInstance =>
  createTessera(
    {
      appId: 'test',
      locale: 'en',
      auth: { type: 'static', user: { id: 'u', name: 'U' } },
      features: { demo: { enabled } },
      ...extra,
    },
    { plugins: loaders },
  );

const mount = async <T extends HTMLElement>(
  el: T,
  parent: HTMLElement = document.body,
): Promise<T> => {
  parent.append(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
};
const text = (el: HTMLElement) => el.shadowRoot?.querySelector('#out')?.textContent;

afterEach(async () => {
  document.body.replaceChildren();
  await resetDefaultInstance();
});

describe('TesseraElement', () => {
  it('renders when its feature is enabled and hides itself when it is not', async () => {
    const on = instance(true);
    await on.ready;
    const a = document.createElement('test-demo') as DemoElement;
    a.tessera = on;
    await mount(a);
    expect(text(a)).toBe('Demo:0');
    expect(a.hidden).toBe(false);

    const off = instance(false);
    await off.ready;
    const b = document.createElement('test-demo') as DemoElement;
    b.tessera = off;
    await mount(b);
    expect(b.shadowRoot?.querySelector('#out')).toBeNull();
    expect(b.hidden).toBe(true);
  });

  it('follows runtime enable/disable', async () => {
    const t = instance(false);
    await t.ready;
    const el = document.createElement('test-demo') as DemoElement;
    el.tessera = t;
    await mount(el);
    expect(el.hidden).toBe(true);
    await t.enable('demo');
    await el.updateComplete;
    expect(el.hidden).toBe(false);
    expect(text(el)).toBe('Demo:0');
    await t.disable('demo');
    await el.updateComplete;
    expect(el.hidden).toBe(true);
    expect(el.shadowRoot?.querySelector('#out')).toBeNull();
  });

  it('resolves the instance from the nearest <tessera-root>, and an explicit property wins', async () => {
    const rootInstance = instance(true);
    const other = instance(true, { locale: 'de' });
    await Promise.all([rootInstance.ready, other.ready]);
    const root = document.createElement('tessera-root') as TesseraRoot;
    root.tessera = rootInstance;
    const inner = document.createElement('test-demo') as DemoElement;
    const explicit = document.createElement('test-demo') as DemoElement;
    explicit.tessera = other;
    root.append(inner, explicit);
    await mount(root);
    await Promise.all([inner.updateComplete, explicit.updateComplete]);
    expect(text(inner)).toBe('Demo:0');
    expect(text(explicit)).toBe('Beispiel:0');
  });

  it('picks up a provider that arrives after the element', async () => {
    const t = instance(true);
    await t.ready;
    const root = document.createElement('tessera-root') as TesseraRoot;
    const el = document.createElement('test-demo') as DemoElement;
    root.append(el);
    root.tessera = t;
    await mount(root);
    await vi.waitFor(() => expect(text(el)).toBe('Demo:0'));
  });

  it('enables its feature in the implicit default instance', async () => {
    registerImplicitPlugin('demo', loaders.demo as PluginLoader);
    const el = document.createElement('test-demo') as DemoElement;
    await mount(el);
    await vi.waitFor(() => expect(text(el)).toBe('Demo:0'));
    expect(getDefaultInstance().ctx.isEnabled('demo')).toBe(true);
  });

  it('does not touch the default instance for primitives and uses built-in strings', async () => {
    const el = document.createElement('test-primitive') as PrimitiveElement;
    await mount(el);
    expect(el.shadowRoot?.textContent).toBe('Close');
    expect(getDefaultInstance().ctx.isEnabled('demo')).toBe(false);
  });

  it('re-renders on locale change', async () => {
    const t = instance(true);
    await t.ready;
    const el = document.createElement('test-demo') as DemoElement;
    el.tessera = t;
    await mount(el);
    t.setLocale('de');
    await el.updateComplete;
    expect(text(el)).toBe('Beispiel:0');
  });

  it('emit() dispatches bubbling, composed, cancelable events', async () => {
    const t = instance(true);
    await t.ready;
    const el = document.createElement('test-demo') as DemoElement;
    el.tessera = t;
    await mount(el);
    const seen = vi.fn((e: Event) => e.preventDefault());
    document.body.addEventListener('demo-poke', seen);
    expect(el.poke()).toBe(false);
    const event = seen.mock.calls[0]?.[0] as CustomEvent<{ n: number }>;
    expect(event.detail).toEqual({ n: 1 });
    expect(event.bubbles && event.composed && event.cancelable).toBe(true);
  });

  it('useStore re-renders when the store changes and stops after disconnect', async () => {
    const el = document.createElement('test-store') as StoreElement;
    await mount(el);
    expect(el.shadowRoot?.querySelector('i')?.textContent).toBe('0');
    el.store.set(5);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('i')?.textContent).toBe('5');
    el.remove();
    const spy = vi.spyOn(el, 'requestUpdate');
    el.store.set(6);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('<tessera-root>', () => {
  it('applies the resolved theme and token overrides, and follows setTheme', async () => {
    const t = instance(true, {
      theme: { mode: 'light', tokens: { '--tessera-color-primary': '#ff0066' } },
    });
    await t.ready;
    const root = document.createElement('tessera-root') as TesseraRoot;
    root.tessera = t;
    await mount(root);
    expect(root.getAttribute('data-tessera-theme')).toBe('light');
    expect(root.style.getPropertyValue('--tessera-color-primary')).toBe('#ff0066');
    t.setTheme('dark');
    expect(root.getAttribute('data-tessera-theme')).toBe('dark');
  });

  it('installs the design tokens when the host did not', async () => {
    const t = instance(true);
    await mount(document.createElement('tessera-root') as TesseraRoot);
    expect(
      getComputedStyle(document.documentElement).getPropertyValue('--tessera-color-primary').trim(),
    ).not.toBe('');
    void t;
  });
});

describe('sanity', () => {
  it('LitElement is deduplicated', () => {
    expect(Object.getPrototypeOf(TesseraElement)).toBe(LitElement);
  });
});

describe('observe()', () => {
  class ObserveElement extends TesseraElement {
    protected readonly featureId: string | null = null;
    a = createStore('a1');
    b = createStore('b1');
    useB = false;
    protected override render() {
      return html`<i>${this.observe(this.useB ? this.b : this.a)}</i>`;
    }
  }
  if (!customElements.get('test-observe')) customElements.define('test-observe', ObserveElement);

  it('follows the stores the latest render read and stops watching the rest', async () => {
    const el = document.createElement('test-observe') as ObserveElement;
    await mount(el);
    const text = () => el.shadowRoot?.querySelector('i')?.textContent;
    expect(text()).toBe('a1');
    el.a.set('a2');
    await el.updateComplete;
    expect(text()).toBe('a2');

    el.useB = true;
    el.requestUpdate();
    await el.updateComplete;
    expect(text()).toBe('b1');
    const spy = vi.spyOn(el, 'requestUpdate');
    el.a.set('a3'); // no longer observed
    expect(spy).not.toHaveBeenCalled();
    el.b.set('b2');
    expect(spy).toHaveBeenCalledTimes(1);
    await el.updateComplete;
    expect(text()).toBe('b2');

    el.remove();
    spy.mockClear();
    el.b.set('b3');
    expect(spy).not.toHaveBeenCalled();
  });
});
