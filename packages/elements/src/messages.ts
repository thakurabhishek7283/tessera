/** Default English strings used by the UI primitives. Hosts can override any key via `config.messages`. */
export const uiMessages: Record<string, Record<string, string>> = {
  en: {
    'ui.close': 'Close',
    'ui.dismiss': 'Dismiss',
    'ui.loading': 'Loading',
    'ui.remove': 'Remove {name}',
    'ui.more': '+{count} more',
    'ui.select': 'Select an option',
    'ui.tagPlaceholder': 'Add and press Enter',
    'ui.tagAdded': 'Added {name}',
    'ui.tagRemoved': 'Removed {name}',
    'ui.tagLimit': 'No more than {max} allowed',
    'ui.required': 'required',
    'ui.notifications': 'Notifications',
    'ui.unread': '{count} unread',
  },
};

/** Interpolates `{name}` placeholders. */
export function interpolate(template: string, params?: Record<string, unknown>): string {
  return params
    ? template.replace(/\{(\w+)\}/g, (m, key: string) => (key in params ? String(params[key]) : m))
    : template;
}
