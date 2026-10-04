# Writing a plugin

A plugin is an object with an id, an options schema, and a `setup` function. This page walks through the `hello` plugin from the [playground](/playground/): a counter that is shared by every open tab. It is small on purpose and uses most of the contract.

## The plugin

<<< ../../playground/src/hello/plugin.ts

### What each part does

**`configSchema`.** Options are validated with zod when the feature is set up. The schema must accept `{ enabled: true }` alone, so every other field needs a default. A mistake is reported with its path, for example `features.hello.step: Invalid input: expected number, received string`.

Use [`zod/mini`](https://zod.dev/packages/mini) for anything that ships to the browser, as above: it is about a quarter of the size of classic `zod` (6.5 KB against 24.7 KB gzip for a config-like schema). Describe options with `.check(z.describe('…'))` so documentation generators can read them. zod/mini carries no message catalog, so in production builds a wrong option reads `Invalid input` (still with its path); development builds load the English messages with core's config schema.

**`requires`.** `['transport', 'storage']` makes setup fail with a clear message if the host did not configure them. You can also require another feature's service by id (`requires: ['editor']`) or list soft dependencies in `optional`. The host orders setup accordingly and detects cycles.

**`messages`.** The default translations. They sit below the host's own `messages`, so users can override any string. See [Internationalisation](/guide/i18n).

**`setup(ctx, config)`.** Receives the context and the validated options and returns the feature's API. The context provides the `bus`, `services`, `auth`, `logger`, `i18n`, `clock`, `ids`, and lazy accessors for `transport()`, `storage()` and `uploads()`.

**`teardown(api)`.** Called on `disable()` and `destroy()`. Release subscriptions and leave rooms here. Services the plugin registered through `ctx.services.register` are removed for you.

### Type-safe extension points

`FeatureApiMap`, `ServiceMap` and `TesseraEvents` are open interfaces. A plugin adds to them with declaration merging, as at the top of the file above. Afterwards `instance.feature('hello')`, `ctx.services.get('hello')` and `instance.on('hello:changed', …)` are all typed.

## The element

<<< ../../playground/src/hello/element.ts

`TesseraElement` finds its instance for you (the `tessera` property, the nearest `<tessera-root>`, or the implicit default instance), hides itself when its feature is off, and re-renders on locale and theme changes. `observe(store)` reads a store during render and subscribes to it.

Notice that the element never imports the plugin: it reads the API from the service registry. That is what keeps kits independent of each other.

## Wiring it up

<<< ../../playground/src/hello/index.ts

Defining the element and calling `registerImplicitPlugin` is what makes a bare `<tessera-hello>` work with no `createTessera` call. With your own instance you pass the loader instead:

```ts
createTessera(
  { appId: 'demo', features: { hello: { enabled: true, step: 5 } } },
  { plugins: { hello: () => import('./hello/plugin.js') }, adapters },
);
```

### Loading elements on first use

A kit with several elements shouldn't make every page download all of them. `lazyDefine(tag, loader)` registers a tag and loads its code the first time an element with that tag is connected, in the document or in any Tessera element's shadow root:

```ts
import { lazyDefine } from '@tessera-kit/elements';

// Defines itself when the module loads; nothing is fetched until a <tessera-hello-history> appears.
lazyDefine('tessera-hello-history', () => import('./history.js'));
```

The loader can define the tag itself (a side-effect module, as above) or resolve to the constructor. `whenLazyDefined(tag)` resolves once the tag is defined and rejects if its loader failed, which is handy in tests. Don't start a dynamic import when your `elements` entry loads (`void import('./x.js')`): that downloads the chunk on every page.

The official kits follow one layout, which you can copy:

| Entry | Contents |
| --- | --- |
| `<kit>/elements` | Defines the kit's main elements and calls `lazyDefine` for the optional ones |
| `<kit>/elements/<tag>` | Defines one element and what it renders, for precise imports |
| `<kit>/autoload` | Only `lazyDefine` calls, one per tag: `<script type="module" src="…/autoload">` in plain HTML |

### Versions and duplicate copies

Give each element class a `static tesseraVersion` with your package's version. If a page ends up with two copies of your kit, `defineElement` keeps the first definition and, in development, prints both versions:

```
[tessera] <tessera-hello> is already defined by another copy (0.1.0), so the one from 0.2.0 is ignored. Run "npx tessera doctor" or dedupe your lockfile.
```

Core does the same for itself: every copy registers its version under `Symbol.for('tessera.core')` on `globalThis`, and a second copy logs one warning in development.

## Services

`ctx.services.register(id, api)` makes an API available to other kits; `get(id)` returns it or `undefined`, `require(id)` throws `SERVICE_MISSING`, and `watch(id, fn)` calls you when it appears or disappears. A plugin's own API is registered under its id automatically.

```ts
// comments, in the comments kit
const editor = ctx.services.get('editor'); // present when the editor feature is enabled
return editor ? mountRichEditor(editor) : mountTextarea();
```

## Rules of thumb

- **No imports between kits.** Use services and the bus.
- **No `console`.** Use `ctx.logger`; it is silent unless the host sets `debug: true`.
- **Validate at the edge.** Storage reads go through `createCollection`; anything off the wire goes through a schema from `@tessera-kit/protocol`.
- **Be deterministic.** Take time from `ctx.clock` and ids from `ctx.ids` so tests with [`createTestInstance`](/guide/testing) are repeatable.
- **Clean up.** Whatever `setup` starts, `teardown` stops.
