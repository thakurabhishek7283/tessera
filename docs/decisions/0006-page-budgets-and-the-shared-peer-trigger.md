# 6. Page budgets, and when shared internals become a peer

Status: accepted

## Context

`.size-limit.json` measures each package's own code and lists its peers and shared dependencies (`zod`, `lit`, `@lit/context`, the other `@tessera-kit/*` packages) under `ignore`. That keeps each package honest about its own bytes, but it can't show what a page actually downloads. Measured with every dependency included, the base page (core plus the shared elements) is 54.5 KB gzip on its first load, and zod alone is about half of it. No budget saw that.

The kit repositories bundle their private `@tessera-internal/*` packages into each kit (tessera-workspace ADR 2) and accept the duplicate copies because a page rarely uses more than one kit. Tessera Studio will compose several kits per page, which weakens that assumption.

## Decision

- Every repository measures **pages**: realistic entry files in `budgets/pages/*.ts`, bundled by `scripts/page-budget.mjs` with rolldown the way an app would bundle them (minified ESM, code splitting on, every dependency included except the host framework, `react` and `react-dom`).
- The report gives, per page, the initial load (entry chunk plus static imports) in gzip and brotli, the total with lazy chunks, the top 10 packages by bytes and every package that appears more than once. It's printed as Markdown and written to `budgets/report.json`.
- `pnpm budget` runs in CI after `build` and fails when a page is over its limit in `budgets/pages.json`, when a page has no budget or when a budget has no page.
- Budgets start at the measured baseline plus 3% (`docs/perf/baseline-2026-10.md`) and only go down. Raising one needs a reason in the pull request.
- When a realistic composed page carries two or more copies of the same internal package, that package is promoted to a published peer (`@tessera-kit/shared`) with its own changeset and size limit. Promotion follows measurement, not taste.

## Consequences

- Bloat that arrives through peers, shared dependencies or duplicate copies shows up in every pull request.
- The per-package size-limit budgets stay. They answer a different question (how big is this package's own code).
- Package attribution is an estimate: each package gets its share of a chunk's compressed size in proportion to its rendered code. It ranks contributors correctly, but the per-package numbers don't add up to an exact standalone size.
- `scripts/page-budget.mjs` and `scripts/page-budget-lib.mjs` are copied into each kit repository. Changes start here.
