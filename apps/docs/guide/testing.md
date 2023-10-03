# Testing

`@tessera/testing` lets you test a kit with several simulated users and no network.

## A test instance

```ts
import { createTestInstance, FakeHub } from '@tessera/testing';

const hub = new FakeHub();
const { instance, clock } = await createTestInstance(
  { features: { chat: { enabled: true } } },
  { chat: () => import('@tessera/chat') },
  { hub }, // gives the instance a transport connected to the hub
);
```

The instance uses memory storage, a clock you control (`clock.advance(1000)`), sequential ids and, when a hub is given, a transport for the default user `alice`. `instance.ready` has already resolved.

## Many peers

```ts
import { alice, bob } from '@tessera/testing';

const a = await hub.transport(alice).join('chat:general');
const b = await hub.transport(bob).join('chat:general');

b.on('chat.typing', (data, from) => seen.push(data));
a.publish('chat.typing', { on: true });
await hub.settle(); // deliveries happen on microtasks
```

`FakeHub` follows the server's rules: `publish` reaches everyone but the sender, `send` reaches one peer, presence is merged and broadcast, `call:` rooms hold at most six people, topics must be valid and frames small.

## Pretending to be the server

```ts
hub.handle('chat.send', (data, ctx) => {
  const message = { id: ctx.hub.ids.next(), body: data.body, authorId: ctx.user.id };
  ctx.broadcast('chat.message', message); // like the real server, the sender gets it too
  return message;
});
```

Handlers may throw a `TesseraError` to produce that error code on the client.

## Network trouble

```ts
const t = hub.transport(alice);
t.drop(); // state → reconnecting; nothing in or out
// … other peers keep chatting …
t.restore(); // state → open, peers re-synced, '$reconnected' emitted so kits can gap-fill
```

## Fixtures

`alice`, `bob`, `carol` (a moderator), `images.{red,green,blue}` as data URLs, `blobFrom(dataUrl)`, `solidPng(w, h, rgb)` and `sampleDocs`.

## Component tests

Kit element tests run in a real browser with Vitest browser mode (Chromium through Playwright), which is the only way to exercise focus, top-layer popovers and form association faithfully. The `@tessera/elements` repository tests show how, including an axe-core accessibility check helper.
