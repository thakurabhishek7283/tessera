# Wire protocol

Clients and `tessera-server` exchange JSON text frames over one WebSocket. The schemas live in `@tessera-kit/protocol` and are used on both sides, so a frame that validates in the client validates on the server.

- Protocol version: **1**. The first frame must be `hello` with `v: 1`.
- Maximum frame size: **64 KiB**. Presence patches are limited to **2 KiB**.
- Every frame is an object with a `t` (type) field.

## Names

| | Format | Example |
| --- | --- | --- |
| Room | `<appId>/<kind>:<id>`, `appId` is `[a-z0-9-]{1,40}`, `kind` is `[a-z]+`, `id` is `[A-Za-z0-9_.:-]{1,120}` | `my-app/chat:general` |
| Topic | dotted lower case: `[a-z]+(\.[a-z-]+)+` | `chat.message-updated` |

Clients write room names without the app prefix (`chat:general`); the transport adds `appId/` on the wire.

## Client → server

| `t` | Fields | Meaning |
| --- | --- | --- |
| `hello` | `v`, `token` (string or null), `appId` | First frame. The server answers `welcome` or closes with 4003. |
| `join` | `id`, `room`, `presence?` | Enter a room. Answered by `joined`. |
| `leave` | `room` | Leave a room. |
| `pub` | `room`, `topic`, `data` | Send to everyone else in the room. |
| `direct` | `room`, `to` (peer id), `topic`, `data` | Send to one member of the room. |
| `presence` | `room`, `patch` | Shallow-merge into your presence; broadcast to the room. |
| `req` | `id`, `room`, `topic`, `data` | Ask the server. Answered by `res` with the same `id`. |
| `ping` | `ts` | Heartbeat. Answered by `pong`. |

## Server → client

| `t` | Fields | Meaning |
| --- | --- | --- |
| `welcome` | `v`, `peerId`, `user`, `serverTime` | Connection accepted. |
| `joined` | `id`, `room`, `peers` | The join with that `id` succeeded; `peers` are the other members. |
| `peer-join` / `peer-leave` | `room`, `peer` / `peerId` | Membership changes. |
| `presence` | `room`, `peerId`, `patch` | Someone's presence changed. |
| `msg` | `room`, `topic`, `data`, `from`, `ts` | A published or direct message. `from` is a peer id or `"server"`. |
| `res` | `id`, `ok`, `data` or `error` | Answer to a `req`. `ok: true` carries `data`, `ok: false` carries `error`. |
| `error` | `error`, `ref?` | A problem not tied to a request, or a rejected join (`ref` is the join `id`). |
| `pong` | `ts`, `serverTime` | Heartbeat answer. |

An error is `{ code, message, details? }` with one of: `CONFIG_INVALID`, `PLUGIN_NOT_FOUND`, `PLUGIN_SETUP_FAILED`, `ADAPTER_MISSING`, `SERVICE_MISSING`, `TRANSPORT_CLOSED`, `TIMEOUT`, `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `VALIDATION`, `UPLOAD_TOO_LARGE`, `UNKNOWN`.

## Close codes

| Code | Meaning | Client behaviour |
| --- | --- | --- |
| 1001 | Server is going away | Reconnect with backoff. |
| 1009 | Frame too large | Reconnect. |
| 4001 | No `hello` in time | Reconnect. |
| 4003 | Token rejected | **Stop.** Reconnecting would not help; the transport enters `closed`. |
| 4008 | Protocol violation | Reconnect. |

## Client behaviour

The `websocket` transport implements the following so kits do not have to:

- **Hello and welcome.** Waits up to 10 s for `welcome`, then reconnects.
- **Rejoin.** After a reconnect it rejoins every room with its last presence, then emits the local pseudo-topic `$reconnected` on each room so kits can fetch what they missed.
- **Queueing.** While offline, `pub` and `direct` frames are queued up to `maxQueue` (default 200; the oldest are dropped). Requests are never dropped: they wait up to 30 s for a connection, then fail with `TRANSPORT_CLOSED`. Presence is not queued because it is re-sent on rejoin.
- **Requests.** Time out after 10 s by default (`TIMEOUT`). A request that was already sent when the connection dropped fails with `TRANSPORT_CLOSED`.
- **Heartbeat.** `ping` every 25 s; no `pong` within 10 s forces a reconnect.
- **Backoff.** `min(maxDelay, initialDelay × factor^attempt) × (1 ± jitter)`, reset after a connection stays up for 10 s. Coming back online or to the foreground retries immediately.
- **Validation.** Every inbound frame is parsed with `ServerMsg`; invalid frames are logged and ignored.

## Topics

Request topics and their payloads are exported from `@tessera-kit/protocol` as `TopicSchemas`, and broadcast payloads as `BroadcastSchemas`.

| Request topic | Request | Response |
| --- | --- | --- |
| `chat.conversations` | `{}` | `{ conversations }` |
| `chat.open-direct` | `{ userId }` | `Conversation` |
| `chat.send` | `{ conversationId, clientId, body, attachments?, replyTo? }` | `Message` |
| `chat.history` | `{ conversationId, before? \| after?, limit? }` | `{ messages, hasMore }` |
| `chat.edit` | `{ messageId, body }` | `Message` |
| `chat.delete` | `{ messageId }` | `Message` |
| `chat.react` | `{ messageId, emoji, on }` | `{ messageId, reactions }` |
| `chat.read` | `{ conversationId, messageId }` | `{ conversationId, messageId }` |

| Broadcast topic | Payload |
| --- | --- |
| `chat.message`, `chat.message-updated` | `Message` |
| `chat.reaction` | `{ conversationId, messageId, emoji, userId, on }` |
| `chat.read` | `{ conversationId, messageId, userId }` |
| `doc.changed` | `{ collection, id, version, deleted?, by? }` |
| `rtc.signal` (direct) | `{ description?, candidate? }` for WebRTC negotiation |

## REST

`tessera-server` also exposes `/v1/docs`, `/v1/uploads`, `/v1/ice` and `/v1/auth/guest`. Their request and response shapes are `DocDto`, `DocListQuery`, `DocPutBody`, `UploadRes`, `IceRes` and `GuestAuthRes` in `@tessera-kit/protocol`. Errors use the envelope `{ "error": { "code", "message", "details?" } }`; a version conflict (`409`) also returns the stored document as `current`.

Filter values in `where[field]=value` carry no type, so servers match a field against every typed reading of the string (`"1"` also matches the number `1`); `encodeWhereValue` and `whereCandidates` implement this.
