import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import * as analyzer from '@custom-elements-manifest/analyzer';
import { litPlugin } from '@custom-elements-manifest/analyzer/src/features/framework-plugins/lit/lit.js';
import type { ClassDeclaration, CustomElement } from 'custom-elements-manifest/schema';
import type * as TS from 'typescript';
import {
  type ClassFacts,
  type Collected,
  newCollected,
  tesseraAnalyzerPlugin,
} from './analyzer.js';
import { featureFromPlugin } from './config-schema.js';
import { ManifestError } from './errors.js';
import { validateManifest } from './schema.js';
import { measureSizes } from './size.js';
import { type ElementTags, editorHint, parseTags } from './tags.js';
import { parseDefault, parseTypeText } from './type-text.js';
import type {
  Category,
  CustomElementsManifest,
  EditorHint,
  ElementManifest,
  EventManifest,
  PropManifest,
  TesseraManifest,
  TypeRef,
} from './types.js';

export interface GenerateOptions {
  /** The package directory (where package.json is). */
  packageDir: string;
  /** Measure `size` from the built entries. Off for drift checks, which ignore sizes. */
  measureSize?: boolean;
}

/** `package.json` → `tessera.manifest`: package-level defaults for the generator. */
interface PackageConfig {
  /** Category for elements without `@tessera-category`. */
  category?: Category;
  /** `false` for packages without a plugin (the elements primitives). */
  plugin?: boolean;
  /** Tags to leave out of the manifest (internal helper elements). */
  exclude?: string[];
  docs?: Partial<TesseraManifest['docs']>;
}

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
  tessera?: { manifest?: PackageConfig };
}

// The analyzer's own typings leave out `create` and the TypeScript instance it was built with.
const { create, ts } = analyzer as unknown as {
  create(options: { modules: TS.SourceFile[]; plugins: unknown[]; context: object }): unknown;
  ts: typeof TS;
};

type ElementDeclaration = ClassDeclaration & Partial<CustomElement>;

// Members every Tessera element inherits; they are infrastructure, not part of an element's API.
const BASE_CLASSES = new Set(['TesseraElement', 'LitElement', 'ReactiveElement', 'HTMLElement']);

/** Generates the manifest for the package in `packageDir`. Throws a ManifestError listing every problem. */
export async function generateManifest(options: GenerateOptions): Promise<TesseraManifest> {
  const root = resolve(options.packageDir);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson;
  const config = pkg.tessera?.manifest ?? {};
  const problems: string[] = [];

  const collected = newCollected();
  const cem = analyze(root, collected);
  problems.push(...collected.problems);

  const elements = buildElements(cem, collected, config, problems);
  const exportsMap = pkg.exports ?? {};
  const elementsEntry = exportsMap['./elements']
    ? `${pkg.name}/elements`
    : exportsMap['./define']
      ? `${pkg.name}/define`
      : undefined;
  if (!elementsEntry)
    problems.push(
      'package.json: exports needs "./elements" (or "./define") for the elements entry',
    );

  let feature: TesseraManifest['feature'];
  if (config.plugin !== false) {
    const entry = entryFile(root, exportsMap['.']);
    if (!entry)
      problems.push(
        'package.json: exports "." must point at the built plugin (or set tessera.manifest.plugin to false)',
      );
    else {
      try {
        feature = await featureFromPlugin(entry);
        if (!feature)
          problems.push(
            `${relative(root, entry)}: the default export is not a Tessera plugin (or set tessera.manifest.plugin to false)`,
          );
      } catch (error) {
        problems.push(
          `${relative(root, entry)}: could not load the plugin (${(error as Error).message}); run the build first`,
        );
      }
    }
  }

  if (problems.length > 0) throw new ManifestError(problems);

  const entries: TesseraManifest['entries'] = { elements: elementsEntry as string };
  if (feature) entries.plugin = pkg.name;
  if (exportsMap['./react']) entries.react = `${pkg.name}/react`;
  if (exportsMap['./elements/*']) {
    entries.perElement = Object.fromEntries(
      elements.map((e) => [e.tag, `${pkg.name}/elements/${e.tag}`]),
    );
  }

  const manifest: TesseraManifest = {
    schemaVersion: '1.0',
    package: { name: pkg.name, version: pkg.version },
    ...(feature ? { feature } : {}),
    elements,
    entries,
    size: options.measureSize
      ? await measureSizes(root, {
          elements: entryFile(root, exportsMap['./elements'] ?? exportsMap['./define']),
          plugin: feature ? entryFile(root, exportsMap['.']) : undefined,
        })
      : { elementsGzip: 0, pluginGzip: 0 },
    peers: pkg.peerDependencies ?? {},
    docs: {
      summary: config.docs?.summary ?? pkg.description ?? pkg.name,
      useWhen: config.docs?.useWhen ?? [],
      ...(config.docs?.avoidWhen ? { avoidWhen: config.docs.avoidWhen } : {}),
      examples: config.docs?.examples ?? [],
    },
    cem,
  };
  const invalid = validateManifest(manifest);
  if (invalid.length > 0) throw new ManifestError(invalid.map((p) => `manifest: ${p}`));
  return manifest;
}

