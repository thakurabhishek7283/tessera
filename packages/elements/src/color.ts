/** Parses `#rgb`, `#rrggbb`, `rgb()` and `hsl()` into 0–255 channels. */
export function parseColor(input: string): [number, number, number] | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m?.[1]) {
    const [r, g, b] = [...m[1]].map((c) => Number.parseInt(c + c, 16));
    return [r ?? 0, g ?? 0, b ?? 0];
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m?.[1]) {
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(s);
  if (m) {
    const h = Number(m[1]) % 360;
    const sat = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    const k = (n: number): number => (n + h / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number): number =>
      Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return [f(0), f(8), f(4)];
  }
  return null;
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#000000';

/** Picks white or near-black text, whichever is more readable on `background`. */
export function readableTextOn(background: string): string | null {
  const bg = parseColor(background);
  if (!bg) return null;
  return contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [0, 0, 0])
    ? LIGHT_TEXT
    : DARK_TEXT;
}
