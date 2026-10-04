# Page cost baseline, October 2026

Measured on 2026-10-04 with `pnpm budget` (rolldown 1.2.12, minified ESM, code splitting on, gzip level 9, brotli quality 11), every dependency included except `react` and `react-dom`. The budgets in `budgets/pages.json` start at these numbers plus 3%, so later work can only lower them. See [ADR 6](../decisions/0006-page-budgets-and-the-shared-peer-trigger.md).

| Page | What it imports | Initial gzip | Initial brotli | Total gzip | Budget (initial / total gzip) |
| --- | --- | ---: | ---: | ---: | ---: |
| `base` | `createTessera` + `@tessera-kit/elements/define` | 54.5 KB | 48.0 KB | 66.5 KB | 56.1 / 68.5 KB |
| `react-bridge` | base + `@tessera-kit/react` | 55.8 KB | 49.1 KB | 67.8 KB | 57.6 / 69.9 KB |

"Initial" is the entry chunk plus its static imports. "Total" adds the lazy chunks for `@tessera-kit/storage` and `@tessera-kit/transport`, which `<tessera-root>` imports only when a config asks for them.

The plan's measurement of the same code as one chunk (`export *` of core and elements) was 55.5 KB gzip; the page measurement agrees within 1 KB.

## Top contributors to `base` (initial load)

| Package | Gzip (estimated share) | Share |
| --- | ---: | ---: |
| zod | 27.9 KB | 51.3% |
| @tessera-kit/elements | 17.4 KB | 32.0% |
| @tessera-kit/core | 3.8 KB | 7.0% |
| lit-html | 2.3 KB | 4.2% |
| @lit/reactive-element | 2.0 KB | 3.7% |
| @lit/context | 0.8 KB | 1.4% |
| lit-element | 0.2 KB | 0.4% |

Lazy only: transport 4.7 KB, storage 4.1 KB, protocol 1.8 KB, idb (inside the storage chunk).

## What this says

- **zod is half of the base page.** Core validates the config with zod "classic" at run time, and the per-package size limits ignore zod, so CI never saw it. Session 0.2 moves the runtime path to `zod/mini`; the target for `base` is 32 KB gzip or less.
- **The React bridge is cheap.** `@tessera-kit/react` plus `@lit/react` add 1.3 KB gzip on top of the base.
- **No duplicate packages** on either page in this repository. The kit repositories measure composed pages that can carry two copies of an internal package.

## Checking the gate

A temporary commit (e118930, reverted in 2bdff94) that added `export * from '@tessera-kit/storage'` to `budgets/pages/base.ts` moved storage, protocol and idb into the initial load and failed the check:

```
Page budget check failed:
  ✖ base: initial gzip is 61.7 KB, over its budget of 56.1 KB by 5.6 KB (+9.9%).

Lower the page cost, or raise the budget in budgets/pages.json and justify it in the pull request.
```

`pnpm budget` exited with status 1. After the revert it passes again.
