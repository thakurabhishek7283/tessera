# @tessera/transport

Two implementations of the `Transport` interface from `@tessera/core`.

```ts
import { createTransport } from '@tessera/transport';
createTessera(config, { plugins, adapters: { transport: createTransport } });
```

`createTransport(cfg, ctx)` returns `null` for `{ type: 'none' }`.

## `local`: tabs of one origin, no server

```ts
transport: { type: 'local', channel: 'default' }
```

Peers find each other with announce/here/bye messages over `BroadcastChannel`, refreshed by a 5 s heartbeat; a peer silent for 15 s is dropped. `Room.request` is answered in the tab by handlers a kit registers, standing in for server topics:

```ts
import { isLocalTransport } from '@tessera/transport';

const t = ctx.transport();
if (isLocalTransport(t)) {
  t.registerHandler('chat.send', async (data, { user, broadcast }) => {
    const message = await save(data, user);
    broadcast('chat.message', message); // reaches every tab, this one included, from 'server'
    return message;
  });
}
```

`capabilities`: no server history, no server persistence.

## `websocket`: tessera-server or any server speaking `@tessera/protocol`

```ts
transport: { type: 'websocket', url: 'wss://example.com/v1/ws', reconnect: { initialDelayMs: 500, maxDelayMs: 30000 } }
```

| Behaviour | Detail |
| --- | --- |
| States | `idle → connecting → open ⇄ reconnecting → closed` (`transport.state` is a store) |
| Reconnect | Exponential backoff with jitter; resets after 10 s of stable connection; retries at once on `online` and when the tab becomes visible |
| Rooms | Rejoined automatically with last presence; `room.on('$reconnected', …)` lets kits fetch what they missed |
| Offline | `publish`/`send` queue (bounded by `maxQueue`, oldest dropped); requests wait up to 30 s, then `TRANSPORT_CLOSED` |
| Requests | `room.request(topic, data, { timeoutMs })`, default 10 s → `TIMEOUT` |
| Heartbeat | `ping` every 25 s, reconnect if no `pong` in 10 s |
| Auth | The token from `ctx.auth.getToken()` is sent in `hello`; close code 4003 stops reconnecting |
| Frames | Validated with `ServerMsg`; invalid ones are ignored; outgoing frames over 64 KiB are rejected |

`capabilities`: server history and persistence available.

Exports: `createTransport`, `createLocalTransport`, `createWebSocketTransport`, `isLocalTransport`, and the helpers `createPeerList`, `createMergeThrottle`, `withTimeout`.
