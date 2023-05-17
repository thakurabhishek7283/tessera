export type {
  AuthProvider,
  Doc,
  DocChange,
  ListQuery,
  Page,
  Peer,
  ReconnectPolicy,
  Room,
  StorageAdapter,
  Transport,
  TransportCapabilities,
  TransportState,
  UploadAdapter,
  UploadResult,
} from './adapters.js';
export { resolveAuth } from './auth.js';
export { createEventBus, type EventBus, type Unsubscribe } from './bus.js';
export { type Clock, systemClock } from './clock.js';
export { formatIssues, parseConfig, TesseraConfigSchema } from './config.js';
export { type ErrorCode, TesseraError } from './errors.js';
export {
  type Command,
  createHistory,
  type History,
  type HistoryOptions,
  type HistoryState,
} from './history.js';
export { createI18n, type I18n, type MessageCatalog } from './i18n.js';
export type { UserInfo } from './identity.js';
export { colorForId, createIdGenerator, type IdGenerator } from './ids.js';
export { createLogger, type Logger, type LogLevel, type LogSink } from './logger.js';
export { definePlugin, type PluginLoader, type TesseraPlugin } from './plugin.js';
export {
  createServiceRegistry,
  type FeatureApiMap,
  type ServiceMap,
  type ServiceRegistry,
} from './services.js';
export { batch, createStore, type ReadonlyStore, type Store } from './store.js';
export { type CreateTesseraOptions, createTessera } from './tessera.js';
export type {
  AdapterFactories,
  AuthConfig,
  FeatureConfigBase,
  FeatureStatus,
  StorageConfig,
  TesseraConfig,
  TesseraContext,
  TesseraEvents,
  TesseraInstance,
  ThemeMode,
  TransportConfig,
  UploadConfig,
} from './types.js';
