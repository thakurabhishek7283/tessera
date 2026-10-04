import { createTessera } from '@tessera-kit/core';
import { describe, expect, it } from 'vitest';
import { createTransport, isLocalTransport } from '../src/index.js';

describe('createTransport', () => {
  it('returns null for none and builds local transports through createTessera', async () => {
    const none = createTessera(
      { appId: 'demo', features: {}, transport: { type: 'none' } },
      { plugins: {}, adapters: { transport: createTransport } },
    );
    expect(none.ctx.transport()).toBeNull();

    const local = createTessera(
      {
        appId: 'demo',
        features: {},
        transport: { type: 'local', channel: 'test' },
        auth: { type: 'static', user: { id: 'u1', name: 'Ada' } },
      },
      { plugins: {}, adapters: { transport: createTransport } },
    );
    const t = local.ctx.transport();
    expect(isLocalTransport(t)).toBe(true);
    const room = await t?.join('chat:general');
    expect(room?.self.user).toMatchObject({
      id: 'u1',
      name: 'Ada',
      color: expect.stringMatching(/^hsl/),
    });
    await local.destroy();
    expect(t?.state.get()).toBe('closed');
  });

  it('forwards transport state to the bus', async () => {
    const t = createTessera(
      { appId: 'demo', features: {}, transport: { type: 'local' } },
      { plugins: {}, adapters: { transport: createTransport } },
    );
    const states: string[] = [];
    t.on('transport:state', (s) => states.push(s));
    t.ctx.transport();
    await t.ctx.transport()?.join('chat:x');
    expect(states).toContain('open');
    await t.destroy();
  });

  it('creates websocket transports without connecting until used', () => {
    const t = createTessera(
      { appId: 'demo', features: {}, transport: { type: 'websocket', url: 'ws://127.0.0.1:1' } },
      { plugins: {}, adapters: { transport: (cfg, ctx) => createTransport(cfg, ctx) } },
    );
    expect(t.ctx.transport()?.capabilities.serverHistory).toBe(true);
    void t.destroy();
  });
});
