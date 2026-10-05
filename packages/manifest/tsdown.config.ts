import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'node',
  // Keep .js (the package is type: module), like the other packages.
  fixedExtension: false,
});
