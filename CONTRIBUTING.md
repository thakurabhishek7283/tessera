# Contributing

Thanks for taking an interest. This repository is a pnpm + Turborepo monorepo.

## Setup

```sh
nvm use            # Node 22
corepack enable    # pnpm 10 from the packageManager field
pnpm install
pnpm check         # lint, typecheck, unit tests, build
```

Component and end-to-end tests need Chromium. Install it with `npx playwright install --with-deps chromium`, or set `CHROMIUM_PATH` to an existing binary.

## Day to day

| Task | Command |
| --- | --- |
| Run the playground | `pnpm dev` |
| Unit tests | `pnpm test` (add `--filter @tessera-kit/core` to narrow) |
| Component tests in a browser | `pnpm test:browser` |
| End-to-end tests | `pnpm e2e` |
| Page budgets (what a page pays, all dependencies included) | `pnpm budget` (after `pnpm build`) |
| Format | `pnpm format` |
| Regenerate the config reference | `pnpm docs:gen` (after changing `packages/core/src/config.ts`) |
| Regenerate the design token module | `pnpm --filter @tessera-kit/elements sync-tokens` (after editing `tokens.css`) |

## Conventions

- **Commits** follow Conventional Commits: `feat(kanban): …`, `fix(chat): …`, `docs: …`, `test: …`, `chore: …`. Keep each commit building and passing `pnpm check`.
- **TypeScript** is strict, with `isolatedDeclarations`, so exported functions and properties need explicit types. `any` is an error.
- **Comments** explain *why*, not what. No commented-out code, no `console` in library code (use `ctx.logger`).
- **Elements** use tokens only (no hard-coded colours), expose `part` names on main internals, and fire kebab-case `CustomEvent`s that bubble and are composed.
- **Accessibility** is part of done: keyboard operation, visible focus, labelled controls. Add an `expectAccessible` check to component tests.
- **Public API changes** need a changeset: `pnpm changeset`.
- **Element API changes** (properties, events, slots, parts, exposes, methods) also change the package's `tessera.manifest.api.json`: run `pnpm manifest:update` in the package and commit it. CI fails with a diff (`pnpm manifest:check`) when the source and the snapshot disagree.
- **zod** at run time means `zod/mini`: `import * as z from 'zod/mini'`, then the functional style (`z.optional(x)`, `.check(z.minLength(1), z.describe('…'))`, `z._default(x, value)`). Lint rejects classic `'zod'` in `packages/*/src` ([ADR 5](docs/decisions/0005-zod-mini-on-the-runtime-path.md)).
- **Page budgets** only go down. If a change has to raise one in `budgets/pages.json`, say why in the pull request. A new runtime package gets a page in `budgets/pages/` before its first release ([ADR 6](docs/decisions/0006-page-budgets-and-the-shared-peer-trigger.md)).

## Adding a UI primitive

1. Create `packages/elements/src/components/<name>.ts` extending `TesseraElement` (`featureId = null`).
2. Register it in `src/define.ts` and export it from `src/index.ts`.
3. Test it in a `*.browser.test.ts` file, including keyboard use and `expectAccessible`.
4. Document its events, parts and slots in the package README.

## Reporting problems

Open an issue with the template. For anything security related, please do not open a public issue; use the contact on the profile page instead.
