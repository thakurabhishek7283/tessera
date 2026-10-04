// tsdown replaces this with the version from package.json when it builds dist.
declare const __TESSERA_ELEMENTS_VERSION__: string | undefined;

/** The version of this copy of `@tessera-kit/elements`. */
export const version: string =
  typeof __TESSERA_ELEMENTS_VERSION__ === 'string' ? __TESSERA_ELEMENTS_VERSION__ : '0.0.0-dev';
