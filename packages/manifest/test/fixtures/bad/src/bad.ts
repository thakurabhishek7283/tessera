import { LitElement } from 'lit';

declare function defineElement(tag: string, ctor: CustomElementConstructor): void;

/**
 * @tessera-category gadgets
 * @tessera-icon Not An Icon
 * @tessera-span 13
 * @tessera-span 6
 * @tessera-expose broken
 * @tessera-expose count {number}
 * @tessera-expose picked {string} from somewhere
 * @tessera-method nope
 * @tessera-editor missing text
 * @tessera-editor size dial
 * @tessera-editor label select
 * @tessera-group size looks
 * @tessera-container yes
 * @tessera-colour red
 */
export class BadElement extends LitElement {
  static override properties = { size: {}, label: {}, count: { type: Number } };
  static tesseraExposes = ['label'];
  size = 'md';
  label = '';
  count = 0;
}

defineElement('bad-element', BadElement);
defineElement('bad-ghost', NotAClass);
declare const NotAClass: CustomElementConstructor;
