# @tessera-kit/manifest

Build-time tooling for Tessera kit manifests. `tessera-manifest` reads a kit's Lit sources and its plugin's config schema and writes `dist/tessera.manifest.json`: one machine-readable description of every element (properties, events, slots, CSS parts, exposes, methods, layout hints) plus the feature's config as JSON Schema. The Studio palette and inspector, the compiler's validator and the agent read it.

The format is a [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) (included as `cem`) wrapped with Tessera fields. Types: `TesseraManifest` in this package; JSON Schema: `@tessera-kit/manifest/manifest.schema.json`.

This package is never imported by runtime code; a lint rule enforces that.

```sh
pnpm add -D @tessera-kit/manifest
```

## Commands

| Command | What it does |
| --- | --- |
| `tessera-manifest build [--package <dir>] [--out <file>]` | Generates, validates and writes the manifest (default `dist/tessera.manifest.json`). Run it after the package's own build: it imports the built plugin and measures the built entries. |
| `tessera-manifest check [--package <dir>] [--api <file>] [--update]` | Regenerates the manifest in memory and compares its public API with the committed snapshot (`tessera.manifest.api.json`). Fails with a readable diff when they differ. `--update` rewrites the snapshot. |
| `tessera-manifest validate <file>` | Checks a manifest against the schema. |
| `tessera-manifest schema --out <file>` | Writes the manifest format as JSON Schema. |

A kit wires it up like `@tessera-kit/elements` does:

```json
{
  "exports": { "./tessera.manifest.json": "./dist/tessera.manifest.json" },
  "scripts": {
    "build": "tsdown && tessera-manifest build",
    "manifest:check": "tessera-manifest check",
    "manifest:update": "tessera-manifest check --update"
  }
}
```

### The drift check

`tessera.manifest.api.json` is the manifest without `size`, `cem` and the package version: the parts that are a contract. It's committed, so a pull request that changes an element's API shows the change in that file too. CI runs `pnpm manifest:check`, which fails when the source and the snapshot disagree:

```
@tessera-kit/elements: the public API changed without the manifest (2 differences):
  - <tessera-button> prop "loading": boolean (attribute "loading")
  + <tessera-button> prop "busy": boolean (attribute "busy")
```

If the change is intended, run `pnpm manifest:update` in the package, commit the snapshot, and add a changeset.

## What the generator reads

- **Elements**: every class registered with `defineElement('tag', Class)` or `customElements.define('tag', Class)` in `src/`.
- **Properties**: public fields listed in `static properties` (Lit, no decorators), including inherited ones; `state: true` properties and members of `TesseraElement` itself are left out. The type, default, attribute name and JSDoc description come from the field. Unions of string literals, also through type aliases declared in the package (`type Placement = Side | \`${Side}-start\``), become enums.
- **Events**: `@fires {CustomEvent<Detail>} name - description` JSDoc tags, `this.emit('name', …)` and `this.dispatchEvent(new CustomEvent('name'))` calls.
- **Slots and CSS parts**: `<slot>` and `part="…"` in `html` templates, plus `@slot name - description` and `@csspart name - description` tags. CSS custom properties come from `@cssprop --name - description`.
- **Form association**: `static formAssociated = true`.
- **The feature**: the default export of the built `"."` entry, a Tessera plugin. Its `configSchema` (zod or zod/mini) becomes JSON Schema with `z.toJSONSchema`, descriptions included.
- **Entries**: `"./elements"` (or `"./define"`), `"./react"` and `"./elements/*"` from `exports`.

### Package settings

`package.json` → `tessera.manifest`:

| Field | Meaning |
| --- | --- |
| `category` | Category for elements without `@tessera-category` |
| `plugin` | `false` when the package has no plugin (the elements primitives) |
| `exclude` | Tags to leave out (internal helper elements) |
| `docs` | `summary` (defaults to the package description), `useWhen`, `avoidWhen`, `examples`: guidance for the agent |

## JSDoc tags

Put these on the element class. A subclass inherits its base class's tags; for the single-valued ones (display, category, icon, span, container), the subclass's tag wins. Malformed tags stop the build with the file, the line and what was expected.

| Tag | Grammar | Example |
| --- | --- | --- |
| `@tessera-display` | `<display name>` | `@tessera-display Chat` |
| `@tessera-category` | `realtime \| workspace \| visual \| data \| layout \| primitive` | `@tessera-category realtime` |
| `@tessera-icon` | `<icon name>` from `@tessera-kit/elements` (required, here or inherited) | `@tessera-icon message` |
| `@tessera-expose` | `<name> {Type} [from property:<prop> \| from event:<event> <path>] [- description]` | `@tessera-expose unread {number} - Unread messages.`<br>`@tessera-expose selected {Message} from event:message-select detail.message` |
| `@tessera-method` | `<name>(<param>: <Type>, …): <Return> [- description]` | `@tessera-method scrollToBottom(smooth?: boolean): void` |
| `@tessera-editor` | `<property> <text \| textarea \| number \| switch \| color \| icon \| json \| select \| code \| hidden> [option,option]` | `@tessera-editor notes textarea`<br>`@tessera-editor tone select calm,loud` |
| `@tessera-span` | `<1–12> [md:<1–12>] [lg:<1–12>] [min-height:<length>]` | `@tessera-span 12 md:6 min-height:420px` |
| `@tessera-group` | `<property> <data \| behaviour \| appearance \| a11y>` | `@tessera-group density appearance` |
| `@tessera-container` | no arguments: the element takes child elements | `@tessera-container` |

Without a tag, the display name comes from the tag (`tessera-icon-button` → "Icon button"), the span is 12 columns, and the editor follows the type: `select` for enums, `switch` for booleans, `number`, `text`, `json` for arrays and objects, and `hidden` for property-only values with no JSON form (functions, instances).

### Exposes and `tessera-change`

A property expose (`@tessera-expose unread {number}`) must name a reactive property that is also listed in `static tesseraExposes`:

```ts
/** @tessera-expose unread {number} - Unread messages in this conversation. */
class MyChat extends TesseraElement {
  static override properties = { unread: { state: true } };
  static override tesseraExposes = ['unread'];
}
```

`TesseraElement` then dispatches `tessera-change` (`{ detail: { property, value } }`, not bubbling, composed) after every render in which one of those properties changed, so generated bindings can observe any kit the same way. The generator fails when the two lists disagree.

## Programmatic use

```ts
import { apiSnapshot, diffApi, formatDiff, generateManifest, validateManifest } from '@tessera-kit/manifest';

const manifest = await generateManifest({ packageDir: '.', measureSize: true });
```
