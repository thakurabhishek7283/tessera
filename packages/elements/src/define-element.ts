/** Defines `tag` once, even if the module is loaded twice. */
export function defineElement(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}
