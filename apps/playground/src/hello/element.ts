import { baseStyles, TesseraElement } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html } from 'lit';
import type { HelloApi } from './plugin.js';

/**
 * `<tessera-hello>`: the visible half of the feature. It never imports the plugin; it finds the
 * API through the service registry, so it works with any instance that has `hello` enabled.
 */
export class TesseraHelloElement extends TesseraElement {
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      .card {
        display: grid;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-5);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        background: var(--tessera-color-surface);
      }
      h2 {
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      output {
        font-size: 3rem;
        font-weight: 700;
        line-height: 1;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      .viewers {
        margin-inline-start: auto;
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
      }
    `,
  ];

  protected readonly featureId: string | null = 'hello';

  protected override renderFeature(): unknown {
    const api = this.ctx.services.get('hello') as HelloApi | undefined;
    if (!api) return html``;
    const config = this.ctx.featureConfig<{ label: string; step: number }>('hello');
    const count = this.observe(api.count);
    const viewers = this.observe(api.viewers);
    return html`<section class="card" part="card" aria-labelledby="title">
      <h2 id="title">${config?.label ?? 'Hello'}</h2>
      <output aria-live="polite" part="count">${count}</output>
      <div class="row">
        <tessera-button variant="primary" @click=${() => void api.increment()}>
          <tessera-icon name="plus"></tessera-icon>${this.t('hello.add', { step: config?.step ?? 1 })}
        </tessera-button>
        <tessera-button @click=${() => void api.reset()}>${this.t('hello.reset')}</tessera-button>
        <span class="viewers">${this.t('hello.viewers', { count: viewers })}</span>
      </div>
    </section>`;
  }
}
