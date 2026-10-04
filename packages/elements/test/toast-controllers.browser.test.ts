import { createTessera } from '@tessera-kit/core';
import { html, LitElement } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../src/define.js';
import { toast, toastErrors } from '../src/components/toast.js';
import {
  AutoScrollController,
  KeyboardShortcutsController,
  parseShortcut,
  ResizeController,
} from '../src/controllers.js';
import { cleanup, expectAccessible, fixture, must, settle } from './helpers/fixture.js';

afterEach(() => {
  cleanup();
  document.querySelector('tessera-toast-region')?.remove();
  vi.useRealTimers();
});

const regionEl = () => must(document.querySelector('tessera-toast-region'));
const toastNodes = () => [...(regionEl().shadowRoot?.querySelectorAll('.toast') ?? [])];

describe('toast', () => {
  it('creates one region lazily and uses status/alert roles by kind', async () => {
    toast(null, { message: 'Saved', kind: 'success' });
    toast(null, { message: 'Could not save', kind: 'error' });
    expect(document.querySelectorAll('tessera-toast-region')).toHaveLength(1);
    await settle(regionEl());
    expect(toastNodes().map((n) => n.getAttribute('role'))).toEqual(['status', 'alert']);
    expect(regionEl().shadowRoot?.querySelector('[role=region]')?.getAttribute('aria-label')).toBe(
      'Notifications',
    );
    await expectAccessible(regionEl());
  });

  it('dismisses via handle, close button and timeout; action runs and dismisses', async () => {
    const a = toast(null, { message: 'one', timeoutMs: 0 });
    await settle(regionEl());
    expect(toastNodes()).toHaveLength(1);
    a.dismiss();
    await settle(regionEl());
    expect(toastNodes()).toHaveLength(0);

    toast(null, { message: 'two', timeoutMs: 0 });
    await settle(regionEl());
    must(regionEl().shadowRoot?.querySelector<HTMLElement>('tessera-icon-button')).click();
    await settle(regionEl());
    expect(toastNodes()).toHaveLength(0);

    const onAction = vi.fn();
    toast(null, { message: 'three', timeoutMs: 0, action: { label: 'Undo', onAction } });
    await settle(regionEl());
    must(regionEl().shadowRoot?.querySelector<HTMLElement>('tessera-button')).click();
    expect(onAction).toHaveBeenCalledTimes(1);
    await settle(regionEl());
    expect(toastNodes()).toHaveLength(0);

    toast(null, { message: 'four', timeoutMs: 80 });
    await settle(regionEl());
    expect(toastNodes()).toHaveLength(1);
    await vi.waitFor(() => expect(toastNodes()).toHaveLength(0));
  });

  it('keeps at most five toasts and pauses timers while hovered', async () => {
    for (let i = 0; i < 7; i++) toast(null, { message: `m${i}`, timeoutMs: 0 });
    await settle(regionEl());
    expect(toastNodes().map((n) => n.textContent?.trim().replace(/\s+/g, ' '))).toHaveLength(5);

    document.querySelector('tessera-toast-region')?.remove();
    toast(null, { message: 'hover me', timeoutMs: 1100 });
    await settle(regionEl());
    const region = must(regionEl().shadowRoot?.querySelector('[role=region]'));
    region.dispatchEvent(new PointerEvent('pointerenter'));
    await new Promise((r) => setTimeout(r, 1300));
    expect(toastNodes()).toHaveLength(1);
    region.dispatchEvent(new PointerEvent('pointerleave'));
    await vi.waitFor(() => expect(toastNodes()).toHaveLength(0), { timeout: 3000 });
  });

  it('translates the dismiss label and shows instance errors via toastErrors', async () => {
    const instance = createTessera(
      {
        appId: 't',
        features: { ghost: { enabled: true } },
        messages: { en: { 'ui.dismiss': 'Schließen' } },
      },
      { plugins: {} },
    );
    const stop = toastErrors(instance);
    await instance.ready;
    await settle(regionEl());
    expect(toastNodes()).toHaveLength(1);
    expect(toastNodes()[0]?.textContent).toContain('ghost');
    expect(
      must(regionEl().shadowRoot?.querySelector('tessera-icon-button')).getAttribute('label'),
    ).toBe('Schließen');
    stop();
  });
});

