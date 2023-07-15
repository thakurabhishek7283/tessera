import {
  createStore,
  type Peer,
  type ReadonlyStore,
  type Store,
  TesseraError,
} from '@tessera/core';

/** Keeps a room's remote peers in an observable list with immutable updates. */
export interface PeerList {
  readonly store: ReadonlyStore<Peer[]>;
  set(peers: Peer[]): void;
  upsert(peer: Peer): void;
  patch(peerId: string, patch: Record<string, unknown>): void;
  remove(peerId: string): boolean;
  get(peerId: string): Peer | undefined;
  clear(): void;
}

export function createPeerList(): PeerList {
  const store: Store<Peer[]> = createStore<Peer[]>([]);
  return {
    store,
    set: (peers) => store.set(peers),
    upsert(peer) {
      store.set((all) => {
        const at = all.findIndex((p) => p.peerId === peer.peerId);
        if (at < 0) return [...all, peer];
        const next = [...all];
        next[at] = peer;
        return next;
      });
    },
    patch(peerId, patch) {
      store.set((all) => {
        const at = all.findIndex((p) => p.peerId === peerId);
        const current = all[at];
        if (!current) return all;
        const next = [...all];
        next[at] = { ...current, presence: { ...current.presence, ...patch } };
        return next;
      });
    },
    remove(peerId) {
      const had = store.get().some((p) => p.peerId === peerId);
      if (had) store.set((all) => all.filter((p) => p.peerId !== peerId));
      return had;
    },
    get: (peerId) => store.get().find((p) => p.peerId === peerId),
    clear: () => store.set([]),
  };
}

export interface MergeThrottle {
  (patch: Record<string, unknown>): void;
  cancel(): void;
}

/**
 * Leading + trailing throttle that merges patches: the first call is sent immediately, calls
 * inside the window are merged and sent once when the window ends.
 */
export function createMergeThrottle(
  windowMs: number,
  send: (patch: Record<string, unknown>) => void,
): MergeThrottle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Record<string, unknown> | null = null;

  const open = (): void => {
    timer = setTimeout(() => {
      timer = undefined;
      if (pending) {
        const out = pending;
        pending = null;
        send(out);
        open();
      }
    }, windowMs);
  };

  const throttled = ((patch: Record<string, unknown>): void => {
    if (timer === undefined) {
      send(patch);
      open();
    } else {
      pending = { ...pending, ...patch };
    }
  }) as MergeThrottle;
  throttled.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = null;
  };
  return throttled;
}

/** Rejects with `TIMEOUT` if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TesseraError('TIMEOUT', `${what} timed out after ${ms} ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
