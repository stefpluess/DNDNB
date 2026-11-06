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
  group: { type: '', ab: '', dc: '', onSave: 'half' },   // area damage: damage type and saving throw
  atk: { target: {}, mode: {}, cover: {}, last: null },   // attacks: target, roll mode and cover per attacker id, last result (UI only)
  castSpell: "Hunter's Mark",  // the spell picked in the inspector's Cast block
  condMoreOpen: false,        // the "concentration and repeated saves" options are open
  // party view
  currentChar: null,
  // bestiary view
  monList: [],
  curMon: null,               // { idx, data }
  // two-step confirmations ("click again to …")
  confirm: { del: null, clear: false, delChar: null, delMon: null, delFight: null, delPage: null },
  saved: [],                  // saved encounters, as last loaded
  // wiki view
  wiki: {
    pages: [], categories: [], trash: 0,   // the page list (no bodies) and the trash count, from /api/wiki
    cur: null,                // the open page: { id, title, category, body, links, backlinks, ... }
    cat: 'all',               // the category shown in the list: 'all', 'recent' or a category key
    q: '', results: null,     // the search box and its results (null when not searching)
    editing: false, trashOpen: false, back: [],   // edit mode, the trash list, pages to go back to
  },
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
/**
 * A resource pip (data-res, data-p) or pool box (data-respool) on a sheet changed: update
 * sheet.resources_used and save. Returns true if the event was one of those.
 */
export function onResourceEvent(e, ch) {
  const pip = e.target.closest('[data-res]'), pool = e.target.closest('[data-respool]');
  if (!ch || !(pip || pool)) return false;
  const key = (pip || pool).dataset.res || pool.dataset.respool;
  const r = ch.derived.resources.find(x => x.key === key);
  if (!r) return false;
  const used = ch.sheet.resources_used ||= {};
  if (pip) { const p = +pip.dataset.p; used[key] = p < r.max - r.used ? r.used + 1 : Math.max(0, r.used - 1); }
  else used[key] = Math.max(0, Math.min(r.max, r.max - (parseInt(pool.value, 10) || 0)));
  r.used = used[key];
  charSaver(ch.id).schedule();
  return true;
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

// ---------- wiki pages ----------

let wikiSaver = null;
const wikiListeners = { saved: [], error: [] };
/** fn(res, latest) runs after the open wiki page was saved; fn(error) after a save failed. */
export const onWikiSaved = fn => wikiListeners.saved.push(fn);
export const onWikiError = fn => wikiListeners.error.push(fn);

function pageSaver() {
  // one saver for every page: saves stay in order even when the DM switches pages quickly
  wikiSaver ||= createAutosave({
    key: 'wiki', delay: 500,
    save: page => {
      const p = page || S.wiki.cur;
      if (!p) return Promise.resolve(null);
      return api(`/api/wiki/${p.id}`, { method: 'PUT', body: { title: p.title, category: p.category, body: p.body, portrait: p.portrait || '' } });
    },
    onSaved: (res, latest) => { if (res) wikiListeners.saved.forEach(fn => fn(res, latest)); },
    onError: e => wikiListeners.error.forEach(fn => fn(e)),
  });
  return wikiSaver;
}
/** Save the open wiki page after typing pauses. */
export const scheduleWikiSave = () => pageSaver().schedule();
/** Save `page` (default: the open page) now; resolves once it's stored. */
export const saveWikiNow = page => pageSaver().flush(page);

/** Upload an image file for the wiki. Resolves with { file, name, bytes }; the file name goes in the page text. */
export async function uploadImage(file) {
  const r = await fetch(`/api/wiki/images?name=${encodeURIComponent(file.name || '')}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error((data && data.error) || r.statusText);
  return data;
}