describe('controllers', () => {
  it('parseShortcut handles modifiers, named keys and Space', () => {
    const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
    const mod = { ctrlKey: true, metaKey: false };
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const modInit = isMac ? { metaKey: true } : mod;
    expect(parseShortcut('mod+z')(ev({ key: 'z', ...modInit }))).toBe(true);
    expect(parseShortcut('mod+z')(ev({ key: 'z' }))).toBe(false);
    expect(parseShortcut('mod+shift+z')(ev({ key: 'Z', shiftKey: true, ...modInit }))).toBe(true);
    expect(parseShortcut('mod+shift+z')(ev({ key: 'z', ...modInit }))).toBe(false);
    expect(parseShortcut('escape')(ev({ key: 'Escape' }))).toBe(true);
    expect(parseShortcut('space')(ev({ key: ' ' }))).toBe(true);
    expect(parseShortcut('alt+arrowup')(ev({ key: 'ArrowUp', altKey: true }))).toBe(true);
    expect(parseShortcut('?')(ev({ key: '?', shiftKey: true }))).toBe(true);
  });

  it('KeyboardShortcutsController fires scoped shortcuts but not while typing', async () => {
    const undo = vi.fn();
    const remove = vi.fn();
    class Shortcut extends LitElement {
      shortcuts = new KeyboardShortcutsController(this, { 'mod+z': undo, delete: remove });
      render() {
        return html`<input aria-label="field" /><button>btn</button>`;
      }
    }
    customElements.define('test-shortcuts', Shortcut);
    const el = await fixture(html`<test-shortcuts></test-shortcuts>`);
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const button = must(el.shadowRoot?.querySelector('button'));
    button.focus();
    await userEvent.keyboard(isMac ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}');
    expect(undo).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Delete}');
    expect(remove).toHaveBeenCalledTimes(1);

    must(el.shadowRoot?.querySelector('input')).focus();
    await userEvent.keyboard('{Delete}');
    expect(remove).toHaveBeenCalledTimes(1);

    el.remove();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('ResizeController reports size changes', async () => {
    class Sized extends LitElement {
      size = new ResizeController(this);
      render() {
        return html`${Math.round(this.size.width)}`;
      }
    }
    customElements.define('test-sized', Sized);
    const el = await fixture<Sized>(
      html`<test-sized style="display:block;width:120px"></test-sized>`,
    );
    await vi.waitFor(() => expect(el.size.width).toBe(120));
    el.style.width = '200px';
    await vi.waitFor(() => expect(el.size.width).toBe(200));
    await vi.waitFor(() => expect(el.shadowRoot?.textContent).toBe('200'));
  });

  it('AutoScrollController scrolls near the edges and stops cleanly', async () => {
    class Host extends LitElement {
      scroller = new AutoScrollController(this, { edge: 40, maxSpeed: 20 });
      render() {
        return html``;
      }
    }
    customElements.define('test-autoscroll', Host);
    const host = await fixture<Host>(html`<test-autoscroll></test-autoscroll>`);
    const box = document.createElement('div');
    box.style.cssText = 'width:200px;height:200px;overflow:auto;position:fixed;top:0;left:0';
    box.innerHTML = '<div style="height:2000px;width:2000px"></div>';
    document.body.append(box);
    const rect = box.getBoundingClientRect();

    host.scroller.start(box);
    host.scroller.move(rect.left + 100, rect.bottom - 2);
    await vi.waitFor(() => expect(box.scrollTop).toBeGreaterThan(30));
    host.scroller.move(rect.left + 100, rect.top + 100);
    const parked = box.scrollTop;
    await new Promise((r) => setTimeout(r, 100));
    expect(box.scrollTop).toBe(parked);
    host.scroller.move(rect.right - 2, rect.top + 100);
    await vi.waitFor(() => expect(box.scrollLeft).toBeGreaterThan(30));
    host.scroller.stop();
    const stopped = box.scrollLeft;
    await new Promise((r) => setTimeout(r, 100));
    expect(box.scrollLeft).toBe(stopped);
    box.remove();
  });
});
