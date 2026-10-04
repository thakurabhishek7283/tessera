import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import type { Placement } from '../position.js';
import { baseStyles, focusRing } from '../styles.js';
import type { TesseraPopover } from './popover.js';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Dropdown menu with full keyboard support (arrows, Home/End, typeahead, Escape).
 *
 * @example
 * <tessera-menu .items=${items}><tessera-button slot="trigger">Actions</tessera-button></tessera-menu>
 * @fires menu-select - `{ id }` of the chosen item
 * @slot trigger - the element that opens the menu
 *
 * @tessera-icon menu
 * @tessera-span 2
 * @tessera-method close(returnFocus?: boolean): void - Closes the menu, by default moving focus back to the trigger.
 */
export class TesseraMenu extends TesseraElement {
  static override properties: PropertyDeclarations = {
    items: { attribute: false },
    label: {},
    placement: {},
    isOpen: { state: true },
    active: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: inline-flex;
      }
      [role='menu'] {
        display: flex;
        flex-direction: column;
        min-width: 160px;
        padding: var(--tessera-space-1);
      }
      [role='menuitem'] {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-2) var(--tessera-space-3);
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
      }
      [role='menuitem']:hover:not([aria-disabled='true']),
      [role='menuitem']:focus-visible {
        background: var(--tessera-color-surface-2);
      }
      [role='menuitem']:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: -2px;
      }
      [role='menuitem'][aria-disabled='true'] {
        opacity: 0.55;
        cursor: not-allowed;
      }
      [role='menuitem'].danger {
        color: var(--tessera-color-danger);
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  items: MenuItem[] = [];
  /** Accessible name of the menu. Defaults to the trigger's text. */
  label?: string;
  placement: Placement = 'bottom-start';
  isOpen = false;
  active = -1;

  #typed = '';
  #typedTimer: ReturnType<typeof setTimeout> | undefined;

  get #trigger(): HTMLElement | null {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name=trigger]');
    return (slot?.assignedElements({ flatten: true })[0] as HTMLElement | undefined) ?? null;
  }

  /** Opens the menu and focuses the first (or last) enabled item. */
  async show(focus: 'first' | 'last' = 'first'): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;
    this.active = this.#step(
      focus === 'first' ? -1 : this.items.length,
      focus === 'first' ? 1 : -1,
    );
    await this.updateComplete;
    await this.renderRoot.querySelector<TesseraPopover>('tessera-popover')?.updateComplete;
    this.#focusActive();
  }

  close(returnFocus = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.active = -1;
    if (returnFocus) this.#trigger?.focus();
  }

  protected override updated(): void {
    const trigger = this.#trigger;
    if (trigger) {
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', String(this.isOpen));
    }
  }

  protected override render(): unknown {
    return html`
      <slot name="trigger" @click=${this.#onTriggerClick} @keydown=${this.#onTriggerKey}></slot>
      <tessera-popover
        .anchor=${this.#trigger}
        .open=${this.isOpen}
        .placement=${this.placement}
        panel-role="presentation"
        @popover-close=${(e: CustomEvent<{ reason: string }>) => this.close(e.detail.reason === 'escape')}
      >
        <div role="menu" aria-label=${this.label ?? this.#trigger?.textContent?.trim() ?? nothing} @keydown=${this.#onMenuKey}>
          ${this.items.map(
            (item, index) => html`<button
              role="menuitem"
              class=${item.danger ? 'danger' : ''}
              tabindex=${index === this.active ? '0' : '-1'}
              aria-disabled=${item.disabled ? 'true' : 'false'}
              data-index=${index}
              @click=${() => this.#select(index)}
            >
              ${item.icon ? html`<tessera-icon name=${item.icon}></tessera-icon>` : nothing}${item.label}
            </button>`,
          )}
        </div>
      </tessera-popover>
    `;
  }

  #onTriggerClick = (): void => {
    if (this.isOpen) this.close(false);
    else void this.show();
  };

  #onTriggerKey = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      void this.show('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      void this.show('last');
    }
  };

  /** Next enabled index from `from` in direction `dir`, wrapping around; -1 if none. */
  #step(from: number, dir: 1 | -1): number {
    const n = this.items.length;
    for (let i = 1; i <= n; i++) {
      const index = (((from + dir * i) % n) + n) % n;
      if (!this.items[index]?.disabled) return index;
    }
    return -1;
  }

  #focusActive(): void {
    this.renderRoot.querySelector<HTMLElement>(`[data-index="${this.active}"]`)?.focus();
  }

  #onMenuKey = (event: KeyboardEvent): void => {
    const move = (index: number): void => {
      event.preventDefault();
      this.active = index;
      void this.updateComplete.then(() => this.#focusActive());
    };
    switch (event.key) {
      case 'ArrowDown':
        move(this.#step(this.active, 1));
        return;
      case 'ArrowUp':
        move(this.#step(this.active, -1));
        return;
      case 'Home':
        move(this.#step(-1, 1));
        return;
      case 'End':
        move(this.#step(this.items.length, -1));
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      case 'Tab':
        this.close(false);
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)
          this.#typeahead(event.key, move);
    }
  };

  #typeahead(char: string, move: (index: number) => void): void {
    clearTimeout(this.#typedTimer);
    this.#typed += char.toLowerCase();
    this.#typedTimer = setTimeout(() => {
      this.#typed = '';
    }, 500);
    const start = this.#typed.length > 1 ? this.active - 1 : this.active;
    for (let i = 1; i <= this.items.length; i++) {
      const index = (((start + i) % this.items.length) + this.items.length) % this.items.length;
      const item = this.items[index];
      if (item && !item.disabled && item.label.toLowerCase().startsWith(this.#typed)) {
        move(index);
        return;
      }
    }
  }

  #select(index: number): void {
    const item = this.items[index];
    if (!item || item.disabled) return;
    this.close();
    this.emit('menu-select', { id: item.id });
  }
}