/** The built file an `exports` entry points at (its `import` condition). */
function entryFile(root: string, target: unknown): string | undefined {
  const path =
    typeof target === 'string'
      ? target
      : ((target as { import?: string; default?: string } | undefined)?.import ??
        (target as { default?: string } | undefined)?.default);
  return path ? join(root, path) : undefined;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.(d|test)\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function analyze(root: string, collected: Collected): CustomElementsManifest {
  const src = join(root, 'src');
  if (!existsSync(src)) throw new ManifestError([`${src}: no src directory to analyze`]);
  const modules = sourceFiles(src).map((file) =>
    ts.createSourceFile(
      relative(root, file).split(sep).join('/'),
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.ES2022,
      true,
    ),
  );
  return create({
    modules,
    plugins: [...litPlugin(), tesseraAnalyzerPlugin(collected)],
    context: { dev: false },
  }) as CustomElementsManifest;
}

function buildElements(
  cem: CustomElementsManifest,
  collected: Collected,
  config: PackageConfig,
  problems: string[],
): ElementManifest[] {
  const declarations = new Map<string, ElementDeclaration>();
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.kind === 'class') declarations.set(decl.name, decl as ClassDeclaration);
    }
  }
  const byTag = new Map<string, ElementManifest>();
  for (const { tag, className, at } of collected.definitions) {
    if (config.exclude?.includes(tag) || byTag.has(tag)) continue;
    const decl = declarations.get(className);
    const facts = collected.classes.get(className);
    if (!decl || !facts) {
      problems.push(
        `${at}: <${tag}> is defined with ${className}, which is not a class in this package`,
      );
      continue;
    }
    byTag.set(
      tag,
      buildElement(tag, decl, chainOf(facts, collected), collected.aliases, config, problems),
    );
  }
  return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/** The class and its ancestors in this package, base first. */
function chainOf(facts: ClassFacts, collected: Collected): ClassFacts[] {
  const chain: ClassFacts[] = [];
  for (
    let c: ClassFacts | undefined = facts;
    c;
    c = c.superclass ? collected.classes.get(c.superclass) : undefined
  ) {
    if (chain.includes(c)) break;
    chain.unshift(c);
  }
  return chain;
}

