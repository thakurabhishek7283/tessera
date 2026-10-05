import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  entry: ['src/index.ts', 'src/define.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'browser',
  define: { __TESSERA_ELEMENTS_VERSION__: JSON.stringify(pkg.version) },
});
