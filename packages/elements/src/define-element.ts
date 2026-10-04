// Bundlers replace `process.env.NODE_ENV` in app builds; where nothing does, reading it throws.
declare const process: { env: { NODE_ENV?: string } };

const warned: Set<string> = /* @__PURE__ */ new Set();

/**
 * Defines `tag` once, even if the module is loaded twice. In development, warns when the tag is
 * already taken by a different class: two copies of a kit (or of this package) are on the page, and
 * only the first one's elements are used. The versions come from each class's `tesseraVersion`.
 * A duplicate copy defines many tags, so each pair of versions is reported once, at the first tag.
 */
export function defineElement(tag: string, ctor: CustomElementConstructor): void {
  const existing = customElements.get(tag);
  if (!existing) {
    customElements.define(tag, ctor);
    return;
  }
  if (existing === ctor) return;
  // The try keeps this working where only `process.env.NODE_ENV` is replaced (Vite) and lets
  // production bundles drop the whole block.
  try {
    if (process.env.NODE_ENV !== 'production') {
      const versionOf = (c: CustomElementConstructor): string =>
        (c as { tesseraVersion?: string }).tesseraVersion ?? 'unknown version';
      const pair = `${versionOf(existing)} ${versionOf(ctor)}`;
      if (warned.has(pair)) return;
      warned.add(pair);
      console.warn(
        `[tessera] <${tag}> is already defined by another copy (${versionOf(existing)}), so the one from ${versionOf(ctor)} is ignored. Run "npx tessera doctor" or dedupe your lockfile.`,
      );
    }
  } catch {
    // Nothing replaced `process.env.NODE_ENV` and `process` doesn't exist: production behaviour.
  }
}
