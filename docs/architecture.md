# Architecture

This is the design of the `tessera` repository. The user-facing view is in the [documentation site](https://thakurabhishek7283.github.io/tessera/); this page is for people changing the code.

## Package graph

```text
protocol ◀── transport ──▶ core ◀── storage ──▶ protocol
                             ▲
        elements ────────────┤
        react ───────────────┤
        testing ─────────────┘ (also uses protocol and storage)
```

- `core` has one runtime dependency (zod) and knows nothing about the DOM beyond optional `matchMedia`, `navigator.language` and `localStorage` for the guest identity.
- `transport` and `storage` implement the interfaces declared in `core`. Core never imports them: the host passes factories, which keeps core small and tree-shakeable.
- `elements` depends on core and Lit. It loads `storage` and `transport` lazily, and only for the implicit default instance.
- Kits (other repositories) depend on `core` and `elements` as peers, so a page has exactly one copy of each.

## Instance lifecycle

`createTessera(config, { plugins, adapters })`:

1. Validate `config` with `TesseraConfigSchema`. Invalid input throws `CONFIG_INVALID` naming each path.
2. Build the context: logger, clock, id generator, bus, service registry, i18n, auth, and *lazy* accessors for transport, storage and uploads.
3. For every enabled feature, call its loader in parallel. Loader failures mark only that feature as failed.
4. Order the loaded plugins by `requires`/`optional` (Kahn's algorithm). Anything that cannot be ordered is part of a cycle and is failed with an explanation.
5. Set features up in dependency order (independent ones in parallel): validate options, check requirements, merge the i18n catalog, run `setup`, register the API as a service under the feature id.
6. Emit `tessera:ready`. `instance.ready` always resolves, even when features failed; failures arrive as `tessera:error` events.

`enable` and `disable` reuse the same routines and are serialised per feature so rapid toggling cannot interleave. Each plugin receives a scoped context whose `services.register` tracks what it registered, so `disable` can undo it.

## Adapters

Transport, storage and uploads are created on first use, then memoised. Storage adapters share one `createEngine` (`packages/storage/src/engine.ts`) over a tiny `DocBackend` (`get`, `all`, atomic `mutate`, optional `external`). Versioning, `where`/`orderBy`/cursor handling and change notification are therefore identical across memory, localStorage and IndexedDB, and a single contract test (`storage-contract.ts`) runs against all adapters, REST included through a fake server.

The `local` transport mirrors server semantics inside a tab group: announce/here/bye plus heartbeats for presence, and kits register in-tab emulators for server topics with `registerHandler`. The `websocket` transport is an explicit state machine (`idle → connecting → open ⇄ reconnecting → closed`) whose edge cases are covered by tests against a real `ws` server and, for timing, an injected socket.

## Elements

`TesseraElement` resolves its instance from the `tessera` property, then the nearest `<tessera-root>` (via `@lit/context`), then, for kit elements only, the implicit default instance. It subscribes to feature, locale and theme events, hides itself when its feature is off, and offers `observe(store)` for render-time store subscriptions.

Design tokens are CSS custom properties, so they cascade into every shadow root. `tokens.css` is the source of truth, `tokens.generated.ts` embeds it for runtime installation, and a test keeps them equal and checks every colour pair against WCAG AA.

## Testing strategy

| Layer | Tool | Where |
| --- | --- | --- |
| Logic | Vitest (node) | `packages/*/test/*.test.ts` |
| Components | Vitest browser mode, Chromium via Playwright, axe-core | `packages/{elements,react}/test/*.browser.test.*` |
| Wire behaviour | Vitest against a real `ws` server | `packages/transport/test` |
| End to end | Playwright against the built playground | `e2e/` |

## Decisions

Architecture decision records live in [`decisions/`](decisions).
