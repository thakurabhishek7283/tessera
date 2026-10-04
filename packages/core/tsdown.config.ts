import { defineConfig } from 'tsdown';

export default defineConfig({
  // config-schema is its own file so production bundles can drop it as a whole module.
  entry: ['src/index.ts', 'src/config-schema.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'neutral',
});
