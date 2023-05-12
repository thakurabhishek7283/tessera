import type { Unsubscribe } from './bus.js';
import type { UserInfo } from './identity.js';
import type { ReadonlyStore } from './store.js';

// ---------- auth ----------

export interface AuthProvider {
  getUser(): UserInfo | null;
  /** Called on transport connect and before REST calls. */
  getToken(): Promise<string | null>;
  onChange(fn: (user: UserInfo | null) => void): Unsubscribe;
}

// ---------- transport ----------

export type TransportState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Peer {
  peerId: string;
  user: UserInfo;
  presence: Record<string, unknown>;
}

export interface TransportCapabilities {
  serverHistory: boolean;
  serverPersistence: boolean;
  directMessages: true;
}

export interface ReconnectPolicy {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitter: number;
  maxQueue: number;
}

export interface Transport {
  readonly state: ReadonlyStore<TransportState>;
  readonly capabilities: TransportCapabilities;
  connect(): Promise<void>;
  disconnect(): void;
  /** Rooms are named `<kind>:<id>`; the transport prefixes `appId/` on the wire. */
  join(room: string, opts?: { presence?: Record<string, unknown> }): Promise<Room>;
}

export interface Room {
  readonly name: string;
  readonly self: Peer;
  /** Other peers in the room (excludes self). */
  readonly peers: ReadonlyStore<Peer[]>;
  /** Broadcast to everyone else in the room. */
  publish(topic: string, data: unknown): void;
  /** Direct message to one peer, e.g. WebRTC signaling. */
  send(peerId: string, topic: string, data: unknown): void;
  /** Server RPC. */
  request<T = unknown>(topic: string, data: unknown, opts?: { timeoutMs?: number }): Promise<T>;
  on<T = unknown>(topic: string, fn: (data: T, from: Peer | 'server') => void): Unsubscribe;
  /** Merged into the current presence; throttled to one update per 100 ms. */
  setPresence(patch: Record<string, unknown>): void;
  leave(): Promise<void>;
}

// ---------- storage ----------

export interface Doc<T> {
  id: string;
  data: T;
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface ListQuery {
  /** Equality filters on top-level `data` fields only. */
  where?: Record<string, string | number | boolean | null>;
  orderBy?: { field: string; dir?: 'asc' | 'desc' };
  limit?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface DocChange {
  collection: string;
  id: string;
  version: number;
  deleted?: boolean;
  by?: string;
}

export interface StorageAdapter {
  get<T>(collection: string, id: string): Promise<Doc<T> | null>;
  list<T>(collection: string, q?: ListQuery): Promise<Page<Doc<T>>>;
  /** When `version` is given the write is optimistic: a mismatch throws `CONFLICT` with `{ current }`. */
  put<T>(collection: string, doc: { id: string; data: T; version?: number }): Promise<Doc<T>>;
  delete(collection: string, id: string, version?: number): Promise<void>;
  /** Live changes, if the backend supports them. */
  watch?(collection: string, fn: (change: DocChange) => void): Unsubscribe;
}

// ---------- uploads ----------

export interface UploadResult {
  url: string;
  id: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
}

export interface UploadAdapter {
  upload(
    file: Blob,
    opts?: { name?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal },
  ): Promise<UploadResult>;
  maxBytes: number;
  /** MIME allowlist, e.g. `['image/*', 'application/pdf']`. */
  accept: string[];
}
