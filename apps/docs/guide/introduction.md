# Introduction

A *tessera* is one tile of a mosaic. Tessera is a family of feature kits that you combine into an application, plus a small core that makes them behave as one system.

## The pieces

| Package | What it is |
| --- | --- |
| `@tessera-kit/core` | The plugin host: configuration schema, plugin lifecycle, event bus, service registry, stores, undo history, i18n, and the adapter interfaces. |
| `@tessera-kit/protocol` | Zod schemas for the WebSocket wire protocol and the REST DTOs, shared by clients and the server. |
| `@tessera-kit/transport` | The `local` transport (BroadcastChannel, no server) and the `websocket` transport. |
| `@tessera-kit/storage` | Memory, localStorage, IndexedDB and REST storage adapters, upload adapters and `createCollection`. |
| `@tessera-kit/elements` | `TesseraElement` (the base class), `<tessera-root>`, design tokens and the UI primitives. |
| `@tessera-kit/react` | `TesseraProvider` and hooks. |
| `@tessera-kit/testing` | `FakeHub`, a fake clock, fixtures and `createTestInstance`. |

The feature kits (editor, notes, kanban, presence, chat, video, comments, annotator, maps) live in their own repositories and depend only on these packages. See the [kit catalog](/reference/kits).

## How it fits together

```text
            ┌──────────────────────── your app ────────────────────────┐
config ───▶ │ createTessera({ features, auth, transport, storage })    │
            │      │                                                   │
            │      ▼                                                   │
            │  plugin host ── loads only the enabled kits (lazy)       │
            │      │                                                   │
            │  bus · services · i18n · theme                           │
            │      │                                                   │
            │  adapters:  Auth · Transport · Storage · Uploads         │
            └──────┼───────────────────────────────────────────────────┘
                   ▼
   local (tabs, no server)  ·  tessera-server  ·  your own backend
```

1. **You describe features.** `features: { chat: { enabled: true } }`.
2. **The core loads and validates them.** Each enabled feature's loader is called, its options are validated against the plugin's schema, and its declared requirements (a transport, a storage, another feature's service) are checked. A failure in one feature is reported on the bus and does not stop the others.
3. **Kits talk through services, never through imports.** The comments kit uses the editor if an `editor` service is registered and a plain textarea otherwise. Kits stay independently pluggable.
4. **Adapters decide where data goes.** The same kit runs against browser-only storage in a demo and against a server in production, without code changes.

## Design rules

- **Kits never import other kits.** Cross-kit use goes through the [service registry](/guide/writing-a-plugin#services).
- **Everything is validated.** Feature options, storage documents and wire messages pass through zod schemas, and errors name the path that is wrong. Development builds also check the whole configuration; production builds check the parts that would otherwise fail far from their cause and leave the full schema out of the bundle.
- **Accessible by default.** Keyboard operation, focus management, live regions for changing content and contrast-checked colour tokens are part of the primitives, not an afterthought.
- **Offline first.** Every kit works with `transport: { type: 'local' }` and IndexedDB storage.
