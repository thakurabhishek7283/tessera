import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineElement } from '../src/define-element.js';

// A stand-in registry: these tests run in Node, where only the guard's logic matters.
const registry = new Map<string, CustomElementConstructor>();
vi.stubGlobal('customElements', {
  get: (tag: string) => registry.get(tag),
  define: (tag: string, ctor: CustomElementConstructor) => {
    if (registry.has(tag)) throw new Error(`${tag} already defined`);
    registry.set(tag, ctor);
  },
});

const kitClass = (version?: string): CustomElementConstructor => {
  const ctor = class {} as unknown as CustomElementConstructor;
  if (version) (ctor as { tesseraVersion?: string }).tesseraVersion = version;
  return ctor;
};

let n = 0;
const uniqueTag = (): string => `test-define-${++n}`;

describe('defineElement', () => {
  const env = process.env.NODE_ENV;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
    warn.mockRestore();
  });

  it('defines a new tag', () => {
    const tag = uniqueTag();
    const ctor = kitClass('1.0.0');
    defineElement(tag, ctor);
    expect(registry.get(tag)).toBe(ctor);
  });

  it('ignores a second definition with the same class, without a warning', () => {
    process.env.NODE_ENV = 'development';
    const tag = uniqueTag();
    const ctor = kitClass('1.0.0');
    defineElement(tag, ctor);
    defineElement(tag, ctor);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once in development, with both versions, when another class takes the tag', () => {
    process.env.NODE_ENV = 'development';
    const tag = uniqueTag();
    const first = kitClass('0.1.0');
    defineElement(tag, first);
    defineElement(tag, kitClass('0.2.0'));
    defineElement(tag, kitClass('0.2.0'));
    expect(registry.get(tag)).toBe(first);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      `[tessera] <${tag}> is already defined by another copy (0.1.0), so the one from 0.2.0 is ignored. Run "npx tessera doctor" or dedupe your lockfile.`,
    );
  });

  it('reports a duplicate copy once, not once per tag it defines', () => {
    process.env.NODE_ENV = 'development';
    const [a, b, c] = [uniqueTag(), uniqueTag(), uniqueTag()];
    for (const tag of [a, b, c]) defineElement(tag, kitClass('1.0.0'));
    for (const tag of [a, b, c]) defineElement(tag, kitClass('1.1.0'));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(`<${a}>`);
    defineElement(a, kitClass('1.2.0'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('says so when a class has no version', () => {
    process.env.NODE_ENV = 'development';
    const tag = uniqueTag();
    defineElement(tag, kitClass());
    defineElement(tag, kitClass('0.0.2'));
    expect(warn.mock.calls[0]?.[0]).toContain('(unknown version), so the one from 0.0.2');
  });

  it('does not warn in production', () => {
    process.env.NODE_ENV = 'production';
    const tag = uniqueTag();
    defineElement(tag, kitClass('0.1.0'));
    defineElement(tag, kitClass('0.2.0'));
    expect(warn).not.toHaveBeenCalled();
  });
});
