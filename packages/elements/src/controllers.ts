import type { ReadonlyStore, Unsubscribe } from '@tessera-kit/core';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

/** Re-renders the host whenever `store` changes. */
export class StoreController<T> implements ReactiveController {
  #off: Unsubscribe | undefined;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly store: ReadonlyStore<T>,
  ) {
    host.addController(this);
  }

  get value(): T {
    return this.store.get();
  }

  hostConnected(): void {
    this.#off = this.store.subscribe(() => this.host.requestUpdate());
    // The value may have changed while the host was disconnected.
    this.host.requestUpdate();
  }

  hostDisconnected(): void {
    this.#off?.();
    this.#off = undefined;
  }
}

/** Tracks the content box of the host (or another element) with a ResizeObserver. */
export class ResizeController implements ReactiveController {
  width = 0;
  height = 0;
  #observer: ResizeObserver | undefined;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly target: () => Element | null = () => host,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    const el = this.target();
    if (!el) return;
    this.#observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === this.width && height === this.height) return;
      this.width = width;
      this.height = height;
      this.host.requestUpdate();
    });
    this.#observer.observe(el);
  }

  hostDisconnected(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
  }
}

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

export interface ShortcutOptions {
  /** Where to listen. Defaults to the host element. */
  target?: () => EventTarget;
  /** Fire even while the user is typing in an input, textarea or contenteditable. */
  allowInInputs?: boolean;
}

const isMac = (): boolean => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !('tagName' in el)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** Parses `'mod+shift+z'` into a predicate on KeyboardEvent. `mod` is Cmd on macOS, Ctrl elsewhere. */
export function parseShortcut(combo: string): (event: KeyboardEvent) => boolean {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim());
  const key = parts.pop() ?? '';
  const want = {
    mod: parts.includes('mod'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    ctrl: parts.includes('ctrl'),
  };
  return (event) => {
    const mod = isMac() ? event.metaKey : event.ctrlKey;
    if (want.mod !== mod) return false;
    if (want.ctrl && !event.ctrlKey) return false;
    if (want.alt !== event.altKey) return false;
    // Shift is only compared when the combo mentions it, so '?' and '+' stay matchable.
    if (want.shift && !event.shiftKey) return false;
    const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    return pressed === key || (key === 'space' && event.key === ' ');
  };
}

/** Keyboard shortcuts scoped to the host element. */
export class KeyboardShortcutsController implements ReactiveController {
  #listener: ((event: Event) => void) | undefined;
  #target: EventTarget | undefined;
  #entries: Array<[(event: KeyboardEvent) => boolean, (event: KeyboardEvent) => void]> = [];

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    shortcuts: ShortcutMap,
    private readonly options: ShortcutOptions = {},
  ) {
    this.setShortcuts(shortcuts);
    host.addController(this);
  }

  setShortcuts(shortcuts: ShortcutMap): void {
    this.#entries = Object.entries(shortcuts).map(([combo, fn]) => [parseShortcut(combo), fn]);
  }

  hostConnected(): void {
    this.#target = this.options.target?.() ?? this.host;
    this.#listener = (event) => {
      const e = event as KeyboardEvent;
      if (!this.options.allowInInputs && isEditable(e.composedPath()[0] ?? e.target)) return;
      for (const [matches, fn] of this.#entries) {
        if (matches(e)) {
          fn(e);
          return;
        }
      }
    };
    this.#target.addEventListener('keydown', this.#listener);
  }

  hostDisconnected(): void {
    if (this.#listener) this.#target?.removeEventListener('keydown', this.#listener);
    this.#listener = undefined;
  }
}

/** Scrolls a container while a drag pointer hovers near its edges. */
export class AutoScrollController implements ReactiveController {
  #container: HTMLElement | null = null;
  #frame = 0;
  #pointer = { x: 0, y: 0 };

  constructor(
    host: ReactiveControllerHost,
    private readonly options: { edge?: number; maxSpeed?: number } = {},
  ) {
    host.addController(this);
  }

  /** Begin following a drag inside `container`. */
  start(container: HTMLElement): void {
    this.#container = container;
    if (!this.#frame) this.#frame = requestAnimationFrame(this.#tick);
  }

  /** Feed the latest pointer position (client coordinates). */
  move(x: number, y: number): void {
    this.#pointer = { x, y };
  }

  stop(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#container = null;
  }

  hostDisconnected(): void {
    this.stop();
  }

  #tick = (): void => {
    const el = this.#container;
    if (!el) return;
    const edge = this.options.edge ?? 48;
    const max = this.options.maxSpeed ?? 18;
    const rect = el.getBoundingClientRect();
    const speed = (distanceIntoEdge: number): number =>
      Math.round(max * Math.min(1, distanceIntoEdge / edge));
    const { x, y } = this.#pointer;
    if (y < rect.top + edge) el.scrollTop -= speed(rect.top + edge - y);
    else if (y > rect.bottom - edge) el.scrollTop += speed(y - (rect.bottom - edge));
    if (x < rect.left + edge) el.scrollLeft -= speed(rect.left + edge - x);
    else if (x > rect.right - edge) el.scrollLeft += speed(x - (rect.right - edge));
    this.#frame = requestAnimationFrame(this.#tick);
  };
}
