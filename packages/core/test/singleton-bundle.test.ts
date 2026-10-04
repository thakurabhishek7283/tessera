import { rolldown } from 'rolldown';
import { afterEach, describe, expect, it, vi } from 'vitest';

const key = Symbol.for('tessera.core');

/** Bundles core the way an app build does, with `process.env.NODE_ENV` replaced. */
async function bundleCore(nodeEnv: string, version: string): Promise<string> {
  const bundle = await rolldown({
    input: new URL('../src/index.ts', import.meta.url).pathname,
    platform: 'browser',
    logLevel: 'silent',
    transform: {
      define: {
        'process.env.NODE_ENV': JSON.stringify(nodeEnv),
        __TESSERA_CORE_VERSION__: JSON.stringify(version),
      },
    },
  });
  const { output } = await bundle.generate({ format: 'esm', minify: true });
  await bundle.close();
  return output[0].code;
}

/** Evaluates a bundle as its own module, like a second copy shipped by another package. */
const evaluate = (code: string): Promise<unknown> =>
  import(`data:text/javascript,${encodeURIComponent(code)}`);

describe('singleton guard in bundled apps', () => {
  afterEach(() => {
    delete (globalThis as { [key: symbol]: unknown })[key];
    vi.restoreAllMocks();
  });

  it('two versions in a development build: exactly one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await evaluate(await bundleCore('development', '0.1.0'));
    await evaluate(await bundleCore('development', '0.2.0'));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toBe(
      '[tessera] two copies of @tessera-kit/core loaded (0.1.0 and 0.2.0). Run "npx tessera doctor" or dedupe your lockfile.',
    );
  }, 30_000);

  it('two versions in a production build: no warning, and none of its code in the bundle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = await bundleCore('production', '0.1.0');
    expect(code).not.toContain('two copies');
    await evaluate(code);
    await evaluate(await bundleCore('production', '0.2.0'));
    expect(warn).not.toHaveBeenCalled();
    expect((globalThis as { [key: symbol]: { versions: string[] } })[key]?.versions).toEqual([
      '0.1.0',
      '0.2.0',
    ]);
  }, 30_000);
});
