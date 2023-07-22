import type { AddressInfo } from 'node:net';
import { type ClientMessage, decodeClientFrame, type ServerMessage } from '@tessera/protocol';
import { type WebSocket, WebSocketServer } from 'ws';

interface Member {
  ws: WebSocket;
  peerId: string;
  user: { id: string; name: string };
  presence: Record<string, unknown>;
}

export interface TestServerOptions {
  port?: number;
  /** Never answers `hello`. */
  ignoreHello?: boolean;
  /** Never answers `ping`. */
  ignorePing?: boolean;
}

export type RequestHandler = (data: unknown, from: Member) => unknown | Promise<unknown>;

/** Minimal tessera-server look-alike: just enough protocol to exercise the client. */
export class TestServer {
  readonly handlers: Map<string, RequestHandler> = new Map();
  readonly received: ClientMessage[] = [];
  readonly rooms: Map<string, Map<string, Member>> = new Map();
  private wss!: WebSocketServer;
  private sockets = new Set<WebSocket>();
  private members = new Map<WebSocket, Member>();
  private counter = 0;
  port: number = 0;

  constructor(readonly options: TestServerOptions = {}) {}

  static async start(options: TestServerOptions = {}): Promise<TestServer> {
    const server = new TestServer(options);
    await server.listen(options.port ?? 0);
    return server;
  }

  get url(): string {
    return `ws://127.0.0.1:${this.port}`;
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port, host: '127.0.0.1' });
      this.wss.once('listening', () => {
        this.port = (this.wss.address() as AddressInfo).port;
        resolve();
      });
      this.wss.once('error', reject);
      this.wss.on('connection', (ws) => this.onConnection(ws));
    });
  }

  /** Abruptly drops every client, like a crashed server or network cut. */
  async stop(): Promise<void> {
    for (const ws of this.sockets) ws.terminate();
    this.sockets.clear();
    this.members.clear();
    this.rooms.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  /** Starts listening again on the same port (after {@link stop}). */
  async restart(): Promise<void> {
    await this.listen(this.port);
  }

  dropClients(): void {
    for (const ws of this.sockets) ws.terminate();
  }

  framesOf<T extends ClientMessage['t']>(type: T): Array<Extract<ClientMessage, { t: T }>> {
    return this.received.filter((m): m is Extract<ClientMessage, { t: T }> => m.t === type);
  }

  members_(room: string): Member[] {
    return [...(this.rooms.get(room)?.values() ?? [])];
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private onConnection(ws: WebSocket): void {
    this.sockets.add(ws);
    ws.on('close', () => {
      this.sockets.delete(ws);
      const member = this.members.get(ws);
      this.members.delete(ws);
      if (!member) return;
      for (const [name, room] of this.rooms) {
        if (room.delete(member.peerId)) {
          for (const other of room.values()) {
            this.send(other.ws, { t: 'peer-leave', room: name, peerId: member.peerId });
          }
        }
      }
    });
    ws.on('message', (raw) => void this.onFrame(ws, raw.toString()));
  }

  private async onFrame(ws: WebSocket, raw: string): Promise<void> {
    const decoded = decodeClientFrame(raw);
    if (!decoded.ok) {
      this.send(ws, { t: 'error', error: { code: 'VALIDATION', message: decoded.reason } });
      return;
    }
    const msg = decoded.msg;
    this.received.push(msg);

    if (msg.t === 'hello') {
      if (this.options.ignoreHello) return;
      if (msg.token === 'bad') {
        ws.close(4003, 'unauthorized');
        return;
      }
      const name = msg.token ?? 'anon';
      const member: Member = {
        ws,
        peerId: `p${++this.counter}`,
        user: { id: name, name },
        presence: {},
      };
      this.members.set(ws, member);
      this.send(ws, {
        t: 'welcome',
        v: 1,
        peerId: member.peerId,
        user: member.user,
        serverTime: Date.now(),
      });
      return;
    }

    const me = this.members.get(ws);
    if (!me) return;

    switch (msg.t) {
      case 'ping':
        if (!this.options.ignorePing)
          this.send(ws, { t: 'pong', ts: msg.ts, serverTime: Date.now() });
        return;
      case 'join': {
        if (msg.room.endsWith(':forbidden')) {
          this.send(ws, {
            t: 'error',
            error: { code: 'FORBIDDEN', message: 'room-full' },
            ref: msg.id,
          });
          return;
        }
        let room = this.rooms.get(msg.room);
        if (!room) {
          room = new Map();
          this.rooms.set(msg.room, room);
        }
        me.presence = (msg.presence as Record<string, unknown> | undefined) ?? {};
        const others = [...room.values()].map(toPeer);
        room.set(me.peerId, me);
        this.send(ws, { t: 'joined', id: msg.id, room: msg.room, peers: others });
        for (const other of room.values()) {
          if (other !== me)
            this.send(other.ws, { t: 'peer-join', room: msg.room, peer: toPeer(me) });
        }
        return;
      }
      case 'leave': {
        const room = this.rooms.get(msg.room);
        if (room?.delete(me.peerId)) {
          for (const other of room.values()) {
            this.send(other.ws, { t: 'peer-leave', room: msg.room, peerId: me.peerId });
          }
        }
        return;
      }
      case 'pub':
        for (const other of this.rooms.get(msg.room)?.values() ?? []) {
          if (other !== me) {
            this.send(other.ws, {
              t: 'msg',
              room: msg.room,
              topic: msg.topic,
              data: msg.data,
              from: me.peerId,
              ts: Date.now(),
            });
          }
        }
        return;
      case 'direct': {
        const target = this.rooms.get(msg.room)?.get(msg.to);
        if (target) {
          this.send(target.ws, {
            t: 'msg',
            room: msg.room,
            topic: msg.topic,
            data: msg.data,
            from: me.peerId,
            ts: Date.now(),
          });
        }
        return;
      }
      case 'presence':
        me.presence = { ...me.presence, ...(msg.patch as Record<string, unknown>) };
        for (const other of this.rooms.get(msg.room)?.values() ?? []) {
          if (other !== me) {
            this.send(other.ws, {
              t: 'presence',
              room: msg.room,
              peerId: me.peerId,
              patch: msg.patch,
            });
          }
        }
        return;
      case 'req': {
        const handler = this.handlers.get(msg.topic);
        if (!handler) {
          this.send(ws, {
            t: 'res',
            id: msg.id,
            ok: false,
            error: { code: 'NOT_FOUND', message: 'unknown topic' },
          });
          return;
        }
        try {
          const data = (await handler(msg.data, me)) ?? null;
          this.send(ws, { t: 'res', id: msg.id, ok: true, data: data as never });
        } catch (error) {
          this.send(ws, {
            t: 'res',
            id: msg.id,
            ok: false,
            error: { code: 'VALIDATION', message: String(error) },
          });
        }
        return;
      }
    }
  }

  /** Server-originated broadcast to a room. */
  broadcast(room: string, topic: string, data: unknown): void {
    for (const member of this.rooms.get(room)?.values() ?? []) {
      this.send(member.ws, {
        t: 'msg',
        room,
        topic,
        data: data as never,
        from: 'server',
        ts: Date.now(),
      });
    }
  }
}

function toPeer(m: Member) {
  return { peerId: m.peerId, user: m.user, presence: m.presence as never };
}
