import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ICONS, registerIcons } from '../src/icons.js';
import '../src/define.js';
import { contrastRatio, parseColor, readableTextOn } from '../src/color.js';
import { initialsOf } from '../src/components/avatar.js';
import { cleanup, expectAccessible, fixture, settle } from './helpers/fixture.js';

afterEach(cleanup);

const shadow = (el: Element, selector: string) => el.shadowRoot?.querySelector(selector) ?? null;

describe('tessera-icon', () => {
  it('ships at least 40 icons, each with markup', () => {
    const names = Object.keys(ICONS);
    expect(names.length).toBeGreaterThanOrEqual(40);
    for (const name of names) expect(ICONS[name], name).toMatch(/<(path|circle|rect)/);
  });

  it('is decorative without a label and an image with one', async () => {
    const decorative = await fixture(html`<tessera-icon name="plus"></tessera-icon>`);
    expect(shadow(decorative, 'svg')?.getAttribute('aria-hidden')).toBe('true');
    const labelled = await fixture(html`<tessera-icon name="plus" label="Add"></tessera-icon>`);
    expect(shadow(labelled, 'svg')?.getAttribute('role')).toBe('img');
    expect(shadow(labelled, 'svg')?.getAttribute('aria-label')).toBe('Add');
    await expectAccessible(labelled);
  });

  it('renders registered icons and sizes via the size attribute', async () => {
    registerIcons({ blob: '<circle cx="12" cy="12" r="6"/>' });
    const el = await fixture(html`<tessera-icon name="blob" size="32"></tessera-icon>`);
    expect(shadow(el, 'circle')).not.toBeNull();
    expect(getComputedStyle(el).width).toBe('32px');
  });
});

describe('tessera-spinner', () => {
  it('exposes a status role with a translated label', async () => {
    const el = await fixture(html`<tessera-spinner></tessera-spinner>`);
    const ring = shadow(el, '[role=status]');
    expect(ring?.getAttribute('aria-label')).toBe('Loading');
    await expectAccessible(el);
  });
});

