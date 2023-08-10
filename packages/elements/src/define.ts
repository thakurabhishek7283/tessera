import { TesseraAvatar, TesseraAvatarStack } from './components/avatar.js';
import { TesseraBadge } from './components/badge.js';
import { TesseraButton } from './components/button.js';
import { TesseraEmptyState } from './components/empty-state.js';
import { TesseraIcon } from './components/icon.js';
import { TesseraIconButton } from './components/icon-button.js';
import { TesseraSpinner } from './components/spinner.js';
import { TesseraRoot } from './root.js';

/** Defines `tag` once, even if the module is loaded twice. */
export function defineElement(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

// <tessera-root> first, so elements upgraded afterwards find their provider immediately.
defineElement('tessera-root', TesseraRoot);
defineElement('tessera-icon', TesseraIcon);
defineElement('tessera-spinner', TesseraSpinner);
defineElement('tessera-button', TesseraButton);
defineElement('tessera-icon-button', TesseraIconButton);
defineElement('tessera-avatar', TesseraAvatar);
defineElement('tessera-avatar-stack', TesseraAvatarStack);
defineElement('tessera-badge', TesseraBadge);
defineElement('tessera-empty-state', TesseraEmptyState);

declare global {
  interface HTMLElementTagNameMap {
    'tessera-root': TesseraRoot;
    'tessera-icon': TesseraIcon;
    'tessera-spinner': TesseraSpinner;
    'tessera-button': TesseraButton;
    'tessera-icon-button': TesseraIconButton;
    'tessera-avatar': TesseraAvatar;
    'tessera-avatar-stack': TesseraAvatarStack;
    'tessera-badge': TesseraBadge;
    'tessera-empty-state': TesseraEmptyState;
  }
}
