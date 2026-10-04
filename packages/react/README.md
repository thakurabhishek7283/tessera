# @tessera-kit/react

React 19 bridge for Tessera.

```tsx
import { TesseraProvider, useFeature, useBusEvent } from '@tessera-kit/react';

<TesseraProvider config={config} plugins={plugins} adapters={adapters} fallback={<Spinner />}>
  <App />
</TesseraProvider>;
```

| Export | Description |
| --- | --- |
| `TesseraProvider` | Creates (or adopts, with `instance`) a Tessera instance, defines the elements, and renders a `<tessera-root>` so Lit elements inside resolve the same instance. Renders `fallback` on the server and until `instance.ready`. Destroys an instance it created on unmount. Setup errors surface to error boundaries. |
| `useTessera()` | The instance (throws outside the provider) |
| `useFeature(id)` | The feature's API, `undefined` while it is off; re-renders on enable/disable |
| `useStore(store)` | `useSyncExternalStore` over a Tessera store |
| `useBusEvent(event, fn)` | Subscribe to a bus event; always calls the latest `fn` |
| `useTranslate()` | `{ t, locale }`, re-renders on locale change |
| `createElementComponent` | Re-export of `createComponent` from `@lit/react`, used by kits to wrap their elements |

`config` is read once on mount; change the component's `key` to create a new instance.

## Server rendering

Nothing touches `window` or `customElements` before mount, so the provider is safe to render on the server (it renders the fallback). In Next.js, load components that render elements with `dynamic(() => import(...), { ssr: false })`.
