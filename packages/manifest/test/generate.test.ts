import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  generateManifest,
  ManifestError,
  type TesseraManifest,
  validateManifest,
} from '../src/index.js';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('generateManifest', async () => {
  const manifest: TesseraManifest = await generateManifest({ packageDir: fixture('kit') });
  const board = manifest.elements.find((e) => e.tag === 'fixture-board');
  const card = manifest.elements.find((e) => e.tag === 'fixture-card');

  it('produces a valid manifest with package, entries, peers and docs', () => {
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.package).toEqual({ name: '@fixture/kit', version: '1.2.3' });
    expect(manifest.entries).toEqual({
      plugin: '@fixture/kit',
      elements: '@fixture/kit/elements',
      react: '@fixture/kit/react',
      perElement: {
        'fixture-board': '@fixture/kit/elements/fixture-board',
        'fixture-card': '@fixture/kit/elements/fixture-card',
      },
    });
    expect(manifest.peers).toEqual({ '@tessera-kit/core': '^0.1.0' });
    expect(manifest.docs).toEqual({
      summary: 'A fixture kit for the generator tests.',
      useWhen: ['testing the generator'],
      examples: [],
    });
    expect(manifest.cem.schemaVersion).toBe('1.0.0');
  });

  it('finds tags defined with defineElement and customElements.define, minus excluded ones', () => {
    expect(manifest.elements.map((e) => e.tag)).toEqual(['fixture-board', 'fixture-card']);
  });

  it('reads the element tags', () => {
    expect(board).toMatchObject({
      displayName: 'Board',
      category: 'workspace',
      icon: 'columns',
      layout: {
        defaultSpan: { base: 12, md: 6, lg: 4 },
        minHeight: '420px',
        resizable: true,
        container: true,
      },
      formAssociated: true,
    });
    expect(board?.methods).toEqual([
      {
        name: 'scrollTo',
        params: [
          { name: 'id', type: { kind: 'string' } },
          { name: 'smooth', type: { kind: 'boolean' } },
        ],
        returns: { kind: 'unknown' },
        description: 'Scrolls a card into view.',
      },
      { name: 'count', params: [], returns: { kind: 'number' }, description: '' },
    ]);
    expect(board?.exposes).toEqual([
      {
        name: 'selected',
        type: { kind: 'string' },
        source: { property: 'selected' },
        description: 'The selected card id.',
      },
      {
        name: 'lastMoved',
        type: { kind: 'ref', name: 'Card' },
        source: { event: 'card-move', path: 'detail.card' },
        description: 'The card that moved last.',
      },
    ]);
  });

  it('lists reactive public properties with attributes, types, defaults and editors', () => {
    const props = Object.fromEntries((board?.props ?? []).map((p) => [p.name, p]));
    expect(Object.keys(props)).toEqual([
      'boardId',
      'density',
      'edge',
      'columns',
      'readonly',
      'limit',
      'notes',
      'tone',
      'selected',
      'filter',
    ]);
    expect(props.boardId).toEqual({
      name: 'boardId',
      attribute: 'board-id',
      type: { kind: 'string' },
      default: '',
      required: false,
      description: 'The board to show.',
      editor: { kind: 'text' },
      bindable: true,
    });
    expect(props.density).toMatchObject({
      attribute: 'density',
      type: { kind: 'enum', values: ['compact', 'comfortable'] },
      default: 'comfortable',
      group: 'appearance',
      editor: {
        kind: 'select',
        options: [
          { value: 'compact', label: 'compact' },
          { value: 'comfortable', label: 'comfortable' },
        ],
      },
    });
    expect(props.edge?.type).toEqual({
      kind: 'enum',
      values: ['top', 'bottom', 'top-start', 'bottom-start'],
    });
    expect(props.columns).toMatchObject({
      type: { kind: 'array', of: { kind: 'string' } },
      editor: { kind: 'json' },
      default: [],
    });
    expect(props.columns).not.toHaveProperty('attribute');
    expect(props.readonly).toMatchObject({
      type: { kind: 'boolean' },
      editor: { kind: 'switch' },
      default: false,
    });
    expect(props.limit).toMatchObject({
      type: { kind: 'number' },
      editor: { kind: 'number' },
      default: 10,
    });
    expect(props.notes?.editor).toEqual({ kind: 'textarea' });
    expect(props.tone?.editor).toEqual({
      kind: 'select',
      options: [
        { value: 'calm', label: 'calm' },
        { value: 'loud', label: 'loud' },
      ],
    });
    // A function can only be set from code.
    expect(props.filter).toMatchObject({ editor: { kind: 'hidden' }, bindable: false });
  });

  it('collects events from @fires and this.emit(), slots and parts from JSDoc and templates', () => {
    expect(board?.events).toEqual([
      { name: 'board-change', detail: { kind: 'unknown' }, description: '', bubbles: true },
      {
        name: 'card-move',
        detail: { kind: 'object', jsonSchema: { type: 'object' } },
        description: 'after a card moved',
        bubbles: true,
      },
    ]);
    expect(board?.slots).toEqual([
      { name: '', description: '' },
      { name: 'toolbar', description: 'extra controls' },
    ]);
    expect(board?.cssParts).toEqual(['column', 'columns', 'header', 'title']);
    expect(board?.cssProperties).toEqual([
      { name: '--fixture-board-gap', description: 'space between columns' },
    ]);
  });

  it('inherits properties and tags, and lets a subclass override single-valued tags', () => {
    expect(card?.icon).toBe('note');
    expect(card?.displayName).toBe('Board');
    expect(card?.props.map((p) => p.name)).toContain('title');
    expect(card?.props.map((p) => p.name)).toContain('boardId');
    expect(card?.methods.map((m) => m.name)).toEqual(['scrollTo', 'count']);
  });

  it('turns the plugin config schema (zod/mini) into JSON Schema with descriptions', () => {
    expect(manifest.feature?.id).toBe('fixture');
    expect(manifest.feature?.requires).toEqual(['storage']);
    expect(manifest.feature?.optional).toEqual(['presence']);
    const schema = manifest.feature?.configSchema as {
      properties: Record<string, { description?: string; default?: unknown }>;
      required?: string[];
    };
    expect(schema.properties.columns).toMatchObject({
      description: 'Column names, left to right.',
      default: ['todo', 'done'],
    });
    expect(schema.properties.limit).toMatchObject({
      description: 'Most cards per column.',
      minimum: 1,
    });
    expect(schema.required).toEqual(['enabled']);
  });

  it('leaves size at zero unless asked to measure', () => {
    expect(manifest.size).toEqual({ elementsGzip: 0, pluginGzip: 0 });
  });
});

