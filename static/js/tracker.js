// The Combat view: library (left), initiative tracker (middle), inspector and roll log (right).

import * as R from './combat.js';
import { d20, roll } from './dice.js';
import { bindForm } from './forms.js';
import { switchView } from './nav.js';
import { classLine, derivedHtml } from './sheetview.js';
import { itemHtml, mdLite, monAC, monInit, monsterLine, spellHtml, statBlock } from './statblock.js';
import { S, api, charOp, ctx, getEntry, onCharSaved, saveEnc, scheduleCharSave } from './store.js';
import { clearLog, handleRollClick, pushLog, renderLog } from './ui.js';
import { $, esc, ordinal, toast, uid } from './util.js';

const KIND = { pc: 'PC', foe: 'Foe', ally: 'Ally' };
const blankSlots = () => Array.from({ length: 9 }, () => ({ max: 0, used: 0 }));

/** After a rule changed a combatant: show its messages and save what changed. */
function changed(c, msgs = []) {
  if (msgs.length) toast(msgs.join(' '));
  if (c && ctx.linked(c)) scheduleCharSave(c.charId);
  saveEnc();
}
const selected = () => (S.sel?.type === 'c' ? S.enc.c.find(x => x.id === S.sel.id) : null);
function amountFrom(sel) {
  const v = parseInt($(sel)?.value, 10);
  if (!(v > 0)) { toast('Enter an amount first.'); return 0; }
  return v;
}

// ---------- tracker ----------

function hpState(c) {
  if (R.hp(ctx, c) <= 0) return 'out';
  const r = R.hp(ctx, c) / R.maxHp(ctx, c);
  return r > 0.5 ? 'good' : r > 0.25 ? 'mid' : 'bad';
}
const chipHtml = (x, i) => `<button class="chip ${x.n === 'Concentrating' ? 'conc' : ''}" data-a="rmcond" data-i="${i}" title="Remove ${esc(x.n)}">${esc(x.n)}${x.d ? ` <b>${x.d}r</b>` : ''}<span aria-hidden="true">×</span></button>`;
function chipsHtml(c) {
  const exh = R.exhaustion(ctx, c);
  const exhChip = exh ? `<button class="chip exh" data-a="exhdown" title="Click to remove one level">Exhaustion ${exh} <b>−${2 * exh}</b><span aria-hidden="true">×</span></button>` : '';
  return c.conds.length || exh ? `<div class="chips">${exhChip}${c.conds.map(chipHtml).join('')}</div>` : '';
}

function rowHtml(c) {
  const v = R.vit(ctx, c), hp = R.hp(ctx, c), max = R.maxHp(ctx, c), temp = R.tempHp(ctx, c);
  const classes = [`cb k-${c.kind}`, c.id === S.enc.active && 'is-active', S.sel?.type === 'c' && S.sel.id === c.id && 'sel', hp <= 0 && 'is-down'].filter(Boolean).join(' ');
  const tag = hp <= 0 ? (c.kind === 'pc' ? 'Dying' : 'Down') : KIND[c.kind];
  return `<div class="${classes}" data-id="${c.id}">
    <input class="field init" type="number" id="init-${c.id}" data-f="init" value="${c.init}" aria-label="Initiative for ${esc(v.name)}">
    <div class="who"><div class="top-line"><span class="nm">${esc(v.name)}</span><span class="tag">${tag}</span></div>${chipsHtml(c)}</div>
    <span class="ac" title="Armor Class"><b>${v.ac}</b><small>AC</small></span>
    <div class="hp ${hpState(c)}"><div class="meter"><i style="width:${Math.max(0, Math.min(100, hp / max * 100))}%"></i>${temp ? `<em style="width:${Math.min(100, temp / max * 100)}%"></em>` : ''}</div>
      <span class="num">${hp}<small>/${max}</small>${temp ? ` <span class="tmp">+${temp}</span>` : ''}</span></div>
    <div class="quick"><input class="field" type="number" min="0" id="q-${c.id}" data-q placeholder="Dmg" aria-label="Amount for ${esc(v.name)}" title="Enter: damage · Shift+Enter: heal">
      <button class="btn bad" data-a="qdmg" title="Damage (Shift-click: from a critical hit)">−</button><button class="btn ok" data-a="qheal" title="Heal">+</button></div>
  </div>`;
}

