import { type CSSResultGroup, css, html, type PropertyDeclarations } from 'lit';
import { buttonStyles, TesseraButton } from './button.js';

/**
 * Square button that shows only an icon. `label` is required: it is the accessible name and the
 * native tooltip.
 *
 * @example <tessera-icon-button icon="trash" label="Delete card"></tessera-icon-button>
 */
export class TesseraIconButton extends TesseraButton {
  static override properties: PropertyDeclarations = {
    ...TesseraButton.properties,
    icon: {},
    label: {},
  };
  static override styles: CSSResultGroup = [
    buttonStyles,
    css`
      button {
        width: 36px;
        padding: 0;
      }
      :host([size='sm']) button {
        width: 28px;
      }
      :host(:not([variant])) button {
        background: transparent;
        border-color: transparent;
      }
    `,
  ];

  icon = '';

  protected override render(): unknown {
    return html`<button
      part="button"
      type="button"
      ?disabled=${this.inert_}
      aria-label=${this.label ?? this.icon}
      title=${this.label ?? this.icon}
      @click=${this.onClick}
    >
      <tessera-icon name=${this.icon}></tessera-icon>
    </button>`;
  }
}
