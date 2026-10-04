import { type CSSResultGroup, css, html, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { baseStyles } from '../styles.js';

/** Indeterminate progress indicator with an accessible status label. *
 * @tessera-icon clock
 * @tessera-span 1
 */
export class TesseraSpinner extends TesseraElement {
  static override properties: PropertyDeclarations = { label: {}, size: { reflect: true } };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: inline-block;
        width: 1.5em;
        height: 1.5em;
      }
      :host([size='sm']) {
        width: 1em;
        height: 1em;
      }
      :host([size='lg']) {
        width: 2.5em;
        height: 2.5em;
      }
      .ring {
        width: 100%;
        height: 100%;
        border: 0.15em solid var(--tessera-color-surface-2);
        border-top-color: var(--tessera-color-primary);
        border-radius: var(--tessera-radius-full);
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ring {
          animation: none;
          border-color: var(--tessera-color-primary);
          border-style: dotted;
        }
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  label?: string;
  size: 'sm' | 'md' | 'lg' = 'md';

  protected override render(): unknown {
    return html`<div class="ring" role="status" aria-label=${this.label ?? this.t('ui.loading')}></div>`;
  }
}
