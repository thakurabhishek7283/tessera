import { html, nothing, type PropertyDeclarations } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { TesseraField } from './field.js';

/** Multi-line text input with optional auto-growing height. *
 * @tessera-icon note
 * @tessera-span 6
 * @tessera-editor value textarea
 */
export class TesseraTextarea extends TesseraField {
  static override properties: PropertyDeclarations = {
    ...TesseraField.properties,
    rows: { type: Number },
    placeholder: {},
    maxlength: { type: Number },
    autoresize: { type: Boolean },
  };

  rows = 3;
  placeholder = '';
  maxlength?: number;
  /** Grow with the content instead of scrolling. */
  autoresize = false;

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const control = this.control;
    if (this.autoresize && control) {
      control.style.height = 'auto';
      control.style.height = `${control.scrollHeight + 2}px`;
    }
  }

  protected renderControl(a: { id: string; describedBy: unknown; invalid: boolean }): unknown {
    return html`<textarea
      class="control"
      part="control"
      id=${a.id}
      name=${this.name || nothing}
      rows=${this.rows}
      .value=${this.value}
      placeholder=${this.placeholder || nothing}
      maxlength=${ifDefined(this.maxlength)}
      ?disabled=${this.disabled}
      ?required=${this.required}
      ?readonly=${this.readonly}
      aria-invalid=${a.invalid ? 'true' : 'false'}
      aria-describedby=${a.describedBy as string}
      style=${this.autoresize ? 'resize:none;overflow:hidden' : ''}
      @input=${this.onInput}
      @change=${this.onChange}
      @blur=${this.onBlur}
    ></textarea>`;
  }
}
