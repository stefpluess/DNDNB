import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convert, isTyping } from '../static/js/forms.js';
import { listAt, setPath } from '../static/js/util.js';

/** A stand-in for a form field: just the properties convert() reads. */
const field = (value, { type = 'text', dataType, required = false, checked = false, tag = 'INPUT' } = {}) =>
  ({ value, type, checked, tagName: tag, dataset: { ...(dataType ? { type: dataType } : {}), ...(required ? { required: '' } : {}) } });

test('numbers: blank or invalid means "not yet", so clearing a field never saves 0', () => {
  assert.equal(convert(field('14', { type: 'number', dataType: 'num' })), 14);
  assert.equal(convert(field('', { type: 'number', dataType: 'num' })), undefined);
  assert.equal(convert(field('-', { type: 'number', dataType: 'num' })), undefined);
});

test('optional numbers: blank means not set', () => {
  assert.equal(convert(field('', { type: 'number', dataType: 'numnull' })), null);
  assert.equal(convert(field('3', { type: 'number', dataType: 'numnull' })), 3);
});

test('selects with an empty option store null', () => {
  assert.equal(convert(field('', { dataType: 'opt', tag: 'SELECT', type: 'select-one' })), null);
  assert.equal(convert(field('wis', { dataType: 'opt', tag: 'SELECT', type: 'select-one' })), 'wis');
});

test('required text cannot be blanked; other text can', () => {
  assert.equal(convert(field('  ', { required: true })), undefined);
  assert.equal(convert(field('Grik', { required: true })), 'Grik');
  assert.equal(convert(field('')), '');
});

test('checkboxes store true/false', () => {
  assert.equal(convert(field('on', { type: 'checkbox', checked: true })), true);
  assert.equal(isTyping(field('', { type: 'checkbox' })), false);
  assert.equal(isTyping(field('', { tag: 'TEXTAREA', type: 'textarea' })), true);
});

test('dotted paths read and write nested data, including array items', () => {
  const o = { actions: [{ _hb: {} }] };
  setPath(o, 'actions.0._hb.dmg', '2d6');
  setPath(o, 'speed_all.fly', 60);
  assert.equal(listAt(o, 'actions.0._hb.dmg'), '2d6');
  assert.equal(o.speed_all.fly, 60);
});
