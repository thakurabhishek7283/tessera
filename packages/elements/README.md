# @tessera-kit/elements

The Lit base class, design tokens and UI primitives that every Tessera kit is built on.

```html
<script type="module" src="@tessera-kit/elements/define"></script> <!-- defines every tag below -->
```

```ts
import { TesseraElement } from '@tessera-kit/elements';        // classes and helpers, no side effects
import '@tessera-kit/elements/define';                         // registers the custom elements
import '@tessera-kit/elements/tokens.css';                     // optional: tokens as a stylesheet
```

## Writing an element

```ts
class MyKit extends TesseraElement {
  protected readonly featureId = 'my-kit';           // null for generic primitives
  protected override renderFeature() {                // only called while the feature is enabled
    return html`<b>${this.t('my-kit.title')}: ${this.observe(this.ctx.services.require('my-kit').count)}</b>`;
  }
}
```

`TesseraElement` finds its instance from the `tessera` property, the nearest `<tessera-root>` or (kit elements only) the implicit default instance; hides itself when its feature is off; re-renders on locale and theme changes; and provides `t()`, `emit()`, `observe(store)` and `useStore(store)`.

`<tessera-root>` provides an instance to its descendants and applies `data-tessera-theme` plus any `theme.tokens` overrides.

## Defining elements

`defineElement(tag, ctor)` defines a tag once, even if the module is evaluated twice. If a *different* class already holds the tag (two copies of a kit on one page), the first definition stays and development builds warn once per pair of versions, using each class's `static tesseraVersion`.

`lazyDefine(tag, loader)` defines a tag the first time an element with it is connected instead of up front. One shared `MutationObserver` watches the document. Document observers can't see inside shadow roots, so while a tag is pending, shadow roots attached afterwards are watched too (`Element.prototype.attachShadow` is wrapped once, the first time `lazyDefine` is called), and `TesseraElement` checks its own after its first render. Elements already on the page when the tag is registered, including inside open shadow roots, are found by a scan.

```ts
lazyDefine('tessera-inbox', () => import('./inbox.js'));        // a module that defines the tag
lazyDefine('my-widget', () => import('./widget.js').then((m) => m.MyWidget)); // or the constructor
await whenLazyDefined('tessera-inbox');                         // resolves when defined, rejects if the loader failed
```

`observeLazyTags(shadowRoot)` watches a shadow root that was attached before the first `lazyDefine` call and isn't open (declarative or closed). `version` is this package's version.

## Primitives

| Tag | Notes | Events |
| --- | --- | --- |
| `tessera-button` | `variant` primary/secondary/ghost/danger, `size`, `loading`, `type` submit/reset (form-associated) | `click` |
| `tessera-icon-button` | `icon`, **`label` required** (accessible name and tooltip) | `click` |
| `tessera-icon` | 61 built-in icons; `registerIcons()` adds more; `label` makes it an image | |
| `tessera-avatar`, `tessera-avatar-stack` | Initials on a colour with guaranteed text contrast; `max` overflow chip | |
| `tessera-badge` | `variant`, `count` (capped at `max`), `dot` | |
| `tessera-spinner`, `tessera-empty-state` | | |
| `tessera-dialog` | Native modal `<dialog>`; focus returns on close | `dialog-cancel` (cancelable), `dialog-close` |
| `tessera-popover` | Top-layer panel anchored to an element; flips and shifts | `popover-close` `{ reason }` |
| `tessera-menu` | Arrows, Home/End, typeahead, Escape; `items` | `menu-select` `{ id }` |
| `tessera-tooltip` | Hover and focus; text is exposed through `aria-describedby` | |
| `tessera-input`, `tessera-textarea`, `tessera-select` | Label, hint, error, constraint validation, form reset | `input`, `change` |
| `tessera-tag-input` | Enter/comma add, Backspace removes, paste splits, live announcements | `change` `{ value }` |
| `tessera-color-swatches` | Radio group with arrow keys | `change` `{ value }` |
| `tessera-toast-region` + `toast(ctx, …)` | Status/alert roles; timers pause on hover and focus; `toastErrors(instance)` | |

CSS parts: `button`, `spinner`, `avatar`, `badge`, `panel`, `tip`, `dialog`, `content`, `body`, `footer`, `field`, `label`, `control`, `hint`, `error`, `box`, `tag`, `input`, `toast`, `more`, `wrap`, `svg`.

## Controllers

`StoreController`, `ResizeController`, `KeyboardShortcutsController` (`mod+z`, scoped to the host, ignores typing in inputs) and `AutoScrollController` (edge scrolling while dragging).

## Tokens and theming

See [Theming](https://thakurabhishek7283.github.io/tessera/guide/theming). All colour pairs are tested for WCAG 2.2 AA in light and dark.

## Default instance

`registerImplicitPlugin(id, loader)` (called by kits' `elements` entries), `configureDefaultInstance(partialConfig)` and `getDefaultInstance()` support bare elements with no `createTessera` call. The default instance uses IndexedDB storage and the local transport.
