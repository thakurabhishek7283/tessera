---
"@tessera-kit/elements": minor
---

- `static tesseraExposes`: listed properties dispatch `tessera-change` (`{ detail: { property, value } }`, not bubbling, composed) when they change. The form primitives (input, textarea, select, tag input, colour swatches) expose `value`.
- The package ships `tessera.manifest.json` (`@tessera-kit/elements/tessera.manifest.json`) describing the 18 primitives and `<tessera-root>`.
