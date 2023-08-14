import { type CSSResultGroup, css, html, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { computePosition, type Placement } from '../position.js';
import { baseStyles } from '../styles.js';

let counter = 0;

/**
 * Describes the slotted element on hover and keyboard focus. The text is also exposed to assistive
 * technology through `aria-describedby`, so it is never the only way to learn something.
 */
export class TesseraTooltip extends TesseraElement {
  static override properties: PropertyDeclarations = {
    text: {},
    placement: {},
    delay: { type: Number },
    visible: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: inline-flex;
      }
      .tip {
        position: fixed;
        inset: auto;
        margin: 0;
        border: 0;
        padding: var(--tessera-space-1) var(--tessera-space-2);
        border-radius: var(--tessera-radius-sm);
        background: var(--tessera-color-text);
        color: var(--tessera-color-bg);
        font-size: var(--tessera-font-size-sm);
        max-width: 28ch;
        pointer-events: none;
        z-index: var(--tessera-z-popover);
      }
      .tip:not(:popover-open) {
        display: none;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  text = '';
  placement: Placement = 'top';
  /** Milliseconds before the tooltip appears. */
  delay = 400;
  visible = false;

  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #describer: HTMLSpanElement = document.createElement('span');
  readonly #id = `tessera-tip-${++counter}`;
  #target: Element | null = null;

  constructor() {
    super();
    this.#describer.id = this.#id;
    // Visually hidden but present in the host's tree, so `aria-describedby` can reference it.
    this.#describer.setAttribute(
      'style',
      'position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap',
    );
    this.addEventListener('pointerenter', () => this.#schedule());
    this.addEventListener('pointerleave', () => this.#hide());
    this.addEventListener('focusin', () => this.#schedule());
    this.addEventListener('focusout', () => this.#hide());
    this.addEventListener('pointerdown', () => this.#hide());
    this.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.visible) {
        event.stopPropagation();
        this.#hide();
      }
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.append(this.#describer);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#timer);
    this.#describer.remove();
    this.#unlink();
  }

  protected override updated(): void {
    this.#describer.textContent = this.text;
    const tip = this.renderRoot.querySelector<HTMLElement>('.tip');
    if (!tip) return;
    if (this.visible && !tip.matches(':popover-open')) {
      tip.showPopover?.();
      this.#position(tip);
    } else if (!this.visible && tip.matches(':popover-open')) {
      tip.hidePopover?.();
    }
  }

  protected override render(): unknown {
    return html`<slot @slotchange=${this.#link}></slot>
      <div class="tip" part="tip" popover="manual" aria-hidden="true">${this.text}</div>`;
  }

  #link = (): void => {
    const slot = this.renderRoot.querySelector('slot');
    const target =
      slot?.assignedElements({ flatten: true }).find((el) => el !== this.#describer) ?? null;
    if (target === this.#target) return;
    this.#unlink();
    this.#target = target;
    if (!target) return;
    const tokens = new Set(
      (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
    );
    tokens.add(this.#id);
    target.setAttribute('aria-describedby', [...tokens].join(' '));
  };

  #unlink(): void {
    const target = this.#target;
    this.#target = null;
    if (!target) return;
    const tokens = (target.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((t) => t && t !== this.#id);
    if (tokens.length) target.setAttribute('aria-describedby', tokens.join(' '));
    else target.removeAttribute('aria-describedby');
  }

  #schedule(): void {
    if (!this.text) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.visible = true;
    }, this.delay);
  }

  #hide(): void {
    clearTimeout(this.#timer);
    this.visible = false;
  }

  #position(tip: HTMLElement): void {
    const a = (this.#target ?? this).getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const r = computePosition({
      anchor: { x: a.x, y: a.y, width: a.width, height: a.height },
      floating: { width, height },
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      placement: this.placement,
    });
    tip.style.left = `${Math.round(r.x)}px`;
    tip.style.top = `${Math.round(r.y)}px`;
  }
}
