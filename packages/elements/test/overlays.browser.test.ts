import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../src/define.js';
import type { MenuItem, TesseraMenu } from '../src/components/menu.js';
import type { TesseraPopover } from '../src/components/popover.js';
import { cleanup, expectAccessible, fixture, must, settle } from './helpers/fixture.js';

afterEach(cleanup);

const panel = (p: Element) => p.shadowRoot?.querySelector('.panel') as HTMLElement;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('tessera-popover', () => {
  it('opens below its anchor and flips above when there is no room', async () => {
    const host = await fixture<HTMLDivElement>(html`<div style="padding:20px">
      <button id="a" style="margin-top:8px">anchor</button>
      <tessera-popover anchor="#a" placement="bottom-start"><div style="width:120px;height:60px">content</div></tessera-popover>
    </div>`);
    const popover = host.querySelector('tessera-popover') as TesseraPopover;
    const anchor = host.querySelector('#a') as HTMLElement;
    popover.open = true;
    await popover.updateComplete;
    const below = panel(popover).getBoundingClientRect();
    expect(below.top).toBeGreaterThan(anchor.getBoundingClientRect().bottom);
    expect(panel(popover).dataset.placement).toBe('bottom-start');
    popover.open = false;
    await popover.updateComplete;

    host.style.position = 'fixed';
    host.style.top = `${window.innerHeight - 60}px`;
    popover.open = true;
    await popover.updateComplete;
    expect(panel(popover).dataset.placement).toBe('top-start');
    expect(panel(popover).getBoundingClientRect().bottom).toBeLessThanOrEqual(
      anchor.getBoundingClientRect().top,
    );
  });

  it('closes on Escape and on outside clicks, but not on clicks inside', async () => {
    const host = await fixture<HTMLDivElement>(html`<div>
      <button id="a">anchor</button>
      <tessera-popover anchor="#a"><button id="inside">inside</button></tessera-popover>
      <button id="outside">outside</button>
    </div>`);
    const popover = host.querySelector('tessera-popover') as TesseraPopover;
    const onClose = vi.fn();
    popover.addEventListener('popover-close', onClose);

    popover.open = true;
    await popover.updateComplete;
    await userEvent.click(host.querySelector('#inside') as Element);
    expect(popover.open).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(popover.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    popover.open = true;
    await popover.updateComplete;
    await userEvent.click(host.querySelector('#outside') as Element);
    expect(popover.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('follows the anchor when the page scrolls', async () => {
    const host = await fixture<HTMLDivElement>(html`<div style="height:2000px;padding-top:100px">
      <button id="a">anchor</button>
      <tessera-popover anchor="#a"><span>content</span></tessera-popover>
    </div>`);
    const popover = host.querySelector('tessera-popover') as TesseraPopover;
    popover.open = true;
    await popover.updateComplete;
    const before = panel(popover).getBoundingClientRect().top;
    window.scrollTo(0, 60);
    await vi.waitFor(() =>
      expect(panel(popover).getBoundingClientRect().top).toBeCloseTo(before - 60, 0),
    );
    window.scrollTo(0, 0);
  });
});

describe('tessera-tooltip', () => {
  it('describes the trigger for assistive tech and appears after the delay on focus', async () => {
    // Padding keeps the anchor away from the viewport top so the tooltip does not flip below it.
    const page = await fixture(
      html`<div style="padding-top:120px"><tessera-tooltip text="Delete this card" delay="30"><button>Delete</button></tessera-tooltip></div>`,
    );
    const el = page.querySelector('tessera-tooltip') as HTMLElement;
    const button = el.querySelector('button') as HTMLButtonElement;
    await settle(el);
    const describedBy = button.getAttribute('aria-describedby') ?? '';
    expect(el.querySelector(`#${describedBy}`)?.textContent).toBe('Delete this card');

    const tip = el.shadowRoot?.querySelector('.tip') as HTMLElement;
    expect(tip.matches(':popover-open')).toBe(false);
    await userEvent.tab();
    expect(tip.matches(':popover-open')).toBe(false);
    await vi.waitFor(() => expect(tip.matches(':popover-open')).toBe(true));
    expect(tip.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      button.getBoundingClientRect().top,
    );

    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(tip.matches(':popover-open')).toBe(false));
    await expectAccessible(el);
  });

  it('hides when focus leaves, never shows without text and cleans up on removal', async () => {
    const el = await fixture(
      html`<div><tessera-tooltip delay="10"><button>x</button></tessera-tooltip><button id="other">other</button></div>`,
    );
    const tooltip = el.querySelector('tessera-tooltip') as HTMLElement;
    await userEvent.tab();
    await sleep(60);
    expect(
      must(tooltip.shadowRoot?.querySelector<HTMLElement>('.tip')).matches(':popover-open'),
    ).toBe(false);

    (tooltip as unknown as { text: string }).text = 'Hello';
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    await vi.waitFor(() =>
      expect(
        must(tooltip.shadowRoot?.querySelector<HTMLElement>('.tip')).matches(':popover-open'),
      ).toBe(true),
    );
    await userEvent.tab();
    await vi.waitFor(() =>
      expect(
        must(tooltip.shadowRoot?.querySelector<HTMLElement>('.tip')).matches(':popover-open'),
      ).toBe(false),
    );
    tooltip.remove();
    expect(tooltip.querySelector('span')).toBeNull();
  });
});

describe('tessera-menu', () => {
  const items: MenuItem[] = [
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'copy', label: 'Copy link', icon: 'link' },
    { id: 'archive', label: 'Archive', disabled: true },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];

  const open = async () => {
    const onSelect = vi.fn();
    const el = (await fixture(html`<tessera-menu .items=${items} @menu-select=${onSelect}>
      <tessera-button slot="trigger">Actions</tessera-button>
    </tessera-menu>`)) as TesseraMenu;
    return { el, onSelect, trigger: el.querySelector('tessera-button') as HTMLElement };
  };
  const focusedLabel = (el: TesseraMenu) =>
    (el.shadowRoot?.activeElement as HTMLElement | null)?.textContent?.trim();
  const menuItems = (el: TesseraMenu) =>
    [...(el.shadowRoot?.querySelectorAll('[role=menuitem]') ?? [])] as HTMLElement[];

  it('opens from the trigger and exposes the ARIA menu pattern', async () => {
    const { el, trigger } = await open();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(trigger);
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Rename'));
    expect(el.shadowRoot?.querySelector('[role=menu]')?.getAttribute('aria-label')).toBe('Actions');
    expect(menuItems(el).map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    await expectAccessible(el);
  });

  it('navigates with arrows (skipping disabled, wrapping), Home and End', async () => {
    const { el, trigger } = await open();
    await userEvent.click(trigger);
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Rename'));
    await userEvent.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Copy link'));
    await userEvent.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Delete'));
    await userEvent.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Rename'));
    await userEvent.keyboard('{ArrowUp}');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Delete'));
    await userEvent.keyboard('{Home}');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Rename'));
    await userEvent.keyboard('{End}');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Delete'));
  });

  it('supports typeahead', async () => {
    const { el, trigger } = await open();
    await userEvent.click(trigger);
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Rename'));
    await userEvent.keyboard('d');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Delete'));
    await sleep(600);
    await userEvent.keyboard('c');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Copy link'));
  });

  it('selects with Enter, closes and returns focus to the trigger', async () => {
    const { el, onSelect, trigger } = await open();
    await userEvent.click(trigger);
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Rename'));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(must(onSelect.mock.calls[0]?.[0] as CustomEvent | undefined).detail).toEqual({
      id: 'copy',
    });
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(el.querySelector('tessera-button'));
  });

  it('ignores disabled items, closes on Escape and opens upward with ArrowUp', async () => {
    const { el, onSelect, trigger } = await open();
    await userEvent.click(trigger);
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Rename'));
    (menuItems(el)[2] as HTMLElement).click();
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
    expect(el.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{ArrowUp}');
    await vi.waitFor(() => expect(focusedLabel(el)).toBe('Delete'));
  });
});

describe('tessera-dialog', () => {
  const make = () =>
    fixture<HTMLElement>(html`<div>
      <button id="opener">open</button>
      <tessera-dialog heading="Rename board">
        <input aria-label="Board name" value="Roadmap" />
        <tessera-button slot="footer" variant="primary">Save</tessera-button>
      </tessera-dialog>
    </div>`);
  const dlg = (host: Element) =>
    host.querySelector('tessera-dialog') as HTMLElement & {
      open: boolean;
      updateComplete: Promise<unknown>;
    };
  const native = (d: Element) => d.shadowRoot?.querySelector('dialog') as HTMLDialogElement;

  it('opens modally, labels itself by the heading and has no a11y violations', async () => {
    const host = await make();
    const d = dlg(host);
    expect(native(d).open).toBe(false);
    d.open = true;
    await d.updateComplete;
    expect(native(d).open).toBe(true);
    expect(native(d).matches(':modal')).toBe(true);
    const labelId = native(d).getAttribute('aria-labelledby') ?? '';
    expect(d.shadowRoot?.getElementById(labelId)?.textContent).toBe('Rename board');
    await expectAccessible(host);
  });

  it('closes on Escape, emits dialog-close and restores focus', async () => {
    const host = await make();
    const d = dlg(host);
    const opener = host.querySelector('#opener') as HTMLButtonElement;
    const onClose = vi.fn();
    d.addEventListener('dialog-close', onClose);
    opener.focus();
    d.open = true;
    await d.updateComplete;
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(d.open).toBe(false));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(opener);
  });

  it('lets listeners veto dismissal and ignores it when not dismissible', async () => {
    const host = await make();
    const d = dlg(host);
    d.addEventListener('dialog-cancel', (e) => e.preventDefault());
    d.open = true;
    await d.updateComplete;
    await userEvent.keyboard('{Escape}');
    await sleep(50);
    expect(d.open).toBe(true);

    const locked = await fixture<HTMLElement>(
      html`<tessera-dialog heading="Locked" .dismissible=${false}>x</tessera-dialog>`,
    );
    (locked as unknown as { open: boolean }).open = true;
    await (locked as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    await userEvent.keyboard('{Escape}');
    await sleep(50);
    expect((locked as unknown as { open: boolean }).open).toBe(true);
    expect(locked.shadowRoot?.querySelector('tessera-icon-button')).toBeNull();
  });

  it('closes from the close button and from a backdrop click', async () => {
    const host = await make();
    const d = dlg(host);
    d.open = true;
    await d.updateComplete;
    must(d.shadowRoot?.querySelector<HTMLElement>('tessera-icon-button')).click();
    await vi.waitFor(() => expect(d.open).toBe(false));

    d.open = true;
    await d.updateComplete;
    native(d).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(d.open).toBe(false));
  });

  it('keeps keyboard focus inside while open', async () => {
    const host = await make();
    const d = dlg(host);
    d.open = true;
    await d.updateComplete;
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      const active = document.activeElement;
      expect(active === d || d.contains(active) || active === document.body).toBe(true);
      expect(active?.id).not.toBe('opener');
    }
  });
});
