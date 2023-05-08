export type MessageCatalog = Record<string, Record<string, string>>;

export interface I18n {
  readonly locale: string;
  /**
   * Looks up `key` and interpolates `{name}` placeholders. When `params.count` is a number the
   * plural variants `key.zero|one|two|few|many|other` are tried first (via `Intl.PluralRules`).
   */
  t(key: string, params?: Record<string, string | number>): string;
  /** Adds default messages; they have lower priority than the host's own messages. */
  addCatalog(catalog: MessageCatalog): void;
  setLocale(locale: string): void;
  formatDate(d: Date | number | string, opts?: Intl.DateTimeFormatOptions): string;
  formatRelative(d: Date | number | string, now?: number): string;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600 * 1000],
  ['month', 30 * 24 * 3600 * 1000],
  ['week', 7 * 24 * 3600 * 1000],
  ['day', 24 * 3600 * 1000],
  ['hour', 3600 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
];

/** Creates a small ICU-lite i18n helper. */
export function createI18n(opts: {
  locale: string;
  messages?: MessageCatalog | undefined;
  now?: () => number;
}): I18n {
  let locale = opts.locale;
  const user: MessageCatalog = opts.messages ?? {};
  const catalogs: MessageCatalog = {};
  const now = opts.now ?? Date.now;

  const lang = (l: string): string => l.split('-')[0] ?? l;

  const lookup = (key: string): string | undefined => {
    const chain: Array<Record<string, string> | undefined> = [
      user[locale],
      user[lang(locale)],
      catalogs[locale],
      catalogs[lang(locale)],
      catalogs.en,
    ];
    for (const table of chain) {
      const hit = table?.[key];
      if (hit !== undefined) return hit;
    }
    return undefined;
  };

  const interpolate = (template: string, params?: Record<string, string | number>): string =>
    params
      ? template.replace(/\{(\w+)\}/g, (m, name: string) =>
          name in params ? String(params[name]) : m,
        )
      : template;

  return {
    get locale() {
      return locale;
    },
    t(key, params) {
      let template: string | undefined;
      if (typeof params?.count === 'number') {
        const category = new Intl.PluralRules(locale).select(params.count);
        template = lookup(`${key}.${category}`) ?? lookup(`${key}.other`);
      }
      return interpolate(template ?? lookup(key) ?? key, params);
    },
    addCatalog(catalog) {
      for (const [loc, table] of Object.entries(catalog)) {
        // Existing entries win so earlier-registered plugins are not silently overridden.
        catalogs[loc] = { ...table, ...catalogs[loc] };
      }
    },
    setLocale(next) {
      locale = next;
    },
    formatDate(d, o) {
      return new Intl.DateTimeFormat(
        locale,
        o ?? { dateStyle: 'medium', timeStyle: 'short' },
      ).format(new Date(d));
    },
    formatRelative(d, at = now()) {
      const diff = new Date(d).getTime() - at;
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      for (const [unit, ms] of RELATIVE_UNITS) {
        if (Math.abs(diff) >= ms || unit === 'second') {
          return rtf.format(Math.round(diff / ms), unit);
        }
      }
      return rtf.format(0, 'second');
    },
  };
}
