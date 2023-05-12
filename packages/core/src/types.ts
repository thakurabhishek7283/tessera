import type {
  AuthProvider,
  ReconnectPolicy,
  StorageAdapter,
  Transport,
  TransportState,
  UploadAdapter,
} from './adapters.js';
import type { EventBus } from './bus.js';
import type { Clock } from './clock.js';
import type { TesseraError } from './errors.js';
import type { I18n } from './i18n.js';
import type { UserInfo } from './identity.js';
import type { IdGenerator } from './ids.js';
import type { Logger } from './logger.js';
import type { FeatureApiMap, ServiceRegistry } from './services.js';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface FeatureConfigBase {
  enabled: boolean;
}

export type AuthConfig =
  | { type: 'static'; user: UserInfo; token?: string }
  | { type: 'guest'; name?: string }
  | { type: 'custom'; provider: AuthProvider };

export type TransportConfig =
  | { type: 'none' }
  | { type: 'local'; channel?: string }
  | { type: 'websocket'; url: string; reconnect?: Partial<ReconnectPolicy> }
  | { type: 'custom'; create: (ctx: TesseraContext) => Transport };

export type StorageConfig =
  | { type: 'memory' }
  | { type: 'local' }
  | { type: 'indexeddb'; dbName?: string }
  | { type: 'rest'; baseUrl: string }
  | { type: 'custom'; adapter: StorageAdapter };

export type UploadConfig =
  | { type: 'dataurl'; maxBytes?: number }
  | { type: 'rest'; baseUrl: string; maxBytes?: number }
  | { type: 'custom'; adapter: UploadAdapter };

export interface TesseraConfig {
  /** Namespace for storage and rooms: `/^[a-z0-9-]{1,40}$/`. */
  appId: string;
  auth?: AuthConfig;
  transport?: TransportConfig;
  storage?: StorageConfig;
  uploads?: UploadConfig;
  /** `tokens` maps CSS custom properties, e.g. `'--tessera-color-primary'` → value. */
  theme?: { mode?: ThemeMode; tokens?: Record<string, string> };
  /** Defaults to `navigator.language`, then `'en'`. */
  locale?: string;
  /** locale → key → template. Wins over every plugin catalog. */
  messages?: Record<string, Record<string, string>>;
  features: Record<string, FeatureConfigBase & Record<string, unknown>>;
  debug?: boolean;
}

/** Events on the in-process bus. Kits add their own through declaration merging. */
export interface TesseraEvents {
  'tessera:ready': void;
  'tessera:error': TesseraError;
  'tessera:feature-changed': { id: string; enabled: boolean };
  'tessera:theme-changed': { mode: ThemeMode; resolved: 'light' | 'dark' };
  'tessera:locale-changed': { locale: string };
  'auth:user-changed': UserInfo | null;
  'transport:state': TransportState;
}

/** Everything a plugin may use. Created once per instance (scoped copy per plugin). */
export interface TesseraContext {
  readonly appId: string;
  readonly config: Readonly<TesseraConfig>;
  readonly bus: EventBus<TesseraEvents>;
  readonly services: ServiceRegistry;
  readonly auth: AuthProvider;
  readonly logger: Logger;
  readonly i18n: I18n;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Lazily created and connected on first call. `null` when the transport is `none`. */
  transport(): Transport | null;
  storage(): StorageAdapter;
  uploads(): UploadAdapter;
  isEnabled(featureId: string): boolean;
  featureConfig<T>(featureId: string): T | undefined;
}

export type FeatureStatus = 'enabled' | 'disabled' | 'failed';

export interface AdapterFactories {
  transport(cfg: TransportConfig, ctx: TesseraContext): Transport | null;
  storage(cfg: StorageConfig, ctx: TesseraContext): StorageAdapter;
  uploads(cfg: UploadConfig, ctx: TesseraContext): UploadAdapter;
}

export interface TesseraInstance {
  readonly ctx: TesseraContext;
  /** Resolves once every enabled feature has been set up (or has failed). Never rejects. */
  readonly ready: Promise<void>;
  /** The feature's API, or `undefined` if it is disabled or failed. */
  feature<K extends keyof FeatureApiMap>(id: K): FeatureApiMap[K] | undefined;
  featureStatus(id: string): FeatureStatus;
  enable(id: string, config?: Record<string, unknown>): Promise<void>;
  disable(id: string): Promise<void>;
  on<E extends keyof TesseraEvents>(event: E, fn: (payload: TesseraEvents[E]) => void): () => void;
  getTheme(): { mode: ThemeMode; resolved: 'light' | 'dark' };
  setTheme(mode: ThemeMode): void;
  setLocale(locale: string): void;
  /** Tears down every plugin and disconnects the transport. */
  destroy(): Promise<void>;
}
