import { describe, expect, it, vi } from 'vitest';
import { createI18n } from '../src/i18n.js';
import { createServiceRegistry, type ServiceMap } from '../src/services.js';

declare module '../src/services.js' {
  interface ServiceMap {
    editor: { name: string };
  }
}

describe('i18n', () => {
  it('interpolates params and falls back to the key', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { hi: 'Hi {name}' } } });
    expect(i18n.t('hi', { name: 'Ada' })).toBe('Hi Ada');
    expect(i18n.t('missing.key')).toBe('missing.key');
    expect(i18n.t('hi')).toBe('Hi {name}');
  });

  it('follows the documented fallback chain', () => {
    const i18n = createI18n({
      locale: 'fr-CA',
      messages: { 'fr-CA': { a: 'user fr-CA' }, fr: { b: 'user fr' } },
    });
    i18n.addCatalog({
      'fr-CA': { c: 'cat fr-CA', b: 'cat fr-CA b' },
      fr: { d: 'cat fr' },
      en: { e: 'cat en', a: 'cat en a' },
    });
    expect(i18n.t('a')).toBe('user fr-CA');
    expect(i18n.t('b')).toBe('user fr');
    expect(i18n.t('c')).toBe('cat fr-CA');
    expect(i18n.t('d')).toBe('cat fr');
    expect(i18n.t('e')).toBe('cat en');
    expect(i18n.t('zzz')).toBe('zzz');
  });

  it('lets user messages win over catalogs and earlier catalogs win over later ones', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { x: 'user' } } });
    i18n.addCatalog({ en: { x: 'plugin-a', y: 'plugin-a' } });
    i18n.addCatalog({ en: { x: 'plugin-b', y: 'plugin-b' } });
    expect(i18n.t('x')).toBe('user');
    expect(i18n.t('y')).toBe('plugin-a');
  });

  it('selects plural forms with Intl.PluralRules', () => {
    const i18n = createI18n({ locale: 'en' });
    i18n.addCatalog({ en: { 'cards.one': '{count} card', 'cards.other': '{count} cards' } });
    expect(i18n.t('cards', { count: 1 })).toBe('1 card');
    expect(i18n.t('cards', { count: 3 })).toBe('3 cards');
    expect(i18n.t('cards', { count: 0 })).toBe('0 cards');
  });

  it('switches locale at runtime', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { a: 'A' }, de: { a: 'Ä' } } });
    i18n.setLocale('de');
    expect(i18n.t('a')).toBe('Ä');
    expect(i18n.locale).toBe('de');
  });

  it('formats relative time', () => {
    const now = Date.UTC(2026, 0, 10, 12);
    const i18n = createI18n({ locale: 'en', now: () => now });
    expect(i18n.formatRelative(now - 3 * 3600 * 1000)).toBe('3 hours ago');
    expect(i18n.formatRelative(now + 2 * 24 * 3600 * 1000)).toBe('in 2 days');
    expect(i18n.formatRelative(now - 1000)).toBe('1 second ago');
  });
});

describe('service registry', () => {
  it('registers, gets, requires and unregisters', () => {
    const reg = createServiceRegistry();
    const off = reg.register('editor', { name: 'e' });
    expect(reg.get('editor')).toEqual({ name: 'e' });
    expect(() => reg.register('editor', { name: 'dup' })).toThrow(/already registered/);
    off();
    expect(reg.get('editor')).toBeUndefined();
    expect(() => reg.require('editor')).toThrowError(
      expect.objectContaining({ code: 'SERVICE_MISSING' }),
    );
  });

  it('watch fires immediately and on changes', () => {
    const reg = createServiceRegistry();
    const fn = vi.fn();
    const stop = reg.watch('editor', fn);
    const impl: ServiceMap['editor'] = { name: 'e' };
    const off = reg.register('editor', impl);
    off();
    stop();
    reg.register('editor', impl);
    expect(fn.mock.calls).toEqual([[undefined], [impl], [undefined]]);
  });
});
