import { ContextConsumer } from '@lit/context';
import type { ReadonlyStore, TesseraContext, TesseraInstance, Unsubscribe } from '@tessera/core';
import { TesseraError } from '@tessera/core';
import { LitElement, nothing, type PropertyDeclarations, type PropertyValues } from 'lit';
import { tesseraContext } from './context.js';
import { StoreController } from './controllers.js';
import { getDefaultInstance, isDefaultInstance } from './default-instance.js';
import { interpolate, uiMessages } from './messages.js';
import { installTokens } from './theme.js';

const catalogged = new WeakSet<TesseraContext>();

/**
 * Base class for every Tessera element.
 *
 * The Tessera instance is resolved in this order: the `tessera` property, the nearest
 * `<tessera-root>` ancestor, then the implicit default instance (kit elements only). A kit element
 * whose feature is disabled renders nothing and sets `hidden`.
 *
 * Kits implement {@link TesseraElement.renderFeature}; generic primitives (`featureId === null`)
 * may override `render()` directly and never need an instance.
 */
export abstract class TesseraElement extends LitElement {
  static override properties: PropertyDeclarations = {
    tessera: { attribute: false },
  };

  /** Explicit instance; wins over any `<tessera-root>`. */
  tessera?: TesseraInstance;

  /** The feature this element belongs to, or `null` for generic primitives. */
  protected abstract readonly featureId: string | null;

  readonly #consumer = new ContextConsumer(this, {
    context: tesseraContext,
    subscribe: true,
    callback: () => this.#bind(false),
  });
  #bound: TesseraInstance | undefined;
  #offs: Unsubscribe[] = [];
  #observed = new Map<ReadonlyStore<unknown>, Unsubscribe>();
  #seen = new Set<ReadonlyStore<unknown>>();

  /** The resolved context. Throws if no instance can be found (only possible for primitives). */
  protected get ctx(): TesseraContext {
    const bound = this.#bound ?? this.tessera ?? this.#consumer.value ?? getDefaultInstance();
    return bound.ctx;
  }

  /** True when the element may render: primitives always, kit elements when their feature is on. */
  protected get enabled(): boolean {
    if (this.featureId === null) return true;
    return this.#bound?.ctx.isEnabled(this.featureId) ?? false;
  }

  /** Translates `key` through the instance's i18n, falling back to built-in English strings. */
  protected t(key: string, params?: Record<string, unknown>): string {
    const instance = this.#bound ?? this.tessera ?? this.#consumer.value;
    if (instance)
      return instance.ctx.i18n.t(key, params as Record<string, string | number> | undefined);
    return interpolate(uiMessages.en?.[key] ?? key, params);
  }

  /** Dispatches a bubbling, composed CustomEvent. Returns `false` if a listener cancelled it. */
  protected emit<D>(name: string, detail: D, opts: { cancelable?: boolean } = {}): boolean {
    const event = new CustomEvent<D>(name, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: opts.cancelable ?? false,
    });
    return this.dispatchEvent(event);
  }

  /**
   * Returns `store.get()` and re-renders when it changes. Call it from `render()`: the
   * subscription follows whichever stores the latest render used, so it works with stores that
   * only exist once a feature is enabled. Prefer {@link TesseraElement.useStore} for a fixed store.
   */
  protected observe<T>(store: ReadonlyStore<T>): T {
    this.#seen.add(store as ReadonlyStore<unknown>);
    if (!this.#observed.has(store as ReadonlyStore<unknown>)) {
      this.#observed.set(
        store as ReadonlyStore<unknown>,
        store.subscribe(() => this.requestUpdate()),
      );
    }
    return store.get();
  }

  /** Re-renders when `store` changes and gives access to its current value. */
  protected useStore<T>(store: ReadonlyStore<T>): StoreController<T> {
    return new StoreController(this, store);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    installTokens(this.ownerDocument);
    this.#bind(false);
    if (this.featureId !== null) {
      // Give a late-upgrading <tessera-root> a chance to claim this element before falling back.
      queueMicrotask(() => {
        if (this.isConnected) this.#bind(true);
      });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unbind();
    for (const off of this.#observed.values()) off();
    this.#observed.clear();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    this.#seen.clear();
    if (changed.has('tessera')) this.#bind(false);
    if (this.featureId !== null) this.toggleAttribute('hidden', !this.enabled);
  }

  protected override render(): unknown {
    return this.enabled ? this.renderFeature() : nothing;
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);
    // `update` (unlike `updated`) is not normally overridden, so this cannot be skipped by accident.
    // Drop subscriptions to stores the last render no longer read.
    for (const [store, off] of this.#observed) {
      if (this.#seen.has(store)) continue;
      off();
      this.#observed.delete(store);
    }
  }

  /** Kits render their UI here; it is only called when the feature is enabled. */
  protected renderFeature(): unknown {
    return nothing;
  }

  #unbind(): void {
    for (const off of this.#offs.splice(0)) off();
    this.#bound = undefined;
  }

  #bind(allowDefault: boolean): void {
    let next = this.tessera ?? this.#consumer.value;
    if (!next && allowDefault && this.featureId !== null) next = getDefaultInstance();
    if (next === this.#bound) return;
    this.#unbind();
    if (!next) {
      this.requestUpdate();
      return;
    }
    this.#bound = next;
    if (!catalogged.has(next.ctx)) {
      catalogged.add(next.ctx);
      next.ctx.i18n.addCatalog(uiMessages);
    }
    const refresh = (): void => this.requestUpdate();
    this.#offs.push(
      next.on('tessera:feature-changed', refresh),
      next.on('tessera:locale-changed', refresh),
      next.on('tessera:theme-changed', refresh),
    );
    // A bare kit element on the implicit instance turns its own feature on.
    if (this.featureId !== null && isDefaultInstance(next) && !next.ctx.isEnabled(this.featureId)) {
      next.enable(this.featureId).catch((error: unknown) => {
        if (!TesseraError.is(error)) next.ctx.logger.error('could not enable feature', error);
      });
    }
    this.requestUpdate();
  }
}
