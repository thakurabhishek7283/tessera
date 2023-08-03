import { TesseraRoot } from './root.js';

/** Defines `tag` once, even if the module is loaded twice. */
export function defineElement(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

// <tessera-root> first, so elements upgraded afterwards find their provider immediately.
defineElement('tessera-root', TesseraRoot);

declare global {
  interface HTMLElementTagNameMap {
    'tessera-root': TesseraRoot;
  }
}
