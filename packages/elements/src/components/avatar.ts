import { colorForId } from '@tessera/core';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { readableTextOn } from '../color.js';
import { baseStyles } from '../styles.js';

export interface AvatarUser {
  name: string;
  avatarUrl?: string | undefined;
  color?: string | undefined;
}

/** First letters of the first two words, upper-cased. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];
  return letters
    .map((w) => [...(w ?? '')][0] ?? '')
    .join('')
    .toUpperCase();
}

/** User avatar: image when available, otherwise initials on a colour derived from the name. */
export class TesseraAvatar extends TesseraElement {
  static override properties: PropertyDeclarations = {
    name: {},
    src: {},
    color: {},
    size: { reflect: true },
    failed: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: inline-flex;
        --_size: 32px;
      }
      :host([size='sm']) {
        --_size: 24px;
      }
      :host([size='lg']) {
        --_size: 48px;
      }
      .avatar {
        width: var(--_size);
        height: var(--_size);
        border-radius: var(--tessera-radius-full);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        font-size: calc(var(--_size) * 0.4);
        font-weight: 700;
        flex: none;
        background: var(--_bg);
        color: var(--_fg);
        box-shadow: 0 0 0 2px var(--tessera-avatar-ring, transparent);
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  name = '';
  src?: string;
  /** Any CSS colour; defaults to a stable colour for the name. */
  color?: string;
  size: 'sm' | 'md' | 'lg' = 'md';
  failed = false;

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('src')) this.failed = false;
  }

  protected override render(): unknown {
    const bg = this.color ?? colorForId(this.name || '?');
    const fg = readableTextOn(bg) ?? 'var(--tessera-color-primary-contrast)';
    const showImage = !!this.src && !this.failed;
    return html`<span class="avatar" part="avatar" role="img" aria-label=${this.name} style="--_bg:${bg};--_fg:${fg}">
      ${
        showImage
          ? html`<img src=${this.src ?? ''} alt="" @error=${() => (this.failed = true)} />`
          : html`<span aria-hidden="true">${initialsOf(this.name)}</span>`
      }
    </span>`;
  }
}

/** Overlapping row of avatars with a "+N" overflow chip. */
export class TesseraAvatarStack extends TesseraElement {
  static override properties: PropertyDeclarations = {
    users: { attribute: false },
    max: { type: Number },
    size: {},
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        --tessera-avatar-ring: var(--tessera-color-bg);
      }
      tessera-avatar + tessera-avatar,
      tessera-avatar + .more {
        margin-inline-start: -8px;
      }
      .more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        height: 32px;
        padding: 0 var(--tessera-space-2);
        border-radius: var(--tessera-radius-full);
        background: var(--tessera-color-surface-2);
        color: var(--tessera-color-text);
        font-size: var(--tessera-font-size-xs);
        font-weight: 700;
        box-shadow: 0 0 0 2px var(--tessera-color-bg);
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  users: AvatarUser[] = [];
  max = 4;
  size: 'sm' | 'md' | 'lg' = 'md';

  protected override render(): unknown {
    const shown = this.users.slice(0, this.max);
    const extra = this.users.length - shown.length;
    const names = this.users.map((u) => u.name).join(', ');
    return html`<span role="group" aria-label=${names} style="display:inline-flex;align-items:center">
      ${shown.map(
        (u) =>
          html`<tessera-avatar name=${u.name} size=${this.size} .src=${u.avatarUrl} .color=${u.color}></tessera-avatar>`,
      )}
      ${extra > 0 ? html`<span class="more" part="more" aria-hidden="true">${this.t('ui.more', { count: extra })}</span>` : nothing}
    </span>`;
  }
}
