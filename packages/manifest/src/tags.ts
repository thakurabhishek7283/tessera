// The `@tessera-*` JSDoc tags on element classes. The grammar is documented in README.md.
import { parseTypeText, splitTop } from './type-text.js';
import type {
  Category,
  EditorHint,
  ExposeManifest,
  MethodManifest,
  PropGroup,
  Span,
} from './types.js';

export interface RawTag {
  /** Without the `@`, e.g. 'tessera-display'. */
  name: string;
  text: string;
  /** 'src/components/button.ts:84', for error messages. */
  at: string;
}

export interface ElementTags {
  displayName?: string;
  category?: Category;
  icon?: string;
  exposes: ExposeManifest[];
  methods: MethodManifest[];
  editors: Map<string, { hint: EditorKind; options?: string[]; at: string }>;
  groups: Map<string, { group: PropGroup; at: string }>;
  span?: Span;
  minHeight?: string;
  container: boolean;
}

export type EditorKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'switch'
  | 'color'
  | 'icon'
  | 'json'
  | 'select'
  | 'code'
  | 'hidden';

export const TAG_NAMES: readonly string[] = [
  'tessera-display',
  'tessera-category',
  'tessera-icon',
  'tessera-expose',
  'tessera-method',
  'tessera-editor',
  'tessera-span',
  'tessera-group',
  'tessera-container',
];
const CATEGORIES: readonly Category[] = [
  'realtime',
  'workspace',
  'visual',
  'data',
  'layout',
  'primitive',
];
const EDITORS: readonly EditorKind[] = [
  'text',
  'textarea',
  'number',
  'switch',
  'color',
  'icon',
  'json',
  'select',
  'code',
  'hidden',
];
const GROUPS: readonly PropGroup[] = ['data', 'behaviour', 'appearance', 'a11y'];
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** Splits `text - description` on the first ` - `. */
function withDescription(text: string): [string, string] {
  const at = text.indexOf(' - ');
  return at === -1 ? [text.trim(), ''] : [text.slice(0, at).trim(), text.slice(at + 3).trim()];
}

/** Parses the `@tessera-*` tags of one class. Problems are appended to `problems`. */
export function parseTags(tags: RawTag[], problems: string[]): ElementTags {
  const out: ElementTags = {
    exposes: [],
    methods: [],
    editors: new Map(),
    groups: new Map(),
    container: false,
  };
  const seen = new Set<string>();
  const fail = (tag: RawTag, message: string): void => {
    problems.push(`${tag.at} @${tag.name}: ${message}`);
  };
  const once = (tag: RawTag): boolean => {
    if (seen.has(tag.name)) {
      fail(tag, 'may appear only once per element');
      return false;
    }
    seen.add(tag.name);
    return true;
  };

  for (const tag of tags) {
    const text = tag.text.trim();
    switch (tag.name) {
      case 'tessera-display':
        if (!once(tag)) break;
        if (!text) fail(tag, 'expected a display name, e.g. `@tessera-display Chat`');
        else out.displayName = text;
        break;
      case 'tessera-category':
        if (!once(tag)) break;
        if (!CATEGORIES.includes(text as Category)) {
          fail(tag, `expected one of ${CATEGORIES.join(', ')}, got "${text}"`);
        } else out.category = text as Category;
        break;
      case 'tessera-icon':
        if (!once(tag)) break;
        if (!KEBAB.test(text)) fail(tag, `expected an icon name like "message", got "${text}"`);
        else out.icon = text;
        break;
      case 'tessera-expose': {
        const expose = parseExpose(text);
        if (typeof expose === 'string') fail(tag, expose);
        else out.exposes.push(expose);
        break;
      }
      case 'tessera-method': {
        const method = parseMethod(text);
        if (typeof method === 'string') fail(tag, method);
        else out.methods.push(method);
        break;
      }
      case 'tessera-editor': {
        const [prop, kind, options, ...rest] = text.split(/\s+/);
        if (!prop || !kind || rest.length > 0 || !IDENT.test(prop)) {
          fail(tag, 'expected `@tessera-editor <property> <kind> [option,option]`');
        } else if (!EDITORS.includes(kind as EditorKind)) {
          fail(tag, `unknown editor "${kind}"; expected one of ${EDITORS.join(', ')}`);
        } else if (options !== undefined && kind !== 'select') {
          fail(tag, 'only the select editor takes options');
        } else if (out.editors.has(prop)) {
          fail(tag, `"${prop}" already has an editor`);
        } else {
          out.editors.set(prop, {
            hint: kind as EditorKind,
            ...(options ? { options: options.split(',').filter(Boolean) } : {}),
            at: tag.at,
          });
        }
        break;
      }
      case 'tessera-group': {
        const [prop, group, ...rest] = text.split(/\s+/);
        if (!prop || !group || rest.length > 0 || !IDENT.test(prop)) {
          fail(tag, 'expected `@tessera-group <property> <group>`');
        } else if (!GROUPS.includes(group as PropGroup)) {
          fail(tag, `unknown group "${group}"; expected one of ${GROUPS.join(', ')}`);
        } else out.groups.set(prop, { group: group as PropGroup, at: tag.at });
        break;
      }
      case 'tessera-span': {
        if (!once(tag)) break;
        const parsed = parseSpan(text);
        if (typeof parsed === 'string') fail(tag, parsed);
        else {
          out.span = parsed.span;
          if (parsed.minHeight) out.minHeight = parsed.minHeight;
        }
        break;
      }
      case 'tessera-container':
        if (!once(tag)) break;
        if (text) fail(tag, 'takes no arguments');
        out.container = true;
        break;
      default:
        fail(tag, `unknown tag; the Tessera tags are ${TAG_NAMES.map((n) => `@${n}`).join(', ')}`);
    }
  }
  return out;
}

