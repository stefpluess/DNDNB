// Preparing fights in advance: the fight planner in the combat inspector.
//
// A prepared fight is a saved encounter ({ name, creatures, notes }, stored in saved_encounters). The planner
// edits it on its own: nothing touches the tracker until "Add to combat". Fights opened in the planner live in
// `plans` (id -> fight) and those same objects sit in S.saved, so every list shows the latest edits.

import { createAutosave } from './autosave.js';
import * as R from './combat.js';
import { bindForm } from './forms.js';
import { monAC, monInit, statBlock } from './statblock.js';
import { S, api, getEntry } from './store.js';
import { $, esc, signed, toast } from './util.js';

const plans = new Map();
const savers = new Map();
const peek = new Set();          // group keys whose stat block is shown in the planner (UI only)
let hooks = { addToCombat: () => {}, refreshLibrary: () => {}, renderInspector: () => {} };

const current = () => (S.sel?.type === 'fight' ? plans.get(S.sel.id) || null : null);
const body = f => ({ name: f.name, creatures: f.creatures, notes: f.notes || '' });

function saverFor(id) {
  if (!savers.has(id)) {
    savers.set(id, createAutosave({
      key: `fight:${id}`, delay: 400,
      save: () => (plans.has(id) ? api(`/api/saved-encounters/${id}`, { method: 'PUT', body: body(plans.get(id)) }) : Promise.resolve(null)),
      onError: e => toast(`Could not save the fight: ${e.message}`),
    }));
  }
  return savers.get(id);
}
/** Save the open fight after a pause; `list` also refreshes the Fights list in the library. */
function changed(f, { list = true } = {}) {
  saverFor(f.id).schedule();
  if (list && S.libKind === 'saved') hooks.refreshLibrary();
}

/** Saved fights as the server sent them, with the fights open in the planner in place of their stored copies. */
export function mergePlans(list) {
  return list.map(f => plans.get(f.id) || f);
}

export async function loadSaved() {
  S.saved = mergePlans(await api('/api/saved-encounters'));
  return S.saved;
}

/** Wait until the fight's last edits are saved (before adding it to combat or leaving it). */
export const flushFight = id => (savers.has(id) ? savers.get(id).flush().catch(() => {}) : Promise.resolve());

export async function openFight(id) {
  let f = (S.saved || []).find(x => x.id === id);
  if (!f) { try { f = (await loadSaved()).find(x => x.id === id); } catch (e) { return toast(e.message); } }
  if (!f) return toast('That fight no longer exists.');
  if (!plans.has(id)) { f.notes ??= ''; plans.set(id, f); }
  S.sel = { type: 'fight', id };
  S.confirm.delFight = null;
  hooks.renderInspector();
  if (S.libKind === 'saved') hooks.refreshLibrary();
}

/** A new, empty fight with a free name based on `name`; opens it. */
export async function newFight(name = 'New fight', creatures = []) {
  if (!S.saved?.length) await loadSaved().catch(() => {});
  const taken = new Set((S.saved || []).map(f => f.name.toLowerCase()));
  let nm = name.trim() || 'New fight';
  for (let i = 2; taken.has(nm.toLowerCase()); i++) nm = `${name.trim() || 'New fight'} ${i}`;
  try {
    const made = await api('/api/saved-encounters', { method: 'POST', body: { name: nm, creatures, notes: '' } });
    S.saved = [...(S.saved || []), made];
    await openFight(made.id);
    $('#planName')?.select();
    return made;
  } catch (e) { toast(e.message); return null; }
}

// ---------- adding creatures ----------

/** What a fight stores for a monster from the library. */
const fromMonster = (m, idx, kind = 'foe') => ({
  ref: `monster:${idx}`, name: m.name, kind, max: +m.hit_points || 1, ac: monAC(m), mod: monInit(m), xp: +m.experience_points || 0,
});

