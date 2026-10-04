---
"@tessera-kit/core": minor
---

Every copy of core registers its version under `globalThis[Symbol.for('tessera.core')]`. When a page loads a second copy, development builds log one warning naming both versions; production builds stay silent. New `version` export.
