import type { TesseraContext, Transport, TransportConfig } from '@tessera/core';
import { createLocalTransport } from './local.js';
import { createWebSocketTransport } from './websocket.js';

/**
 * Factory for `createTessera({ adapters: { transport } })`.
 * Returns `null` for `{ type: 'none' }`.
 */
export function createTransport(cfg: TransportConfig, ctx: TesseraContext): Transport | null {
  switch (cfg.type) {
    case 'none':
      return null;
    case 'local':
      return createLocalTransport({
        appId: ctx.appId,
        ...(cfg.channel ? { channel: cfg.channel } : {}),
        user: () => ctx.auth.getUser(),
        ids: ctx.ids,
        clock: ctx.clock,
        logger: ctx.logger.child('transport'),
      });
    case 'websocket':
      return createWebSocketTransport({
        url: cfg.url,
        appId: ctx.appId,
        auth: ctx.auth,
        ids: ctx.ids,
        clock: ctx.clock,
        logger: ctx.logger.child('transport'),
        reconnect: cfg.reconnect,
      });
    case 'custom':
      return cfg.create(ctx);
  }
}
