// Application state, server access and saving. Every view reads and writes state through here.

import { createAutosave } from './autosave.js';
import { toast } from './util.js';

export const S = {
  meta: null,                 // lists from /api/meta: abilities, skills, classes, conditions, ...
  srdCounts: {},
  enc: { round: 1, active: null, acted: [], skip: true, c: [], ticks: [], prompts: [] },
  chars: new Map(),           // id -> { id, sheet, derived }
  entryCache: new Map(),      // "kind:idx" -> reference entry
  view: 'combat',
  // combat view
  sel: null,                  // { type: 'c', id } | { type: 'entry', kind, idx } | { type: 'char', id }
  libKind: 'monster',
  editingSlots: new Set(),    // combatant ids with the slot editor open (UI only, never saved)
  targets: new Map(),         // combatant id -> { half, mod }: ticked for area damage (UI only, never saved)
  groupAmt: '',               // what's typed in the area damage box
  atk: { target: {}, mode: {}, last: null },
  condMoreOpen: false,        // the "concentration and repeated saves" options are open   // attacks: target and roll mode per attacker id, last attack result (UI only)
  // party view
  currentChar: null,
  // bestiary view
  monList: [],
  curMon: null,               // { idx, data }
  // two-step confirmations ("click again to …")
  confirm: { del: null, clear: false, delChar: null, delMon: null, delFight: null },
  saved: [],                  // saved encounters, as last loaded
};

export async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error((data && data.error) || r.statusText);
  return data;
}

export async function getEntry(kind, idx) {
  const key = `${kind}:${idx}`;
  if (!S.entryCache.has(key)) S.entryCache.set(key, await api(`/api/entry/${kind}/${idx}`));
  return S.entryCache.get(key);
}

// ---------- the encounter ----------

const encSaver = createAutosave({
  key: 'encounter', delay: 300,
  save: () => api('/api/encounter', { method: 'PUT', body: S.enc }),
  onError: e => toast('Could not save the encounter: ' + e.message),
});
export const saveEnc = () => encSaver.schedule();

/** The context the combat rules work on. */
export const ctx = {
  get enc() { return S.enc; },
  linked: c => (c.charId && S.chars.get(c.charId)) || null,
};

// ---------- characters ----------

const charSavers = new Map();
const charListeners = [];
/** fn(id, { structural }) runs after a character was saved and its derived stats updated. */
export const onCharSaved = fn => charListeners.push(fn);

function charSaver(id) {
  if (!charSavers.has(id)) {
    charSavers.set(id, createAutosave({
      key: `char:${id}`,
      save: extra => api(`/api/characters/${id}`, { method: 'PUT', body: { sheet: S.chars.get(id).sheet, ...(extra || {}) } }),
      onSaved: (res, latest, extra) => {
        const ch = S.chars.get(id);
        if (!ch) return;
        ch.derived = res.derived;
        // operations like "fill from class" change the sheet on the server: take its version,
        // unless newer local edits are already waiting to be saved
        if (extra && latest) ch.sheet = res.sheet;
        charListeners.forEach(fn => fn(id, { structural: !!extra }));
      },
      onError: e => toast('Could not save the character: ' + e.message),
    }));
  }
  return charSavers.get(id);
}
/** Save a character after typing pauses. */
export const scheduleCharSave = id => charSaver(id).schedule();
/** Save now, optionally asking the server to apply something ({ apply_class_defaults: true }). */
export const charOp = (id, extra = {}) => charSaver(id).flush(extra);

// ---------- homebrew creatures ----------

const monSavers = new Map();
const monListeners = [];
/** fn(idx, res, latest) runs after a homebrew creature was saved. */
export const onMonSaved = fn => monListeners.push(fn);

function monSaver(idx) {
  if (!monSavers.has(idx)) {
    monSavers.set(idx, createAutosave({
      key: `mon:${idx}`,
      save: () => {
        if (S.curMon?.idx !== idx) return Promise.resolve(null);
        return api(`/api/homebrew/${idx}`, { method: 'PUT', body: { data: S.curMon.data } });
      },
      onSaved: (res, latest) => {
        if (!res) return;
        S.entryCache.delete(`monster:${idx}`);
        const li = S.monList.find(m => m.idx === idx);
        if (li) { li.name = res.data.name; li.meta = res.meta; }
        monListeners.forEach(fn => fn(idx, res, latest));
      },
      onError: e => toast('Could not save the creature: ' + e.message),
    }));
  }
  return monSavers.get(idx);
}
export const scheduleMonSave = idx => monSaver(idx).schedule();
export const saveMonNow = idx => monSaver(idx).flush();
