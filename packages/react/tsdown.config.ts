import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'neutral',
  external: ['react', 'react/jsx-runtime', '@tessera-kit/elements/define'],
});
