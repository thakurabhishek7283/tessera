import type { ThemeMode } from '@tessera/core';
import { tokensCss } from './tokens.generated.js';

const MARKER = '--tessera-color-primary';

/**
 * Makes sure the design tokens exist on the page. Hosts that already import
 * `@tessera/elements/tokens.css` are left alone; otherwise the tokens are adopted once.
 */
export function installTokens(doc: Document = document): void {
  const view = doc.defaultView;
  if (!view) return;
  if (view.getComputedStyle(doc.documentElement).getPropertyValue(MARKER).trim()) return;
  try {
    const sheet = new view.CSSStyleSheet();
    sheet.replaceSync(tokensCss);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch {
    const style = doc.createElement('style');
    style.setAttribute('data-tessera-tokens', '');
    style.textContent = tokensCss;
    doc.head.append(style);
  }
}

/** Applies the resolved theme and token overrides to an element (`<tessera-root>` or `<html>`). */
export function applyTheme(
  target: HTMLElement,
  resolved: 'light' | 'dark',
  tokens: Record<string, string> | undefined,
  previous: Iterable<string> = [],
): string[] {
  target.setAttribute('data-tessera-theme', resolved);
  for (const name of previous) target.style.removeProperty(name);
  const applied: string[] = [];
  for (const [name, value] of Object.entries(tokens ?? {})) {
    if (!name.startsWith('--')) continue;
    target.style.setProperty(name, value);
    applied.push(name);
  }
  return applied;
}

export type { ThemeMode };
