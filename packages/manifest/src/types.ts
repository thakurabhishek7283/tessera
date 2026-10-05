// The manifest format from LLD 01 (tessera-studio-plan/01-design/lld/01-kit-manifest.md).
// Deviations, all for packages that ship elements but no plugin (the elements primitives):
// `feature` and `entries.plugin` are optional.
import type { Package as CustomElementsManifest } from 'custom-elements-manifest/schema';

export type { CustomElementsManifest };

/** A JSON Schema document (draft 2020-12), as produced by `z.toJSONSchema`. */
export type JSONSchema = { [key: string]: unknown };

export interface TesseraManifest {
  schemaVersion: '1.0';
  package: { name: string; version: string };
  /** Feature id passed to createTessera features, e.g. 'chat'. Absent when the package has no plugin. */
  feature?: {
    id: string;
    /** JSON Schema generated from the plugin's zod configSchema (z.toJSONSchema). */
    configSchema: JSONSchema;
    requires: Array<'transport' | 'storage' | 'uploads' | string>;
    optional: string[];
  };
  elements: ElementManifest[];
  /** Import specifiers the compiler emits. */
  entries: {
    /** '@tessera-kit/chat'. Absent when the package has no plugin. */
    plugin?: string;
    /** '@tessera-kit/chat/elements' */
    elements: string;
    /** '@tessera-kit/chat/react' */
    react?: string;
    /** tag → chunk entry for precise imports (after session 0.3) */
    perElement?: Record<string, string>;
  };
  size: { elementsGzip: number; pluginGzip: number; lazyGzip?: number };
  peers: Record<string, string>;
  /** Tool-facing guidance: when to use it, gotchas, examples. Kept short; read by the agent. */
  docs: { summary: string; useWhen: string[]; avoidWhen?: string[]; examples: ManifestExample[] };
  /** The full CEM document, for standard tooling. */
  cem: CustomElementsManifest;
}

export interface ManifestExample {
  title: string;
  /** HTML, or a Studio spec fragment when `language` is 'json'. */
  code: string;
  language?: 'html' | 'json';
}

export type Category = 'realtime' | 'workspace' | 'visual' | 'data' | 'layout' | 'primitive';

export interface ElementManifest {
  /** 'tessera-chat' */
  tag: string;
  /** 'Chat' */
  displayName: string;
  category: Category;
  /** Name from the elements icon set. */
  icon: string;
  props: PropManifest[];
  events: EventManifest[];
  /** Readable from bindings as nodes.<name>.<expose>. */
  exposes: ExposeManifest[];
  /** Callable through the callMethod action. */
  methods: MethodManifest[];
  slots: SlotManifest[];
  cssParts: string[];
  cssProperties: Array<{ name: string; description: string; default?: string }>;
  layout: { defaultSpan: Span; minHeight?: string; resizable: boolean; container: boolean };
  formAssociated: boolean;
}

export interface PropManifest {
  /** JS property name: 'conversationId' */
  name: string;
  /** 'conversation-id' (absent for property-only) */
  attribute?: string;
  /** Used for binding type checks. */
  type: TypeRef;
  default?: unknown;
  required: boolean;
  description: string;
  /** Drives the inspector control. */
  editor: EditorHint;
  /** May take a { $bind } value. */
  bindable: boolean;
  group?: PropGroup;
}

export type PropGroup = 'data' | 'behaviour' | 'appearance' | 'a11y';

export type TypeRef =
  | { kind: 'string' | 'number' | 'boolean' | 'unknown' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'array'; of: TypeRef }
  | { kind: 'object'; jsonSchema: JSONSchema }
  /** A named type, e.g. 'Message'. */
  | { kind: 'ref'; name: string };

export type EditorHint =
  | { kind: 'text' | 'textarea' | 'number' | 'switch' | 'color' | 'icon' | 'json' }
  | { kind: 'select'; options: Array<{ value: string; label: string }> }
  | { kind: 'code'; language: 'tbx' }
  | { kind: 'hidden' };

export interface EventManifest {
  name: string;
  detail: TypeRef;
  description: string;
  bubbles: boolean;
}

export interface ExposeManifest {
  name: string;
  type: TypeRef;
  source: { property: string } | { event: string; path: string };
  description: string;
}

export interface MethodManifest {
  name: string;
  params: Array<{ name: string; type: TypeRef }>;
  returns: TypeRef;
  description: string;
}

export interface SlotManifest {
  /** '' for the default slot. */
  name: string;
  description: string;
  accepts?: string[];
}

/** Of 12 columns. */
export interface Span {
  base: number;
  md?: number;
  lg?: number;
}
