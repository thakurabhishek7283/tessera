# 4. Toolchain: TypeScript 6, tsdown, Biome, Vitest

Status: accepted

## Context

The repository wants fast builds and a small configuration surface.

## Decision

TypeScript 6.0 (not 7: some tools still need the JavaScript compiler API), tsdown for library builds, Vite for apps, Biome for lint and format, Vitest (with browser mode through Playwright) for tests, Turborepo and pnpm for the workspace.

## Consequences

- `isolatedDeclarations` is on (explicit types on exports), which keeps declaration emit fast and the public API deliberate. `@tessera-kit/protocol` is the exception (see ADR 3).
- Component tests run in real Chromium. The container's Chromium is used through `CHROMIUM_PATH`; CI installs its own.
- Turborepo's generated agent-guidance file is disabled (`agentGuidance: false`) so the repository contains only files we maintain.
