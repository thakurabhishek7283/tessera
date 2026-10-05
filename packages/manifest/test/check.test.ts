import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apiSnapshot, diffApi, formatDiff, generateManifest } from '../src/index.js';

const manifest = await generateManifest({
  packageDir: fileURLToPath(new URL('./fixtures/kit', import.meta.url)),
});

describe('apiSnapshot and diffApi', () => {
  it('ignores size, the CEM document and the package version', () => {
    const snapshot = apiSnapshot(manifest);
    expect(snapshot).not.toHaveProperty('size');
    expect(snapshot).not.toHaveProperty('cem');
    expect(snapshot.package).toEqual({ name: '@fixture/kit' });
    const bumped = apiSnapshot({
      ...manifest,
      package: { ...manifest.package, version: '9.9.9' },
      size: { elementsGzip: 1, pluginGzip: 2 },
    });
    expect(diffApi(snapshot, bumped)).toEqual([]);
  });

  it('describes a renamed property, a changed type and a removed event readably', () => {
    const before = apiSnapshot(manifest);
    const after = structuredClone(before);
    const board = after.elements[0];
    if (!board) throw new Error('no board');
    const prop = board.props.find((p) => p.name === 'readonly');
    if (prop) prop.name = 'locked';
    const density = board.props.find((p) => p.name === 'density');
    if (density) density.type = { kind: 'enum', values: ['compact'] };
    board.events = board.events.filter((e) => e.name !== 'card-move');
    const diffs = diffApi(before, after);
    expect(formatDiff(diffs).split('\n')).toEqual([
      `  ~ <fixture-board> prop "density" type: 'compact' | 'comfortable' → 'compact'`,
      '  - <fixture-board> prop "readonly": boolean (attribute "readonly")',
      '  + <fixture-board> prop "locked": boolean (attribute "readonly")',
      '  - <fixture-board> event "card-move": detail object',
    ]);
  });

  it('reports added and removed elements and CSS parts', () => {
    const before = apiSnapshot(manifest);
    const after = structuredClone(before);
    after.elements = after.elements.slice(0, 1);
    after.elements[0]?.cssParts.push('footer');
    expect(diffApi(before, after)).toEqual([
      { where: '<fixture-board> CSS part "footer"', change: 'added', after: '"footer"' },
      { where: '<fixture-card>', change: 'removed', before: '<fixture-card>' },
    ]);
  });
});
