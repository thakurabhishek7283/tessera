# Quick start

The examples use the kanban kit. Kits live in their own repositories and depend on the core packages below.

::: info Packages are not on npm yet
Until the packages are published, install them from the repositories (each one explains how) or link them as described in the repository README. The code below shows the intended public API.
:::

```sh
pnpm add @tessera/core @tessera/elements @tessera/transport @tessera/storage
```

## Just an element

With no configuration at all, an element switches its own feature on in an implicit instance that uses IndexedDB storage and the local transport:

```html
<script type="module">
  import '@tessera/elements/define'; // <tessera-root> and the UI primitives
  import '@tessera/kanban/elements'; // <tessera-kanban>, registers the kanban plugin
</script>

<tessera-kanban board-id="roadmap"></tessera-kanban>
```

Open the page in two tabs: they stay in sync.

## With configuration

Create an instance yourself when you want a different backend, auth, theme or a subset of features:

::: code-group

```html [Plain HTML]
<script type="module">
  import { createTessera } from '@tessera/core';
  import { createStorage, createUploads } from '@tessera/storage';
  import { createTransport } from '@tessera/transport';
  import '@tessera/elements/define';
  import '@tessera/kanban/elements';

  const tessera = createTessera(
    {
      appId: 'my-app',
      auth: { type: 'static', user: { id: 'u1', name: 'Ada' } },
      transport: { type: 'websocket', url: 'wss://example.com/v1/ws' },
      storage: { type: 'rest', baseUrl: 'https://example.com' },
      features: { kanban: { enabled: true }, chat: { enabled: false } },
    },
    {
      plugins: {
        kanban: () => import('@tessera/kanban'),
        chat: () => import('@tessera/chat'), // never loaded: chat is disabled
      },
      adapters: { transport: createTransport, storage: createStorage, uploads: createUploads },
    },
  );

  document.querySelector('tessera-root').tessera = tessera;
</script>

<tessera-root>
  <tessera-kanban board-id="roadmap"></tessera-kanban>
</tessera-root>
```

```tsx [React]
import { TesseraProvider } from '@tessera/react';
import { KanbanBoard } from '@tessera/kanban/react';
import { createStorage, createUploads } from '@tessera/storage';
import { createTransport } from '@tessera/transport';

const config = {
  appId: 'my-app',
  features: { kanban: { enabled: true } },
};
const plugins = { kanban: () => import('@tessera/kanban') };
const adapters = { transport: createTransport, storage: createStorage, uploads: createUploads };

export function App() {
  return (
    <TesseraProvider config={config} plugins={plugins} adapters={adapters} fallback={<p>Loading…</p>}>
      <KanbanBoard boardId="roadmap" />
    </TesseraProvider>
  );
}
```

```ts [Angular]
// main.ts: define the elements once
import '@tessera/elements/define';
import '@tessera/kanban/elements';

// app.component.ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { createTessera } from '@tessera/core';

@Component({
  selector: 'app-root',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <tessera-root [tessera]="tessera">
      <tessera-kanban board-id="roadmap"></tessera-kanban>
    </tessera-root>
  `,
})
export class AppComponent {
  tessera = createTessera(config, { plugins, adapters });
}
```

```vue [Vue]
<script setup lang="ts">
import '@tessera/elements/define';
import '@tessera/kanban/elements';
import { createTessera } from '@tessera/core';

const tessera = createTessera(config, { plugins, adapters });
</script>

<template>
  <!-- .prop sets the property instead of an attribute -->
  <tessera-root :tessera.prop="tessera">
    <tessera-kanban board-id="roadmap" />
  </tessera-root>
</template>

<!-- main.ts: app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('tessera-') -->
```

```tsx [Next.js]
'use client';
import dynamic from 'next/dynamic';

// Elements need the DOM, so skip server rendering for the part that uses them.
const Board = dynamic(() => import('./board'), { ssr: false, loading: () => <p>Loading…</p> });

export default function Page() {
  return <Board />;
}
```

:::

## Toggling features at runtime

```ts
await tessera.enable('chat', { composer: { rich: true } }); // loads the code now
await tessera.disable('chat'); // tears it down; elements hide themselves
tessera.on('tessera:feature-changed', ({ id, enabled }) => console.log(id, enabled));
```

## Next steps

- [Adapters](/guide/adapters): point the same config at a real backend.
- [Configuration reference](/reference/configuration)
- [Theming](/guide/theming)
- [Writing a plugin](/guide/writing-a-plugin)
