import {
  createTessera,
  type PluginLoader,
  TesseraError,
  type TesseraInstance,
  type ThemeMode,
} from '@tessera/core';
import { baseStyles, toastErrors } from '@tessera/elements';
import { createStorage, createUploads } from '@tessera/storage';
import { createTransport } from '@tessera/transport';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';

const plugins: Record<string, PluginLoader> = { hello: () => import('./hello/plugin.js') };

const DEFAULT_CONFIG = JSON.stringify(
  {
    appId: 'playground',
    locale: 'en',
    theme: { mode: 'auto' },
    features: { hello: { enabled: true, label: 'Shared counter', step: 1 } },
  },
  null,
  2,
);

interface LogEntry {
  at: string;
  type: string;
  payload: string;
}

const describe = (payload: unknown): string => {
  if (payload === undefined) return '';
  if (payload instanceof Error) return payload.message;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

/** The playground: edit a config, apply it, toggle the example feature and watch the bus. */
export class PlaygroundApp extends LitElement {
  static override properties: PropertyDeclarations = {
    configText: { state: true },
    error: { state: true },
    instance: { state: true },
    log: { state: true },
    transportState: { state: true },
    helloOn: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      tessera-root {
        min-height: 100vh;
        background: var(--tessera-color-bg);
      }
      header,
      main {
        max-width: 72rem;
        margin: 0 auto;
        padding: var(--tessera-space-4);
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: var(--tessera-space-4);
        border-bottom: 1px solid var(--tessera-color-border);
      }
      h1 {
        margin: 0;
        font-size: var(--tessera-font-size-xl);
        margin-inline-end: auto;
      }
      h1 small {
        display: block;
        font-size: var(--tessera-font-size-sm);
        font-weight: 400;
        color: var(--tessera-color-text-muted);
      }
      main {
        display: grid;
        gap: var(--tessera-space-6);
        grid-template-columns: minmax(0, 1fr);
      }
      @media (min-width: 52rem) {
        main {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
      }
      section {
        display: grid;
        gap: var(--tessera-space-3);
        align-content: start;
      }
      h2 {
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      tessera-textarea::part(control) {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--tessera-font-size-sm);
        min-height: 16rem;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      ol {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 16rem;
        overflow: auto;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--tessera-font-size-xs);
      }
      li {
        display: grid;
        grid-template-columns: auto auto 1fr;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-1) var(--tessera-space-2);
        border-bottom: 1px solid var(--tessera-color-surface-2);
      }
      li b {
        color: var(--tessera-color-primary);
      }
      li span:last-child {
        overflow-wrap: anywhere;
        color: var(--tessera-color-text-muted);
      }
      .hint {
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
        margin: 0;
      }
    `,
  ];

  configText = DEFAULT_CONFIG;
  error = '';
  instance: TesseraInstance | undefined;
  log: LogEntry[] = [];
  transportState = 'idle';
  helloOn = false;

  #offs: Array<() => void> = [];

  override connectedCallback(): void {
    super.connectedCallback();
    this.apply();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#teardown();
  }

  #teardown(): void {
    for (const off of this.#offs.splice(0)) off();
    void this.instance?.destroy();
  }

  /** Re-creates the instance from the JSON in the editor. */
  apply(): void {
    this.#teardown();
    this.error = '';
    this.log = [];
    try {
      const parsed: unknown = JSON.parse(this.configText);
      const instance = createTessera(
        {
          transport: { type: 'local' },
          storage: { type: 'indexeddb' },
          ...(parsed as object),
        } as never,
        {
          plugins,
          adapters: { transport: createTransport, storage: createStorage, uploads: createUploads },
        },
      );
      this.instance = instance;
      this.#offs.push(
        toastErrors(instance),
        instance.ctx.bus.onAny((type, payload) => {
          const entry = {
            at: new Date().toLocaleTimeString(),
            type: String(type),
            payload: describe(payload),
          };
          this.log = [entry, ...this.log].slice(0, 60);
        }),
        instance.on('tessera:feature-changed', () => this.#syncFeature()),
        instance.on('transport:state', (state) => (this.transportState = state)),
      );
      void instance.ready.then(() => this.#syncFeature());
    } catch (error) {
      this.instance = undefined;
      this.error =
        error instanceof SyntaxError
          ? `Not valid JSON: ${error.message}`
          : TesseraError.from(error).message;
    }
  }

  #syncFeature(): void {
    this.helloOn = this.instance?.featureStatus('hello') === 'enabled';
  }

  async #toggleHello(): Promise<void> {
    const instance = this.instance;
    if (!instance) return;
    try {
      if (this.helloOn) await instance.disable('hello');
      else await instance.enable('hello');
    } catch {
      // The failure is already on the bus and shown as a toast.
    }
  }

  protected override render(): unknown {
    const instance = this.instance;
    return html`<tessera-root .tessera=${instance}>
      <header>
        <h1>Tessera playground<small>Open this page in two tabs and click the counter.</small></h1>
        <tessera-select
          label="Theme"
          .value=${instance?.getTheme().mode ?? 'auto'}
          .options=${[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          @change=${(e: Event) => instance?.setTheme((e.target as HTMLInputElement).value as ThemeMode)}
        ></tessera-select>
        <tessera-select
          label="Language"
          .value=${instance?.ctx.i18n.locale.slice(0, 2) ?? 'en'}
          .options=${[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }]}
          @change=${(e: Event) => instance?.setLocale((e.target as HTMLInputElement).value)}
        ></tessera-select>
      </header>
      <main>
        <section aria-labelledby="config-title">
          <h2 id="config-title">Configuration</h2>
          <tessera-textarea
            label="Config (JSON)"
            .value=${this.configText}
            .error=${this.error}
            rows="14"
            @input=${(e: Event) => (this.configText = (e.target as HTMLTextAreaElement).value)}
          ></tessera-textarea>
          <div class="toolbar">
            <tessera-button variant="primary" @click=${() => this.apply()}>Apply</tessera-button>
            <tessera-button @click=${() => ((this.configText = DEFAULT_CONFIG), this.apply())}>Reset</tessera-button>
          </div>
          <p class="hint">
            Applying creates a fresh instance. Features that are not enabled never load their code.
          </p>
        </section>
        <section aria-labelledby="live-title">
          <h2 id="live-title">Live instance</h2>
          <div class="toolbar">
            <tessera-button @click=${() => void this.#toggleHello()} ?disabled=${!instance}>
              ${this.helloOn ? 'Disable' : 'Enable'} “hello”
            </tessera-button>
            <tessera-badge variant=${this.transportState === 'open' ? 'success' : 'neutral'}>
              transport: ${this.transportState}
            </tessera-badge>
          </div>
          ${instance ? html`<tessera-hello></tessera-hello>` : nothing}
          <h2>Event bus</h2>
          <ol aria-label="Bus events" tabindex="0">
            ${this.log.map((e) => html`<li><span>${e.at}</span><b>${e.type}</b><span>${e.payload}</span></li>`)}
          </ol>
        </section>
      </main>
    </tessera-root>`;
  }
}

customElements.define('playground-app', PlaygroundApp);
