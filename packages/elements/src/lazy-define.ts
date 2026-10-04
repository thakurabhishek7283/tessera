import { defineElement } from './define-element.js';

/**
 * Loads the code for a tag. It may define the tag itself (a side-effect module), or resolve to the
 * constructor, or to a module whose `default` export is the constructor.
 */
export type LazyLoader = () => Promise<unknown>;

const pending = new Map<string, LazyLoader>();
const inFlight = new Map<string, Promise<CustomElementConstructor>>();
interface Waiter {
  resolve(ctor: CustomElementConstructor): void;
  reject(error: unknown): void;
}

const waiters = new Map<string, Waiter[]>();
let selector = '';
let observer: MutationObserver | undefined;
let scanQueued = false;

const hasDom = (): boolean =>
  typeof document !== 'undefined' && typeof customElements !== 'undefined';

/**
 * Registers `tag` to be defined the first time an element with that tag is connected, instead of
 * loading its code up front.
 *
 * A single `MutationObserver` on the document watches for the tag; `TesseraElement` also checks its
 * own shadow root after its first render, because document observers do not see inside shadow
 * roots. Elements already on the page when the tag is registered are found too. Registering a tag
 * that is already defined, or already registered, does nothing.
 *
 * @example
 * lazyDefine('tessera-inbox', () => import('./inbox.js'));
 */
export function lazyDefine(tag: string, loader: LazyLoader): void {
  const name = tag.toLowerCase();
  if (!hasDom() || customElements.get(name) || pending.has(name) || inFlight.has(name)) return;
  register(name, loader);
  // One deep scan for everything registered in the same task (an autoload entry registers many).
  if (!scanQueued) {
    scanQueued = true;
    queueMicrotask(() => {
      scanQueued = false;
      deepScan(document);
    });
  }
}

/**
 * Resolves with the constructor once `tag` is defined, like `customElements.whenDefined`, but
 * rejects if its lazy loader failed. Mostly for tests.
 */
export function whenLazyDefined(tag: string): Promise<CustomElementConstructor> {
  const name = tag.toLowerCase();
  const defined = customElements.get(name);
  if (defined) return Promise.resolve(defined);
  const loading = inFlight.get(name);
  if (loading) return loading;
  // Settles with the next load of this tag, or resolves if something else defines it.
  return new Promise((resolve, reject) => {
    const list = waiters.get(name) ?? [];
    list.push({ resolve, reject });
    waiters.set(name, list);
    void customElements.whenDefined(name).then(resolve);
  });
}

/**
 * Watches a shadow root for lazily defined tags: checks what it holds now and what is added later.
 * `TesseraElement` calls this after its first render; call it for other shadow roots if needed.
 */
export function observeLazyTags(root: ShadowRoot | Document): void {
  if (pending.size === 0) return;
  watch(root);
  scan(root);
}

function register(name: string, loader: LazyLoader): void {
  pending.set(name, loader);
  updateSelector();
  watch(document);
}

function updateSelector(): void {
  selector = [...pending.keys()].map((t) => CSS.escape(t)).join(',');
}

function watch(root: Node): void {
  observer ??= new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node as Element);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
}

/** Loads every pending tag found in `root` (and `root` itself), without entering shadow roots. */
function scan(root: Element | ShadowRoot | Document): void {
  if (pending.size === 0) return;
  if (root instanceof Element && pending.has(root.localName)) load(root.localName);
  if (pending.size === 0) return;
  for (const el of root.querySelectorAll(selector)) {
    load(el.localName);
    if (pending.size === 0) return;
  }
}

/** Like {@link scan}, but also enters (and watches) every open shadow root below `root`. */
function deepScan(root: Document | ShadowRoot): void {
  if (pending.size === 0) return;
  scan(root);
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      watch(el.shadowRoot);
      deepScan(el.shadowRoot);
    }
  }
}

function load(tag: string): void {
  const loader = pending.get(tag);
  if (!loader) return;
  pending.delete(tag);
  updateSelector();
  // Nothing left to look for: stop observing until the next registration.
  if (pending.size === 0) {
    observer?.disconnect();
    observer = undefined;
  }
  const promise = Promise.resolve()
    .then(loader)
    .then((result) => {
      if (!customElements.get(tag)) {
        const ctor =
          typeof result === 'function'
            ? result
            : (result as { default?: unknown } | null | undefined)?.default;
        if (typeof ctor !== 'function')
          throw new Error(`the loader for <${tag}> did not define it`);
        defineElement(tag, ctor as CustomElementConstructor);
      }
      return customElements.get(tag) as CustomElementConstructor;
    });
  inFlight.set(tag, promise);
  const settle = (fn: (waiter: Waiter) => void): void => {
    inFlight.delete(tag);
    for (const waiter of waiters.get(tag) ?? []) fn(waiter);
    waiters.delete(tag);
  };
  promise.then(
    (ctor) => settle((w) => w.resolve(ctor)),
    (error: unknown) => {
      console.error(`[tessera] could not load <${tag}>`, error);
      settle((w) => w.reject(error));
      // Try again when the next element with this tag appears (not for the ones already here).
      if (!customElements.get(tag)) register(tag, loader);
    },
  );
}
