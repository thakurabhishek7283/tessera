# Adapters

Four small interfaces connect Tessera to the outside world. Kits only ever use the interfaces, so swapping an implementation never touches kit code.

| Adapter | Interface | Built in | Use it for |
| --- | --- | --- | --- |
| Auth | `AuthProvider` | `static`, `guest`, `custom` | Telling kits who the user is and giving servers a token. |
| Transport | `Transport` / `Room` | `none`, `local`, `websocket`, `custom` | Presence, live messages and server requests. |
| Storage | `StorageAdapter` | `memory`, `local`, `indexeddb`, `rest`, `custom` | Persisting documents. |
| Uploads | `UploadAdapter` | `dataurl`, `rest`, `custom` | Images and attachments. |

Core does not import the implementations. You pass factories from `@tessera/transport` and `@tessera/storage`, which keeps core tiny and lets you tree-shake what you do not use:

```ts
import { createTessera } from '@tessera/core';
import { createStorage, createUploads } from '@tessera/storage';
import { createTransport } from '@tessera/transport';

createTessera(config, {
  plugins,
  adapters: { transport: createTransport, storage: createStorage, uploads: createUploads },
});
```

Asking for a type without passing its factory fails with `ADAPTER_MISSING` and tells you which import to add.

## Auth

```ts
interface AuthProvider {
  getUser(): UserInfo | null;
  getToken(): Promise<string | null>; // called on connect and before REST calls
  onChange(fn: (user: UserInfo | null) => void): Unsubscribe;
}
```

`static` is for demos, `guest` creates a random identity that is remembered in `localStorage`, and `custom` wraps your own session. A typical custom provider reads the user from your app's auth state and returns its access token:

```ts
const provider: AuthProvider = {
  getUser: () => session.user && { id: session.user.id, name: session.user.displayName },
  getToken: async () => (await session.refresh()).accessToken,
  onChange: (fn) => session.subscribe((s) => fn(s.user ? { id: s.user.id, name: s.user.displayName } : null)),
};
createTessera({ appId: 'my-app', auth: { type: 'custom', provider }, features: {} }, opts);
```

## Transport

A transport joins named **rooms** (`<kind>:<id>`, for example `chat:general`) and offers four things inside one:

- `publish(topic, data)`: to everyone else in the room.
- `send(peerId, topic, data)`: to one peer (WebRTC signaling uses this).
- `request(topic, data)`: ask the server and await the answer.
- `peers` and `setPresence(patch)`: who is here and what they are doing.

| | `local` | `websocket` |
| --- | --- | --- |
| Works without a server | yes | no |
| Peers | other tabs of the same origin | everyone connected to the server |
| `request` | answered in the tab by handlers kits register | answered by the server |
| Persistence and history | none | server side |
| Reconnect, queueing, heartbeat | not needed | yes (backoff with jitter, bounded queue, ping/pong) |

`transport.capabilities` tells a kit what it can rely on. Chat, for example, asks the server for history when `serverHistory` is true and keeps its own messages in storage otherwise.

## Storage

Documents are JSON with a version, grouped in collections named `<featureId>.<collection>`:

```ts
interface StorageAdapter {
  get<T>(collection: string, id: string): Promise<Doc<T> | null>;
  list<T>(collection: string, q?: ListQuery): Promise<Page<Doc<T>>>;
  put<T>(collection: string, doc: { id: string; data: T; version?: number }): Promise<Doc<T>>;
  delete(collection: string, id: string, version?: number): Promise<void>;
  watch?(collection: string, fn: (change: DocChange) => void): Unsubscribe;
}
```

Every adapter shares the same behaviour, and the test suite in the repository runs one contract against all of them:

- `put` without a version overwrites. With a version it is **optimistic**: a mismatch throws `CONFLICT` and `details.current` holds the stored document. `version: 0` means "create only".
- `list` filters by equality on top-level `data` fields (`where`), sorts by one field, and pages with an opaque `cursor`.
- `watch` reports writes, including those from other tabs (`localStorage` events, an IndexedDB `BroadcastChannel`, or `doc.changed` messages from the server).

Use `createCollection` inside a plugin to get a typed, validated view:

```ts
const cards = createCollection(ctx, 'kanban.cards', CardSchema);
await cards.put({ id, data: { title: 'Write docs', column: 'todo' } });
```

Invalid documents are logged and skipped on read; invalid data is rejected on write.

### Writing your own

```ts
const adapter: StorageAdapter = {
  async get(collection, id) { /* … */ },
  async list(collection, q) { /* … */ },
  async put(collection, doc) { /* honour doc.version → throw new TesseraError('CONFLICT', …, { details: { current } }) */ },
  async delete(collection, id, version) { /* … */ },
};
createTessera({ appId: 'x', storage: { type: 'custom', adapter }, features: {} }, opts);
```

If your backend can notify you of changes, implement `watch` and live updates work in every kit. Otherwise leave it out: kits still update after their own writes, they just do not see other people's until they reload.

## Uploads

`upload(blob, { onProgress, signal })` returns `{ url, id, mime, size, width?, height? }`. The `dataurl` adapter inlines small files (images are scaled to 1600 px first) so demos need no server; `rest` posts multipart to `/v1/uploads/:appId` with progress. Both check a MIME allowlist and `maxBytes` (for images, after scaling) and report `VALIDATION` or `UPLOAD_TOO_LARGE`.
