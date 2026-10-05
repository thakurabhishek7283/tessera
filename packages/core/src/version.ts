// tsdown replaces this with the version from package.json when it builds dist.
declare const __TESSERA_CORE_VERSION__: string | undefined;
// Bundlers replace `process.env.NODE_ENV` in app builds; where nothing does, reading it throws.
declare const process: { env: { NODE_ENV?: string } };

/** The version of this copy of `@tessera-kit/core`. */
export const version: string =
  typeof __TESSERA_CORE_VERSION__ === 'string' ? __TESSERA_CORE_VERSION__ : '0.0.0-dev';

interface CoreRegistry {
  versions: string[];
  warned?: boolean;
}

// Every copy of core that a page evaluates registers here, so a second copy (two versions in the
// lockfile, or one bundled twice) is reported instead of splitting state silently.
const slot = globalThis as { [key: symbol]: CoreRegistry | undefined };
const key = Symbol.for('tessera.core');
slot[key] ??= { versions: [] };
const registry: CoreRegistry = slot[key];
registry.versions.push(version);

// The try keeps this working where only `process.env.NODE_ENV` is replaced (Vite) and lets
// production bundles drop the whole block.
try {
  if (process.env.NODE_ENV !== 'production' && registry.versions.length > 1 && !registry.warned) {
    registry.warned = true;
    console.warn(
      `[tessera] two copies of @tessera-kit/core loaded (${registry.versions[0]} and ${registry.versions[1]}). Run "npx tessera doctor" or dedupe your lockfile.`,
    );
  }
} catch {
  // Nothing replaced `process.env.NODE_ENV` and `process` doesn't exist: production behaviour.
}
