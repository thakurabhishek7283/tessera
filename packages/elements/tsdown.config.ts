import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/define.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'browser',
});
