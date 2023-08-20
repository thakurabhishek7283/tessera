import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../src/define.js';
import type { TesseraColorSwatches } from '../src/components/color-swatches.js';
import type { TesseraInput } from '../src/components/input.js';
import type { TesseraSelect } from '../src/components/select.js';
import type { TesseraTagInput } from '../src/components/tag-input.js';
import type { TesseraTextarea } from '../src/components/textarea.js';
import { cleanup, expectAccessible, fixture, must } from './helpers/fixture.js';

afterEach(cleanup);

const inner = (el: Element, selector = '.control') =>
  must(el.shadowRoot?.querySelector<HTMLInputElement>(selector), selector);

describe('tessera-input', () => {
  it('labels its control, forwards typing and is accessible', async () => {
    const onInput = vi.fn();
    const el = await fixture<TesseraInput>(
      html`<tessera-input label="Board name" hint="Shown to everyone" @input=${onInput}></tessera-input>`,
    );
    const control = inner(el);
    expect(el.shadowRoot?.querySelector('label')?.getAttribute('for')).toBe(control.id);
    expect(control.getAttribute('aria-describedby')).toContain('hint');
    await userEvent.click(el);
    await userEvent.keyboard('Roadmap');
    expect(el.value).toBe('Roadmap');
    expect(onInput).toHaveBeenCalled();
    await expectAccessible(el);
  });

  it('takes part in forms: submits its value, validates and resets', async () => {
    const form = await fixture<HTMLFormElement>(html`<form>
      <tessera-input name="title" label="Title" required value="Draft"></tessera-input>
    </form>`);
    const el = must(form.querySelector<TesseraInput>('tessera-input'));
    expect(new FormData(form).get('title')).toBe('Draft');
    expect(form.checkValidity()).toBe(true);

    el.value = '';
    await el.updateComplete;
    expect(new FormData(form).get('title')).toBe('');
    expect(form.checkValidity()).toBe(false);
    expect(el.validity.valueMissing).toBe(true);

    el.value = 'Changed';
    await el.updateComplete;
    form.reset();
    await el.updateComplete;
    expect(el.value).toBe('Draft');
  });

  it('shows native validation text only after the user touched it, and custom errors immediately', async () => {
    const el = await fixture<TesseraInput>(
      html`<tessera-input label="Email" type="email" required></tessera-input>`,
    );
    expect(el.shadowRoot?.querySelector('.error')).toBeNull();
    await userEvent.click(el);
    await userEvent.tab();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.error')?.textContent).toBeTruthy();
    expect(inner(el).getAttribute('aria-invalid')).toBe('true');
    expect(el.hasAttribute('invalid')).toBe(true);

    const withError = await fixture<TesseraInput>(
      html`<tessera-input label="Name" error="Name is taken"></tessera-input>`,
    );
    expect(withError.shadowRoot?.querySelector('.error')?.textContent).toBe('Name is taken');
    expect(withError.checkValidity()).toBe(false);
    expect(withError.validationMessage).toBe('Name is taken');
    await expectAccessible(withError);
  });

  it('re-dispatches change on the host and honours disabled', async () => {
    const onChange = vi.fn();
    const el = await fixture<TesseraInput>(
      html`<tessera-input label="Q" @change=${onChange}></tessera-input>`,
    );
    await userEvent.click(el);
    await userEvent.keyboard('abc');
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);

    const disabled = await fixture<TesseraInput>(
      html`<tessera-input label="D" disabled></tessera-input>`,
    );
    expect(inner(disabled).disabled).toBe(true);
  });
});

describe('tessera-textarea', () => {
  it('grows with its content when autoresize is on', async () => {
    const el = await fixture<TesseraTextarea>(
      html`<tessera-textarea label="Notes" autoresize rows="1"></tessera-textarea>`,
    );
    const before = inner(el).getBoundingClientRect().height;
    await userEvent.click(el);
    await userEvent.keyboard('one{Enter}two{Enter}three{Enter}four');
    await el.updateComplete;
    expect(inner(el).getBoundingClientRect().height).toBeGreaterThan(before + 20);
    expect(el.value).toBe('one\ntwo\nthree\nfour');
    await expectAccessible(el);
  });
});

describe('tessera-select', () => {
  const options = [
    { value: 'todo', label: 'To do' },
    { value: 'doing', label: 'Doing' },
    { value: 'done', label: 'Done', disabled: true },
  ];

  it('renders options, a placeholder, and submits the chosen value', async () => {
    const form = await fixture<HTMLFormElement>(html`<form>
      <tessera-select name="column" label="Column" placeholder="Choose…" .options=${options} required></tessera-select>
    </form>`);
    const el = must(form.querySelector<TesseraSelect>('tessera-select'));
    expect(inner(el).querySelectorAll('option')).toHaveLength(4);
    expect(form.checkValidity()).toBe(false);

    inner(el).value = 'doing';
    inner(el).dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    inner(el).dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    expect(el.value).toBe('doing');
    expect(new FormData(form).get('column')).toBe('doing');
    expect(form.checkValidity()).toBe(true);
    await expectAccessible(form);
  });
});

