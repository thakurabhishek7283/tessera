import { ContextProvider } from '@lit/context';
import type { TesseraInstance, Unsubscribe } from '@tessera/core';
import { type CSSResultGroup, css, html, LitElement, type PropertyDeclarations } from 'lit';
import { tesseraContext } from './context.js';
import { applyTheme, installTokens } from './theme.js';

/**
 * Provides a Tessera instance to every element inside it and applies theme and token overrides.
 *
 * @example
 * <tessera-root><tessera-kanban board-id="roadmap"></tessera-kanban></tessera-root>
 * root.tessera = createTessera(config, opts);
 */
export class TesseraRoot extends LitElement {
  static override properties: PropertyDeclarations = { tessera: { attribute: false } };

  static override styles: CSSResultGroup = css`
    :host {
      display: block;
      font-family: var(--tessera-font-family);
      font-size: var(--tessera-font-size-md);
      line-height: var(--tessera-line-height);
      color: var(--tessera-color-text);
    }
  `;

  tessera?: TesseraInstance;

  readonly #provider = new ContextProvider(this, { context: tesseraContext });
  #offs: Unsubscribe[] = [];
  #appliedTokens: string[] = [];

  override connectedCallback(): void {
    super.connectedCallback();
    installTokens(this.ownerDocument);
    this.#attach();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#detach();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('tessera')) this.#attach();
  }

  protected override render(): unknown {
    return html`<slot></slot>`;
  }

  #detach(): void {
    for (const off of this.#offs.splice(0)) off();
  }

  #attach(): void {
    this.#detach();
    const instance = this.tessera;
    if (!instance) return;
    this.#provider.setValue(instance);
    const apply = (): void => {
      this.#appliedTokens = applyTheme(
        this,
        instance.getTheme().resolved,
        instance.ctx.config.theme?.tokens,
        this.#appliedTokens,
      );
    };
    apply();
    this.#offs.push(instance.on('tessera:theme-changed', apply));
  }
}
