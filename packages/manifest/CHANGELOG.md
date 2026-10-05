# @tessera-kit/manifest

## 0.1.0

### Minor Changes

- c514561: New build-time package: `tessera-manifest build | check | validate | schema`. It turns a kit's Lit sources (through the Custom Elements Manifest analyzer) and its plugin's config schema into a validated `tessera.manifest.json`, reads the `@tessera-*` JSDoc tags (display, category, icon, expose, method, editor, span, group, container), and compares the public API with a committed snapshot so CI catches unannounced API changes.
