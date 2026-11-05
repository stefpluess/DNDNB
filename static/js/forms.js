// One way to connect form fields to data, used by the character sheet, the combat inspector
// and the Bestiary editor.
//
//   data-path="abilities.str"   writes the field's value to that path on the target object
//   data-type="num"             number; a blank field is not saved and is restored when you leave it
//   data-type="numnull"         number, blank means "not set" (null)
//   data-type="opt"             select whose empty option means null
//   data-required               text that may not be blank (restored when you leave it)
//   data-list="prof.saves"      checkbox that adds/removes its value in that array
//
// Text and number fields save as you type; selects and checkboxes save on change.

import { listAt, setPath } from './util.js';

/** The value a field should store, or undefined when it shouldn't store anything yet. */
export function convert(el) {
  if (el.type === 'checkbox') return el.checked;
  const v = el.value;
  switch (el.dataset.type) {
    case 'num': return v === '' || isNaN(Number(v)) ? undefined : Number(v);
    case 'numnull': return v === '' || isNaN(Number(v)) ? null : Number(v);
    case 'opt': return v || null;
    default: return el.dataset.required !== undefined && !v.trim() ? undefined : v;
  }
}

export function isTyping(el) {
  return (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && !['checkbox', 'radio'].includes(el.type);
}

/**
 * bindForm(root, { target, onEdit })
 *  target()                      -> the object being edited (or null)
 *  onEdit(path, value, el, phase) after a value was written; phase is 'input' or 'change'
 */
export function bindForm(root, { target, onEdit }) {
  function handle(el, phase) {
    const obj = target();
    if (!obj) return;
    if (el.dataset.list) {
      if (phase !== 'change') return;
      const arr = listAt(obj, el.dataset.list) || [];
      const next = el.checked ? [...new Set([...arr, el.value])] : arr.filter(x => x !== el.value);
      setPath(obj, el.dataset.list, next);
      onEdit(el.dataset.list, next, el, phase);
      return;
    }
    const path = el.dataset.path;
    if (!path) return;
    const typing = isTyping(el);
    if (!typing && phase !== 'change') return;
    const value = convert(el);
    if (value === undefined) {                       // blank where a value is required
      if (phase === 'change') el.value = listAt(obj, path) ?? '';
      return;
    }
    if (typing && phase === 'change') return;        // already saved while typing
    setPath(obj, path, value);
    onEdit(path, value, el, phase);
  }
  root.addEventListener('input', e => handle(e.target, 'input'));
  root.addEventListener('change', e => handle(e.target, 'change'));
}
