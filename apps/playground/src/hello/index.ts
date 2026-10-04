import { defineElement, registerImplicitPlugin } from '@tessera-kit/elements';
import { TesseraHelloElement } from './element.js';

export { TesseraHelloElement } from './element.js';
export type { HelloApi } from './plugin.js';

// Defining the element and registering the plugin loader is what lets a bare <tessera-hello> work
// on its own, with no createTessera() call at all.
defineElement('tessera-hello', TesseraHelloElement);
registerImplicitPlugin('hello', () => import('./plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-hello': TesseraHelloElement;
  }
}