function buildElement(
  tag: string,
  decl: ElementDeclaration,
  chain: ClassFacts[],
  aliases: ReadonlyMap<string, string>,
  config: PackageConfig,
  problems: string[],
): ElementManifest {
  const typeOf = (text: string | undefined): TypeRef => parseTypeText(text, aliases);
  const own = chain[chain.length - 1] as ClassFacts;
  const tags: ElementTags = parseTags(inheritedTags(chain), problems);
  const reactive = new Map(chain.flatMap((c) => [...c.reactive]));
  const fail = (message: string): void => {
    problems.push(`${own.at} <${tag}>: ${message}`);
  };

  const props: PropManifest[] = [];
  for (const member of decl.members ?? []) {
    if (member.kind !== 'field' || member.static || (member.privacy && member.privacy !== 'public'))
      continue;
    if (member.inheritedFrom && BASE_CLASSES.has(member.inheritedFrom.name)) continue;
    const r = reactive.get(member.name);
    if (!r || r.state) continue;
    const type = typeOf(member.type?.text);
    const fallback = (member as { attribute?: string }).attribute
      ? defaultEditor(type)
      : propertyOnlyEditor(type);
    const override = tags.editors.get(member.name);
    let editor: EditorHint = fallback;
    if (override) {
      const hint = editorHint(
        override.hint,
        override.options,
        type.kind === 'enum' ? type.values : undefined,
      );
      if (typeof hint === 'string')
        problems.push(`${override.at} @tessera-editor ${member.name}: ${hint}`);
      else editor = hint;
    }
    const group = tags.groups.get(member.name)?.group;
    const value = parseDefault(member.default);
    const attribute = (member as { attribute?: string }).attribute;
    props.push({
      name: member.name,
      ...(attribute ? { attribute } : {}),
      type,
      ...(value !== undefined ? { default: value } : {}),
      required: false,
      description: member.description ?? '',
      editor,
      bindable: editor.kind !== 'hidden',
      ...(group ? { group } : {}),
    });
  }
  const propNames = new Set(props.map((p) => p.name));
  for (const [name, { at }] of tags.editors) {
    if (!propNames.has(name))
      problems.push(`${at} @tessera-editor: <${tag}> has no public property "${name}"`);
  }
  for (const [name, { at }] of tags.groups) {
    if (!propNames.has(name))
      problems.push(`${at} @tessera-group: <${tag}> has no public property "${name}"`);
  }

  const events = new Map<string, EventManifest>();
  for (const event of decl.events ?? []) {
    // `tessera-change` (from TesseraElement) is how exposes are delivered; bindings read exposes.
    if (!event.name || (event.inheritedFrom && BASE_CLASSES.has(event.inheritedFrom.name)))
      continue;
    events.set(event.name, {
      name: event.name,
      detail: detailType(event.type?.text, typeOf),
      description: event.description ?? '',
      bubbles: true,
    });
  }
  for (const name of chain.flatMap((c) => c.emits)) {
    if (!events.has(name))
      events.set(name, { name, detail: { kind: 'unknown' }, description: '', bubbles: true });
  }

  // Exposes: property sources must be reactive and listed in static tesseraExposes, so that the
  // element really fires `tessera-change` for them.
  const declared = new Set(chain.flatMap((c) => c.exposes ?? []));
  for (const expose of tags.exposes) {
    if (!('property' in expose.source)) {
      if (!events.has(expose.source.event))
        fail(`@tessera-expose ${expose.name}: the element fires no "${expose.source.event}" event`);
      continue;
    }
    const property = expose.source.property;
    if (!reactive.has(property))
      fail(`@tessera-expose ${expose.name}: "${property}" is not a reactive property`);
    else if (!declared.has(property))
      fail(
        `@tessera-expose ${expose.name}: add "${property}" to static tesseraExposes so the element fires tessera-change for it`,
      );
  }
  for (const property of declared) {
    if (!tags.exposes.some((e) => 'property' in e.source && e.source.property === property)) {
      fail(
        `static tesseraExposes lists "${property}" without a @tessera-expose tag giving its type`,
      );
    }
  }

  const slots = new Map<string, string>();
  for (const slot of decl.slots ?? []) slots.set(slot.name ?? '', slot.description ?? '');
  for (const slot of chain.flatMap((c) => c.slots)) if (!slots.has(slot)) slots.set(slot, '');
  const parts = new Set([
    ...(decl.cssParts ?? []).map((p) => p.name),
    ...chain.flatMap((c) => c.parts),
  ]);

  const category = tags.category ?? config.category;
  if (!category)
    fail('no category: add @tessera-category or set tessera.manifest.category in package.json');
  if (!tags.icon) fail('no icon: add @tessera-icon <name> (an icon from @tessera-kit/elements)');

  return {
    tag,
    displayName: tags.displayName ?? displayNameOf(tag),
    category: category ?? 'primitive',
    icon: tags.icon ?? 'unknown',
    props,
    events: [...events.values()].sort((a, b) => a.name.localeCompare(b.name)),
    exposes: tags.exposes,
    methods: tags.methods,
    slots: [...slots]
      .map(([name, description]) => ({ name, description }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    cssParts: [...parts].sort(),
    cssProperties: (decl.cssProperties ?? [])
      .map((p) => ({
        name: p.name,
        description: p.description ?? '',
        ...(p.default ? { default: p.default } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    layout: {
      defaultSpan: tags.span ?? { base: 12 },
      ...(tags.minHeight ? { minHeight: tags.minHeight } : {}),
      resizable: true,
      container: tags.container,
    },
    formAssociated: chain.some((c) => c.formAssociated),
  };
}

// Tags that describe the element as a whole: a subclass's tag replaces its base class's.
const SINGLE = new Set([
  'tessera-display',
  'tessera-category',
  'tessera-icon',
  'tessera-span',
  'tessera-container',
]);

/** The tags of a class chain (base first), with subclasses overriding single-valued tags. */
function inheritedTags(chain: ClassFacts[]): ClassFacts['tags'] {
  const out: ClassFacts['tags'] = [];
  chain.forEach((facts, i) => {
    const later = new Set(chain.slice(i + 1).flatMap((c) => c.tags.map((t) => t.name)));
    out.push(...facts.tags.filter((t) => !(SINGLE.has(t.name) && later.has(t.name))));
  });
  return out;
}

/** 'tessera-icon-button' → 'Icon button' */
function displayNameOf(tag: string): string {
  const words = tag.replace(/^tessera-/, '').split('-');
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The inspector control for an attribute-backed property. */
function defaultEditor(type: TypeRef): EditorHint {
  switch (type.kind) {
    case 'boolean':
      return { kind: 'switch' };
    case 'number':
      return { kind: 'number' };
    case 'string':
      return { kind: 'text' };
    case 'enum':
      return { kind: 'select', options: type.values.map((value) => ({ value, label: value })) };
    case 'unknown':
      return { kind: 'text' };
    default:
      return { kind: 'json' };
  }
}

/** The inspector control for a property without an attribute. */
function propertyOnlyEditor(type: TypeRef): EditorHint {
  // Functions, instances and other values without a JSON form can only be set from code.
  if (type.kind === 'unknown' || type.kind === 'ref') return { kind: 'hidden' };
  return defaultEditor(type);
}

/** `CustomEvent<{ id: string }>` → the detail type, when the @fires tag gives one. */
function detailType(text: string | undefined, typeOf: (t: string | undefined) => TypeRef): TypeRef {
  if (!text) return { kind: 'unknown' };
  const m = /^CustomEvent<(.+)>$/.exec(text.trim());
  return typeOf(m ? m[1] : text);
}