export function renderTracker() {
  const L = R.sorted(S.enc);
  const cur = S.enc.c.find(c => c.id === S.enc.active);
  if (S.enc.active && !cur) S.enc.active = null;
  $('#round').textContent = S.enc.active ? S.enc.round : '–';
  $('#turnName').textContent = cur ? R.nameOf(ctx, cur) : 'Combat not started';
  const nx = cur && R.nextAfter(ctx, cur.id);
  $('#onDeck').textContent = cur ? (nx ? `On deck: ${R.nameOf(ctx, nx)}` : 'Only one combatant')
    : L.length ? `${L.length} combatant${L.length > 1 ? 's' : ''} ready.` : 'Add monsters from the library and your party from the Party tab.';
  $('#nextBtn').textContent = S.enc.active ? 'Next turn' : 'Start combat';
  $('#nextBtn').disabled = !L.length;
  $('#prevBtn').disabled = !S.enc.active;
  $('#endBtn').hidden = !S.enc.active;
  $('#skipDown').checked = !!S.enc.skip;
  $('#clearAll').textContent = S.confirm.clear ? 'Click again to clear' : 'Clear tracker';
  $('#list').innerHTML = L.length ? L.map(rowHtml).join('') : '<div class="empty-list">No combatants yet.</div>';
}

function step(dir) {
  const msgs = R.step(ctx, dir);
  S.sel = S.enc.active ? { type: 'c', id: S.enc.active } : S.sel;
  if (msgs.length) toast(msgs.join(' '));
  saveEnc(); renderTracker(); renderInspector();
}

// ---------- inspector ----------

let lastSelKey = '';
export async function renderInspector() {
  const box = $('#inspect');
  const sel = S.sel;
  const key = sel ? `${sel.type}:${sel.id ?? `${sel.kind}:${sel.idx}`}` : '';
  if (key !== lastSelKey) { box.scrollTop = 0; lastSelKey = key; }
  if (!sel) { box.innerHTML = '<p class="hint">Select a combatant, or a monster, spell or item from the library.</p>'; return; }
  if (sel.type === 'c') {
    const c = selected();
    if (!c) { S.sel = null; return renderInspector(); }
    box.innerHTML = combatantPanel(c);
    if (c.ref) {
      const [kind, idx] = c.ref.split(':');
      try {
        const m = await getEntry(kind, idx);
        if (S.sel?.id === c.id) $('#sbHost').innerHTML = statBlock(m);
      } catch (e) { const host = $('#sbHost'); if (host) host.innerHTML = `<p class="hint">Stat block unavailable: ${esc(e.message)}</p>`; }
    }
    return;
  }
  if (sel.type === 'char') {
    const ch = S.chars.get(sel.id);
    box.innerHTML = ch ? `<div class="ins-head"><h2>${esc(ch.sheet.name)}</h2><p>${esc(classLine(ch.sheet))}</p></div>${derivedHtml(ch, { compact: true })}` : '';
    return;
  }
  box.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const d = await getEntry(sel.kind, sel.idx);
    if (S.sel !== sel) return;                    // the selection changed while loading
    if (sel.kind === 'monster') {
      box.innerHTML = `<div class="ins-head"><h2>${esc(d.name)}</h2><p>${esc(monsterLine(d))}</p></div>
        <div class="line"><button class="btn primary" data-addmon="${esc(sel.idx)}">Add to combat</button><span class="hint">Uses the count and HP setting in the library.</span></div>${statBlock(d)}`;
    } else if (sel.kind === 'spell') box.innerHTML = spellHtml(d);
    else if (sel.kind === 'condition') box.innerHTML = `<div class="ins-head"><h2>${esc(d.name)}</h2></div><div class="prose">${mdLite(d.desc)}</div>`;
    else box.innerHTML = itemHtml(sel.kind, sel.idx, d, [...S.chars.values()]);
  } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
}

