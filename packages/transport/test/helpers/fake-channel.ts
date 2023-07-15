/** Deterministic in-process BroadcastChannel stand-in: delivery happens on a microtask. */
export class FakeChannelBus {
  private channels: Map<string, Set<FakeChannel>> = new Map();
  /** Peers whose outgoing messages are swallowed, to simulate a frozen or crashed tab. */
  muted: WeakSet<FakeChannel> = new WeakSet();

  /** The most recently created channel; tests grab it right after creating a transport. */
  last: FakeChannel | undefined;

  create = (name: string): FakeChannel => {
    const channel = new FakeChannel(name, this);
    this.last = channel;
    let set = this.channels.get(name);
    if (!set) {
      set = new Set();
      this.channels.set(name, set);
    }
    set.add(channel);
    return channel;
  };

  deliver(from: FakeChannel, message: unknown): void {
    if (this.muted.has(from)) return;
    const data = structuredClone(message);
    for (const other of this.channels.get(from.name) ?? []) {
      if (other === from) continue;
      queueMicrotask(() => {
        if (!other.closed) for (const fn of other.listeners) fn({ data } as MessageEvent);
      });
    }
  }

  remove(channel: FakeChannel): void {
    this.channels.get(channel.name)?.delete(channel);
  }
}

export class FakeChannel {
  listeners: Set<(event: MessageEvent) => void> = new Set();
  closed: boolean = false;
  constructor(
    readonly name: string,
    private bus: FakeChannelBus,
  ) {}
  postMessage(message: unknown): void {
    this.bus.deliver(this, message);
  }
  addEventListener(_type: 'message', fn: (event: MessageEvent) => void): void {
    this.listeners.add(fn);
  }
  close(): void {
    this.closed = true;
    this.bus.remove(this);
  }
}
