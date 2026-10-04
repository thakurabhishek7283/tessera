# @tessera-kit/core

The plugin host behind Tessera: configuration schema, plugin lifecycle, event bus, service registry, stores, undo/redo history, i18n and the adapter interfaces. One runtime dependency (zod, through `zod/mini`).

```sh
pnpm add @tessera-kit/core
```

## `createTessera(config, options)`

```ts
import { createTessera } from '@tessera-kit/core';

const tessera = createTessera(
  { appId: 'my-app', features: { kanban: { enabled: true } } },
  {
    plugins: { kanban: () => import('@tessera-kit/kanban') }, // only called for enabled features
    adapters: { transport, storage, uploads },            // factories from @tessera-kit/transport / storage
  },
);
await tessera.ready; // never rejects; failures arrive as 'tessera:error'
```

An invalid config throws `CONFIG_INVALID` with one `path: message` line per problem. Development builds (anything where `process.env.NODE_ENV` isn't `"production"`) check the whole config against `TesseraConfigSchema`. Production builds check `appId`, the `features` object and the adapter `type` values, with the same messages, and leave the full schema and zod's message catalog out of the bundle. Feature options are always checked by their plugin.

| Option | Description |
| --- | --- |
| `plugins` | Feature id → `() => import(...)` whose default export is a plugin |
| `adapters` | `{ transport, storage, uploads }` factories. Missing factory + configured type → `ADAPTER_MISSING` |
| `clock`, `ids` | Injectable for tests |

Returns a `TesseraInstance`: `ready`, `ctx`, `feature(id)`, `featureStatus(id)`, `enable(id, cfg?)`, `disable(id)`, `on(event, fn)`, `getTheme()`, `setTheme(mode)`, `setLocale(locale)`, `destroy()`.

The full configuration is documented in the [configuration reference](https://thakurabhishek7283.github.io/tessera/reference/configuration).

## Plugins

```ts
import { definePlugin } from '@tessera-kit/core';
import * as z from 'zod/mini';

export default definePlugin({
  id: 'counter',
  version: '1.0.0',
  configSchema: z.object({ enabled: z.boolean(), step: z._default(z.number(), 1) }),
  requires: ['storage'],
  setup: (ctx, cfg) => ({ step: cfg.step }),
  teardown: (api) => {},
});
```

See [Writing a plugin](https://thakurabhishek7283.github.io/tessera/guide/writing-a-plugin).

## Building blocks

| Export | What it is |
| --- | --- |
| `createEventBus<M>()` | Typed, synchronous bus. A throwing listener does not stop the others. |
| `createStore(initial)`, `batch(fn)` | Tiny observable value with `select` and notification batching. |
| `createHistory(opts)` | Command-pattern undo/redo with merge window, transactions and a limit. |
| `createI18n(opts)` | `{name}` interpolation, plural forms, locale fallback chain, `Intl` formatting. |
| `createServiceRegistry()` | `register`, `get`, `require`, `watch`. |
| `createIdGenerator()` | 26-char sortable ids (time + randomness), monotonic within a millisecond. |
| `TesseraError` | `code`, `message`, `details`, `cause`; `TesseraError.is(e, code?)`. |
| `createLogger(level)` | Scoped logger; libraries log through `ctx.logger`. |

## One copy per page

Each copy of core that a page evaluates pushes its version onto `globalThis[Symbol.for('tessera.core')].versions`. When a second copy appears (two versions in the lockfile, or one bundled twice), development builds log one warning:

```
[tessera] two copies of @tessera-kit/core loaded (0.1.0 and 0.2.0). Run "npx tessera doctor" or dedupe your lockfile.
```

Two copies don't share instances, stores or the implicit default instance, so elements from one can't see the other's. Production builds keep the registration and drop the warning. The `version` export is this copy's version.

## Extending the types

`FeatureApiMap`, `ServiceMap` and `TesseraEvents` are open interfaces; kits add to them with `declare module '@tessera-kit/core'`.

## Error codes

`CONFIG_INVALID`, `PLUGIN_NOT_FOUND`, `PLUGIN_SETUP_FAILED`, `ADAPTER_MISSING`, `SERVICE_MISSING`, `TRANSPORT_CLOSED`, `TIMEOUT`, `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `VALIDATION`, `UPLOAD_TOO_LARGE`, `UNKNOWN`.
