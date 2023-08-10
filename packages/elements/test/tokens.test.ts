import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

/** Extracts `--name: value` declarations from the first block matching `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('}', start);
  const out: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+);/g))
    out[m[1] ?? ''] = (m[2] ?? '').trim();
  return out;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const palettes = {
  light: () => block(':root,\ntessera-root'),
  dark: () =>
    block(
      ":root[data-tessera-theme='dark'],\ntessera-root[data-tessera-theme='dark'],\n[data-tessera-theme='dark']",
    ),
};

describe.each(Object.entries(palettes))('%s palette meets WCAG AA', (name, read) => {
  const light = palettes.light();
  const t = { ...light, ...read() };
  const c = (key: string): string => t[`--tessera-color-${key}`] ?? '';

  it('defines every colour token as hex', () => {
    for (const key of [
      'bg',
      'surface',
      'surface-2',
      'border',
      'text',
      'text-muted',
      'primary',
      'primary-contrast',
      'danger',
      'warning',
      'success',
      'focus-ring',
    ]) {
      expect(c(key), `${name}:${key}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each([
    ['text', 'bg'],
    ['text', 'surface'],
    ['text', 'surface-2'],
    ['text-muted', 'bg'],
    ['text-muted', 'surface'],
    ['text-muted', 'surface-2'],
    ['primary', 'bg'],
    ['primary', 'surface'],
    ['danger', 'bg'],
    ['danger', 'surface'],
    ['warning', 'bg'],
    ['warning', 'surface'],
    ['success', 'bg'],
    ['success', 'surface'],
    ['primary-contrast', 'primary'],
    ['primary-contrast', 'danger'],
    ['primary-contrast', 'warning'],
    ['primary-contrast', 'success'],
  ])('text %s on %s has ≥ 4.5:1', (fg, bg) => {
    expect(contrast(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['border', 'bg'],
    ['border', 'surface'],
    ['focus-ring', 'bg'],
    ['focus-ring', 'surface'],
  ])('UI colour %s against %s has ≥ 3:1', (fg, bg) => {
    expect(contrast(c(fg), c(bg))).toBeGreaterThanOrEqual(3);
  });
});

describe('structure', () => {
  it('declares the documented scale tokens', () => {
    const root = palettes.light();
    for (const key of [
      'font-family',
      'font-size-xs',
      'font-size-sm',
      'font-size-md',
      'font-size-lg',
      'font-size-xl',
      'line-height',
      'radius-sm',
      'radius-md',
      'radius-lg',
      'radius-full',
      'shadow-sm',
      'shadow-md',
      'shadow-lg',
      'z-popover',
      'z-dialog',
      'z-toast',
      'motion-duration',
    ]) {
      expect(root[`--tessera-${key}`], key).toBeDefined();
    }
    for (let i = 1; i <= 8; i++) expect(root[`--tessera-space-${i}`]).toBe(`${i * 4}px`);
  });

  it('disables motion when the user prefers reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*--tessera-motion-duration: 0ms/);
  });
});

describe('generated module', () => {
  it('stays in sync with tokens.css (run `pnpm sync-tokens` if this fails)', async () => {
    const { tokensCss } = await import('../src/tokens.generated.js');
    expect(tokensCss).toBe(css);
  });
});
