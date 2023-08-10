import { type CSSResultGroup, css, html, type PropertyDeclarations, svg } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { TesseraElement } from '../base.js';
import { ICONS } from '../icons.js';
import { baseStyles } from '../styles.js';

/**
 * Inline SVG icon. Decorative unless `label` is set.
 *
 * @example <tessera-icon name="plus" label="Add card"></tessera-icon>
 */
export class TesseraIcon extends TesseraElement {
  static override properties: PropertyDeclarations = {
    name: { reflect: true },
    label: {},
    size: {},
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: inline-flex;
        width: var(--tessera-icon-size, 1.25em);
        height: var(--tessera-icon-size, 1.25em);
        vertical-align: middle;
        flex: none;
      }
      svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  name = '';
  label?: string;
  /** CSS length, e.g. `20px`. Defaults to `1.25em`. */
  size?: string;

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('size')) {
      if (this.size)
        this.style.setProperty(
          '--tessera-icon-size',
          /^\d+(\.\d+)?$/.test(this.size) ? `${this.size}px` : this.size,
        );
      else this.style.removeProperty('--tessera-icon-size');
    }
  }

  protected override render(): unknown {
    const markup = ICONS[this.name] ?? '';
    return html`<svg
      viewBox="0 0 24 24"
      part="svg"
      role=${this.label ? 'img' : 'presentation'}
      aria-label=${this.label ?? ''}
      aria-hidden=${this.label ? 'false' : 'true'}
    >${markup ? unsafeSVG(markup) : svg``}</svg>`;
  }
}
