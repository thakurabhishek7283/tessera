# @tessera-kit/storage

## 0.1.1

### Patch Changes

- 57d6e91: Runtime validation now uses `zod/mini`, which takes the base page from 54.5 KB to 30.2 KB gzip in a production build.
  
  - `@tessera-kit/core`: the full config schema runs in development builds (`process.env.NODE_ENV !== 'production'`). Production builds check `appId`, `features` and adapter `type` values with the same `CONFIG_INVALID` messages and leave the schema out of the bundle. `TesseraConfigSchema` is now a zod/mini schema. Plugin `configSchema` accepts any zod 4 schema. Requires `zod@^4.2.0`.
  - `@tessera-kit/protocol`: every schema is a zod/mini schema with the same validation. Call classic-only methods through their functional form (`z.extend(schema, …)` instead of `schema.extend(…)`).
  - `@tessera-kit/storage`: `createCollection` accepts any zod 4 schema.
- Updated dependencies [ae48cc2]
- Updated dependencies [57d6e91]
  - @tessera-kit/core@0.2.0
  - @tessera-kit/protocol@0.2.0
