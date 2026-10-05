import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { baseStyles } from '../styles.js';

/** Small status or count label. *
 * @tessera-icon star
 * @tessera-span 1
 */
export class TesseraBadge extends TesseraElement {
  static override properties: PropertyDeclarations = {
    variant: { reflect: true },
    count: { type: Number },
    max: { type: Number },
    dot: { type: Boolean, reflect: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: inline-flex;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5em;
        padding: 0 var(--tessera-space-2);
        border-radius: var(--tessera-radius-full);
        font-size: var(--tessera-font-size-xs);
        font-weight: 700;
        line-height: 1.5;
        background: var(--tessera-color-surface-2);
        color: var(--tessera-color-text);
      }
      :host([variant='primary']) .badge {
        background: var(--tessera-color-primary);
        color: var(--tessera-color-primary-contrast);
      }
      :host([variant='success']) .badge {
        background: var(--tessera-color-success);
        color: var(--tessera-color-primary-contrast);
      }
      :host([variant='warning']) .badge {
        background: var(--tessera-color-warning);
        color: var(--tessera-color-primary-contrast);
      }
      :host([variant='danger']) .badge {
        background: var(--tessera-color-danger);
        color: var(--tessera-color-primary-contrast);
      }
      :host([dot]) .badge {
        min-width: 0;
        width: 0.6em;
        height: 0.6em;
        padding: 0;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  variant: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' = 'neutral';
  count?: number;
  max = 99;
  dot = false;

  protected override render(): unknown {
    if (this.dot) return html`<span class="badge" part="badge"></span>`;
    const hasCount = this.count !== undefined;
    const text = hasCount
      ? (this.count ?? 0) > this.max
        ? `${this.max}+`
        : String(this.count)
      : nothing;
    return html`<span class="badge" part="badge" aria-label=${hasCount ? String(this.count) : nothing}>${text}<slot></slot></span>`;
  }
}
