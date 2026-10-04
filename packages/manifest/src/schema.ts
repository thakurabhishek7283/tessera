// The manifest schema. Build-time code, so classic zod is fine here (ADR 5).
import { z } from 'zod';
import type { TesseraManifest, TypeRef } from './types.js';

const jsonSchema = z.record(z.string(), z.unknown());

export const TypeRefSchema: z.ZodType<TypeRef> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['string', 'number', 'boolean', 'unknown']) }).strict(),
    z.object({ kind: z.literal('enum'), values: z.array(z.string()).min(1) }).strict(),
    z.object({ kind: z.literal('array'), of: TypeRefSchema }).strict(),
    z.object({ kind: z.literal('object'), jsonSchema }).strict(),
    z.object({ kind: z.literal('ref'), name: z.string().min(1) }).strict(),
  ]),
);

const EditorHintSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.enum(['text', 'textarea', 'number', 'switch', 'color', 'icon', 'json']) })
    .strict(),
  z
    .object({
      kind: z.literal('select'),
      options: z.array(z.object({ value: z.string(), label: z.string() }).strict()).min(1),
    })
    .strict(),
  z.object({ kind: z.literal('code'), language: z.literal('tbx') }).strict(),
  z.object({ kind: z.literal('hidden') }).strict(),
]);

const kebab = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'expected kebab-case');
const tagName = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/, 'expected a custom element tag');
const span = z.number().int().min(1).max(12);

const PropSchema = z
  .object({
    name: z.string().min(1),
    attribute: z.string().min(1).optional(),
    type: TypeRefSchema,
    default: z.unknown().optional(),
    required: z.boolean(),
    description: z.string(),
    editor: EditorHintSchema,
    bindable: z.boolean(),
    group: z.enum(['data', 'behaviour', 'appearance', 'a11y']).optional(),
  })
  .strict();

const ElementSchema = z
  .object({
    tag: tagName,
    displayName: z.string().min(1),
    category: z.enum(['realtime', 'workspace', 'visual', 'data', 'layout', 'primitive']),
    icon: kebab,
    props: z.array(PropSchema),
    events: z.array(
      z
        .object({
          name: z.string().min(1),
          detail: TypeRefSchema,
          description: z.string(),
          bubbles: z.boolean(),
        })
        .strict(),
    ),
    exposes: z.array(
      z
        .object({
          name: z.string().min(1),
          type: TypeRefSchema,
          source: z.union([
            z.object({ property: z.string().min(1) }).strict(),
            z.object({ event: z.string().min(1), path: z.string().min(1) }).strict(),
          ]),
          description: z.string(),
        })
        .strict(),
    ),
    methods: z.array(
      z
        .object({
          name: z.string().min(1),
          params: z.array(z.object({ name: z.string().min(1), type: TypeRefSchema }).strict()),
          returns: TypeRefSchema,
          description: z.string(),
        })
        .strict(),
    ),
    slots: z.array(
      z
        .object({
          name: z.string(),
          description: z.string(),
          accepts: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    cssParts: z.array(z.string().min(1)),
    cssProperties: z.array(
      z
        .object({
          name: z.string().startsWith('--'),
          description: z.string(),
          default: z.string().optional(),
        })
        .strict(),
    ),
    layout: z
      .object({
        defaultSpan: z.object({ base: span, md: span.optional(), lg: span.optional() }).strict(),
        minHeight: z.string().optional(),
        resizable: z.boolean(),
        container: z.boolean(),
      })
      .strict(),
    formAssociated: z.boolean(),
  })
  .strict();

const manifestSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    package: z.object({ name: z.string().min(1), version: z.string().min(1) }).strict(),
    feature: z
      .object({
        id: z.string().min(1),
        configSchema: jsonSchema,
        requires: z.array(z.string()),
        optional: z.array(z.string()),
      })
      .strict()
      .optional(),
    elements: z.array(ElementSchema),
    entries: z
      .object({
        plugin: z.string().min(1).optional(),
        elements: z.string().min(1),
        react: z.string().min(1).optional(),
        perElement: z.record(tagName, z.string().min(1)).optional(),
      })
      .strict(),
    size: z
      .object({
        elementsGzip: z.number().int().nonnegative(),
        pluginGzip: z.number().int().nonnegative(),
        lazyGzip: z.number().int().nonnegative().optional(),
      })
      .strict(),
    peers: z.record(z.string(), z.string()),
    docs: z
      .object({
        summary: z.string().min(1),
        useWhen: z.array(z.string()),
        avoidWhen: z.array(z.string()).optional(),
        examples: z.array(
          z
            .object({
              title: z.string().min(1),
              code: z.string().min(1),
              language: z.enum(['html', 'json']).optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    cem: z.object({ schemaVersion: z.string(), modules: z.array(z.unknown()) }).loose(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const tags = new Set<string>();
    manifest.elements.forEach((element, i) => {
      if (tags.has(element.tag)) {
        ctx.addIssue({ code: 'custom', path: ['elements', i, 'tag'], message: 'duplicate tag' });
      }
      tags.add(element.tag);
    });
    for (const tag of Object.keys(manifest.entries.perElement ?? {})) {
      if (!tags.has(tag)) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', 'perElement', tag],
          message: 'no element with this tag',
        });
      }
    }
  });

/** The `TesseraManifest` schema. */
export const TesseraManifestSchema: z.ZodType = manifestSchema;

/** Problems with a manifest, one `path: message` line each; empty when it is valid. */
export function validateManifest(value: unknown): string[] {
  const result = TesseraManifestSchema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
}

/** The manifest format as JSON Schema, for editors and other languages. */
export function manifestJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(TesseraManifestSchema, { io: 'input', unrepresentable: 'any' });
}

// Keeps the schema and the hand-written types in step: this stops compiling if a field of
// TesseraManifest has no matching field in the schema.
const fitsSchema = (
  manifest: Omit<TesseraManifest, 'cem'>,
): Omit<z.input<typeof manifestSchema>, 'cem'> => manifest;
void fitsSchema;