function combatantPanel(c) {
  const v = R.vit(ctx, c), ch = ctx.linked(c), hp = R.hp(ctx, c), temp = R.tempHp(ctx, c);
  const slots = v.slots || [];
  const editing = S.editingSlots.has(c.id);
  let slotHtml;
  if (editing) {
    slotHtml = `<div class="slotedit">${slots.map((s, i) => `<label>${ordinal(i + 1)}<input class="field" type="number" min="0" max="9" id="sl-${i}" data-path="slots.${i}.max" data-type="num" value="${s.max}"></label>`).join('')}</div>`;
  } else if (slots.some(s => s.max > 0)) {
    slotHtml = slots.map((s, i) => s.max ? `<div class="slot"><span class="lv">${ordinal(i + 1)}</span><span class="pips">${Array.from({ length: s.max }, (_, p) =>
      `<button class="pip ${p >= s.max - s.used ? 'spent' : ''}" data-a="slot" data-l="${i}" data-p="${p}" aria-label="${ordinal(i + 1)} level slot ${p + 1}"></button>`).join('')}</span></div>` : '').join('');
  } else slotHtml = '<p class="hint">No spell slots.</p>';

  const deathSaves = c.kind === 'pc' && hp <= 0 ? `<div class="blk"><h4>Death saves</h4><div class="ds">
      <div>Successes ${[1, 2, 3].map(k => `<button class="pip ${c.ds.s >= k ? 'on' : ''}" data-a="ds" data-t="s" data-v="${k}" aria-label="Success ${k}"></button>`).join('')}</div>
      <div class="f">Failures ${[1, 2, 3].map(k => `<button class="pip ${c.ds.f >= k ? 'on' : ''}" data-a="ds" data-t="f" data-v="${k}" aria-label="Failure ${k}"></button>`).join('')}</div>
      <button class="btn sm" data-a="dsroll">Roll death save</button></div></div>` : '';

  const sub = ch ? classLine(ch.sheet) : c.ref ? 'Monster' : KIND[c.kind];
  return `<div class="ins-head"><h2>${esc(v.name)}</h2><p>${esc(sub)} · initiative ${c.init}</p></div>
    <div class="blk"><h4>Hit points</h4>
      <div class="bigstat"><span class="v">${hp}<small>/${R.maxHp(ctx, c)}</small></span>${temp ? `<span class="v tmp">+${temp}<small> temp</small></span>` : ''}<span class="v">${v.ac}<small> AC</small></span></div>
      <div class="line"><input class="field" type="number" min="0" id="insAmt" placeholder="Amount" aria-label="Amount">
        <button class="btn bad" data-a="dmg" title="Shift-click: damage from a critical hit">Damage</button><button class="btn ok" data-a="heal">Heal</button><button class="btn" data-a="temp">Temp HP</button></div>
      ${ch ? '' : `<div class="line">
        <label class="hint">Max HP <input class="field tiny" type="number" min="1" id="insMax" data-path="max" data-type="num" value="${c.max}"></label>
        <label class="hint">AC <input class="field tiny" type="number" id="insAc" data-path="ac" data-type="num" value="${c.ac}"></label>
        <label class="hint">Name <input class="field" id="insName" data-path="name" data-required value="${esc(c.name)}"></label></div>`}
    </div>
    ${deathSaves}
    <div class="blk"><h4>Conditions</h4>
      ${chipsHtml(c)}
      <div class="line"><select class="field" id="insCond" aria-label="Condition">${S.meta.conditions.map(n => `<option>${n}</option>`).join('')}</select>
        <input class="field rounds" type="number" min="1" id="insRounds" placeholder="Rounds" aria-label="Rounds">
        <button class="btn" data-a="addcond">Add</button></div>
      <p class="hint">Blank rounds lasts until removed. Rounds count down at the end of this creature's turn. Adding Exhaustion raises its level by one.</p></div>
    <div class="blk"><h4>Spell slots ${ch ? '<span class="hint">from sheet</span>' : `<button class="link" data-a="editslots">${editing ? 'Done' : 'Edit'}</button>`}</h4>${slotHtml}</div>
    ${ch ? derivedHtml(ch, { compact: true }) : ''}
    <div id="sbHost"></div>
    <div class="blk"><h4>Notes</h4><textarea class="field" id="insNotes" data-path="notes" placeholder="Tactics, reminders, loot…">${esc(c.notes)}</textarea></div>
    <div class="acts">${ch ? '<button class="btn sm" data-a="opensheet">Open sheet</button>' : '<button class="btn sm" data-a="dup">Duplicate</button>'}
      <button class="btn sm bad" data-a="del">${S.confirm.del === c.id ? 'Click again to remove' : 'Remove'}</button></div>`;
}

