# Page cost after define-on-first-use and the singleton guard (session 0.3)

Measured on 2026-10-04 with `pnpm budget` (production builds, `process.env.NODE_ENV` replaced with `"production"`). Previous: [after-0.2.md](after-0.2.md).

| Page | Initial gzip before | Initial gzip after | Total gzip before | Total gzip after | Budget (initial / total) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `base` | 30.2 KB | 31.0 KB | 47.8 KB | 48.5 KB | 31.2 / 49.2 KB (unchanged) |
| `react-bridge` | 31.6 KB | 32.3 KB | 49.2 KB | 49.9 KB | 32.6 / 50.7 KB (unchanged) |

The base page is still under the plan's 32 KB target. Nothing in `tessera` got smaller, so no budget moves; none had to go up either.

## Where the 0.8 KB went

| Change | Gzip, minified on its own | Why it is on every page |
| --- | ---: | --- |
| `lazyDefine` (`lazy-define.ts`) | 0.93 KB (about 0.7 KB inside the page) | `TesseraElement` checks its shadow root for lazily defined tags after its first render, so the module is part of the base class |
| Version constants and `static tesseraVersion` | < 0.1 KB | |
| Core singleton registration | < 0.1 KB | Production builds keep the registration and drop the warning |

Both development warnings are removed from production bundles completely (`packages/core/test/singleton-bundle.test.ts` checks the bundle text).

The savings are in the kits: pages that render only some of a kit's elements stop downloading the rest. See `docs/perf/after-0.3.md` in tessera-realtime, tessera-workspace and tessera-visual.

## Own-code size limits (size-limit, brotli)

| Package | Before | After | Limit |
| --- | ---: | ---: | ---: |
| `@tessera-kit/core` | 6.10 kB | 6.16 kB | 6.5 kB |
| `@tessera-kit/elements` (`define`) | 14.20 kB | 14.87 kB | 15 kB |

## Development detection

The guards read `process.env.NODE_ENV` inside `try`, not behind `typeof process !== 'undefined'`. Vite replaces `process.env.NODE_ENV` but doesn't define `process` in the browser, so a `typeof process` check never sees development in a Vite dev server (checked in Chromium: `typeof process` is `"undefined"` while `process.env.NODE_ENV` reads `"development"`). Wrapped in `try`, the check works there, stays silent in unbundled ES modules, and still folds away in production builds.

## The budget now counts eager dynamic imports

`pnpm budget` used to count only the entry chunk and its static imports as "initial". A dynamic `import()` that runs as soon as a module is evaluated (chat's `void import('./inbox.js')`) downloads on every page, but was counted as lazy, so the budget couldn't see the problem this session removes. `scripts/page-budget-lib.mjs` now finds `import()` calls outside functions and loaders and counts their chunks as initial. Nothing in `tessera` does this, so its numbers don't change; chat's page measured 48.3 KB rather than 45.0 KB before its fix (see tessera-realtime).
