import { describe, expect, it } from 'vitest';
import { type Command, createHistory } from '../src/history.js';

function counter() {
  const state = { n: 0, log: [] as string[] };
  const add = (by: number, label = 'add', mergeKey?: string): Command => ({
    label,
    ...(mergeKey ? { mergeKey } : {}),
    do() {
      state.n += by;
      state.log.push(`do${by}`);
    },
    undo() {
      state.n -= by;
      state.log.push(`undo${by}`);
    },
    merge(next) {
      const nextBy = (next as Command & { by: number }).by;
      return add(by + nextBy, label, mergeKey);
    },
    ...({ by } as object),
  });
  return { state, add };
}

describe('createHistory', () => {
  it('push runs do, undo/redo move through the stack and update state', async () => {
    const { state, add } = counter();
    const h = createHistory();
    await h.push(add(1, 'one'));
    await h.push(add(2, 'two'));
    expect(state.n).toBe(3);
    expect(h.state.get()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'two' });
    expect(await h.undo()).toBe(true);
    expect(state.n).toBe(1);
    expect(h.state.get()).toMatchObject({ canRedo: true, redoLabel: 'two' });
    expect(await h.redo()).toBe(true);
    expect(state.n).toBe(3);
    expect(await h.redo()).toBe(false);
  });

  it('alreadyDone skips do and a new push clears redo', async () => {
    const { state, add } = counter();
    const h = createHistory();
    await h.push(add(5), { alreadyDone: true });
    expect(state.n).toBe(0);
    await h.undo();
    await h.push(add(1));
    expect(h.state.get().canRedo).toBe(false);
  });

  it('merges commands with the same key inside the merge window only', async () => {
    let t = 0;
    const { state, add } = counter();
    const h = createHistory({ mergeWindowMs: 500, clock: { now: () => t } });
    await h.push(add(1, 'type', 'typing'));
    t = 100;
    await h.push(add(1, 'type', 'typing'));
    await h.undo();
    expect(state.n).toBe(0);
    await h.redo();
    t = 5000;
    await h.push(add(1, 'type', 'typing'));
    await h.undo();
    expect(state.n).toBe(2);
  });

  it('groups a transaction into one undo entry', async () => {
    const { state, add } = counter();
    const h = createHistory();
    await h.transaction('Move 3', async () => {
      await h.push(add(1));
      await h.push(add(1));
      await h.push(add(1));
    });
    expect(state.n).toBe(3);
    expect(h.state.get().undoLabel).toBe('Move 3');
    await h.undo();
    expect(state.n).toBe(0);
    expect(h.state.get().canUndo).toBe(false);
  });

  it('enforces the limit and restores the command when undo fails', async () => {
    const { add } = counter();
    const h = createHistory({ limit: 2 });
    await h.push(add(1, 'a'));
    await h.push(add(1, 'b'));
    await h.push(add(1, 'c'));
    await h.undo();
    await h.undo();
    expect(await h.undo()).toBe(false);

    const failing: Command = {
      label: 'boom',
      do() {},
      undo() {
        throw new Error('nope');
      },
    };
    await h.push(failing);
    await expect(h.undo()).rejects.toThrow('nope');
    expect(h.state.get().canUndo).toBe(true);
  });
});
