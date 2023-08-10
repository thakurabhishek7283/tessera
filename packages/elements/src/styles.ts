import { type CSSResult, css } from 'lit';

/** Styles every Tessera element starts from. Uses tokens only — no hard-coded colours. */
export const baseStyles: CSSResult = css`
  :host {
    box-sizing: border-box;
    font-family: var(--tessera-font-family);
    font-size: var(--tessera-font-size-md);
    line-height: var(--tessera-line-height);
    color: var(--tessera-color-text);
  }
  :host([hidden]) {
    display: none !important;
  }
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
`;

/** Keyboard focus outline shared by interactive parts. */
export const focusRing: CSSResult = css`
  :focus-visible {
    outline: 2px solid var(--tessera-color-focus-ring);
    outline-offset: 2px;
  }
`;

export const visuallyHidden: CSSResult = css`
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
`;
