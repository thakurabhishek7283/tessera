import { html, LitElement } from 'lit';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyDefine, TesseraElement, whenLazyDefined } from '../src/index.js';
import { cleanup } from './helpers/fixture.js';

// The custom element registry lives as long as the page, so every test uses its own tags.
let n = 0;
const uniqueTag = (name: string): string => `lazy-${name}-${++n}`;

/** A loader that defines `tag` and counts how often it ran. */
function loaderFor(tag: string): { load: () => Promise<void>; calls: () => number } {
  let calls = 0;
  return {
    load: async () => {
      calls++;
      customElements.define(
        tag,
        class extends HTMLElement {
          upgraded = true;
        },
      );
    },
    calls: () => calls,
  };
}

const isUpgraded = (el: Element | null | undefined): boolean =>
  (el as { upgraded?: boolean } | null | undefined)?.upgraded === true;

/** A Tessera primitive whose shadow root renders whatever `inner` says. */
function defineHost(tag: string, inner: (host: HTMLElement) => unknown): void {
  customElements.define(
    tag,
    class extends TesseraElement {
      protected readonly featureId: string | null = null;
      protected override render() {
        return inner(this);
      }
    },
  );
}

/** Lets the MutationObserver callback (a microtask) and the loader's promise chain run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r));
};

afterEach(cleanup);

describe('lazyDefine', () => {
  it('does not load anything while no element with the tag is connected', async () => {
    const tag = uniqueTag('idle');
    const { load, calls } = loaderFor(tag);
    lazyDefine(tag, load);
    // Created but never connected: a detached element is not a reason to download code.
    document.createElement(tag);
    await flush();
    expect(calls()).toBe(0);
    expect(customElements.get(tag)).toBeUndefined();
  });

  it('defines the tag when an element is added to the document after registration', async () => {
    const tag = uniqueTag('after');
    const { load, calls } = loaderFor(tag);
    lazyDefine(tag, load);
    const el = document.createElement(tag);
    document.body.append(el);
    await whenLazyDefined(tag);
    expect(calls()).toBe(1);
    expect(isUpgraded(el)).toBe(true);
  });

  it('defines the tag for an element that was already in the document before registration', async () => {
    const tag = uniqueTag('before');
    const el = document.createElement(tag);
    document.body.append(el);
    const { load, calls } = loaderFor(tag);
    lazyDefine(tag, load);
    await whenLazyDefined(tag);
    expect(calls()).toBe(1);
    expect(isUpgraded(el)).toBe(true);
  });

  it('finds elements inserted with innerHTML, nested in plain markup', async () => {
    const tag = uniqueTag('inner-html');
    const { load, calls } = loaderFor(tag);
    lazyDefine(tag, load);
    const host = document.createElement('div');
    document.body.append(host);
    host.innerHTML = `<section><p><${tag} id="a"></${tag}><${tag} id="b"></${tag}></p></section>`;
    await whenLazyDefined(tag);
    expect(calls()).toBe(1);
    expect(isUpgraded(host.querySelector('#a'))).toBe(true);
    expect(isUpgraded(host.querySelector('#b'))).toBe(true);
  });

  it('loads each tag once, however many elements appear', async () => {
    const tag = uniqueTag('once');
    const { load, calls } = loaderFor(tag);
    lazyDefine(tag, load);
    lazyDefine(tag, load);
    for (let i = 0; i < 3; i++) document.body.append(document.createElement(tag));
    await whenLazyDefined(tag);
    document.body.append(document.createElement(tag));
    await flush();
    expect(calls()).toBe(1);
  });

  it('only loads the tags that are actually used', async () => {
    const used = uniqueTag('used');
    const unused = uniqueTag('unused');
    const a = loaderFor(used);
    const b = loaderFor(unused);
    lazyDefine(used, a.load);
    lazyDefine(unused, b.load);
    document.body.append(document.createElement(used));
    await whenLazyDefined(used);
    await flush();
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(0);
  });

  it('ignores tags that are already defined', async () => {
    const tag = uniqueTag('defined');
    customElements.define(tag, class extends HTMLElement {});
    const load = vi.fn(async () => {});
    lazyDefine(tag, load);
    document.body.append(document.createElement(tag));
    await flush();
    expect(load).not.toHaveBeenCalled();
    await expect(whenLazyDefined(tag)).resolves.toBe(customElements.get(tag));
  });

  it('accepts a loader that returns the constructor instead of defining the tag', async () => {
    const tag = uniqueTag('ctor');
    class Ctor extends HTMLElement {
      upgraded = true;
    }
    lazyDefine(tag, async () => Ctor);
    const el = document.createElement(tag);
    document.body.append(el);
    await expect(whenLazyDefined(tag)).resolves.toBe(Ctor);
    expect(isUpgraded(el)).toBe(true);
  });

  it('accepts a loader that returns a module whose default export is the constructor', async () => {
    const tag = uniqueTag('module');
    class Ctor extends HTMLElement {}
    lazyDefine(tag, async () => ({ default: Ctor }));
    document.body.append(document.createElement(tag));
    await expect(whenLazyDefined(tag)).resolves.toBe(Ctor);
  });

  it('rejects whenLazyDefined when the loader fails, and retries on the next element', async () => {
    const tag = uniqueTag('fails');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempts = 0;
    lazyDefine(tag, async () => {
      attempts++;
      if (attempts === 1) throw new Error('offline');
      customElements.define(tag, class extends HTMLElement {});
    });
    const pending = whenLazyDefined(tag);
    document.body.append(document.createElement(tag));
    await expect(pending).rejects.toThrow('offline');
    expect(error).toHaveBeenCalledOnce();
    document.body.append(document.createElement(tag));
    await expect(whenLazyDefined(tag)).resolves.toBeTypeOf('function');
    expect(attempts).toBe(2);
    error.mockRestore();
  });

  it('upgrades an element rendered in a Tessera element’s shadow root', async () => {
    const tag = uniqueTag('shadow-child');
    const host = uniqueTag('shadow-host');
    const { load, calls } = loaderFor(tag);
    lazyDefine(tag, load);
    // Let the registration scan finish first, so only the element's own check can find the tag.
    await flush();
    defineHost(host, () => html`<div><span>${unsafeTag(tag)}</span></div>`);
    const el = document.createElement(host);
    document.body.append(el);
    await whenLazyDefined(tag);
    expect(calls()).toBe(1);
    expect(isUpgraded(el.shadowRoot?.querySelector(tag))).toBe(true);
  });

  it('upgrades elements in nested shadow roots (a kit element inside another kit’s element)', async () => {
    const tag = uniqueTag('deep-child');
    const inner = uniqueTag('deep-inner');
    const outer = uniqueTag('deep-outer');
    const { load } = loaderFor(tag);
    lazyDefine(tag, load);
    // Let the registration scan finish first, so only the element's own check can find the tag.
    await flush();
    defineHost(inner, () => unsafeTag(tag));
    defineHost(outer, () => unsafeTag(inner));
    const el = document.createElement(outer);
    document.body.append(el);
    await whenLazyDefined(tag);
    const innerEl = el.shadowRoot?.querySelector(inner);
    expect(isUpgraded(innerEl?.shadowRoot?.querySelector(tag))).toBe(true);
  });

  it('upgrades an element that a shadow root renders later, after its first update', async () => {
    const tag = uniqueTag('late-child');
    const host = uniqueTag('late-host');
    const { load, calls } = loaderFor(tag);
    lazyDefine(tag, load);
    // Let the registration scan finish first, so only the element's own check can find the tag.
    await flush();
    defineHost(host, (self) =>
      (self as { show?: boolean }).show ? unsafeTag(tag) : html`<i></i>`,
    );
    const el = document.createElement(host) as TesseraElement & { show?: boolean };
    document.body.append(el);
    await el.updateComplete;
    await flush();
    expect(calls()).toBe(0);
    el.show = true;
    el.requestUpdate();
    await whenLazyDefined(tag);
    expect(isUpgraded(el.shadowRoot?.querySelector(tag))).toBe(true);
  });

  it('finds an element in a shadow root that existed before the tag was registered', async () => {
    const tag = uniqueTag('pre-shadow');
    const host = uniqueTag('pre-host');
    // A plain Lit element, not a TesseraElement: found by the scan that runs on registration.
    customElements.define(
      host,
      class extends LitElement {
        protected override render() {
          return unsafeTag(tag);
        }
      },
    );
    const el = document.createElement(host) as LitElement;
    document.body.append(el);
    await el.updateComplete;
    const { load } = loaderFor(tag);
    lazyDefine(tag, load);
    await whenLazyDefined(tag);
    expect(isUpgraded(el.shadowRoot?.querySelector(tag))).toBe(true);
  });
});

/** Renders `<tag></tag>` for a tag name only known at runtime. */
function unsafeTag(tag: string): unknown {
  const name = unsafeStatic(tag);
  return staticHtml`<${name}></${name}>`;
}
