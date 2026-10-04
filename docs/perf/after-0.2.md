# Page cost after moving to zod/mini (session 0.2)

Measured on 2026-10-04 with `pnpm budget`, which now builds pages the way a production app does (`process.env.NODE_ENV` replaced with `"production"`). Baseline: [baseline-2026-10.md](baseline-2026-10.md). Decision: [ADR 5](../decisions/0005-zod-mini-on-the-runtime-path.md).

| Page | Initial gzip before | Initial gzip after | Total gzip before | Total gzip after | New budget (initial / total) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `base` | 54.5 KB | **30.2 KB** | 66.5 KB | 47.8 KB | 31.2 / 49.2 KB |
| `react-bridge` | 55.8 KB | **31.6 KB** | 67.8 KB | 49.2 KB | 32.6 / 50.7 KB |

The plan's target for the base page was 32 KB gzip or less.

A development build of `base` is 39.2 KB gzip on first load: it adds the full config schema (about 2 KB) and zod's English messages (about 1.1 KB), plus the zod code the schema needs.

## Top contributors to `base` (initial load)

| Package | Before | After |
| --- | ---: | ---: |
| @tessera-kit/elements | 17.4 KB | 17.2 KB |
| @tessera-kit/core | 3.8 KB | 4.3 KB |
| zod | 27.9 KB | 3.2 KB |
| Lit (lit-html, reactive-element, lit-element, context) | 5.3 KB | 5.5 KB |

Core grew by 0.5 KB for the production config check and the zod/mini parse call. zod's remaining 3.2 KB is the parse machinery that plugin option schemas need; the other 6.2 KB of zod is in the lazy transport and storage chunks, for wire and REST validation.

`@tessera-kit/elements` is now more than half of the base page, and the next thing to look at. Session 0.3 (define elements on first use) addresses part of it.
