import type { Clock } from './clock.js';
import { systemClock } from './clock.js';
import type { ReadonlyStore } from './store.js';
import { createStore } from './store.js';

/** A reversible action. */
export interface Command {
  /** Shown in undo/redo UI ("Move card"). */
  label: string;
  do(): void | Promise<void>;
  undo(): void | Promise<void>;
  /** Consecutive commands with the same key inside the merge window are merged. */
  mergeKey?: string;
  /** Required when `mergeKey` is set. Returns the combined command. */
  merge?(next: Command): Command;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

export interface History {
  /** Runs `cmd.do()` (unless `alreadyDone`) and records it. Clears the redo stack. */
  push(cmd: Command, opts?: { alreadyDone?: boolean }): Promise<void>;
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
  /** Groups every command pushed inside `fn` into a single undo entry. */
  transaction(label: string, fn: () => Promise<void> | void): Promise<void>;
  clear(): void;
  readonly state: ReadonlyStore<HistoryState>;
}

export interface HistoryOptions {
  limit?: number;
  mergeWindowMs?: number;
  clock?: Clock;
}

/** Creates an undo/redo stack using the command pattern. */
export function createHistory(opts: HistoryOptions = {}): History {
  const limit = opts.limit ?? 100;
  const mergeWindowMs = opts.mergeWindowMs ?? 500;
  const clock = opts.clock ?? systemClock;

  const undoStack: Command[] = [];
  const redoStack: Command[] = [];
  let lastPushAt = 0;
  let group: Command[] | null = null;
  // Serialises async do/undo so rapid shortcuts cannot interleave.
  let queue: Promise<unknown> = Promise.resolve();

  const state = createStore<HistoryState>({ canUndo: false, canRedo: false });

  const sync = (): void => {
    const u = undoStack.at(-1);
    const r = redoStack.at(-1);
    state.set({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      ...(u ? { undoLabel: u.label } : {}),
      ...(r ? { redoLabel: r.label } : {}),
    });
  };

  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const record = (cmd: Command): void => {
    redoStack.length = 0;
    const top = undoStack.at(-1);
    const now = clock.now();
    if (
      top?.mergeKey !== undefined &&
      top.mergeKey === cmd.mergeKey &&
      top.merge &&
      now - lastPushAt <= mergeWindowMs
    ) {
      undoStack[undoStack.length - 1] = top.merge(cmd);
    } else {
      undoStack.push(cmd);
      if (undoStack.length > limit) undoStack.shift();
    }
    lastPushAt = now;
    sync();
  };

  return {
    state,
    push: (cmd, pushOpts) =>
      enqueue(async () => {
        if (!pushOpts?.alreadyDone) await cmd.do();
        if (group) group.push(cmd);
        else record(cmd);
      }),
    async undo() {
      return enqueue(async () => {
        const cmd = undoStack.pop();
        if (!cmd) return false;
        try {
          await cmd.undo();
        } catch (error) {
          undoStack.push(cmd);
          throw error;
        } finally {
          sync();
        }
        redoStack.push(cmd);
        sync();
        return true;
      });
    },
    async redo() {
      return enqueue(async () => {
        const cmd = redoStack.pop();
        if (!cmd) return false;
        try {
          await cmd.do();
        } catch (error) {
          redoStack.push(cmd);
          throw error;
        } finally {
          sync();
        }
        undoStack.push(cmd);
        sync();
        return true;
      });
    },
    async transaction(label, fn) {
      if (group) {
        // Nested transaction: flatten into the outer one.
        await fn();
        return;
      }
      group = [];
      const collected = group;
      try {
        await fn();
      } finally {
        group = null;
      }
      if (collected.length === 0) return;
      const first = collected[0];
      if (collected.length === 1 && first) {
        record({ ...first, label });
        return;
      }
      record({
        label,
        do: async () => {
          for (const c of collected) await c.do();
        },
        undo: async () => {
          for (const c of [...collected].reverse()) await c.undo();
        },
      });
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      sync();
    },
  };
}
