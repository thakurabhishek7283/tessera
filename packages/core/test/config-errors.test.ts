import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTessera, type TesseraConfig } from '../src/index.js';

// The exact CONFIG_INVALID text for representative mistakes. Development builds run the full
// schema; production builds run a small hand-written check of the fields that would otherwise
// fail far from their cause. Both paths are snapshotted so a change in either shows up in review.
const invalid: Record<string, unknown> = {
  'empty object': {},
  'appId with spaces and capitals': { appId: 'My App', features: {} },
  'appId as a number': { appId: 123, features: {} },
  'appId over 40 characters': { appId: 'a'.repeat(41), features: {} },
  'features missing': { appId: 'app' },
  'features as an array': { appId: 'app', features: [] },
  'feature without enabled': { appId: 'app', features: { kanban: {} } },
  'enabled as a string': { appId: 'app', features: { kanban: { enabled: 'yes' } } },
  'unknown auth type': { appId: 'app', features: {}, auth: { type: 'oauth' } },
  'static auth with an empty user': {
    appId: 'app',
    features: {},
    auth: { type: 'static', user: { id: '', name: '' } },
  },
  'websocket url without ws://': {
    appId: 'app',
    features: {},
    transport: { type: 'websocket', url: 'http://example.com' },
  },
  'reconnect numbers out of range': {
    appId: 'app',
    features: {},
    transport: {
      type: 'websocket',
      url: 'wss://example.com',
      reconnect: { factor: 0.5, jitter: 2, maxQueue: -1 },
    },
  },
  'unknown transport type': { appId: 'app', features: {}, transport: { type: 'carrier-pigeon' } },
  'custom transport without a factory': {
    appId: 'app',
    features: {},
    transport: { type: 'custom', create: 'nope' },
  },
  'rest storage without baseUrl': { appId: 'app', features: {}, storage: { type: 'rest' } },
  'unknown storage type': { appId: 'app', features: {}, storage: { type: 'sqlite' } },
  'uploads maxBytes not an integer': {
    appId: 'app',
    features: {},
    uploads: { type: 'dataurl', maxBytes: 1.5 },
  },
  'theme mode and token names': {
    appId: 'app',
    features: {},
    theme: { mode: 'blue', tokens: { color: 'red' } },
  },
  'locale too short, messages and debug of the wrong type': {
    appId: 'app',
    features: {},
    locale: 'e',
    messages: { en: { hello: 1 } },
    debug: 'true',
  },
};

function messageFor(config: unknown): string {
  try {
    createTessera(config as TesseraConfig, { plugins: {} }).destroy();
    return '(accepted)';
  } catch (error) {
    const e = error as { code?: string; message: string };
    return `${e.code}\n${e.message}`;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CONFIG_INVALID messages', () => {
  it('in development builds', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const out = Object.fromEntries(Object.entries(invalid).map(([k, v]) => [k, messageFor(v)]));
    expect(out).toMatchSnapshot();
  });

  it('in production builds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const out = Object.fromEntries(Object.entries(invalid).map(([k, v]) => [k, messageFor(v)]));
    expect(out).toMatchSnapshot();
  });
});
