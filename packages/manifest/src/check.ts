import { formatTypeRef } from './type-text.js';
import type { TesseraManifest, TypeRef } from './types.js';

/**
 * The part of a manifest that is a contract: everything except `size`, `cem` (which lists private
 * members too) and the package version, which change without the API changing.
 */
export type ApiSnapshot = Omit<TesseraManifest, 'size' | 'cem' | 'package'> & {
  package: { name: string };
};

export function apiSnapshot(manifest: TesseraManifest): ApiSnapshot {
  const { size: _size, cem: _cem, package: pkg, ...rest } = manifest;
  return { package: { name: pkg.name }, ...rest };
}

export interface ApiDiff {
  /** Where, readably: `<tessera-button> prop "variant"`. */
  where: string;
  change: 'added' | 'removed' | 'changed';
  before?: string;
  after?: string;
}

const LABELS: Record<string, string> = {
  props: 'prop',
  events: 'event',
  exposes: 'expose',
  methods: 'method',
  slots: 'slot',
  cssProperties: 'CSS property',
  cssParts: 'CSS part',
  params: 'parameter',
};

/** The differences between two API snapshots, in a stable order. */
export function diffApi(before: ApiSnapshot, after: ApiSnapshot): ApiDiff[] {
  const out: ApiDiff[] = [];
  walk([], before, after, out);
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyOf(items: unknown[]): 'tag' | 'name' | undefined {
  const first = items.find(isObject);
  if (!first) return undefined;
  if (typeof first.tag === 'string') return 'tag';
  if (typeof first.name === 'string') return 'name';
  return undefined;
}

function show(value: unknown): string {
  if (isObject(value)) {
    if (value.kind === 'select' && Array.isArray(value.options)) {
      return `select (${(value.options as Array<{ value: string }>).map((o) => o.value).join(', ')})`;
    }
    if (typeof value.kind === 'string' && !('language' in value))
      return formatTypeRef(value as TypeRef);
    // A whole prop, event, expose or element: its type and how it is reached, not its JSON.
    if (typeof value.tag === 'string') return `<${value.tag}>`;
    if (isObject(value.type)) {
      const where =
        typeof value.attribute === 'string' ? `attribute "${value.attribute}"` : 'property only';
      return `${formatTypeRef(value.type as TypeRef)} (${where})`;
    }
    if (isObject(value.detail)) return `detail ${formatTypeRef(value.detail as TypeRef)}`;
    if (Array.isArray(value.params)) return `(${value.params.length} parameters)`;
  }
  const text = JSON.stringify(value);
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

function label(path: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const segment = path[i] as string;
    const next = path[i + 1];
    if (segment === 'elements' && next !== undefined) {
      parts.push(`<${next}>`);
      i++;
    } else if (LABELS[segment] && next !== undefined && !/^\d+$/.test(next)) {
      parts.push(`${LABELS[segment]} "${next || '(default)'}"`);
      i++;
    } else parts.push(segment);
  }
  return parts.join(' ');
}

function walk(path: string[], before: unknown, after: unknown, out: ApiDiff[]): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (before === undefined) {
    out.push({ where: label(path), change: 'added', after: show(after) });
    return;
  }
  if (after === undefined) {
    out.push({ where: label(path), change: 'removed', before: show(before) });
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const key = keyOf([...before, ...after]);
    const name = path[path.length - 1] ?? '';
    if (key) {
      const a = new Map(before.map((item) => [(item as Record<string, string>)[key], item]));
      const b = new Map(after.map((item) => [(item as Record<string, string>)[key], item]));
      for (const id of new Set([...a.keys(), ...b.keys()]))
        walk([...path, id as string], a.get(id), b.get(id), out);
      return;
    }
    if (
      before.every((v) => typeof v === 'string') &&
      after.every((v) => typeof v === 'string') &&
      LABELS[name]
    ) {
      for (const v of before)
        if (!after.includes(v)) walk([...path, v as string], v, undefined, out);
      for (const v of after)
        if (!before.includes(v)) walk([...path, v as string], undefined, v, out);
      return;
    }
  }
  // Types and editor hints read best as a whole: `'sm' | 'md' → 'sm' | 'md' | 'lg'`.
  if (isObject(before) && isObject(after) && typeof before.kind !== 'string') {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
      walk([...path, k], before[k], after[k], out);
    return;
  }
  out.push({ where: label(path), change: 'changed', before: show(before), after: show(after) });
}

/** One line per difference, for the terminal. */
export function formatDiff(diffs: ApiDiff[]): string {
  return diffs
    .map((d) =>
      d.change === 'added'
        ? `  + ${d.where}: ${d.after}`
        : d.change === 'removed'
          ? `  - ${d.where}: ${d.before}`
          : `  ~ ${d.where}: ${d.before} → ${d.after}`,
    )
    .join('\n');
}
