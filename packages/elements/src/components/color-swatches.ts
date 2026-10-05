import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { readableTextOn } from '../color.js';
import { baseStyles } from '../styles.js';

/**
 * Colour picker made of radio swatches (single choice, arrow keys move and select).
 *
 * @fires change - `{ value: string }`
 *
 * @tessera-icon image
 * @tessera-span 4
 * @tessera-editor value color
 * @tessera-expose value {string} - The selected colour.
 */
export class TesseraColorSwatches extends TesseraElement {
  static override tesseraExposes: readonly string[] = ['value'];
  static formAssociated = true;
  static override properties: PropertyDeclarations = {
    colors: { attribute: false },
    names: { attribute: false },
    value: {},
    label: {},
    name: {},
    disabled: { type: Boolean, reflect: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      .label {
        font-size: var(--tessera-font-size-sm);
        font-weight: 600;
        margin-bottom: var(--tessera-space-1);
      }
      [role='radiogroup'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
      }
      button {
        all: unset;
        box-sizing: border-box;
        width: 28px;
        height: 28px;
        border-radius: var(--tessera-radius-full);
        background: var(--_color);
        color: var(--_check);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border: 2px solid var(--tessera-color-border);
      }
      button[aria-checked='true'] {
        border-color: var(--tessera-color-text);
        box-shadow: 0 0 0 2px var(--tessera-color-bg), 0 0 0 4px var(--tessera-color-text);
      }
      button:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 4px;
      }
      :host([disabled]) button {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  colors: string[] = [];
  /** Optional human names by colour value, used as accessible labels. */
  names: Record<string, string> = {};
  value = '';
  label = '';
  name = '';
  disabled = false;

  readonly #internals: ElementInternals = this.attachInternals();

  protected override updated(): void {
    this.#internals.setFormValue(this.value);
  }

  formResetCallback(): void {
    this.value = '';
  }

  #choose(color: string): void {
    if (this.disabled || color === this.value) return;
    this.value = color;
    this.emit('change', { value: color });
  }

  #onKeydown = (event: KeyboardEvent): void => {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const step = keys[event.key];
    if (step === undefined || !this.colors.length) return;
    event.preventDefault();
    const current = Math.max(0, this.colors.indexOf(this.value));
    const next = (current + step + this.colors.length) % this.colors.length;
    const color = this.colors[next];
    if (color === undefined) return;
    this.#choose(color);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>(`[data-color="${CSS.escape(color)}"]`)?.focus(),
    );
  };

  protected override render(): unknown {
    const selected = this.colors.includes(this.value) ? this.value : this.colors[0];
    return html`
      ${this.label ? html`<div class="label" id="lbl">${this.label}</div>` : nothing}
      <div role="radiogroup" aria-labelledby=${this.label ? 'lbl' : nothing} @keydown=${this.#onKeydown}>
        ${this.colors.map(
          (color) => html`<button
            type="button"
            role="radio"
            data-color=${color}
            aria-checked=${color === this.value ? 'true' : 'false'}
            aria-label=${this.names[color] ?? color}
            tabindex=${color === selected ? '0' : '-1'}
            ?disabled=${this.disabled}
            style="--_color:${color};--_check:${readableTextOn(color) ?? 'currentColor'}"
            @click=${() => this.#choose(color)}
          >
            ${color === this.value ? html`<tessera-icon name="check" size="16"></tessera-icon>` : nothing}
          </button>`,
        )}
      </div>
    `;
  }
}
