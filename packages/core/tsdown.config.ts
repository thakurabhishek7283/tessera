import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // config-schema is its own file so production bundles can drop it as a whole module.
  entry: ['src/index.ts', 'src/config-schema.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'neutral',
  define: { __TESSERA_CORE_VERSION__: JSON.stringify(pkg.version) },
});
