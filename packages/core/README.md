# @tessera/core

The plugin host behind Tessera: configuration schema, plugin lifecycle, event bus, service registry, stores, undo/redo history, i18n and the adapter interfaces. One runtime dependency (zod).

```sh
pnpm add @tessera/core
```

## `createTessera(config, options)`

```ts
import { createTessera } from '@tessera/core';

const tessera = createTessera(
  { appId: 'my-app', features: { kanban: { enabled: true } } },
  {
    plugins: { kanban: () => import('@tessera/kanban') }, // only called for enabled features
    adapters: { transport, storage, uploads },            // factories from @tessera/transport / storage
  },
);
await tessera.ready; // never rejects; failures arrive as 'tessera:error'
```

| Option | Description |
| --- | --- |
| `plugins` | Feature id → `() => import(...)` whose default export is a plugin |
| `adapters` | `{ transport, storage, uploads }` factories. Missing factory + configured type → `ADAPTER_MISSING` |
| `clock`, `ids` | Injectable for tests |

Returns a `TesseraInstance`: `ready`, `ctx`, `feature(id)`, `featureStatus(id)`, `enable(id, cfg?)`, `disable(id)`, `on(event, fn)`, `getTheme()`, `setTheme(mode)`, `setLocale(locale)`, `destroy()`.

The full configuration is documented in the [configuration reference](https://thakurabhishek7283.github.io/tessera/reference/configuration).

## Plugins

```ts
import { definePlugin } from '@tessera/core';
import { z } from 'zod';

export default definePlugin({
  id: 'counter',
  version: '1.0.0',
  configSchema: z.object({ enabled: z.boolean(), step: z.number().default(1) }),
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

## Extending the types

`FeatureApiMap`, `ServiceMap` and `TesseraEvents` are open interfaces; kits add to them with `declare module '@tessera/core'`.

## Error codes

`CONFIG_INVALID`, `PLUGIN_NOT_FOUND`, `PLUGIN_SETUP_FAILED`, `ADAPTER_MISSING`, `SERVICE_MISSING`, `TRANSPORT_CLOSED`, `TIMEOUT`, `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `VALIDATION`, `UPLOAD_TOO_LARGE`, `UNKNOWN`.