describe('tessera-button', () => {
  it('fires click, supports keyboard activation and has no a11y violations', async () => {
    const onClick = vi.fn();
    const el = await fixture(
      html`<tessera-button variant="primary" @click=${onClick}>Save</tessera-button>`,
    );
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(el.matches(':focus')).toBe(true);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
    await expectAccessible(el);
  });

  it('does not fire click while disabled or loading', async () => {
    const onClick = vi.fn();
    const disabled = await fixture(
      html`<tessera-button disabled @click=${onClick}>No</tessera-button>`,
    );
    const loading = await fixture(
      html`<tessera-button loading @click=${onClick}>Wait</tessera-button>`,
    );
    disabled.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    loading.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(onClick).not.toHaveBeenCalled();
    expect(shadow(loading, 'button')?.getAttribute('aria-busy')).toBe('true');
    expect(shadow(loading, 'tessera-spinner')).not.toBeNull();
    expect((shadow(disabled, 'button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits and resets the surrounding form', async () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    const form = await fixture<HTMLFormElement>(html`
      <form @submit=${onSubmit}>
        <input name="q" value="initial" />
        <tessera-button type="submit" name="intent" value="save">Go</tessera-button>
        <tessera-button type="reset">Reset</tessera-button>
      </form>
    `);
    const input = form.querySelector('input') as HTMLInputElement;
    const [submit, reset] = form.querySelectorAll('tessera-button');
    input.value = 'changed';
    await userEvent.click(submit as Element);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(new FormData(form).get('intent')).toBe('save');
    await userEvent.click(reset as Element);
    expect(input.value).toBe('initial');
  });
});

describe('tessera-icon-button', () => {
  it('uses label as accessible name and tooltip', async () => {
    const el = await fixture(
      html`<tessera-icon-button icon="trash" label="Delete card"></tessera-icon-button>`,
    );
    const button = shadow(el, 'button');
    expect(button?.getAttribute('aria-label')).toBe('Delete card');
    expect(button?.getAttribute('title')).toBe('Delete card');
    await expectAccessible(el);
  });

  it('activates from the keyboard', async () => {
    const onClick = vi.fn();
    const el = await fixture(
      html`<tessera-icon-button icon="plus" label="Add" @click=${onClick}></tessera-icon-button>`,
    );
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
    void el;
  });
});

describe('colour helpers', () => {
  it('parses hex, rgb and hsl', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#0b1220')).toEqual([11, 18, 32]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('hsl(0 100% 50%)')).toEqual([255, 0, 0]);
    expect(parseColor('banana')).toBeNull();
  });

  it('always picks text with at least 4.5:1 contrast', () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const bg = `hsl(${hue} 62% 42%)`;
      const fg = readableTextOn(bg) as string;
      const ratio = contrastRatio(
        parseColor(bg) as [number, number, number],
        parseColor(fg) as [number, number, number],
      );
      expect(ratio, bg).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('tessera-avatar', () => {
  it('derives initials', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('ada')).toBe('A');
    expect(initialsOf('  Grace  Brewster  Hopper ')).toBe('GH');
    expect(initialsOf('')).toBe('');
  });

  it('shows initials, falls back from a broken image, and is accessible', async () => {
    const el = await fixture(
      html`<tessera-avatar name="Ada Lovelace" src="data:image/png;base64,broken"></tessera-avatar>`,
    );
    await vi.waitFor(async () => {
      await settle(el);
      expect(shadow(el, 'img')).toBeNull();
    });
    expect(shadow(el, '.avatar')?.textContent?.trim()).toBe('AL');
    expect(shadow(el, '[role=img]')?.getAttribute('aria-label')).toBe('Ada Lovelace');
    await expectAccessible(el);
  });

  it('meets contrast for many generated colours', async () => {
    const names = [
      'Ada Lovelace',
      'Bob',
      'Cy Young',
      'Dee',
      'Eve Online',
      'Fay',
      'Gus',
      'Hal 9000',
    ];
    const row = await fixture(
      html`<div>${names.map((n) => html`<tessera-avatar name=${n}></tessera-avatar>`)}</div>`,
    );
    await settle(row);
    await expectAccessible(row);
  });
});

describe('tessera-avatar-stack', () => {
  it('collapses overflow into a +N chip and lists all names for assistive tech', async () => {
    const users = ['Ada', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay'].map((name) => ({ name }));
    const el = await fixture(
      html`<tessera-avatar-stack .users=${users} max="3"></tessera-avatar-stack>`,
    );
    expect(el.shadowRoot?.querySelectorAll('tessera-avatar')).toHaveLength(3);
    expect(shadow(el, '.more')?.textContent).toBe('+3 more');
    expect(shadow(el, '[role=group]')?.getAttribute('aria-label')).toBe(
      'Ada, Bob, Cy, Dee, Eve, Fay',
    );
    await expectAccessible(el);
  });
});

describe('tessera-badge', () => {
  it('caps large counts and supports every variant accessibly', async () => {
    const big = await fixture(html`<tessera-badge count="250"></tessera-badge>`);
    expect(big.shadowRoot?.textContent?.trim()).toBe('99+');
    const row = await fixture(html`<div>
      ${(['neutral', 'primary', 'success', 'warning', 'danger'] as const).map((v) => html`<tessera-badge variant=${v}>${v}</tessera-badge>`)}
    </div>`);
    await settle(row);
    await expectAccessible(row);
  });
});

describe('tessera-empty-state', () => {
  it('renders heading, description and slotted action', async () => {
    const el =
      await fixture(html`<tessera-empty-state icon="note" heading="No cards yet" description="Create the first card.">
      <tessera-button>Add card</tessera-button>
    </tessera-empty-state>`);
    expect(shadow(el, 'h3')?.textContent).toBe('No cards yet');
    expect(el.querySelector('tessera-button')).not.toBeNull();
    await expectAccessible(el);
  });
});

describe('dark theme', () => {
  it('keeps primitives accessible under data-tessera-theme="dark"', async () => {
    document.documentElement.setAttribute('data-tessera-theme', 'dark');
    try {
      const row = await fixture(html`<div style="background:var(--tessera-color-bg)">
        <tessera-button variant="primary">Primary</tessera-button>
        <tessera-button variant="danger">Danger</tessera-button>
        <tessera-badge variant="warning">warn</tessera-badge>
        <tessera-avatar name="Ada Lovelace"></tessera-avatar>
      </div>`);
      await settle(row);
      await expectAccessible(row);
    } finally {
      document.documentElement.removeAttribute('data-tessera-theme');
    }
  });
});
