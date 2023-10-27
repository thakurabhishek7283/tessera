# @tessera/storage

Document storage and upload adapters for Tessera.

```ts
import { createStorage, createUploads } from '@tessera/storage';
createTessera(config, { plugins, adapters: { storage: createStorage, uploads: createUploads } });
```

## Storage adapters

| `storage.type` | Backed by | Cross-tab `watch` | Notes |
| --- | --- | --- | --- |
| `memory` | A `Map` | in-process | Tests and fallback |
| `local` | `localStorage`, key `tessera:<appId>:<collection>` | `storage` events | Small data; warns above 2 MB |
| `indexeddb` | Database `tessera-<appId>` | `BroadcastChannel` | Atomic per-document writes |
| `rest` | `/v1/docs/:appId/:collection/:id` | `doc.changed` over the transport | `If-Match` versioning; `Bearer` token |

All of them pass the same contract tests: versioned `put` (`CONFLICT` with `details.current`, `version: 0` = create only), `delete`, `list` with `where`/`orderBy`/`limit`/`cursor`, and `watch`.

### `createCollection(ctx, 'feature.collection', zodSchema)`

A typed view that validates on write (`VALIDATION`) and drops (and logs) invalid documents on read. Names must be `<featureId>.<collection>`.

```ts
const cards = createCollection(ctx, 'kanban.cards', z.object({ title: z.string(), column: z.string() }));
const saved = await cards.put({ id: 'c1', data: { title: 'Ship it', column: 'todo' } });
await cards.put({ id: 'c1', data: { title: 'Ship it', column: 'done' }, version: saved.version });
```

## Uploads

| `uploads.type` | Behaviour |
| --- | --- |
| `dataurl` | Inlines files as `data:` URLs (default limit 1 MB). Images are scaled to 1600 px first. No server. |
| `rest` | `POST /v1/uploads/:appId` multipart. Progress through `XMLHttpRequest`, abort through `AbortSignal`. |

Both check the MIME allowlist (`image/*`, `application/pdf` by default) and `maxBytes`.

Exports: `createStorage`, `createUploads`, `createMemoryStorage`, `createLocalStorageAdapter`, `createIndexedDbStorage`, `createRestStorage`, `createDataUrlUploads`, `createRestUploads`, `createCollection`, `createEngine` (for building your own adapter on a `DocBackend`).
