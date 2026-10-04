import type { TesseraContext, TesseraInstance } from '@tessera-kit/core';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { TesseraElement } from '../base.js';
import { baseStyles, focusRing } from '../styles.js';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  kind?: ToastKind;
  message: string;
  /** Optional single action, e.g. "Undo". */
  action?: { label: string; onAction: () => void };
  /** Milliseconds until it disappears. `0` keeps it until dismissed. Default 5000 (errors 8000). */
  timeoutMs?: number;
}

export interface ToastHandle {
  readonly id: number;
  dismiss(): void;
}

interface ToastItem extends Required<Pick<ToastOptions, 'kind' | 'message' | 'timeoutMs'>> {
  id: number;
  action?: ToastOptions['action'];
  dismissLabel: string;
}

const ICON: Record<ToastKind, string> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'alert',
};
const MAX_VISIBLE = 5;
let nextId = 0;

/**
 * Stack of transient notifications. Errors use `role="alert"`, everything else `role="status"`,
 * so screen readers announce them. Timers pause while the pointer or keyboard focus is inside.
 */
export class TesseraToastRegion extends TesseraElement {
  static override properties: PropertyDeclarations = { toasts: { state: true } };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        position: fixed;
        inset-block-end: var(--tessera-space-4);
        inset-inline-end: var(--tessera-space-4);
        z-index: var(--tessera-z-toast);
        display: flex;
        flex-direction: column;
        gap: var(--tessera-space-2);
        width: min(24rem, calc(100vw - 2rem));
        pointer-events: none;
      }
      .toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-3) var(--tessera-space-4);
        border: 1px solid var(--tessera-color-border);
        border-inline-start: 4px solid var(--_accent);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-surface);
        color: var(--tessera-color-text);
        box-shadow: var(--tessera-shadow-md);
        animation: in var(--tessera-motion-duration) ease-out;
      }
      .toast.info {
        --_accent: var(--tessera-color-primary);
      }
      .toast.success {
        --_accent: var(--tessera-color-success);
      }
      .toast.warning {
        --_accent: var(--tessera-color-warning);
      }
      .toast.error {
        --_accent: var(--tessera-color-danger);
      }
      tessera-icon.kind {
        color: var(--_accent);
      }
      .message {
        flex: 1;
        overflow-wrap: anywhere;
      }
      @keyframes in {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  toasts: ToastItem[] = [];

  readonly #timers = new Map<
    number,
    { handle: ReturnType<typeof setTimeout> | undefined; remaining: number; startedAt: number }
  >();

  /** Shows a toast and returns a handle to dismiss it early. */
  show(item: ToastItem): ToastHandle {
    this.toasts = [...this.toasts, item].slice(-MAX_VISIBLE);
    this.#arm(item.id, item.timeoutMs);
    return { id: item.id, dismiss: () => this.dismiss(item.id) };
  }

  dismiss(id: number): void {
    this.#disarm(id);
    this.#timers.delete(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const id of [...this.#timers.keys()]) this.#disarm(id);
  }

  #arm(id: number, ms: number): void {
    if (ms <= 0) return;
    const handle = setTimeout(() => this.dismiss(id), ms);
    this.#timers.set(id, { handle, remaining: ms, startedAt: Date.now() });
  }

  #disarm(id: number): void {
    const timer = this.#timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
  }

  #pause = (): void => {
    for (const [id, timer] of this.#timers) {
      if (!timer.handle) continue;
      clearTimeout(timer.handle);
      timer.handle = undefined;
      timer.remaining -= Date.now() - timer.startedAt;
      this.#timers.set(id, timer);
    }
  };

  #resume = (): void => {
    for (const [id, timer] of this.#timers) {
      if (timer.handle) continue;
      this.#arm(id, Math.max(timer.remaining, 1000));
    }
  };

  protected override render(): unknown {
    return html`<div
      role="region"
      aria-label=${this.t('ui.notifications')}
      style="display:contents"
      @pointerenter=${this.#pause}
      @pointerleave=${this.#resume}
      @focusin=${this.#pause}
      @focusout=${this.#resume}
    >
      ${this.toasts.map(
        (
          toast,
        ) => html`<div class="toast ${toast.kind}" role=${toast.kind === 'error' ? 'alert' : 'status'} part="toast">
          <tessera-icon class="kind" name=${ICON[toast.kind]}></tessera-icon>
          <span class="message">${toast.message}</span>
          ${
            toast.action
              ? html`<tessera-button
                size="sm"
                variant="ghost"
                @click=${() => {
                  toast.action?.onAction();
                  this.dismiss(toast.id);
                }}
                >${toast.action.label}</tessera-button
              >`
              : nothing
          }
          <tessera-icon-button icon="x" size="sm" label=${toast.dismissLabel} @click=${() => this.dismiss(toast.id)}></tessera-icon-button>
        </div>`,
      )}
    </div>`;
  }
}

function region(doc: Document): TesseraToastRegion {
  const existing = doc.querySelector('tessera-toast-region');
  if (existing) return existing as TesseraToastRegion;
  const created = doc.createElement('tessera-toast-region') as TesseraToastRegion;
  doc.body.append(created);
  return created;
}

/**
 * Shows a toast. `ctx` supplies translated labels; pass `null` to use built-in English.
 *
 * @example toast(ctx, { kind: 'success', message: 'Card moved', action: { label: 'Undo', onAction: undo } })
 */
export function toast(
  ctx: Pick<TesseraContext, 'i18n'> | null,
  options: ToastOptions,
): ToastHandle {
  const kind = options.kind ?? 'info';
  return region(document).show({
    id: ++nextId,
    kind,
    message: options.message,
    timeoutMs: options.timeoutMs ?? (kind === 'error' ? 8000 : 5000),
    dismissLabel: ctx?.i18n.t('ui.dismiss') ?? 'Dismiss',
    ...(options.action ? { action: options.action } : {}),
  });
}

/** Shows every `tessera:error` on the instance as an error toast. Returns the unsubscribe function. */
export function toastErrors(instance: TesseraInstance): () => void {
  return instance.on('tessera:error', (error) => {
    toast(instance.ctx, { kind: 'error', message: error.message });
  });
}
