import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/bus.js';
import { batch, createStore } from '../src/store.js';

describe('createStore', () => {
  it('notifies subscribers with value and prev, ignoring identical sets', () => {
    const s = createStore(1);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(1);
    s.set(2);
    s.set((v) => v + 1);
    expect(fn.mock.calls).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  it('stops notifying after unsubscribe', () => {
    const s = createStore(0);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    off();
    s.set(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('batch coalesces notifications and reports the original prev', () => {
    const s = createStore(0);
    const fn = vi.fn();
    s.subscribe(fn);
    batch(() => {
      s.set(1);
      s.set(2);
      batch(() => s.set(3));
      expect(fn).not.toHaveBeenCalled();
    });
    expect(fn.mock.calls).toEqual([[3, 0]]);
  });

  it('batch does not notify when the value returns to its original', () => {
    const s = createStore(0);
    const fn = vi.fn();
    s.subscribe(fn);
    batch(() => {
      s.set(1);
      s.set(0);
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('select derives a store that only fires on changes of the selected value', () => {
    const s = createStore({ a: 1, b: 1 });
    const a = s.select((v) => v.a);
    const fn = vi.fn();
    a.subscribe(fn);
    s.set({ a: 1, b: 2 });
    expect(fn).not.toHaveBeenCalled();
    s.set({ a: 2, b: 2 });
    expect(fn).toHaveBeenCalledWith(2, 1);
    expect(a.get()).toBe(2);
  });

  it('select supports custom equality and chaining', () => {
    const s = createStore({ items: [1, 2] });
    const len = s
      .select(
        (v) => v.items,
        (x, y) => x.length === y.length,
      )
      .select((i) => i.length);
    const fn = vi.fn();
    len.subscribe(fn);
    s.set({ items: [3, 4] });
    expect(fn).not.toHaveBeenCalled();
    s.set({ items: [3, 4, 5] });
    expect(fn).toHaveBeenCalledWith(3, 2);
  });
});

describe('createEventBus', () => {
  interface Events {
    ping: { n: number };
    ready: void;
  }

  it('delivers typed payloads and supports once', () => {
    const bus = createEventBus<Events>();
    const on = vi.fn();
    const once = vi.fn();
    bus.on('ping', on);
    bus.once('ping', once);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(on).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledTimes(1);
  });

  it('isolates listener errors and logs them', () => {
    const error = vi.fn();
    const bus = createEventBus<Events>({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
      child: () => {
        throw new Error('unused');
      },
    });
    const good = vi.fn();
    bus.on('ready', () => {
      throw new Error('bad');
    });
    bus.on('ready', good);
    bus.emit('ready');
    expect(good).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('allows unsubscribing during dispatch and supports onAny', () => {
    const bus = createEventBus<Events>();
    const any = vi.fn();
    bus.onAny(any);
    const off = bus.on('ping', () => off());
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(any).toHaveBeenCalledTimes(2);
  });
});