/** Add `qty` of monster `idx` to fight `id` (open in the planner or not). */
export async function addMonsterToFight(id, idx, qty = 1) {
  let m;
  try { m = await getEntry('monster', idx); } catch (e) { return toast(`Could not load that monster: ${e.message}`); }
  const f = plans.get(id) || (S.saved || []).find(x => x.id === id);
  if (!f) return toast('That fight no longer exists.');
  if (!plans.has(id)) { f.notes ??= ''; plans.set(id, f); }
  for (let i = 0; i < qty; i++) f.creatures.push(fromMonster(m, idx));
  changed(f);
  if (current() === f) renderPlanBody();
  toast(`Added ${qty > 1 ? `${qty}× ` : ''}${m.name} to "${f.name}".`);
}

// ---------- the planner ----------

function difficultyHtml(f) {
  const foes = f.creatures.filter(c => c.kind !== 'ally');
  if (!foes.length) return '';
  const xp = R.foeXp(f.creatures);
  const levels = [...S.chars.values()].map(c => +c.sheet.level).filter(l => l > 0);
  const noXp = foes.filter(c => !c.ref && !c.xp).length;
  const note = noXp ? ` · ${noXp} custom foe${noXp > 1 ? 's have' : ' has'} no XP` : '';
  if (!levels.length) return `<p class="diffline"><b>${xp.toLocaleString()} XP</b> of foes <span class="hint">· difficulty needs characters in the Party view${note}</span></p>`;
  const d = R.difficulty(levels, xp);
  return `<p class="diffline r-${d.rating.replace(/\s/g, '').toLowerCase()}"><b>${d.rating}</b> for the party (${levels.length} character${levels.length > 1 ? 's' : ''}, level${levels.length > 1 ? 's' : ''} ${levels.join(', ')}) · ${xp.toLocaleString()} XP
    <span class="hint">(budgets: Low ${d.low.toLocaleString()} · Moderate ${d.moderate.toLocaleString()} · High ${d.high.toLocaleString()})${note}</span></p>`;
}

function groupHtml(f, g) {
  const c = f.creatures[g.idx[0]];
  const stats = [c.ac && `AC ${c.ac}`, c.max && `HP ${c.max}`, c.mod !== undefined && `Init ${signed(+c.mod || 0)}`, g.kind === 'foe' && `${g.xp.toLocaleString()} XP`].filter(Boolean).join(' · ');
  const k = esc(g.key);
  return `<li class="k-${g.kind}">
    <div class="pl-row">
      ${g.ref ? `<button class="link pl-name" data-plan="peek" data-g="${k}" title="Show or hide the stat block">${esc(g.name)}</button>` : `<span class="pl-name">${esc(g.name)}</span>`}
      <span class="hint pl-stats">${esc(stats)}</span>
      <select class="field tiny" data-plankind="${k}" aria-label="Side"><option value="foe"${g.kind === 'foe' ? ' selected' : ''}>Foe</option><option value="ally"${g.kind === 'ally' ? ' selected' : ''}>Ally</option></select>
      <span class="pl-count"><button class="btn sm" data-plan="less" data-g="${k}" title="One fewer">−</button><b>${g.n}</b><button class="btn sm" data-plan="more" data-g="${k}" title="One more">+</button></span>
      <button class="btn sm bad" data-plan="drop" data-g="${k}" title="Remove ${g.n > 1 ? 'all of them' : 'it'}">×</button>
    </div>
    ${g.ref && peek.has(g.key) ? `<div class="pl-sb" data-sbfor="${esc(g.ref)}"><p class="hint">Loading…</p></div>` : ''}</li>`;
}

/** The parts that change as creatures come and go: difficulty and the creature list. */
function renderPlanBody() {
  const f = current(), host = $('#planBody');
  if (!f || !host) return;
  const groups = R.fightGroups(f.creatures);
  host.innerHTML = difficultyHtml(f) + (groups.length
    ? `<ul class="planlist">${groups.map(g => groupHtml(f, g)).join('')}</ul>`
    : '<p class="hint">No creatures yet. Search for monsters below, add a custom one, or use Add to fight on a monster\'s stat block.</p>');
  host.querySelectorAll('[data-sbfor]').forEach(div => {
    const [kind, idx] = div.dataset.sbfor.split(':');
    getEntry(kind, idx).then(m => { div.innerHTML = statBlock(m); }, e => { div.innerHTML = `<p class="hint">Stat block unavailable: ${esc(e.message)}</p>`; });
  });
  const acts = $('#planActs');
  if (acts) acts.querySelector('[data-plan="combat"]').disabled = !f.creatures.length;
}

