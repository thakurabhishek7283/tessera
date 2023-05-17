import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { StorageAdapter, Transport } from '../src/adapters.js';
import { definePlugin, type PluginLoader } from '../src/plugin.js';
import type { ServiceMap } from '../src/services.js';
import { createStore } from '../src/store.js';
import { createTessera } from '../src/tessera.js';
import type { TesseraConfig } from '../src/types.js';

declare module '../src/services.js' {
  interface ServiceMap {
    alpha: { value: string };
    beta: { value: string };
  }
  interface FeatureApiMap {
    alpha: { value: string };
    beta: { value: string };
    hello: { greet(): string };
  }
}

const base = (
  features: TesseraConfig['features'],
  extra: Partial<TesseraConfig> = {},
): TesseraConfig => ({
  appId: 'test-app',
  auth: { type: 'static', user: { id: 'u1', name: 'Ada' } },
  features,
  ...extra,
});

const fakeTransport = (): Transport => ({
  state: createStore('open' as const),
  capabilities: { serverHistory: false, serverPersistence: false, directMessages: true },
  connect: async () => {},
  disconnect: () => {},
  join: async () => {
    throw new Error('not used');
  },
});

const helloPlugin = (log: string[] = []) =>
  definePlugin({
    id: 'hello',
    version: '1.0.0',
    configSchema: z.object({ enabled: z.boolean(), greeting: z.string().default('Hello') }),
    messages: { en: { 'hello.title': 'Hello kit' } },
    setup(ctx, cfg) {
      log.push('setup');
      return { greet: () => `${cfg.greeting}, ${ctx.auth.getUser()?.name}` };
    },
    teardown() {
      log.push('teardown');
    },
  });

const loaderFor =
  (plugin: unknown): PluginLoader =>
  async () => ({ default: plugin as never });

