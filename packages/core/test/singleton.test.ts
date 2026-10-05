import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare const process: { env: { NODE_ENV?: string } };

const key = Symbol.for('tessera.core');
const registry = (): { versions: string[]; warned?: boolean } | undefined =>
  (globalThis as { [key: symbol]: { versions: string[]; warned?: boolean } | undefined })[key];

/** Evaluates a fresh copy of core, as a second bundle or a duplicate install would. */
async function loadCopy(): Promise<typeof import('../src/index.js')> {
  vi.resetModules();
  return import('../src/index.js');
}

describe('singleton guard', () => {
  const env = process.env.NODE_ENV;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (globalThis as { [key: symbol]: unknown })[key];
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
    warn.mockRestore();
  });

  it('registers each evaluated copy and its version on globalThis', async () => {
    const core = await loadCopy();
    expect(registry()?.versions).toEqual([core.version]);
    await loadCopy();
    expect(registry()?.versions).toEqual([core.version, core.version]);
  });

  it('warns exactly once in development when two versions are loaded', async () => {
    process.env.NODE_ENV = 'development';
    // Another bundle already evaluated an older core.
    (globalThis as { [key: symbol]: unknown })[key] = { versions: ['0.0.9'] };
    const core = await loadCopy();
    await loadCopy();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      `[tessera] two copies of @tessera-kit/core loaded (0.0.9 and ${core.version}). Run "npx tessera doctor" or dedupe your lockfile.`,
    );
  });

  it('does not warn for a single copy', async () => {
    process.env.NODE_ENV = 'development';
    await loadCopy();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn in production', async () => {
    process.env.NODE_ENV = 'production';
    (globalThis as { [key: symbol]: unknown })[key] = { versions: ['0.0.9'] };
    await loadCopy();
    expect(registry()?.versions).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
  });
});
