import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doubleDice, parseAmount, roll } from '../static/js/dice.js';

/** A fake random source that returns the given die faces in order (for dice of size `faces`). */
const faces = (size, ...values) => { let i = 0; return () => (values[i++ % values.length] - 1) / size; };

test('adds dice and modifiers', () => {
  const r = roll('2d6+3', faces(6, 4, 5));
  assert.equal(r.total, 12);
  assert.equal(r.detail, '[4,5] + 3');
});

test('handles several dice groups, minus signs and spaces', () => {
  const allOnes = () => 0;                                             // every die rolls a 1
  assert.equal(roll('1d8 + 1d6 - 2', allOnes).total, 1 + 1 - 2);
  assert.equal(roll('10−4').total, 6);                                 // typographic minus works too
  assert.equal(roll('7').total, 7);
});

test('reports the natural d20 for crits and fumbles', () => {
  assert.equal(roll('1d20+5', faces(20, 20)).nat, 20);
  assert.equal(roll('d20-1', faces(20, 1)).nat, 1);
  assert.equal(roll('2d20', faces(20, 20)).nat, null);   // only a single d20 counts
});

test('rejects invalid expressions instead of guessing', () => {
  for (const bad of ['', 'abc', '2d', 'd', '1d20+', '3x6', '101d6', '1d0']) assert.equal(roll(bad), null, bad);
});

test('critical hits double every dice group but not the modifier', () => {
  assert.equal(doubleDice('2d6+3'), '4d6+3');
  assert.equal(doubleDice('d8+1d6'), '2d8+2d6');
});

test('damage boxes take plain numbers, sums and dice', () => {
  assert.deepEqual(parseAmount('12'), { total: 12, detail: '+ 12', rolled: false });
  assert.equal(parseAmount('12+7').total, 19);
  const r = parseAmount('2d6+3', faces(6, 4, 5));
  assert.deepEqual([r.total, r.rolled], [12, true]);
  for (const bad of ['', '0', '3-5', 'lots']) assert.equal(parseAmount(bad), null, bad);
});

test('a minimum per die (Great Weapon Fighting)', () => {
  const r = roll('2d6+3', faces(6, 1, 5), { min: 3 });
  assert.deepEqual([r.total, r.detail], [11, '[1→3,5] + 3']);
});