/** The planner, in the inspector. */
export function renderPlan(box) {
  const f = current();
  if (!f) { box.innerHTML = '<p class="hint">That fight no longer exists.</p>'; return; }
  const sure = S.confirm.delFight === f.id;
  box.innerHTML = `<div class="ins-head"><h2>Prepare a fight</h2><p>Saved as you go. The tracker isn't touched until you add the fight to combat.</p></div>
    <div class="blk"><label class="planname">Name<input class="field" id="planName" data-path="name" data-required data-commit value="${esc(f.name)}" autocomplete="off"></label></div>
    <div class="blk" id="planBody"></div>
    <div class="blk"><h4>Add monsters</h4>
      <div class="line"><div class="itemsearch grow"><input class="field wide" type="search" id="planSearch" placeholder="Search SRD and homebrew monsters" autocomplete="off"><ul class="results" id="planResults" hidden></ul></div>
      <label class="hint">Count <input class="field tiny" type="number" id="planQty" min="1" max="20" value="1"></label></div>
      <details class="quickadd"><summary>Add a custom creature</summary>
        <form id="planCustom" class="addgrid" autocomplete="off">
          <label class="w2">Name<input class="field" name="name" required placeholder="Bandit captain"></label>
          <label>Count<input class="field" name="count" type="number" min="1" max="20" value="1"></label>
          <label>Side<select class="field" name="kind"><option value="foe">Foe</option><option value="ally">Ally</option></select></label>
          <label>HP<input class="field" name="hp" type="number" min="1" required placeholder="65"></label>
          <label>AC<input class="field" name="ac" type="number" value="12"></label>
          <label>Init mod<input class="field" name="mod" type="number" value="0"></label>
          <label>XP<input class="field" name="xp" type="number" min="0" placeholder="0"></label>
          <button class="btn primary" type="submit">Add</button>
        </form></details></div>
    <div class="blk"><h4>Notes</h4><textarea class="field" id="planNotes" data-path="notes" rows="5" placeholder="Where and how it starts, terrain, tactics, treasure…">${esc(f.notes || '')}</textarea></div>
    <div class="acts" id="planActs"><button class="btn primary" data-plan="combat" title="Add these creatures to the tracker (uses Roll HP and Surprised from the library)">Add to combat</button>
      <button class="btn sm" data-plan="dup">Duplicate</button>
      <button class="btn sm bad" data-plan="del">${sure ? 'Click again to delete' : 'Delete'}</button></div>`;
  renderPlanBody();
}

// ---------- events ----------

let searchTimer;
async function search() {
  const ul = $('#planResults'), q = $('#planSearch')?.value.trim();
  if (!ul) return;
  if (!q) { ul.hidden = true; return; }
  try {
    const rows = await api(`/api/search?kind=monster&q=${encodeURIComponent(q)}&limit=30`);
    ul.innerHTML = rows.map(r => `<li><button class="r-main" data-planadd="${esc(r.idx)}"><span class="r-name">${esc(r.name)}</span><span class="r-meta">${esc(r.meta)}</span></button>
      <button class="add" data-planadd="${esc(r.idx)}" title="Add to this fight">+</button></li>`).join('') || `<li class="empty">Nothing matches "${esc(q)}".</li>`;
  } catch (e) { ul.innerHTML = `<li class="empty">${esc(e.message)}</li>`; }
  ul.hidden = false;
}

