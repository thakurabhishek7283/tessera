# @tessera-kit/testing

Test helpers for Tessera kits. See the [testing guide](https://thakurabhishek7283.github.io/tessera/guide/testing).

| Export | Description |
| --- | --- |
| `FakeHub` | In-memory stand-in for tessera-server: rooms, presence, publish, direct, request handlers, server broadcasts, room capacity, a frame `log`, and `settle()` to flush deliveries |
| `hub.transport(user)` | A `Transport` per simulated peer, with `drop()` / `restore()` to simulate outages |
| `createTestInstance(config, plugins, opts)` | Instance with memory storage, a fake clock, sequential ids and an optional hub transport; resolves after `ready` |
| `createFakeClock()`, `createSequentialIds()` | Deterministic time and ids |
| `alice`, `bob`, `carol`, `users` | Sample users (`carol` is a moderator) |
| `images`, `solidPng()`, `blobFrom()` | Valid solid-colour PNGs as data URLs and blobs |
| `sampleDocs` | Neutral sample cards and notes |
