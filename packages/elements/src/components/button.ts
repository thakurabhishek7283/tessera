import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import { TesseraElement } from '../base.js';
import { baseStyles, focusRing } from '../styles.js';

export const buttonStyles: CSSResultGroup = [
  baseStyles,
  focusRing,
  css`
    :host {
      display: inline-flex;
    }
    button {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--tessera-space-2);
      min-height: 36px;
      padding: 0 var(--tessera-space-4);
      border: 1px solid transparent;
      border-radius: var(--tessera-radius-md);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: background-color var(--tessera-motion-duration), border-color var(--tessera-motion-duration);
    }
    button:focus-visible {
      outline: 2px solid var(--tessera-color-focus-ring);
      outline-offset: 2px;
    }
    :host([size='sm']) button {
      min-height: 28px;
      padding: 0 var(--tessera-space-3);
      font-size: var(--tessera-font-size-sm);
    }
    :host([variant='primary']) button {
      background: var(--tessera-color-primary);
      color: var(--tessera-color-primary-contrast);
    }
    :host([variant='secondary']) button,
    :host(:not([variant])) button {
      background: var(--tessera-color-surface);
      color: var(--tessera-color-text);
      border-color: var(--tessera-color-border);
    }
    :host([variant='ghost']) button {
      background: transparent;
      color: var(--tessera-color-text);
    }
    :host([variant='danger']) button {
      background: var(--tessera-color-danger);
      color: var(--tessera-color-primary-contrast);
    }
    button:hover:not(:disabled) {
      filter: brightness(0.94);
    }
    :host([variant='ghost']) button:hover:not(:disabled),
    :host([variant='secondary']) button:hover:not(:disabled) {
      background: var(--tessera-color-surface-2);
      filter: none;
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    tessera-spinner {
      width: 1em;
      height: 1em;
    }
  `,
];

/**
 * Button with primary, secondary, ghost and danger variants. Form-associated: `type="submit"` and
 * `type="reset"` act on the surrounding `<form>`.
 *
 * @fires click - native click (not fired while `disabled` or `loading`)
 *
 * @tessera-icon check
 * @tessera-span 2
 */
export class TesseraButton extends TesseraElement {
  static formAssociated = true;
  static override shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };
  static override properties: PropertyDeclarations = {
    variant: { reflect: true },
    size: { reflect: true },
    disabled: { type: Boolean, reflect: true },
    loading: { type: Boolean, reflect: true },
    type: { reflect: true },
    name: {},
    value: {},
    label: {},
  };
  static override styles: CSSResultGroup = buttonStyles;

  protected readonly featureId: string | null = null;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary';
  size: 'sm' | 'md' = 'md';
  disabled = false;
  loading = false;
  type: 'button' | 'submit' | 'reset' = 'button';
  name = '';
  value = '';
  /** Accessible name when the content is not text. */
  label?: string;

  protected readonly internals: ElementInternals = this.attachInternals();

  constructor() {
    super();
    // Capture phase at the host runs before any listener the app attached to the host, so a
    // programmatic `el.click()` on a disabled button is swallowed too.
    this.addEventListener(
      'click',
      (event) => {
        if (this.inert_) {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      },
      true,
    );
  }

  protected get inert_(): boolean {
    return this.disabled || this.loading;
  }

  protected onClick(_event: Event): void {
    if (this.inert_) return;
    const form = this.internals.form;
    if (this.type === 'submit') {
      if (this.name) {
        const data = new FormData();
        data.set(this.name, this.value);
        this.internals.setFormValue(data);
      }
      form?.requestSubmit();
    } else if (this.type === 'reset') {
      form?.reset();
    }
  }

  protected override render(): unknown {
    return html`<button
      part="button"
      type="button"
      ?disabled=${this.inert_}
      aria-busy=${this.loading ? 'true' : 'false'}
      aria-label=${this.label ?? nothing}
      @click=${this.onClick}
    >
      ${this.loading ? html`<tessera-spinner size="sm" part="spinner"></tessera-spinner>` : nothing}
      <slot></slot>
    </button>`;
  }
}