describe('tessera-tag-input', () => {
  const make = (extra = '') =>
    fixture<TesseraTagInput>(
      html`<form><tessera-tag-input name="tags" label="Tags" ${extra}></tessera-tag-input></form>`,
    ).then((f) => must(f.querySelector<TesseraTagInput>('tessera-tag-input')));
  const chips = (el: Element) =>
    [...(el.shadowRoot?.querySelectorAll('li span') ?? [])].map((s) => s.textContent);
  const status = (el: Element) => el.shadowRoot?.querySelector('[role=status]')?.textContent;

  it('adds on Enter and comma, announces it and fires change', async () => {
    const el = await make();
    const onChange = vi.fn();
    el.addEventListener('change', onChange);
    await userEvent.click(inner(el, 'input'));
    await userEvent.keyboard('urgent{Enter}');
    await userEvent.keyboard('bug,');
    await el.updateComplete;
    expect(el.value).toEqual(['urgent', 'bug']);
    expect(chips(el)).toEqual(['urgent', 'bug']);
    expect(status(el)).toBe('Added bug');
    expect(must(onChange.mock.calls.at(-1)?.[0] as CustomEvent | undefined).detail).toEqual({
      value: ['urgent', 'bug'],
    });
    expect(inner(el, 'input').value).toBe('');
    await expectAccessible(el);
  });

  it('rejects duplicates and invalid tags, respects max, and removes with Backspace or the x button', async () => {
    const el = await make();
    el.max = 3;
    el.validate = (tag) => tag.length > 1;
    expect(el.addTags('a, bb, BB, cc, dd')).toEqual(['bb', 'cc', 'dd']);
    await el.updateComplete;
    expect(el.addTags('ee')).toEqual([]);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.problem')?.textContent).toBe('No more than 3 allowed');

    await userEvent.click(inner(el, 'input'));
    await userEvent.keyboard('{Backspace}');
    await el.updateComplete;
    expect(el.value).toEqual(['bb', 'cc']);
    expect(status(el)).toBe('Removed dd');

    must(el.shadowRoot?.querySelector<HTMLElement>('li button[aria-label="Remove bb"]')).click();
    await el.updateComplete;
    expect(el.value).toEqual(['cc']);
  });

  it('splits pasted text and submits one entry per tag', async () => {
    const el = await make();
    const input = inner(el, 'input');
    input.focus();
    const data = new DataTransfer();
    data.setData('text', 'x, y\nz');
    input.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(el.value).toEqual(['x', 'y', 'z']);
    const form = must(el.closest('form'));
    expect(new FormData(form).getAll('tags')).toEqual(['x', 'y', 'z']);
    form.reset();
    await el.updateComplete;
    expect(el.value).toEqual([]);
  });
});

describe('tessera-color-swatches', () => {
  const colors = ['#b91c1c', '#166534', '#1d4ed8', '#f59e0b'];
  const make = () =>
    fixture<TesseraColorSwatches>(
      html`<tessera-color-swatches label="Card colour" .colors=${colors} .names=${{ '#b91c1c': 'Red', '#166534': 'Green', '#1d4ed8': 'Blue', '#f59e0b': 'Amber' }} value="#166534"></tessera-color-swatches>`,
    );
  const radios = (el: Element) => [
    ...(el.shadowRoot?.querySelectorAll<HTMLElement>('[role=radio]') ?? []),
  ];

  it('is a labelled radiogroup with a single tab stop on the selected swatch', async () => {
    const el = await make();
    expect(el.shadowRoot?.querySelector('[role=radiogroup]')?.getAttribute('aria-labelledby')).toBe(
      'lbl',
    );
    expect(radios(el).map((r) => r.getAttribute('aria-label'))).toEqual([
      'Red',
      'Green',
      'Blue',
      'Amber',
    ]);
    expect(radios(el).map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(radios(el).map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
    await expectAccessible(el);
  });

  it('selects by click and by arrow keys with wrap-around', async () => {
    const el = await make();
    const onChange = vi.fn();
    el.addEventListener('change', onChange);
    await userEvent.click(must(radios(el)[0]));
    expect(el.value).toBe('#b91c1c');
    await userEvent.keyboard('{ArrowLeft}');
    await vi.waitFor(() => expect(el.value).toBe('#f59e0b'));
    await userEvent.keyboard('{ArrowRight}');
    await vi.waitFor(() => expect(el.value).toBe('#b91c1c'));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(el.shadowRoot?.activeElement?.getAttribute('aria-label')).toBe('Red');
  });
});
