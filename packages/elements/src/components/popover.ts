import { type CSSResultGroup, css, html, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { computePosition, type Placement } from '../position.js';
import { baseStyles } from '../styles.js';

const supportsPopoverApi = (): boolean =>
  typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

/**
 * A panel anchored to another element. Dismisses on Escape and on outside clicks.
 * Rendered in the browser's top layer, so it is never clipped by an ancestor.
 *
 * @fires popover-close - `{ reason: 'escape' | 'outside' | 'api' }` after the popover closed itself
 * @csspart panel - the floating container
 *
 * @tessera-icon eye
 * @tessera-span 3
 * @tessera-method hide(): void - Closes the popover.
 */
export class TesseraPopover extends TesseraElement {
  static override properties: PropertyDeclarations = {
    open: { type: Boolean, reflect: true },
    anchor: { attribute: 'anchor' },
    placement: {},
    offset: { type: Number },
    panelRole: { attribute: 'panel-role' },
    matchAnchorWidth: { type: Boolean, attribute: 'match-anchor-width' },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: contents;
      }
      .panel {
        position: fixed;
        inset: auto;
        margin: 0;
        padding: var(--tessera-space-2);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-bg);
        color: var(--tessera-color-text);
        box-shadow: var(--tessera-shadow-md);
        z-index: var(--tessera-z-popover);
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
        overflow: auto;
      }
      .panel:not(:popover-open):not([data-fallback-open]) {
        display: none;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  open = false;
  /** An element, or a CSS selector resolved in the popover's own root. */
  anchor: Element | string | null = null;
  placement: Placement = 'bottom-start';
  offset = 6;
  matchAnchorWidth = false;
  /** ARIA role of the floating panel. Use `presentation` when slotted content brings its own role. */
  panelRole = 'dialog';

  #panel: HTMLElement | null = null;
  #cleanup: Array<() => void> = [];

  /** Closes the popover without waiting for user input. */
  hide(): void {
    if (this.open) this.#close();
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    this.#panel = this.renderRoot.querySelector('.panel');
    if (changed.has('open')) {
      if (this.open) this.#show();
      else this.#hideNow();
    } else if (this.open) {
      this.reposition();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#hideNow();
  }

  protected override render(): unknown {
    return html`<div
      class="panel"
      part="panel"
      popover=${supportsPopoverApi() ? 'manual' : ''}
      role=${this.panelRole}
      ?data-fallback-open=${this.open && !supportsPopoverApi()}
    >
      <slot></slot>
    </div>`;
  }

  get anchorElement(): Element | null {
    if (this.anchor instanceof Element) return this.anchor;
    if (typeof this.anchor === 'string' && this.anchor) {
      const root = this.getRootNode() as Document | ShadowRoot;
      return root.querySelector(this.anchor);
    }
    return null;
  }

  /** Recomputes the position; call after the anchor moved. */
  reposition(): void {
    const panel = this.#panel;
    const anchor = this.anchorElement;
    if (!panel || !anchor) return;
    const a = anchor.getBoundingClientRect();
    if (this.matchAnchorWidth) panel.style.minWidth = `${a.width}px`;
    const { width, height } = panel.getBoundingClientRect();
    const result = computePosition({
      anchor: { x: a.x, y: a.y, width: a.width, height: a.height },
      floating: { width, height },
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      placement: this.placement,
      offset: this.offset,
    });
    panel.style.left = `${Math.round(result.x)}px`;
    panel.style.top = `${Math.round(result.y)}px`;
    panel.dataset.placement = result.placement;
  }

  #show(): void {
    const panel = this.#panel;
    if (!panel) return;
    if (supportsPopoverApi() && !panel.matches(':popover-open')) panel.showPopover();
    this.reposition();
    const onPointer = (event: PointerEvent): void => {
      const path = event.composedPath();
      if (path.includes(this) || (this.anchorElement && path.includes(this.anchorElement))) return;
      this.#close('outside');
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.#close('escape');
      }
    };
    const onMove = (): void => this.reposition();
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    const observer = new ResizeObserver(onMove);
    observer.observe(panel);
    this.#cleanup = [
      () => document.removeEventListener('pointerdown', onPointer, true),
      () => document.removeEventListener('keydown', onKey, true),
      () => window.removeEventListener('resize', onMove),
      () => window.removeEventListener('scroll', onMove, true),
      () => observer.disconnect(),
    ];
  }

  #hideNow(): void {
    for (const fn of this.#cleanup.splice(0)) fn();
    const panel = this.#panel;
    if (panel && supportsPopoverApi() && panel.matches(':popover-open')) panel.hidePopover();
  }

  #close(reason: 'escape' | 'outside' | 'api' = 'api'): void {
    this.open = false;
    this.emit('popover-close', { reason });
  }
}