// ---------- library ----------

let searchTimer;
async function doSearch() {
  const q = $('#libSearch').value.trim();
  const ul = $('#libResults');
  $('#libOpts').hidden = S.libKind !== 'monster';
  if (S.libKind === 'party') {
    const list = [...S.chars.values()].filter(c => c.sheet.name.toLowerCase().includes(q.toLowerCase()));
    ul.innerHTML = (list.length ? '<li><button class="btn sm" data-addparty>Add whole party</button></li>' : '')
      + (list.map(c => `<li><button class="r-main" data-openchar="${c.id}"><span class="r-name">${esc(c.sheet.name)}</span><span class="r-meta">${esc(classLine(c.sheet))} · AC ${c.derived.ac} · HP ${c.sheet.hp}/${c.sheet.max_hp}</span></button>
        <button class="add" data-addchar="${c.id}" title="Add to combat">+</button></li>`).join('') || '<li class="empty">No characters yet. Create them in the Party view.</li>');
    return;
  }
  const kinds = S.libKind === 'item' ? 'equipment,magic-item' : S.libKind;
  const total = kinds.split(',').reduce((n, k) => n + (S.srdCounts[k] || 0), 0);
  if (!total && S.libKind !== 'monster') { ul.innerHTML = '<li class="empty">No reference data yet. In a terminal, run <code>python import_srd.py</code>, then reload.</li>'; return; }
  try {
    const rows = await api(`/api/search?kind=${kinds}&q=${encodeURIComponent(q)}&limit=80`);
    ul.innerHTML = rows.map(r => {
      const isSel = S.sel?.type === 'entry' && S.sel.kind === r.kind && S.sel.idx === r.idx;
      return `<li class="${isSel ? 'sel' : ''}"><button class="r-main" data-open="${r.kind}:${r.idx}"><span class="r-name">${esc(r.name)}</span><span class="r-meta">${esc(r.meta)}</span></button>
        ${r.kind === 'monster' ? `<button class="add" data-addmon="${r.idx}" title="Add to combat">+</button>` : ''}</li>`;
    }).join('') || (total ? `<li class="empty">Nothing matches "${esc(q)}".</li>`
      : '<li class="empty">No SRD monsters yet: run <code>python import_srd.py</code>. Homebrew creatures from the Bestiary appear here too.</li>');
  } catch (e) { ul.innerHTML = `<li class="empty">${esc(e.message)}</li>`; }
}

