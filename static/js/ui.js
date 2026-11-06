// The roll log, shared by all views. Rolls show in the log in the combat view and as a popup elsewhere.

import { doubleDice, roll } from './dice.js';
import { S } from './store.js';
import { $, esc, toast } from './util.js';

const entries = [];

export function pushLog(lbl, r, cls = '') {
  entries.push({ lbl, total: r.total, detail: r.detail, cls });
  if (entries.length > 150) entries.shift();
  renderLog();
  if (S.view !== 'combat') {
    toast(`${lbl}: ${r.total}${cls === 'crit' ? ' (natural 20)' : cls === 'fumble' ? ' (natural 1)' : ''}`);
  }
}

/** type: 'atk' | 'check' | 'dmg' | 'hp'. Shift-click on damage rolls a critical hit. */
export function rollAndLog(lbl, expr, type, ev, min = 0) {
  if (type === 'dmg' && ev?.shiftKey) { expr = doubleDice(expr); lbl += ' (crit)'; }
  const r = roll(expr, Math.random, { min });
  if (!r) return toast(`Can't roll "${expr}". Try something like 2d6+3.`);
  const d20Roll = type !== 'dmg' && type !== 'hp';
  const cls = d20Roll && r.nat === 20 ? 'crit' : d20Roll && r.nat === 1 ? 'fumble' : '';
  pushLog(lbl, r, cls);
}

/** Click handler for any element with data-roll; returns true if it handled the click. */
export function handleRollClick(e) {
  const b = e.target.closest('[data-roll]');
  if (!b) return false;
  rollAndLog(b.dataset.label, b.dataset.roll, b.dataset.type, e, +b.dataset.min || 0);
  return true;
}

export function renderLog() {
  const ol = $('#log');
  if (!ol) return;
  ol.innerHTML = entries.slice().reverse().map(e =>
    `<li class="${e.cls}"><span class="tot">${e.total}</span><span class="lbl">${esc(e.lbl)}</span><span class="det">${esc(e.detail)}</span></li>`).join('');
}

export function clearLog() { entries.length = 0; renderLog(); }
export const logEntries = () => entries.slice();