/** `selected {Message} from event:message-select detail.message - The picked message.` */
export function parseExpose(text: string): ExposeManifest | string {
  const [head, description] = withDescription(text);
  const m = /^([A-Za-z_$][\w$]*)\s+\{([^}]+)\}(?:\s+from\s+(.+))?$/.exec(head);
  if (!m) {
    return 'expected `@tessera-expose <name> {Type} [from property:<name> | from event:<event> <path>] [- description]`';
  }
  const [, name, type, from] = m as unknown as [string, string, string, string | undefined];
  let source: ExposeManifest['source'] = { property: name };
  if (from !== undefined) {
    const property = /^property:([A-Za-z_$][\w$]*)$/.exec(from.trim());
    const event = /^event:([a-z][\w-]*)\s+([\w$]+(?:\.[\w$]+)*)$/.exec(from.trim());
    if (property) source = { property: property[1] as string };
    else if (event) source = { event: event[1] as string, path: event[2] as string };
    else
      return `cannot read the source "${from}"; expected property:<name> or event:<event> <path>`;
  }
  return { name, type: parseTypeText(type), source, description };
}

/** `scrollToBottom(smooth?: boolean): void - Scroll to the newest message.` */
export function parseMethod(text: string): MethodManifest | string {
  const [head, description] = withDescription(text);
  const m = /^([A-Za-z_$][\w$]*)\((.*)\)\s*:\s*(.+)$/.exec(head);
  if (!m) return 'expected `@tessera-method <name>(<param>: <Type>, …): <Return> [- description]`';
  const [, name, rawParams, returns] = m as unknown as [string, string, string, string];
  const params: MethodManifest['params'] = [];
  for (const raw of rawParams.trim() ? splitTop(rawParams, ',') : []) {
    const p = /^\s*([A-Za-z_$][\w$]*)\??\s*:\s*(.+?)\s*$/.exec(raw);
    if (!p) return `cannot read the parameter "${raw.trim()}"; expected <name>: <Type>`;
    params.push({ name: p[1] as string, type: parseTypeText(p[2]) });
  }
  return { name, params, returns: parseTypeText(returns), description };
}

/** `12 md:6 lg:4 min-height:420px` */
export function parseSpan(text: string): { span: Span; minHeight?: string } | string {
  const words = text.split(/\s+/).filter(Boolean);
  const columns = (value: string): number | undefined => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
  };
  const [first, ...rest] = words;
  const base = first === undefined ? undefined : columns(first);
  if (base === undefined) return `expected a column count from 1 to 12 first, got "${first ?? ''}"`;
  const span: Span = { base };
  let minHeight: string | undefined;
  for (const word of rest) {
    const [key, value = ''] = word.split(':');
    if (key === 'md' || key === 'lg') {
      const n = columns(value);
      if (n === undefined) return `"${word}": expected ${key}:<1–12>`;
      span[key] = n;
    } else if (key === 'min-height' && /^\d+(\.\d+)?(px|rem|em|vh)$/.test(value)) {
      minHeight = value;
    } else {
      return `cannot read "${word}"; expected md:<n>, lg:<n> or min-height:<length>`;
    }
  }
  return minHeight ? { span, minHeight } : { span };
}

/** Turns an editor tag (or the property's type) into the inspector hint. */
export function editorHint(
  kind: EditorKind,
  options: string[] | undefined,
  enumValues: string[] | undefined,
): EditorHint | string {
  if (kind === 'select') {
    const values = options ?? enumValues;
    if (!values?.length) return 'the select editor needs options or a union of string literals';
    return { kind: 'select', options: values.map((value) => ({ value, label: value })) };
  }
  if (kind === 'code') return { kind: 'code', language: 'tbx' };
  return { kind };
}