describe('createTessera', () => {
  it('rejects invalid config with readable paths', () => {
    expect(() => createTessera({ appId: 'Bad ID', features: {} }, { plugins: {} })).toThrowError(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: expect.stringContaining('appId'),
      }),
    );
    expect(() =>
      createTessera({ appId: 'ok', features: { a: { enabled: 'yes' as never } } }, { plugins: {} }),
    ).toThrowError(/features\.a\.enabled/);
  });

  it('sets up enabled features, applies defaults and exposes the api', async () => {
    const log: string[] = [];
    const t = createTessera(base({ hello: { enabled: true } }), {
      plugins: { hello: loaderFor(helloPlugin(log)) },
    });
    const ready = vi.fn();
    t.on('tessera:ready', ready);
    await t.ready;
    expect(t.feature('hello')?.greet()).toBe('Hello, Ada');
    expect(t.ctx.isEnabled('hello')).toBe(true);
    expect(t.ctx.i18n.t('hello.title')).toBe('Hello kit');
    expect(t.ctx.services.get('hello' as keyof ServiceMap)).toBeDefined();
    expect(ready).toHaveBeenCalledOnce();
    expect(log).toEqual(['setup']);
  });

  it('never calls the loader of a disabled feature', async () => {
    const loader = vi.fn(loaderFor(helloPlugin()));
    const t = createTessera(base({ hello: { enabled: false } }), { plugins: { hello: loader } });
    await t.ready;
    expect(loader).not.toHaveBeenCalled();
    expect(t.feature('hello')).toBeUndefined();
    expect(t.featureStatus('hello')).toBe('disabled');
  });

  it('fails a feature cleanly when its plugin is missing, and keeps the others running', async () => {
    const t = createTessera(base({ ghost: { enabled: true }, hello: { enabled: true } }), {
      plugins: { hello: loaderFor(helloPlugin()) },
    });
    const errors: string[] = [];
    t.on('tessera:error', (e) => errors.push(e.code));
    await t.ready;
    expect(errors).toEqual(['PLUGIN_NOT_FOUND']);
    expect(t.featureStatus('ghost')).toBe('failed');
    expect(t.feature('hello')).toBeDefined();
  });

  it('reports invalid feature config under features.<id>', async () => {
    const strict = definePlugin({
      id: 'strict',
      version: '1',
      configSchema: z.object({ enabled: z.boolean(), max: z.number() }),
      setup: () => ({}),
    });
    const t = createTessera(base({ strict: { enabled: true, max: 'lots' } }), {
      plugins: { strict: loaderFor(strict) },
    });
    const seen: Error[] = [];
    t.on('tessera:error', (e) => seen.push(e));
    await t.ready;
    expect(seen[0]).toMatchObject({ code: 'CONFIG_INVALID' });
    expect(seen[0]?.message).toMatch(/features\.strict\.max/);
  });

  it("fails a plugin that requires 'transport' when transport is none", async () => {
    const needs = definePlugin({
      id: 'needs',
      version: '1',
      configSchema: z.object({ enabled: z.boolean() }),
      requires: ['transport'],
      setup: () => ({}),
    });
    const t = createTessera(base({ needs: { enabled: true } }, { transport: { type: 'none' } }), {
      plugins: { needs: loaderFor(needs) },
    });
    const codes: string[] = [];
    t.on('tessera:error', (e) => codes.push(e.code));
    await t.ready;
    expect(codes).toEqual(['ADAPTER_MISSING']);
    expect(t.featureStatus('needs')).toBe('failed');
  });

  it('creates the transport lazily, once, and forwards its state', async () => {
    const create = vi.fn(fakeTransport);
    const needs = definePlugin({
      id: 'needs',
      version: '1',
      configSchema: z.object({ enabled: z.boolean() }),
      requires: ['transport'],
      setup: (ctx) => {
        ctx.transport();
        ctx.transport();
        return {};
      },
    });
    const t = createTessera(
      base({ needs: { enabled: true } }, { transport: { type: 'custom', create } }),
      { plugins: { needs: loaderFor(needs) } },
    );
    expect(create).not.toHaveBeenCalled();
    await t.ready;
    expect(create).toHaveBeenCalledOnce();
    expect(t.featureStatus('needs')).toBe('enabled');
  });

  it('throws ADAPTER_MISSING with a hint when a storage factory is absent', () => {
    const t = createTessera(base({}, { storage: { type: 'indexeddb' } }), { plugins: {} });
    expect(() => t.ctx.storage()).toThrowError(/@tessera\/storage/);
  });

  it('uses custom storage adapters without a factory', () => {
    const adapter = {} as StorageAdapter;
    const t = createTessera(base({}, { storage: { type: 'custom', adapter } }), { plugins: {} });
    expect(t.ctx.storage()).toBe(adapter);
  });

  it('sets features up in dependency order using requires and optional', async () => {
    const order: string[] = [];
    const mk = (id: 'alpha' | 'beta', extra: object) =>
      definePlugin({
        id,
        version: '1',
        configSchema: z.object({ enabled: z.boolean() }),
        ...extra,
        async setup() {
          await new Promise((r) => setTimeout(r, id === 'alpha' ? 20 : 0));
          order.push(id);
          return { value: id };
        },
      });
    const t = createTessera(base({ beta: { enabled: true }, alpha: { enabled: true } }), {
      plugins: {
        beta: loaderFor(mk('beta', { requires: ['alpha'] })),
        alpha: loaderFor(mk('alpha', {})),
      },
    });
    await t.ready;
    expect(order).toEqual(['alpha', 'beta']);
  });

  it('fails a feature whose required service is not provided', async () => {
    const beta = definePlugin({
      id: 'beta',
      version: '1',
      configSchema: z.object({ enabled: z.boolean() }),
      requires: ['alpha'],
      setup: () => ({ value: 'b' }),
    });
    const t = createTessera(base({ beta: { enabled: true } }), {
      plugins: { beta: loaderFor(beta) },
    });
    const codes: string[] = [];
    t.on('tessera:error', (e) => codes.push(e.code));
    await t.ready;
    expect(codes).toEqual(['SERVICE_MISSING']);
  });

  it('detects dependency cycles without hanging', async () => {
    const mk = (id: 'alpha' | 'beta', dep: 'alpha' | 'beta') =>
      definePlugin({
        id,
        version: '1',
        configSchema: z.object({ enabled: z.boolean() }),
        optional: [dep],
        setup: () => ({ value: id }),
      });
    const t = createTessera(base({ alpha: { enabled: true }, beta: { enabled: true } }), {
      plugins: { alpha: loaderFor(mk('alpha', 'beta')), beta: loaderFor(mk('beta', 'alpha')) },
    });
    const messages: string[] = [];
    t.on('tessera:error', (e) => messages.push(e.message));
    await t.ready;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatch(/cycle/);
  });

  it('enables and disables features at runtime, with teardown and events', async () => {
    const log: string[] = [];
    const t = createTessera(base({ hello: { enabled: false } }), {
      plugins: { hello: loaderFor(helloPlugin(log)) },
    });
    const changes: Array<{ id: string; enabled: boolean }> = [];
    t.on('tessera:feature-changed', (c) => changes.push(c));
    await t.ready;
    await t.enable('hello', { greeting: 'Hi' });
    expect(t.feature('hello')?.greet()).toBe('Hi, Ada');
    expect(t.ctx.isEnabled('hello')).toBe(true);
    await t.disable('hello');
    expect(t.feature('hello')).toBeUndefined();
    expect(t.ctx.services.get('hello' as keyof ServiceMap)).toBeUndefined();
    expect(t.ctx.isEnabled('hello')).toBe(false);
    await t.enable('hello');
    expect(t.feature('hello')?.greet()).toBe('Hi, Ada');
    expect(log).toEqual(['setup', 'teardown', 'setup']);
    expect(changes.map((c) => c.enabled)).toEqual([true, false, true]);
  });

  it('rejects enable() for a failing feature', async () => {
    const t = createTessera(base({}), { plugins: {} });
    await t.ready;
    await expect(t.enable('nope')).rejects.toMatchObject({ code: 'PLUGIN_NOT_FOUND' });
    expect(t.featureStatus('nope')).toBe('failed');
  });

  it('unregisters services a plugin registered itself when it is disabled', async () => {
    const withService = definePlugin({
      id: 'hello',
      version: '1',
      configSchema: z.object({ enabled: z.boolean() }),
      setup(ctx) {
        ctx.services.register('alpha', { value: 'a' });
        return { greet: () => 'hi' };
      },
    });
    const t = createTessera(base({ hello: { enabled: true } }), {
      plugins: { hello: loaderFor(withService) },
    });
    await t.ready;
    expect(t.ctx.services.get('alpha')).toEqual({ value: 'a' });
    await t.disable('hello');
    expect(t.ctx.services.get('alpha')).toBeUndefined();
  });

  it('switches theme and locale, emitting events', async () => {
    const t = createTessera(base({}, { locale: 'en', theme: { mode: 'light' } }), { plugins: {} });
    const themes: string[] = [];
    const locales: string[] = [];
    t.on('tessera:theme-changed', (e) => themes.push(`${e.mode}/${e.resolved}`));
    t.on('tessera:locale-changed', (e) => locales.push(e.locale));
    t.setTheme('dark');
    t.setLocale('de');
    expect(themes).toEqual(['dark/dark']);
    expect(locales).toEqual(['de']);
    expect(t.ctx.i18n.locale).toBe('de');
    expect(t.getTheme()).toEqual({ mode: 'dark', resolved: 'dark' });
  });

  it('destroy tears features down in reverse order and disconnects the transport', async () => {
    const log: string[] = [];
    const disconnect = vi.fn();
    const mk = (id: 'alpha' | 'beta', extra: object) =>
      definePlugin({
        id,
        version: '1',
        configSchema: z.object({ enabled: z.boolean() }),
        ...extra,
        setup: (ctx) => {
          ctx.transport();
          return { value: id };
        },
        teardown: () => {
          log.push(`down:${id}`);
        },
      });
    const t = createTessera(
      base(
        { alpha: { enabled: true }, beta: { enabled: true } },
        {
          transport: {
            type: 'custom',
            create: () => ({ ...fakeTransport(), disconnect }),
          },
        },
      ),
      {
        plugins: {
          alpha: loaderFor(mk('alpha', {})),
          beta: loaderFor(mk('beta', { requires: ['alpha'] })),
        },
      },
    );
    await t.destroy();
    expect(log).toEqual(['down:beta', 'down:alpha']);
    expect(disconnect).toHaveBeenCalled();
  });

  it('gives guests a stable colourful identity', () => {
    const t = createTessera({ appId: 'guests', features: {} }, { plugins: {} });
    const user = t.ctx.auth.getUser();
    expect(user?.id).toMatch(/^guest-/);
    expect(user?.color).toMatch(/^hsl\(/);
  });
});
