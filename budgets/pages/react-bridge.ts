// A React page: the base page plus the React bridge. React itself is left out because the host
// app already pays for it.
export { createTessera } from '@tessera-kit/core';

import '@tessera-kit/elements/define';

export * from '@tessera-kit/react';
