import { html, nothing, type PropertyDeclarations } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { TesseraField } from './field.js';

/**
 * Single-line text input. Works inside a plain `<form>`: it submits under `name`, takes part in
 * constraint validation and resets with the form.
 *
 * @example <tessera-input label="Email" type="email" name="email" required></tessera-input>
 */
export class TesseraInput extends TesseraField {
  static override properties: PropertyDeclarations = {
    ...TesseraField.properties,
    type: {},
    placeholder: {},
    maxlength: { type: Number },
    minlength: { type: Number },
    pattern: {},
    autocomplete: {},
    inputmode: {},
  };

  type: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel' | 'number' = 'text';
  placeholder = '';
  maxlength?: number;
  minlength?: number;
  pattern?: string;
  autocomplete?: string;
  inputmode?: string;

  protected renderControl(a: { id: string; describedBy: unknown; invalid: boolean }): unknown {
    return html`<input
      class="control"
      part="control"
      id=${a.id}
      type=${this.type}
      name=${this.name || nothing}
      .value=${this.value}
      placeholder=${this.placeholder || nothing}
      maxlength=${ifDefined(this.maxlength)}
      minlength=${ifDefined(this.minlength)}
      pattern=${ifDefined(this.pattern)}
      autocomplete=${ifDefined(this.autocomplete) as string}
      inputmode=${ifDefined(this.inputmode) as string}
      ?disabled=${this.disabled}
      ?required=${this.required}
      ?readonly=${this.readonly}
      aria-invalid=${a.invalid ? 'true' : 'false'}
      aria-describedby=${a.describedBy as string}
      @input=${this.onInput}
      @change=${this.onChange}
      @blur=${this.onBlur}
    />`;
  }
}
