# 2. Adapters instead of a fixed backend

Status: accepted

## Context

Demos must run on static hosting with no server, applications need a real backend, and some teams already have one.

## Decision

Core defines four small interfaces: `AuthProvider`, `Transport`, `StorageAdapter` and `UploadAdapter`. Core does not import their implementations; the host passes factories. A shared behaviour contract (versions, conflicts, listing, watching) is tested against every storage adapter.

## Consequences

- The same kit runs against the browser-only `local` transport and IndexedDB, against `tessera-server`, or against a custom backend.
- Core stays at a few kilobytes because unused adapters are never bundled.
- `put` with a version is optimistic (`CONFLICT` with the current document); `version: 0` means create-only. All adapters and the server follow this.
