# 5. zod/mini on the runtime path; the full config schema in development only

Status: accepted

## Context

Core validated the developer's config with zod "classic" at run time, and protocol and storage imported classic zod too. Measured as a page (ADR 6), zod was about half of the 54.5 KB gzip base page. Classic zod's chainable API (`.optional()`, `.describe()`) puts every method on every schema, so bundlers can't drop the parts a page doesn't use; `zod/mini` exposes the same validation as tree-shakable functions. A config-like schema is 24.7 KB gzip with classic zod and 6.5 KB with zod/mini.

Config mistakes are developer mistakes. They're best caught in development, and by the Studio compiler at build time. Wire messages from the network are untrusted and have to be validated completely in production.

## Decision

- Runtime code in `packages/*/src` and the playground imports `zod/mini`. A Biome `noRestrictedImports` rule rejects `'zod'` there. Classic zod stays available to build-time tools (the docs generator).
- `TesseraPlugin.configSchema`, `parseConfig` and `createCollection` accept any zod 4 schema (`z.core.$ZodType`), so kits written with classic zod keep working while they migrate.
- `TesseraConfigSchema` lives in its own module (`config-schema.ts`, its own file in `dist`) with zod's English message catalog. `createTessera` uses it only when `process.env.NODE_ENV !== 'production'`. Bundlers replace that expression in app builds, and because core has no side effects the whole module drops out of production bundles.
- Production builds run `checkConfig`: `appId` format, a `features` object and known adapter `type` values, with the same `CONFIG_INVALID` code and the same message text as the schema for those mistakes.
- Where `process` doesn't exist and nothing replaced the expression (plain ES modules in a browser), the production check runs.
- Descriptions move from `.describe()` to `.check(z.describe(…))`, which zod/mini has had since 4.2, so `pnpm docs:gen` produces the same reference and JSON Schema. Core requires `zod@^4.2.0`.
- Protocol schemas keep complete validation. Before the switch, the zod/mini schemas were compared with the classic ones on 4,000 generated inputs each (same accept/reject decision, same parsed output), and a fuzz test now feeds 1,000 malformed frames per direction to the decoders.

## Consequences

- The base page is 30.2 KB gzip in a production build (was 54.5 KB) and 39.2 KB in a development build.
- In production, zod/mini has no message catalog, so a wrong feature option reads `features.kanban.columns: Invalid input`. The path is still exact. Development builds load the English catalog with the config schema, which is where these messages are read.
- `debug: true` no longer brings the full schema into production bundles; the plan's draft of this ADR proposed that, but it would put the schema back into every bundle. Apps that want the full check in production can import `TesseraConfigSchema` and run `parseConfig` themselves.
- Contributors use the functional zod/mini style (`z.optional(x)`, `.check(z.minLength(1))`, `z._default(x, v)`). CONTRIBUTING and the plugin guide show it.
- The public schema types change from classic `ZodType` to zod/mini types (`ZodMiniType`). Code that calls classic-only methods on exported schemas (for example `.extend()` on a protocol schema) has to use the functional form instead. That's why core and protocol take a minor version.
