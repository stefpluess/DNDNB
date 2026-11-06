import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory } from '../static/js/history.js';

function setup(limit) {
  const state = { hp: 10 };
  const h = createHistory({ capture: () => ({ ...state }), restore: s => Object.assign(state, s), limit });
  const act = (label, hp) => { h.remember(label); state.hp = hp; };
  return { state, h, act };
}

test('undo restores the state before the action, redo applies it again', () => {
  const { state, h, act } = setup();
  act('Damage Orc 3', 7);
  act('Damage Orc 2', 5);
  assert.equal(h.undo(), 'Damage Orc 2');
  assert.equal(state.hp, 7);
  assert.equal(h.undo(), 'Damage Orc 3');
  assert.equal(state.hp, 10);
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), 'Damage Orc 3');
  assert.equal(state.hp, 7);
  assert.equal(h.redoLabel, 'Damage Orc 2');
});

test('a new action after undo drops the redo list', () => {
  const { state, h, act } = setup();
  act('a', 7);
  h.undo();
  act('b', 4);
  assert.equal(h.redo(), null);
  assert.equal(state.hp, 4);
  assert.equal(h.undoLabel, 'b');
});

test('history keeps only the most recent actions', () => {
  const { h, act } = setup(2);
  act('a', 1); act('b', 2); act('c', 3);
  assert.equal(h.undo(), 'c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), null);
});
