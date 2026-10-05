import { describe, expect, it } from 'vitest';
import { parseExpose, parseMethod, parseSpan, parseTypeText } from '../src/index.js';

describe('tag grammar', () => {
  it('reads exposes with a property or event source', () => {
    expect(parseExpose('unread {number}')).toEqual({
      name: 'unread',
      type: { kind: 'number' },
      source: { property: 'unread' },
      description: '',
    });
    expect(parseExpose('count {number} from property:unread - Unread messages.')).toMatchObject({
      source: { property: 'unread' },
      description: 'Unread messages.',
    });
    expect(parseExpose('picked {Message} from event:message-select detail.message')).toMatchObject({
      type: { kind: 'ref', name: 'Message' },
      source: { event: 'message-select', path: 'detail.message' },
    });
    expect(parseExpose('unread number')).toMatch(/^expected/);
  });

  it('reads method signatures', () => {
    expect(parseMethod('focusComposer(): void')).toEqual({
      name: 'focusComposer',
      params: [],
      returns: { kind: 'unknown' },
      description: '',
    });
    expect(
      parseMethod('open(id: string, opts?: Record<string, unknown>): Promise<void> - Opens it.'),
    ).toEqual({
      name: 'open',
      params: [
        { name: 'id', type: { kind: 'string' } },
        { name: 'opts', type: { kind: 'object', jsonSchema: { type: 'object' } } },
      ],
      returns: { kind: 'unknown' },
      description: 'Opens it.',
    });
    expect(parseMethod('open(id string): void')).toMatch(/^cannot read the parameter "id string"/);
  });

  it('reads spans', () => {
    expect(parseSpan('6')).toEqual({ span: { base: 6 } });
    expect(parseSpan('12 md:6 lg:3 min-height:20rem')).toEqual({
      span: { base: 12, md: 6, lg: 3 },
      minHeight: '20rem',
    });
    expect(parseSpan('0')).toMatch(/^expected a column count/);
    expect(parseSpan('6 xl:2')).toMatch(/^cannot read "xl:2"/);
    expect(parseSpan('6 md:20')).toBe('"md:20": expected md:<1–12>');
  });
});

describe('parseTypeText', () => {
  const aliases = new Map([
    ['Side', "'top' | 'bottom'"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a template literal type, as written
    ['Placement', 'Side | `${Side}-start`'],
    ['Loop', 'Loop | string'],
  ]);

  it.each([
    ['string', { kind: 'string' }],
    ['number | undefined', { kind: 'number' }],
    ["'a' | 'b' | null", { kind: 'enum', values: ['a', 'b'] }],
    ['string[]', { kind: 'array', of: { kind: 'string' } }],
    ['readonly number[]', { kind: 'array', of: { kind: 'number' } }],
    ['Array<Message>', { kind: 'array', of: { kind: 'ref', name: 'Message' } }],
    ['{ id: string }', { kind: 'object', jsonSchema: { type: 'object' } }],
    ['Placement', { kind: 'enum', values: ['top', 'bottom', 'top-start', 'bottom-start'] }],
    ['Loop', { kind: 'ref', name: 'Loop' }],
    ['(item: string) => void', { kind: 'unknown' }],
    ['string | number', { kind: 'unknown' }],
  ])('%s', (text, expected) => {
    expect(parseTypeText(text, aliases)).toEqual(expected);
  });
});
