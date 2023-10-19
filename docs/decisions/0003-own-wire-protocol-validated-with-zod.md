# 3. A small JSON protocol validated with zod

Status: accepted

## Context

Realtime features need rooms, presence, broadcast, direct messages and request/response. Socket.IO provides rooms but couples client and server to its transport and gives no end-to-end types.

## Decision

Use plain WebSocket frames: JSON objects with a `t` discriminator, defined once as zod schemas in `@tessera/protocol` and imported by both the client transport and the server. Requests carry ids; errors use a fixed set of codes shared with `TesseraError`.

## Consequences

- Both sides reject malformed frames the same way, and types are inferred rather than duplicated.
- Reconnect, queueing and heartbeat are our responsibility; they live in one place (`WebSocketTransport`) and are tested against a real server.
- `protocol` opts out of `isolatedDeclarations`, because exporting inferred zod types would require restating every schema type by hand.
