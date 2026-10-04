import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { baseStyles, focusRing, visuallyHidden } from '../styles.js';

let counter = 0;

/**
 * Free-form tag entry: Enter or comma adds, Backspace on an empty field removes the last tag,
 * pasted text is split on commas and new lines. Submits one form entry per tag under `name`.
 *
 * @fires change - `{ value: string[] }`
 */
export class TesseraTagInput extends TesseraElement {
  static override tesseraExposes: readonly string[] = ['value'];
  static formAssociated = true;
  static override properties: PropertyDeclarations = {
    label: {},
    name: {},
    value: { attribute: false },
    max: { type: Number },
    placeholder: {},
    suggestions: { attribute: false },
    disabled: { type: Boolean, reflect: true },
    allowDuplicates: { type: Boolean, attribute: 'allow-duplicates' },
    validate: { attribute: false },
    draft: { state: true },
    announcement: { state: true },
    problem: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: block;
      }
      label {
        display: block;
        font-size: var(--tessera-font-size-sm);
        font-weight: 600;
        margin-bottom: var(--tessera-space-1);
      }
      .box {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-1);
        padding: var(--tessera-space-1) var(--tessera-space-2);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-bg);
        min-height: 36px;
      }
      .box:focus-within {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      ul {
        display: contents;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: inline-flex;
        align-items: center;
        gap: var(--tessera-space-1);
        padding: 0 var(--tessera-space-1) 0 var(--tessera-space-2);
        border-radius: var(--tessera-radius-full);
        background: var(--tessera-color-surface-2);
        font-size: var(--tessera-font-size-sm);
      }
      li button {
        all: unset;
        display: inline-flex;
        cursor: pointer;
        border-radius: var(--tessera-radius-full);
        padding: 2px;
      }
      li button:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
      }
      input {
        flex: 1;
        min-width: 8ch;
        border: 0;
        outline: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        padding: var(--tessera-space-1);
      }
      .problem {
        color: var(--tessera-color-danger);
        font-size: var(--tessera-font-size-sm);
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  label = '';
  name = '';
  value: string[] = [];
  max: number = Number.POSITIVE_INFINITY;
  placeholder?: string;
  suggestions: string[] = [];
  disabled = false;
  allowDuplicates = false;
  /** Return `false` to reject a tag. */
  validate?: (tag: string) => boolean;
  draft = '';
  announcement = '';
  problem = '';

  readonly #internals: ElementInternals = this.attachInternals();
  readonly #uid = `tessera-tags-${++counter}`;

  protected override updated(): void {
    const data = new FormData();
    for (const tag of this.value) data.append(this.name || 'tags', tag);
    this.#internals.setFormValue(data);
  }

  formResetCallback(): void {
    this.value = [];
    this.draft = '';
  }

  /** Adds one or more tags (comma or newline separated). Returns the tags that were accepted. */
  addTags(raw: string): string[] {
    const accepted: string[] = [];
    const next = [...this.value];
    for (const piece of raw.split(/[,\n]/)) {
      const tag = piece.trim();
      if (!tag) continue;
      if (!this.allowDuplicates && next.some((t) => t.toLowerCase() === tag.toLowerCase()))
        continue;
      if (this.validate && !this.validate(tag)) continue;
      if (next.length >= this.max) {
        this.problem = this.t('ui.tagLimit', { max: this.max });
        break;
      }
      next.push(tag);
      accepted.push(tag);
    }
    if (accepted.length) {
      this.problem = '';
      this.#commit(next, this.t('ui.tagAdded', { name: accepted.join(', ') }));
    }
    return accepted;
  }

  removeTag(tag: string): void {
    const at = this.value.indexOf(tag);
    if (at < 0) return;
    this.#commit(
      this.value.filter((_, i) => i !== at),
      this.t('ui.tagRemoved', { name: tag }),
    );
    this.renderRoot.querySelector('input')?.focus();
  }

  #commit(value: string[], message: string): void {
    this.value = value;
    this.announcement = message;
    this.emit('change', { value });
  }

  #onKeydown = (event: KeyboardEvent): void => {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (this.addTags(input.value).length || !input.value.trim()) this.draft = '';
    } else if (event.key === 'Backspace' && input.value === '' && this.value.length) {
      const last = this.value.at(-1);
      if (last !== undefined) this.removeTag(last);
    }
  };

  #onPaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData('text') ?? '';
    if (/[,\n]/.test(text)) {
      event.preventDefault();
      this.addTags(text);
    }
  };

  protected override render(): unknown {
    return html`
      ${this.label ? html`<label for=${this.#uid}>${this.label}</label>` : nothing}
      <div class="box" part="box">
        <ul aria-label=${this.label || this.t('ui.tagPlaceholder')}>
          ${this.value.map(
            (tag) => html`<li part="tag">
              <span>${tag}</span>
              <button type="button" aria-label=${this.t('ui.remove', { name: tag })} ?disabled=${this.disabled} @click=${() => this.removeTag(tag)}>
                <tessera-icon name="x" size="14"></tessera-icon>
              </button>
            </li>`,
          )}
        </ul>
        <input
          id=${this.#uid}
          part="input"
          .value=${this.draft}
          placeholder=${this.value.length ? '' : (this.placeholder ?? this.t('ui.tagPlaceholder'))}
          list=${this.suggestions.length ? `${this.#uid}-list` : nothing}
          ?disabled=${this.disabled}
          @input=${(e: Event) => (this.draft = (e.target as HTMLInputElement).value)}
          @keydown=${this.#onKeydown}
          @paste=${this.#onPaste}
        />
        ${
          this.suggestions.length
            ? html`<datalist id="${this.#uid}-list">${this.suggestions.map((s) => html`<option value=${s}></option>`)}</datalist>`
            : nothing
        }
      </div>
      ${this.problem ? html`<div class="problem" role="alert">${this.problem}</div>` : nothing}
      <div class="visually-hidden" role="status" aria-live="polite">${this.announcement}</div>
    `;
  }
}
