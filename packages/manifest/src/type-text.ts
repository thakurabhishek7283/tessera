import type { TypeRef } from './types.js';

/**
 * Turns a TypeScript type as written (`'a' | 'b'`, `string[]`, `Message | undefined`) into a
 * TypeRef. Type aliases declared in the package (`aliases`, name → type as written) are followed
 * when they are unions of string literals, including template literals such as `${Side}-start`.
 * Anything else it doesn't understand becomes `{ kind: 'unknown' }`, never an error.
 */
export function parseTypeText(
  text: string | undefined,
  aliases: ReadonlyMap<string, string> = new Map(),
  seen: ReadonlySet<string> = new Set(),
): TypeRef {
  if (!text) return { kind: 'unknown' };
  const recurse = (t: string | undefined): TypeRef => parseTypeText(t, aliases, seen);
  const parts = splitTop(text.trim(), '|')
    .map((p) => p.trim())
    .filter((p) => p !== 'undefined' && p !== 'null' && p !== '');
  if (parts.length === 0) return { kind: 'unknown' };
  if (parts.length > 1) {
    const values: string[] = [];
    for (const part of parts) {
      const t = recurse(part);
      if (t.kind !== 'enum') return { kind: 'unknown' };
      for (const v of t.values) if (!values.includes(v)) values.push(v);
    }
    return { kind: 'enum', values };
  }
  const t = stripParens(parts[0] as string);
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'unknown') return { kind: t };
  if (t === 'any') return { kind: 'unknown' };
  const literal = stringLiteral(t);
  if (literal !== undefined && !literal.includes('${')) return { kind: 'enum', values: [literal] };
  const template = /^`([^`$]*)\$\{([A-Za-z_]\w*)\}([^`$]*)`$/.exec(t);
  if (template) {
    const inner = recurse(template[2]);
    if (inner.kind !== 'enum') return { kind: 'string' };
    return { kind: 'enum', values: inner.values.map((v) => `${template[1]}${v}${template[3]}`) };
  }
  const readonlyless = t.replace(/^readonly\s+/, '');
  if (readonlyless.endsWith('[]')) return { kind: 'array', of: recurse(readonlyless.slice(0, -2)) };
  const generic = /^(?:Readonly)?Array<(.+)>$/.exec(readonlyless);
  if (generic) return { kind: 'array', of: recurse(generic[1]) };
  if (/^Record<|^\{/.test(t) || t === 'object') {
    return { kind: 'object', jsonSchema: { type: 'object' } };
  }
  if (/^[A-Z][A-Za-z0-9_]*$/.test(t)) {
    // A union of string literals declared in the package is an enum; other names stay references.
    const alias = aliases.get(t);
    if (alias !== undefined && !seen.has(t)) {
      const resolved = parseTypeText(alias, aliases, new Set([...seen, t]));
      if (resolved.kind === 'enum') return resolved;
    }
    return { kind: 'ref', name: t };
  }
  return { kind: 'unknown' };
}

/** A short human-readable form of a TypeRef, for diffs. */
export function formatTypeRef(type: TypeRef): string {
  switch (type.kind) {
    case 'enum':
      return type.values.map((v) => `'${v}'`).join(' | ');
    case 'array':
      return `${formatTypeRef(type.of)}[]`;
    case 'object':
      return 'object';
    case 'ref':
      return type.name;
    default:
      return type.kind;
  }
}

function stringLiteral(text: string): string | undefined {
  const m = /^(['"`])(.*)\1$/.exec(text.trim());
  return m ? (m[2] as string) : undefined;
}

function stripParens(text: string): string {
  let t = text.trim();
  while (
    t.startsWith('(') &&
    t.endsWith(')') &&
    splitTop(t.slice(1, -1), '|').join('|') === t.slice(1, -1)
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** Splits on `separator` outside of brackets, parentheses, braces and quotes. */
export function splitTop(text: string, separator: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth--;
    if (ch === separator && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/** Reads a default value as written in source (`'md'`, `0`, `false`, `[]`), or undefined. */
export function parseDefault(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  const t = text.trim();
  const literal = stringLiteral(t);
  if (literal !== undefined && !t.startsWith('`')) return literal;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === '[]') return [];
  if (t === '{}') return {};
  return undefined;
}
