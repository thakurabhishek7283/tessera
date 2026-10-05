---
"@tessera-kit/elements": minor
---

Elements can be defined on first use, and a tag taken by a second copy of a kit is reported.

- `lazyDefine(tag, loader)` loads and defines a tag the first time an element with it is connected: in the document (one shared `MutationObserver`), in a shadow root attached while the tag is pending (`attachShadow` is wrapped once) or a `TesseraElement`'s (checked after its first render), or already on the page when the tag is registered. `whenLazyDefined(tag)` resolves once it is defined and rejects if the loader failed. `observeLazyTags(root)` watches other shadow roots.
- `defineElement` warns in development when a different class already holds the tag, with both versions from the classes' new `static tesseraVersion`. Each pair of versions is reported once.
- New `version` export.
