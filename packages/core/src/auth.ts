import type { AuthProvider } from './adapters.js';
import type { UserInfo } from './identity.js';
import { colorForId } from './ids.js';
import type { AuthConfig } from './types.js';

const GUEST_KEY = 'tessera:guest-user';

function withColor(user: UserInfo): UserInfo {
  return user.color ? user : { ...user, color: colorForId(user.id) };
}

function readGuest(): UserInfo | null {
  try {
    const raw = globalThis.localStorage?.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as UserInfo) : null;
  } catch {
    return null;
  }
}

function writeGuest(user: UserInfo): void {
  try {
    globalThis.localStorage?.setItem(GUEST_KEY, JSON.stringify(user));
  } catch {
    // Private mode or storage disabled: the guest is simply not remembered.
  }
}

/** Turns an {@link AuthConfig} into an {@link AuthProvider}. */
export function resolveAuth(cfg: AuthConfig | undefined, newId: () => string): AuthProvider {
  const config: AuthConfig = cfg ?? { type: 'guest' };

  if (config.type === 'custom') {
    const provider = config.provider;
    return {
      getUser: () => {
        const user = provider.getUser();
        return user ? withColor(user) : null;
      },
      getToken: () => provider.getToken(),
      onChange: (fn) => provider.onChange((u) => fn(u ? withColor(u) : null)),
    };
  }

  if (config.type === 'static') {
    const user = withColor(config.user);
    return {
      getUser: () => user,
      getToken: async () => config.token ?? null,
      onChange: () => () => {},
    };
  }

  const stored = readGuest();
  let guest: UserInfo;
  if (stored) {
    guest = stored;
  } else {
    const suffix = newId().slice(-6).toLowerCase();
    guest = withColor({ id: `guest-${suffix}`, name: config.name ?? `Guest ${suffix.slice(-4)}` });
    writeGuest(guest);
  }
  return { getUser: () => guest, getToken: async () => null, onChange: () => () => {} };
}
