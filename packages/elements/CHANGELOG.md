# @tessera-kit/elements

## 0.2.0

### Minor Changes

- 376ade7: - `static tesseraExposes`: listed properties dispatch `tessera-change` (`{ detail: { property, value } }`, not bubbling, composed) when they change. The form primitives (input, textarea, select, tag input, colour swatches) expose `value`.
  - The package ships `tessera.manifest.json` (`@tessera-kit/elements/tessera.manifest.json`) describing the 18 primitives and `<tessera-root>`.
- fbd0998: Elements can be defined on first use, and a tag taken by a second copy of a kit is reported.
  
  - `lazyDefine(tag, loader)` loads and defines a tag the first time an element with it is connected: in the document (one shared `MutationObserver`), in a shadow root attached while the tag is pending (`attachShadow` is wrapped once) or a `TesseraElement`'s (checked after its first render), or already on the page when the tag is registered. `whenLazyDefined(tag)` resolves once it is defined and rejects if the loader failed. `observeLazyTags(root)` watches other shadow roots.
  - `defineElement` warns in development when a different class already holds the tag, with both versions from the classes' new `static tesseraVersion`. Each pair of versions is reported once.
  - New `version` export.

### Patch Changes

- 345a23a: The embedded design tokens no longer carry Windows line endings, and regenerating them gives the same file on every platform.
- Updated dependencies [ae48cc2]
- Updated dependencies [57d6e91]
  - @tessera-kit/core@0.2.0
  - @tessera-kit/storage@0.1.1
  - @tessera-kit/transport@0.1.1