async function onClick(e) {
  const f = current();
  if (!f) return;
  const add = e.target.closest('[data-planadd]');
  if (add) {
    const qty = Math.max(1, Math.min(20, parseInt($('#planQty').value, 10) || 1));
    $('#planResults').hidden = true;
    return addMonsterToFight(f.id, add.dataset.planadd, qty);
  }
  if (!e.target.closest('.itemsearch') && $('#planResults')) $('#planResults').hidden = true;
  const b = e.target.closest('[data-plan]');
  if (!b) return;
  const a = b.dataset.plan, g = b.dataset.g && R.fightGroups(f.creatures).find(x => x.key === b.dataset.g);
  if (a !== 'del' && S.confirm.delFight === f.id) { S.confirm.delFight = null; $('#planActs [data-plan="del"]').textContent = 'Delete'; }
  if (a === 'peek' && g) { peek.has(g.key) ? peek.delete(g.key) : peek.add(g.key); return renderPlanBody(); }
  if (a === 'more' && g) f.creatures.splice(g.idx[g.idx.length - 1] + 1, 0, { ...f.creatures[g.idx[g.idx.length - 1]] });
  else if (a === 'less' && g) f.creatures.splice(g.idx[g.idx.length - 1], 1);
  else if (a === 'drop' && g) f.creatures = f.creatures.filter((_, i) => !g.idx.includes(i));
  else if (a === 'combat') {
    await flushFight(f.id);
    return hooks.addToCombat(f.id);
  } else if (a === 'dup') {
    await flushFight(f.id);
    return newFight(`${f.name} (copy)`, f.creatures.map(c => ({ ...c })));
  } else if (a === 'del') {
    if (S.confirm.delFight !== f.id) { S.confirm.delFight = f.id; b.textContent = 'Click again to delete'; return; }
    S.confirm.delFight = null;
    try { await api(`/api/saved-encounters/${f.id}`, { method: 'DELETE' }); } catch (err) { return toast(err.message); }
    plans.delete(f.id);
    S.saved = (S.saved || []).filter(x => x.id !== f.id);
    S.sel = null;
    toast(`Deleted "${f.name}".`);
    hooks.renderInspector();
    if (S.libKind === 'saved') hooks.refreshLibrary();
    return;
  } else return;
  changed(f);
  renderPlanBody();
}

function onChange(e) {
  const f = current();
  const sel = f && e.target.closest('[data-plankind]');
  if (!sel) return;
  const g = R.fightGroups(f.creatures).find(x => x.key === sel.dataset.plankind);
  if (!g) return;
  g.idx.forEach(i => { f.creatures[i].kind = sel.value; });
  changed(f);
  renderPlanBody();
}

function onSubmit(e) {
  const f = current();
  if (!f || e.target.id !== 'planCustom') return;
  e.preventDefault();
  const fd = new FormData(e.target), num = (k, d) => (Number.isFinite(parseInt(fd.get(k), 10)) ? parseInt(fd.get(k), 10) : d);
  const name = String(fd.get('name') || '').trim();
  if (!name) return toast('Name the creature first.');
  const n = Math.max(1, Math.min(20, num('count', 1)));
  const c = { name, kind: fd.get('kind') === 'ally' ? 'ally' : 'foe', max: Math.max(1, num('hp', 1)), ac: num('ac', 10), mod: num('mod', 0), xp: Math.max(0, num('xp', 0)) };
  for (let i = 0; i < n; i++) f.creatures.push({ ...c });
  e.target.reset();
  changed(f);
  renderPlanBody();
  toast(`Added ${n > 1 ? `${n}× ` : ''}${name} to "${f.name}".`);
}

/**
 * Wire the planner into the combat view.
 *  addToCombat(id)   adds a saved fight's creatures to the tracker
 *  refreshLibrary()  redraws the library list
 *  renderInspector() redraws the inspector
 */
export function initFights(h) {
  hooks = { ...hooks, ...h };
  const box = $('#inspect');
  box.addEventListener('click', onClick);
  box.addEventListener('change', onChange);
  box.addEventListener('submit', onSubmit);
  box.addEventListener('input', e => {
    if (e.target.id === 'planSearch') { clearTimeout(searchTimer); searchTimer = setTimeout(search, 140); }
  });
  box.addEventListener('keydown', e => {
    if (e.target.id === 'planSearch' && e.key === 'Escape') $('#planResults').hidden = true;
  });
  // name (saved when you leave the field) and notes (saved as you type)
  bindForm(box, {
    target: current,
    onEdit: path => {
      const f = current();
      if (path === 'name') {
        f.name = f.name.trim().slice(0, 120);
        if ((S.saved || []).some(x => x !== f && x.name.toLowerCase() === f.name.toLowerCase())) toast(`Another fight is also called "${f.name}": wiki links will find only one of them.`);
      }
      changed(f, { list: path === 'name' });
    },
  });
}
