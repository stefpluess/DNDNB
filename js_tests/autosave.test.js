import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAutosave, enqueue } from '../static/js/autosave.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

test('tasks for one key run in order even when the first is slower', async () => {
  const done = [];
  await Promise.all([
    enqueue('k', async () => { await sleep(30); done.push(1); }),
    enqueue('k', async () => { done.push(2); }),
  ]);
  assert.deepEqual(done, [1, 2]);
});

test('a failed save does not block the next one', async () => {
  const p1 = enqueue('f', async () => { throw new Error('offline'); });
  const p2 = enqueue('f', async () => 'ok');
  await assert.rejects(p1);
  assert.equal(await p2, 'ok');
});

test('debounced edits are saved once, with the latest state', async () => {
  const state = { name: '' }, sent = [];
  const saver = createAutosave({ key: 'debounce', delay: 20, save: async () => { sent.push(state.name); return state.name; } });
  for (const ch of ['A', 'Ab', 'Abo']) { state.name = ch; saver.schedule(); }
  await sleep(60);
  assert.deepEqual(sent, ['Abo']);
});

test('the server version is only "latest" when nothing changed during the save', async () => {
  const state = { v: 1 }, seen = [];
  const saver = createAutosave({
    key: 'latest', delay: 5,
    save: async () => { const v = state.v; await sleep(20); return v; },
    onSaved: (res, latest) => seen.push([res, latest]),
  });
  saver.schedule();
  await sleep(10);            // first save is in flight now
  state.v = 2; saver.schedule();
  await sleep(80);
  assert.deepEqual(seen, [[1, false], [2, true]]);
});

test('flush saves immediately and reports the result', async () => {
  const saver = createAutosave({ key: 'flush', delay: 10_000, save: async arg => ({ got: arg }) });
  saver.schedule();           // would wait 10 s
  const { res, latest } = await saver.flush({ apply: true });
  assert.deepEqual(res, { got: { apply: true } });
  assert.equal(latest, true);
});
