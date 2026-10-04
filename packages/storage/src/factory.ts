import type {
  StorageAdapter,
  StorageConfig,
  TesseraContext,
  UploadAdapter,
  UploadConfig,
} from '@tessera-kit/core';
import { createIndexedDbStorage } from './indexeddb.js';
import { createLocalStorageAdapter } from './local-storage.js';
import { createMemoryStorage } from './memory.js';
import { createRestStorage } from './rest.js';
import { createDataUrlUploads, createRestUploads } from './uploads.js';

/** Factory for `createTessera({ adapters: { storage } })`. */
export function createStorage(cfg: StorageConfig, ctx: TesseraContext): StorageAdapter {
  const common = { clock: ctx.clock, userId: () => ctx.auth.getUser()?.id };
  switch (cfg.type) {
    case 'memory':
      return createMemoryStorage(common);
    case 'local':
      return createLocalStorageAdapter({ ...common, appId: ctx.appId, logger: ctx.logger });
    case 'indexeddb':
      return createIndexedDbStorage({
        ...common,
        appId: ctx.appId,
        ...(cfg.dbName ? { dbName: cfg.dbName } : {}),
      });
    case 'rest':
      return createRestStorage({
        baseUrl: cfg.baseUrl,
        appId: ctx.appId,
        auth: ctx.auth,
        transport: () => ctx.transport(),
      });
    case 'custom':
      return cfg.adapter;
  }
}

/** Factory for `createTessera({ adapters: { uploads } })`. */
export function createUploads(cfg: UploadConfig, ctx: TesseraContext): UploadAdapter {
  switch (cfg.type) {
    case 'dataurl':
      return createDataUrlUploads({
        ids: ctx.ids,
        ...(cfg.maxBytes ? { maxBytes: cfg.maxBytes } : {}),
      });
    case 'rest':
      return createRestUploads({
        baseUrl: cfg.baseUrl,
        appId: ctx.appId,
        auth: ctx.auth,
        ...(cfg.maxBytes ? { maxBytes: cfg.maxBytes } : {}),
      });
    case 'custom':
      return cfg.adapter;
  }
}
