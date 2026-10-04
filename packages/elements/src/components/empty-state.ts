import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { baseStyles } from '../styles.js';

/** Placeholder for lists and boards with nothing in them. Put a call to action in the default slot. *
 * @tessera-icon info
 * @tessera-editor icon icon
 */
export class TesseraEmptyState extends TesseraElement {
  static override properties: PropertyDeclarations = { icon: {}, heading: {}, description: {} };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      .wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-8) var(--tessera-space-4);
        text-align: center;
      }
      tessera-icon {
        --tessera-icon-size: 2.5rem;
        color: var(--tessera-color-text-muted);
      }
      h3 {
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      p {
        margin: 0;
        max-width: 36ch;
        color: var(--tessera-color-text-muted);
      }
      .actions {
        margin-top: var(--tessera-space-3);
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  icon = '';
  heading = '';
  description = '';

  protected override render(): unknown {
    return html`<div class="wrap" part="wrap">
      ${this.icon ? html`<tessera-icon name=${this.icon}></tessera-icon>` : nothing}
      ${this.heading ? html`<h3>${this.heading}</h3>` : nothing}
      ${this.description ? html`<p>${this.description}</p>` : nothing}
      <div class="actions"><slot></slot></div>
    </div>`;
  }
}
