import { html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraField } from './field.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Native `<select>` with the Tessera look, form association and validation. *
 * @tessera-icon chevron-down
 */
export class TesseraSelect extends TesseraField {
  static override properties: PropertyDeclarations = {
    ...TesseraField.properties,
    options: { attribute: false },
    placeholder: {},
  };

  options: SelectOption[] = [];
  /** Text of the empty first option. When omitted, no empty option is rendered. */
  placeholder = '';

  protected renderControl(a: { id: string; describedBy: unknown; invalid: boolean }): unknown {
    return html`<select
      class="control"
      part="control"
      id=${a.id}
      name=${this.name || nothing}
      ?disabled=${this.disabled}
      ?required=${this.required}
      aria-invalid=${a.invalid ? 'true' : 'false'}
      aria-describedby=${a.describedBy as string}
      @input=${this.onInput}
      @change=${this.onChange}
      @blur=${this.onBlur}
    >
      ${this.placeholder ? html`<option value="" ?selected=${this.value === ''}>${this.placeholder}</option>` : nothing}
      ${this.options.map(
        (o) =>
          html`<option value=${o.value} ?disabled=${o.disabled} ?selected=${o.value === this.value}>${o.label}</option>`,
      )}
    </select>`;
  }
}