describe('generateManifest errors', () => {
  it('reports every malformed tag with its location, then fails', async () => {
    const error = await generateManifest({ packageDir: fixture('bad') }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ManifestError);
    const problems = (error as ManifestError).problems;
    const at = (line: number): string => `src/bad.ts:${line}`;
    expect(problems).toEqual(
      expect.arrayContaining([
        `${at(6)} @tessera-category: expected one of realtime, workspace, visual, data, layout, primitive, got "gadgets"`,
        `${at(7)} @tessera-icon: expected an icon name like "message", got "Not An Icon"`,
        `${at(8)} @tessera-span: expected a column count from 1 to 12 first, got "13"`,
        `${at(9)} @tessera-span: may appear only once per element`,
        expect.stringMatching(
          /^src\/bad\.ts:10 @tessera-expose: expected `@tessera-expose <name> \{Type\}/,
        ),
        `${at(12)} @tessera-expose: cannot read the source "somewhere"; expected property:<name> or event:<event> <path>`,
        expect.stringMatching(
          /^src\/bad\.ts:13 @tessera-method: expected `@tessera-method <name>\(/,
        ),
        `${at(15)} @tessera-editor: unknown editor "dial"; expected one of text, textarea, number, switch, color, icon, json, select, code, hidden`,
        `${at(17)} @tessera-group: unknown group "looks"; expected one of data, behaviour, appearance, a11y`,
        `${at(18)} @tessera-container: takes no arguments`,
        expect.stringMatching(
          /^src\/bad\.ts:19 @tessera-colour: unknown tag; the Tessera tags are @tessera-display/,
        ),
        `${at(14)} @tessera-editor: <bad-element> has no public property "missing"`,
        `${at(16)} @tessera-editor label: the select editor needs options or a union of string literals`,
        'src/bad.ts:21 <bad-element>: @tessera-expose count: add "count" to static tesseraExposes so the element fires tessera-change for it',
        'src/bad.ts:21 <bad-element>: static tesseraExposes lists "label" without a @tessera-expose tag giving its type',
        'src/bad.ts:21 <bad-element>: no category: add @tessera-category or set tessera.manifest.category in package.json',
        expect.stringMatching(
          /^src\/bad\.ts:\d+: <bad-ghost> is defined with NotAClass, which is not a class in this package$/,
        ),
      ]),
    );
    expect((error as Error).message).toMatch(/^The manifest could not be generated:\n {2}- /);
  });
});
