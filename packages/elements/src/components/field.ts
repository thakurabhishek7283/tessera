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

let counter = 0;

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export const fieldStyles: CSSResultGroup = [
  baseStyles,
  focusRing,
  css`
    :host {
      display: block;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--tessera-space-1);
    }
    label {
      font-size: var(--tessera-font-size-sm);
      font-weight: 600;
    }
    .required {
      color: var(--tessera-color-danger);
    }
    .control {
      width: 100%;
      min-height: 36px;
      padding: var(--tessera-space-2) var(--tessera-space-3);
      border: 1px solid var(--tessera-color-border);
      border-radius: var(--tessera-radius-md);
      background: var(--tessera-color-bg);
      color: var(--tessera-color-text);
      font: inherit;
    }
    .control::placeholder {
      color: var(--tessera-color-text-muted);
    }
    .control:focus-visible {
      outline: 2px solid var(--tessera-color-focus-ring);
      outline-offset: 1px;
    }
    .control:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    :host([invalid]) .control {
      border-color: var(--tessera-color-danger);
    }
    .hint {
      font-size: var(--tessera-font-size-sm);
      color: var(--tessera-color-text-muted);
    }
    .error {
      font-size: var(--tessera-font-size-sm);
      color: var(--tessera-color-danger);
    }
  `,
];

/**
 * Shared behaviour for text-like form controls: label, hint and error text, form association,
 * constraint validation and form reset/restore.
 *
 * @fires input - native, composed
 * @fires change - re-dispatched from the host (native `change` does not cross shadow boundaries)
 */
export abstract class TesseraField extends TesseraElement {
  static formAssociated = true;
  static override shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };
  static override properties: PropertyDeclarations = {
    label: {},
    name: {},
    value: {},
    hint: {},
    error: {},
    disabled: { type: Boolean, reflect: true },
    required: { type: Boolean, reflect: true },
    readonly: { type: Boolean, reflect: true },
    invalid: { type: Boolean, reflect: true },
    touched: { state: true },
  };
  static override styles: CSSResultGroup = fieldStyles;

  protected readonly featureId: string | null = null;
  label = '';
  name = '';
  value = '';
  hint = '';
  /** Custom error text. When set the field is invalid regardless of native constraints. */
  error = '';
  disabled = false;
  required = false;
  readonly = false;
  invalid = false;
  touched = false;

  protected readonly internals: ElementInternals = this.attachInternals();
  protected readonly uid: string = `tessera-field-${++counter}`;
  #defaultValue: string | null = null;

  /** The native element inside the shadow root. */
  protected get control(): Control | null {
    return this.renderRoot?.querySelector<Control>('.control') ?? null;
  }

  protected get messageId(): string {
    return `${this.uid}-msg`;
  }

  get form(): HTMLFormElement | null {
    return this.internals.form;
  }
  get validity(): ValidityState {
    return this.internals.validity;
  }
  get validationMessage(): string {
    return this.internals.validationMessage;
  }
  checkValidity(): boolean {
    return this.internals.checkValidity();
  }
  reportValidity(): boolean {
    this.touched = true;
    return this.internals.reportValidity();
  }

  protected formValue(): string | FormData {
    return this.value;
  }

  protected override firstUpdated(): void {
    this.#defaultValue = this.value;
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    this.#sync();
    if (changed.has('error') || changed.has('touched')) this.invalid = this.#message() !== '';
  }

  #message(): string {
    if (this.error) return this.error;
    const control = this.control;
    return this.touched && control && !control.validity.valid ? control.validationMessage : '';
  }

  #sync(): void {
    this.internals.setFormValue(this.formValue());
    const control = this.control;
    if (this.error) {
      this.internals.setValidity({ customError: true }, this.error, control ?? undefined);
    } else if (control && !control.validity.valid) {
      const v = control.validity;
      this.internals.setValidity(
        {
          valueMissing: v.valueMissing,
          typeMismatch: v.typeMismatch,
          patternMismatch: v.patternMismatch,
          tooLong: v.tooLong,
          tooShort: v.tooShort,
          rangeUnderflow: v.rangeUnderflow,
          rangeOverflow: v.rangeOverflow,
          stepMismatch: v.stepMismatch,
          badInput: v.badInput,
        },
        control.validationMessage,
        control,
      );
    } else {
      this.internals.setValidity({});
    }
  }

  protected onInput = (event: Event): void => {
    this.value = (event.target as Control).value;
    this.requestUpdate();
  };

  protected onChange = (event: Event): void => {
    event.stopPropagation();
    this.value = (event.target as Control).value;
    this.touched = true;
    this.dispatchEvent(new Event('change', { bubbles: true }));
  };

  protected onBlur = (): void => {
    this.touched = true;
  };

  formResetCallback(): void {
    this.value = this.#defaultValue ?? '';
    this.touched = false;
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabled = disabled;
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === 'string') this.value = state;
  }

  /** Renders the native control. Must have `class="control"`, the field's `id` and ARIA wiring. */
  protected abstract renderControl(attrs: {
    id: string;
    describedBy: string | typeof nothing;
    invalid: boolean;
  }): unknown;

  protected override render(): unknown {
    const message = this.#message();
    const describedBy = [this.hint ? `${this.uid}-hint` : '', message ? this.messageId : '']
      .filter(Boolean)
      .join(' ');
    return html`<div class="field" part="field">
      ${
        this.label
          ? html`<label for=${this.uid} part="label"
            >${this.label}${this.required ? html`<span class="required" aria-hidden="true"> *</span>` : nothing}</label
          >`
          : nothing
      }
      ${this.renderControl({ id: this.uid, describedBy: describedBy || nothing, invalid: message !== '' })}
      ${this.hint ? html`<div class="hint" id="${this.uid}-hint" part="hint">${this.hint}</div>` : nothing}
      ${message ? html`<div class="error" id=${this.messageId} part="error" role="alert">${message}</div>` : nothing}
    </div>`;
  }
}
