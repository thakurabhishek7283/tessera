import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import { TesseraElement } from '../src/index.js';
import { cleanup, fixture } from './helpers/fixture.js';
import '../src/define.js';

class ExposingElement extends TesseraElement {
  static override properties = { count: { type: Number }, label: {}, internal: { state: true } };
  static override tesseraExposes: readonly string[] = ['count', 'internal'];
  protected readonly featureId: string | null = null;
  count = 0;
  label = '';
  internal = false;
  protected override render() {
    return html`<span>${this.label}:${this.count}</span>`;
  }
}
customElements.define('test-exposing', ExposingElement);

type Change = { property: string; value: unknown };

async function mount(): Promise<{ el: ExposingElement; changes: Change[]; events: Event[] }> {
  const el = await fixture<ExposingElement>(html`<test-exposing></test-exposing>`);
  const changes: Change[] = [];
  const events: Event[] = [];
  el.addEventListener('tessera-change', (event) => {
    events.push(event);
    changes.push((event as CustomEvent<Change>).detail);
  });
  return { el, changes, events };
}

afterEach(cleanup);

describe('tessera-change', () => {
  it('fires once per change of an exposed property, with its new value', async () => {
    const { el, changes } = await mount();
    el.count = 1;
    await el.updateComplete;
    el.count = 2;
    await el.updateComplete;
    expect(changes).toEqual([
      { property: 'count', value: 1 },
      { property: 'count', value: 2 },
    ]);
  });

  it('does not fire for properties that are not exposed', async () => {
    const { el, changes } = await mount();
    el.label = 'hello';
    await el.updateComplete;
    expect(changes).toEqual([]);
  });

  it('fires once per update, however often the property was set before it', async () => {
    const { el, changes } = await mount();
    el.count = 5;
    el.count = 6;
    el.label = 'x';
    await el.updateComplete;
    expect(changes).toEqual([{ property: 'count', value: 6 }]);
  });

  it('works for internal state that is exposed, and reports each exposed property that changed', async () => {
    const { el, changes } = await mount();
    el.count = 3;
    el.internal = true;
    await el.updateComplete;
    expect(changes).toEqual([
      { property: 'count', value: 3 },
      { property: 'internal', value: true },
    ]);
  });

  it('does not bubble, but crosses shadow roots', async () => {
    const { el, events } = await mount();
    let bubbled = false;
    document.body.addEventListener('tessera-change', () => {
      bubbled = true;
    });
    el.count = 9;
    await el.updateComplete;
    expect(events[0]?.bubbles).toBe(false);
    expect(events[0]?.composed).toBe(true);
    expect(bubbled).toBe(false);
  });

  it('is what form primitives fire as the user types', async () => {
    const input = await fixture<HTMLElement & { value: string; updateComplete: Promise<unknown> }>(
      html`<tessera-input label="Name"></tessera-input>`,
    );
    const values: unknown[] = [];
    input.addEventListener('tessera-change', (e) =>
      values.push((e as CustomEvent<Change>).detail.value),
    );
    const control = input.shadowRoot?.querySelector('input') as HTMLInputElement;
    control.value = 'Ada';
    control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await input.updateComplete;
    expect(values).toEqual(['Ada']);
  });
});
