import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { baseStyles, focusRing } from '../styles.js';

let counter = 0;

/** The element that really has focus, looking through open shadow roots. */
function deepActiveElement(root: Document | ShadowRoot = document): HTMLElement | null {
  const active = root.activeElement as HTMLElement | null;
  return active?.shadowRoot?.activeElement ? deepActiveElement(active.shadowRoot) : active;
}

/**
 * Modal dialog built on the native `<dialog>` element: focus is trapped, the page behind is inert
 * and Escape closes it. Focus returns to whatever had it before the dialog opened.
 *
 * @fires dialog-cancel - Escape, the close button or a backdrop click; cancelable
 * @fires dialog-close - after the dialog closed
 * @slot - dialog body
 * @slot footer - actions
 *
 * @tessera-icon copy
 * @tessera-method show(): void - Opens the dialog as a modal.
 * @tessera-method close(): void - Closes the dialog.
 */
export class TesseraDialog extends TesseraElement {
  static override properties: PropertyDeclarations = {
    open: { type: Boolean, reflect: true },
    heading: {},
    dismissible: { type: Boolean },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: contents;
      }
      dialog {
        padding: 0;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        background: var(--tessera-color-bg);
        color: var(--tessera-color-text);
        box-shadow: var(--tessera-shadow-lg);
        width: min(32rem, calc(100vw - 2rem));
        max-height: calc(100vh - 2rem);
        overflow: hidden;
      }
      dialog::backdrop {
        background: rgb(15 23 42 / 0.55);
      }
      .content {
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 2rem);
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-4) var(--tessera-space-4) var(--tessera-space-2);
      }
      h2 {
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      .body {
        padding: var(--tessera-space-2) var(--tessera-space-4) var(--tessera-space-4);
        overflow: auto;
      }
      footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-3) var(--tessera-space-4);
        border-top: 1px solid var(--tessera-color-border);
      }
      footer:not(:has(::slotted(*))) {
        display: none;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  open = false;
  heading = '';
  /** When false, Escape, backdrop clicks and the close button do nothing. */
  dismissible = true;

  readonly #titleId = `tessera-dialog-title-${++counter}`;
  #returnFocus: HTMLElement | null = null;

  /** Opens the dialog. */
  show(): void {
    this.open = true;
  }

  /** Closes the dialog without a `dialog-cancel` round trip. */
  close(): void {
    this.open = false;
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has('open')) return;
    const dialog = this.renderRoot.querySelector('dialog');
    if (!dialog) return;
    if (this.open && !dialog.open) {
      this.#returnFocus = deepActiveElement();
      dialog.showModal();
    } else if (!this.open && dialog.open) {
      dialog.close();
    }
  }

  protected override render(): unknown {
    return html`<dialog
      part="dialog"
      aria-labelledby=${this.#titleId}
      @cancel=${this.#onNativeCancel}
      @close=${this.#onNativeClose}
      @click=${this.#onBackdropClick}
    >
      <div class="content" part="content">
        <header>
          <h2 id=${this.#titleId}>${this.heading}</h2>
          ${
            this.dismissible
              ? html`<tessera-icon-button icon="x" label=${this.t('ui.close')} size="sm" @click=${this.#requestClose}></tessera-icon-button>`
              : nothing
          }
        </header>
        <div class="body" part="body"><slot></slot></div>
        <footer part="footer"><slot name="footer"></slot></footer>
      </div>
    </dialog>`;
  }

  #requestClose = (): void => {
    if (!this.dismissible) return;
    if (this.emit('dialog-cancel', {}, { cancelable: true })) this.open = false;
  };

  #onNativeCancel = (event: Event): void => {
    // We own the closing decision, so the native default is always suppressed.
    event.preventDefault();
    this.#requestClose();
  };

  #onBackdropClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) this.#requestClose();
  };

  #onNativeClose = (): void => {
    this.open = false;
    const target = this.#returnFocus;
    this.#returnFocus = null;
    if (target?.isConnected) target.focus();
    this.emit('dialog-close', {});
  };
}
