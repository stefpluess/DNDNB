// Small helpers shared by every view. No application state lives here.

export const $ = sel => document.querySelector(sel);

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Math.random().toString(36).slice(2, 10);

export const mod = score => Math.floor((Number(score) - 10) / 2);

export const MINUS = '−';
/** +3 / −1 for display. */
export const signed = n => (n >= 0 ? '+' : MINUS) + Math.abs(n);
/** +3 / -1 for dice expressions. */
export const plusMinus = n => (n >= 0 ? '+' : '-') + Math.abs(n);

export const ordinal = n => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;
export const label = k => String(k).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const fmtCR = cr => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[cr] || String(Math.round(cr * 1000) / 1000));
/** Name of an Open5e reference object ({name, key}) or a plain string. */
export const nm = x => (x && typeof x === 'object' ? x.name : x) || '';

/** Read a dotted path: listAt({a: {b: [1]}}, 'a.b.0') === 1 */
export const listAt = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
/** Write a dotted path, creating objects along the way. */
export function setPath(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = val;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t || !msg) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}