export async function addMonster(idx) {
  const m = await getEntry('monster', idx);
  const qty = Math.max(1, Math.min(20, parseInt($('#libQty').value, 10) || 1));
  const rollHp = $('#libRollHp').checked;
  const initBonus = monInit(m), dexMod = m.modifiers?.dexterity ?? initBonus;
  const names = R.groupNames(S.enc, m.name, qty);
  const rolls = names.map((name, i) => {
    const hp = rollHp ? Math.max(1, roll(m.hit_dice || '')?.total || m.hit_points) : m.hit_points;
    const init = d20() + initBonus;
    S.enc.c.push({ id: uid(), ref: `monster:${idx}`, name, kind: 'foe', init, mod: dexMod, ac: monAC(m), hp, max: hp, temp: 0, exh: 0,
      conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', seq: Date.now() + i / 100 });
    return init;
  });
  saveEnc(); renderTracker();
  toast(`Added ${qty > 1 ? qty + '× ' : ''}${m.name} (initiative ${rolls.join(', ')}).`);
}

/** Add a party member; returns "Name 17" (their initiative), or null if they're already in the fight. */
export function addChar(id) {
  const ch = S.chars.get(id);
  if (S.enc.c.some(c => c.charId === id)) { toast(`${ch.sheet.name} is already in the fight.`); return null; }
  const init = d20() + ch.derived.initiative;
  S.enc.c.push({ id: uid(), charId: id, name: ch.sheet.name, kind: 'pc', init, mod: ch.derived.mods.dex, ac: ch.derived.ac,
    hp: ch.sheet.hp, max: ch.sheet.max_hp, temp: 0, exh: 0, conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', seq: Date.now() + Math.random() });
  saveEnc(); renderTracker();
  return `${ch.sheet.name} ${init}`;
}

// ---------- events ----------

function onListClick(e) {
  const row = e.target.closest('.cb');
  const c = row && S.enc.c.find(x => x.id === row.dataset.id);
  if (!c) return;
  const b = e.target.closest('[data-a]');
  if (b) {
    const a = b.dataset.a;
    if (a === 'qdmg' || a === 'qheal') {
      const v = amountFrom(`#q-${c.id}`);
      if (!v) return;
      changed(c, a === 'qdmg' ? R.damage(ctx, c, v, e.shiftKey) : R.heal(ctx, c, v));
    } else if (a === 'rmcond') { c.conds.splice(+b.dataset.i, 1); changed(c); }
    else if (a === 'exhdown') changed(c, R.setExhaustion(ctx, c, R.exhaustion(ctx, c) - 1));
    renderTracker();
    if (S.sel?.id === c.id) renderInspector();
    return;
  }
  if (e.target.closest('input')) return;
  S.confirm.del = null;
  S.sel = { type: 'c', id: c.id };
  renderTracker(); renderInspector();
}

async function onInspectClick(e) {
  if (handleRollClick(e)) return;
  const addBtn = e.target.closest('[data-addmon]');
  if (addBtn) return addMonster(addBtn.dataset.addmon);
  const give = e.target.closest('[data-give]');
  if (give) {
    const [kind, idx] = give.dataset.give.split(':');
    const id = +$('#giveTo').value, ch = S.chars.get(id);
    const item = await api(`/api/item-template/${kind}/${idx}`);
    ch.sheet.inventory.push(item);
    await charOp(id);
    return toast(`${item.name} added to ${ch.sheet.name}'s inventory.${item.notes ? ' ' + item.notes : ''}`);
  }
  const b = e.target.closest('[data-a]');
  const c = selected();
  if (!b || !c) return;
  const a = b.dataset.a;
  if (a !== 'del') S.confirm.del = null;
  switch (a) {
    case 'dmg': { const n = amountFrom('#insAmt'); if (n) changed(c, R.damage(ctx, c, n, e.shiftKey)); break; }
    case 'heal': { const n = amountFrom('#insAmt'); if (n) changed(c, R.heal(ctx, c, n)); break; }
    case 'temp': { const n = amountFrom('#insAmt'); if (n) changed(c, R.giveTemp(ctx, c, n)); break; }
    case 'addcond': changed(c, R.addCondition(ctx, c, $('#insCond').value, parseInt($('#insRounds').value, 10))); break;
    case 'rmcond': c.conds.splice(+b.dataset.i, 1); changed(c); break;
    case 'exhdown': changed(c, R.setExhaustion(ctx, c, R.exhaustion(ctx, c) - 1)); break;
    case 'slot': R.toggleSlot(R.vit(ctx, c).slots[+b.dataset.l], +b.dataset.p); changed(c); break;
    case 'editslots': S.editingSlots.has(c.id) ? S.editingSlots.delete(c.id) : S.editingSlots.add(c.id); break;
    case 'ds': { const k = b.dataset.t, n = +b.dataset.v; c.ds[k] = c.ds[k] === n ? n - 1 : n; changed(c); break; }
    case 'dsroll': {
      const die = d20();
      const r = R.deathSave(ctx, c, die);
      pushLog(`${R.nameOf(ctx, c)} death save: ${r.outcome}`, { total: r.total, detail: r.pen ? `[${die}] − ${r.pen} exhaustion` : `[${die}]` }, r.cls);
      changed(c, r.msgs);
      break;
    }
    case 'dup': {
      const n = JSON.parse(JSON.stringify(c));
      Object.assign(n, { id: uid(), seq: c.seq + 0.001, hp: n.max, temp: 0, exh: 0, conds: [], ds: { s: 0, f: 0 } });
      n.name = R.groupNames(S.enc, c.name.replace(/\s+\d+$/, ''), 1)[0];
      S.enc.c.push(n); saveEnc();
      break;
    }
    case 'del':
      if (S.confirm.del === c.id) {
        R.removeCombatants(ctx, [c.id]);
        S.sel = null; S.confirm.del = null; saveEnc();
      } else S.confirm.del = c.id;
      break;
    case 'opensheet':
      S.currentChar = c.charId;
      return switchView('party');
  }
  renderTracker(); renderInspector();
}

function onLibraryClick(e) {
  const open = e.target.closest('[data-open]');
  if (open) {
    const [kind, idx] = open.dataset.open.split(':');
    S.sel = { type: 'entry', kind, idx };
    document.querySelectorAll('#libResults li').forEach(li => li.classList.toggle('sel', li.contains(open)));
    renderTracker();
    return renderInspector();
  }
  const add = e.target.closest('[data-addmon]');
  if (add) return addMonster(add.dataset.addmon);
  const addC = e.target.closest('[data-addchar]');
  if (addC) { const r = addChar(+addC.dataset.addchar); if (r) toast(`Initiative: ${r}.`); return; }
  const openC = e.target.closest('[data-openchar]');
  if (openC) { S.sel = { type: 'char', id: +openC.dataset.openchar }; return renderInspector(); }
  if (e.target.closest('[data-addparty]')) {
    const r = [...S.chars.keys()].map(addChar).filter(Boolean);
    if (r.length) toast(`Initiative: ${r.join(', ')}.`);
  }
}

function onAddForm(e) {
  e.preventDefault();
  const name = $('#a-name').value.trim();
  const n = Math.max(1, Math.min(20, parseInt($('#a-count').value, 10) || 1));
  const kind = $('#a-kind').value, md = parseInt($('#a-mod').value, 10) || 0;
  const initRaw = $('#a-init').value.trim(), hpStr = $('#a-hp').value, ac = parseInt($('#a-ac').value, 10) || 10;
  if (!roll(hpStr)) return toast('HP needs a number or dice, like 45 or 6d8+18.');
  R.groupNames(S.enc, name, n).forEach((nm, i) => {
    const hp = Math.max(1, roll(hpStr).total);
    S.enc.c.push({ id: uid(), name: nm, kind, init: initRaw !== '' ? parseInt(initRaw, 10) : d20() + md, mod: md,
      ac, hp, max: hp, temp: 0, exh: 0, conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', seq: Date.now() + i / 100 });
  });
  saveEnc(); renderTracker();
  toast(`Added ${n > 1 ? n + '× ' : ''}${name}.`);
  $('#a-name').value = ''; $('#a-init').value = '';
}

export function initCombat() {
  $('#list').addEventListener('click', onListClick);
  $('#list').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('[data-q]')) return;
    const c = S.enc.c.find(x => x.id === e.target.closest('.cb').dataset.id);
    const v = parseInt(e.target.value, 10);
    if (!(v > 0) || !c) return;
    changed(c, e.shiftKey ? R.heal(ctx, c, v) : R.damage(ctx, c, v));
    renderTracker();
    if (S.sel?.id === c.id) renderInspector();
    $(`#q-${c.id}`)?.focus();
  });
  $('#list').addEventListener('change', e => {
    if (!e.target.matches('[data-f="init"]')) return;
    const c = S.enc.c.find(x => x.id === e.target.closest('.cb').dataset.id);
    c.init = parseInt(e.target.value, 10) || 0;
    saveEnc(); renderTracker();
  });

  $('#inspect').addEventListener('click', onInspectClick);
  $('#inspect').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'insAmt') { e.preventDefault(); toast('Choose Damage, Heal or Temp HP.'); }
  });
  // name, max HP, AC and slot fields (shown for monsters and NPCs) and notes (everyone)
  bindForm($('#inspect'), {
    target: selected,
    onEdit: path => {
      const c = selected();
      if (path === 'max') {
        c.max = Math.max(1, c.max);
        c.hp = Math.min(c.hp, c.max);
      }
      const slot = path.match(/^slots\.(\d+)\.max$/);
      if (slot) {
        const s = c.slots[+slot[1]];
        s.max = Math.max(0, Math.min(9, s.max));
        s.used = Math.min(s.used, s.max);
      }
      saveEnc();
      if (path !== 'notes') renderTracker();
    },
  });

  $('#libTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-lib]');
    if (!b) return;
    S.libKind = b.dataset.lib;
    document.querySelectorAll('#libTabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#libSearch').placeholder = { monster: 'Search monsters', spell: 'Search spells', item: 'Search weapons, armor, magic items', party: 'Search your party' }[S.libKind];
    doSearch();
  });
  $('#libSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 140); });
  $('#libResults').addEventListener('click', onLibraryClick);

  $('#nextBtn').onclick = () => step(1);
  $('#prevBtn').onclick = () => step(-1);
  $('#endBtn').onclick = () => { R.endCombat(S.enc); saveEnc(); renderTracker(); toast('Combat ended.'); };
  $('#clearFoes').onclick = () => {
    R.removeCombatants(ctx, S.enc.c.filter(c => c.kind !== 'pc').map(c => c.id));
    if (S.sel?.type === 'c' && !selected()) S.sel = null;
    saveEnc(); renderTracker(); renderInspector();
  };
  $('#clearAll').onclick = () => {
    if (S.confirm.clear) {
      S.enc = { round: 1, active: null, skip: S.enc.skip, c: [], ticks: [] };
      S.sel = null; S.confirm.clear = false;
      saveEnc(); renderInspector();
    } else {
      S.confirm.clear = true;
      setTimeout(() => { S.confirm.clear = false; renderTracker(); }, 3000);
    }
    renderTracker();
  };
  $('#skipDown').onchange = e => { S.enc.skip = e.target.checked; saveEnc(); renderTracker(); };
  $('#addForm').addEventListener('submit', onAddForm);
  $('#rollForm').addEventListener('submit', e => {
    e.preventDefault();
    const x = $('#rollExpr').value.trim();
    if (!x) return;
    const r = roll(x);
    if (!r) return toast(`Can't roll "${x}". Try something like 2d6+3.`);
    pushLog(x, r, /d20/.test(x) && r.nat === 20 ? 'crit' : /d20/.test(x) && r.nat === 1 ? 'fumble' : '');
  });
  $('#clearLog').onclick = clearLog;

  // a PC's sheet changed (from here or the Party view): refresh what shows it
  onCharSaved(id => {
    if (!S.enc.c.some(c => c.charId === id)) return;
    renderTracker();
    if (S.sel?.type === 'c' && S.view === 'combat' && !document.activeElement?.closest('#inspect')) renderInspector();
  });
}

export function showCombat() {
  renderTracker(); renderInspector(); doSearch(); renderLog();
}

export { step as stepTurn };
