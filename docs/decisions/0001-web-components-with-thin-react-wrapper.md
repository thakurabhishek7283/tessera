# 1. Web Components with a thin React wrapper

Status: accepted

## Context

The kits must work in React, Angular, Vue and plain HTML. Maintaining a component library per framework multiplies the work and lets behaviour drift.

## Decision

Every UI piece is a Lit 3 custom element with Shadow DOM, plus a headless TypeScript API. React gets a thin bridge (`@tessera-kit/react`: a provider and hooks; kits wrap their elements with `@lit/react`).

## Consequences

- One implementation, tested once in a real browser.
- Styling crosses the shadow boundary through CSS custom properties and `::part`.
- Form participation needs `ElementInternals`; the form controls implement it.
- Server rendering shows a fallback and hydrates on the client.
- Lit components are declared with `static properties` rather than decorators, so no particular compiler setting is required of consumers.
