// The Combat view: library (left), initiative tracker (middle), inspector and roll log (right).

import * as R from './combat.js';
import { d20, doubleDice, parseAmount, roll } from './dice.js';
import { addMonsterToFight, initFights, loadSaved, newFight, openFight, renderPlan } from './fights.js';
import { bindForm } from './forms.js';
import { createHistory } from './history.js';
import { switchView } from './nav.js';
import { classLine, derivedHtml } from './sheetview.js';
import { itemHtml, mdLite, monAC, monInit, monsterLine, spellHtml, statBlock } from './statblock.js';
import { S, api, charOp, ctx, getEntry, onCharSaved, onResourceEvent, saveEnc, scheduleCharSave } from './store.js';
import { clearLog, handleRollClick, pushLog, renderLog } from './ui.js';
import { $, esc, mod as abilityMod, ordinal, signed, toast, uid } from './util.js';
import { showMentions } from './wiki.js';

const KIND = { pc: 'PC', foe: 'Foe', ally: 'Ally' };
const blankSlots = () => Array.from({ length: 9 }, () => ({ max: 0, used: 0 }));

/** After a rule changed a combatant: show its messages and save what changed. */
function changed(c, msgs = []) {
  if (msgs.length) toast(msgs.join(' '));
  // a rule used up a once-per-rest feature (Relentless Endurance...): spend it on the sheet
  for (const x of S.enc.c) {
    const ch = x.spent?.length && ctx.linked(x);
    if (ch) { for (const k of x.spent) ch.sheet.resources_used[k] = (ch.sheet.resources_used[k] || 0) + 1; scheduleCharSave(x.charId); }
    delete x.spent;
  }
  if (c && ctx.linked(c)) scheduleCharSave(c.charId);
  saveEnc();
}
const selected = () => (S.sel?.type === 'c' ? S.enc.c.find(x => x.id === S.sel.id) : null);

/** The amount in a damage or healing box: "12", "12+7" or "2d6+3" (dice are rolled and logged). 0 if invalid. */
function amountOf(text, what = 'Amount') {
  if (!String(text ?? '').trim()) { toast('Enter an amount first.'); return 0; }
  const r = parseAmount(text);
  if (!r) { toast(`"${text}" isn't an amount. Try 12, 12+7 or 2d6+3.`); return 0; }
  if (r.rolled) pushLog(`${what}: ${text}`, r);
  return r.total;
}
const amountFrom = (sel, what) => amountOf($(sel)?.value, what);

// ---------- undo ----------
// A snapshot holds the encounter plus the combat fields of every linked character sheet
// (only those, so undoing a hit never reverts edits made in the Party view). Class resources and
// Heroic Inspiration are in it because combat actions spend them (Second Wind, Lay on Hands, Focus...).

const fightFields = sh => JSON.parse(JSON.stringify({ hp: sh.hp, temp_hp: sh.temp_hp, exhaustion: sh.exhaustion,
  inspiration: !!sh.inspiration, slots: sh.slots || [], resources_used: sh.resources_used || {} }));
const history = createHistory({
  capture: () => ({
    enc: JSON.parse(JSON.stringify(S.enc)),
    sheets: S.enc.c.filter(c => ctx.linked(c)).map(c => [c.charId, fightFields(ctx.linked(c).sheet)]),
  }),
  restore: snap => {
    S.enc = snap.enc;
    for (const [id, f] of snap.sheets) {
      const ch = S.chars.get(id);
      if (ch) { Object.assign(ch.sheet, f); scheduleCharSave(id); }
    }
    for (const id of S.targets.keys()) if (!S.enc.c.some(c => c.id === id)) S.targets.delete(id);
    if (S.sel?.type === 'c' && !selected()) S.sel = null;
    saveEnc();
  },
});
/** Call right before an action changes the fight, so Ctrl+Z can take it back. */
const remember = label => history.remember(label);
const who = c => R.nameOf(ctx, c);

export function undo(dir = -1) {
  const label = dir < 0 ? history.undo() : history.redo();
  if (!label) return toast(dir < 0 ? 'Nothing to undo.' : 'Nothing to redo.');
  toast(`${dir < 0 ? 'Undid' : 'Redid'}: ${label}.`);
  renderTracker(); renderInspector();
}
function renderUndo() {
  const u = history.undoLabel, r = history.redoLabel;
  Object.assign($('#undoBtn'), { disabled: !u, title: u ? `Undo: ${u} (Ctrl+Z)` : 'Nothing to undo' });
  Object.assign($('#redoBtn'), { disabled: !r, title: r ? `Redo: ${r} (Ctrl+Shift+Z)` : 'Nothing to redo' });
}

/** Damage with a resistance setting: returns the rule messages plus a note when the amount changed. */
function hurt(c, amount, mod, crit, type = '') {
  const n = R.adjustDamage(R.reduceDamage(c, type, amount), { mod });
  const note = mod !== 'normal' ? [`${R.DAMAGE_MODS[mod] || 'Resistant and vulnerable'}: ${who(c)} takes ${n}.`] : [];
  return n > 0 ? [...note, ...R.damage(ctx, c, n, crit)] : note;
}

// ---------- tracker ----------

function hpState(c) {
  if (R.hp(ctx, c) <= 0) return 'out';
  const r = R.hp(ctx, c) / R.maxHp(ctx, c);
  return r > 0.5 ? 'good' : r > 0.25 ? 'mid' : 'bad';
}
/** "until the end of Mira's turn" for a timer tied to another creature, or '' */
function timerSource(x) {
  const src = x.src && S.enc.c.find(c => c.id === x.src);
  return src ? { name: R.nameOf(ctx, src), at: x.at === 'start' ? 'start' : 'end' } : null;
}
function chipHtml(x, i) {
  const src = x.d ? timerSource(x) : null;
  const from = x.src && S.enc.c.find(c => c.id === x.src);
  const when = x.d ? (src ? `${x.d} round${x.d > 1 ? 's' : ''}, counting down at the ${src.at} of ${src.name}'s turn` : `${x.d} round${x.d > 1 ? 's' : ''}, counting down at the end of its own turn`) : 'until removed';
  const notes = [when, x.conc && from && `ends if ${who(from)} loses concentration`,
    x.save && `${x.save.ab.toUpperCase()} save DC ${x.save.dc} at the ${x.save.when} of each of its turns ends it`,
    x.n === 'Concentrating' && 'removing it ends every effect tied to this concentration'].filter(Boolean).join('; ');
  const small = [x.n === 'Concentrating' && x.spell, src && `${src.at} of ${src.name}`, x.save && `${x.save.ab.toUpperCase()} ${x.save.dc}`, x.conc && from && `${who(from)}'s conc.`].filter(Boolean).join(' · ');
  return `<button class="chip ${x.n === 'Concentrating' ? 'conc' : ''}" data-a="rmcond" data-i="${i}" title="${esc(x.n)}: ${esc(notes)}. Click to remove.">${esc(x.n)}${x.d ? ` <b>${x.d}r</b>` : ''}${small ? `<small class="src">${esc(small)}</small>` : ''}<span aria-hidden="true">×</span></button>`;
}

// ---------- saving throw prompts (repeated saves, concentration) ----------

/** A creature's save bonus for ability `ab` ('wis'), or null when unknown (custom creatures). */
function saveBonus(c, ab) {
  const ch = ctx.linked(c);
  if (ch) return ch.derived.saves?.[ab]?.bonus == null ? null : ch.derived.saves[ab].bonus + R.auraSaveBonus(ctx, c);   // Exhaustion included
  const m = c.sb || (c.ref && S.entryCache.get(c.ref));
  if (!m) return null;
  const long = S.meta.ability_long[ab];
  const v = (m.saving_throws_all || {})[long] ?? (m.saving_throws || {})[long] ?? (m.modifiers || {})[long]
    ?? abilityMod((m.ability_scores || {})[long] ?? 10);
  return v - 2 * R.exhaustion(ctx, c) + R.auraSaveBonus(ctx, c);
}

function renderPrompts() {
  const box = $('#prompts'), list = (S.enc.prompts || []).map(p => ({ p, c: S.enc.c.find(x => x.id === p.cid) })).filter(x => x.c);
  box.hidden = !list.length;
  for (const { c } of list) if (c.ref && !S.entryCache.has(c.ref)) getEntry(...c.ref.split(':')).then(renderTracker, () => {});
  box.innerHTML = list.map(({ p, c }) => {
    if (p.kind === 'mark') {
      const from = S.enc.c.find(x => x.id === p.from);
      const to = S.enc.c.filter(x => x.id !== p.from && x.id !== c.id && R.lifeState(ctx, x) !== 'dead' && !(x.kind !== 'pc' && R.hp(ctx, x) <= 0));
      return `<div class="prompt" data-pid="${p.id}"><span><b>${esc(who(c))}</b>: ${esc(p.n)} on ${esc(from ? who(from) : 'a fallen creature')} can move (Bonus Action)</span>
        <select class="field" data-p-to aria-label="New target">${to.map(x => `<option value="${x.id}">${esc(who(x))}</option>`).join('')}</select>
        <button class="btn sm ok" data-p="move">Move</button><button class="btn sm" data-p="no">Not now</button></div>`;
    }
    const b = saveBonus(c, p.ab), rule = R.saveRule(c, p.ab);
    const what = p.kind === 'conc' ? 'to keep concentration' : `to end ${esc(p.n)}`;
    const [yes, no] = p.kind === 'conc' ? ['Kept', 'Lost'] : ['Succeeded', 'Failed'];
    const roll = rule.fail ? `<button class="btn sm" data-p="roll" title="${esc(rule.fail)}: fails ${p.ab.toUpperCase()} saves automatically">Fails automatically (${esc(rule.fail)})</button>`
      : b != null ? `<button class="btn sm" data-p="roll" title="Roll d20 ${signed(b)}${saveMode(rule)} and resolve">Roll ${signed(b)}${saveMode(rule)}</button>` : '';
    return `<div class="prompt" data-pid="${p.id}"><span><b>${esc(who(c))}</b>: ${p.ab.toUpperCase()} save DC ${p.dc} ${what}</span>
      ${roll}
      <button class="btn sm ok" data-p="yes">${yes}</button><button class="btn sm bad" data-p="no">${no}</button></div>`;
  }).join('');
}

/** The d20s a save rolled, for the log: "[7,15 lower]" with Disadvantage, "[7,15 higher]" with Advantage. */
const saveDice = (dice, rule) => (rule.dis ? `[${dice.join(',')} lower]` : rule.adv ? `[${dice.join(',')} higher]` : `[${dice[0]}]`);
/** " with Advantage" / " with Disadvantage" for a save button's label. */
const saveMode = rule => (rule.dis ? ' with Disadvantage' : rule.adv ? ' with Advantage' : '');

/** Roll the Bless / Bane dice a creature adds to an attack roll or save. Returns { total, detail }. */
function rollExtras(c) {
  const rolls = R.rollMods(c).map(d => ({ d, r: roll(d) })).filter(x => x.r);
  return { total: rolls.reduce((n, x) => n + x.r.total, 0), detail: rolls.map(x => ` ${x.r.total < 0 ? '−' : '+'} ${Math.abs(x.r.total)} (${x.d.replace('-', '')}${x.d.startsWith('-') ? ' Bane' : ' Bless'})`).join('') };
}

function onPromptClick(e) {
  const b = e.target.closest('[data-p]'), row = e.target.closest('[data-pid]');
  const p = row && (S.enc.prompts || []).find(x => x.id === row.dataset.pid);
  if (!b || !p) return;
  const c = S.enc.c.find(x => x.id === p.cid);
  if (p.kind === 'mark') {
    remember(`Move ${p.n}`);
    changed(c, R.resolvePrompt(ctx, p.id, b.dataset.p === 'move' ? row.querySelector('[data-p-to]')?.value : false));
    return (renderTracker(), renderInspector());
  }
  let ok = b.dataset.p === 'yes';
  if (b.dataset.p === 'roll') {
    const rule = R.saveRule(c, p.ab), bonus = saveBonus(c, p.ab) ?? 0, dice = [d20(), d20()];
    const ex = rollExtras(c);
    const r = R.rollSave({ dice, bonus, dc: p.dc, rule, extra: ex.total });
    ok = r.ok;
    if (r.auto) toast(`${who(c)} fails automatically (${r.auto}).`);
    else pushLog(`${who(c)} ${p.ab.toUpperCase()} save vs DC ${p.dc}: ${ok ? 'success' : 'failure'}`,
      { total: r.total, detail: `${saveDice(dice, rule)} ${signed(bonus)}${ex.detail}` }, r.die === 20 ? 'crit' : r.die === 1 ? 'fumble' : '');
  }
  remember(`${who(c)}'s ${p.kind === 'conc' ? 'concentration' : p.n} save`);
  changed(c, R.resolvePrompt(ctx, p.id, ok));
  S.enc.c.forEach(x => { if (ctx.linked(x)) scheduleCharSave(x.charId); });
  renderTracker(); renderInspector();
}
function chipsHtml(c) {
  const exh = R.exhaustion(ctx, c);
  const exhChip = exh ? `<button class="chip exh" data-a="exhdown" title="Click to remove one level">Exhaustion ${exh} <b>−${2 * exh}</b><span aria-hidden="true">×</span></button>` : '';
  return c.conds.length || exh ? `<div class="chips">${exhChip}${c.conds.map(chipHtml).join('')}</div>` : '';
}

/** Pips for a { max, used } pool: available ones first, spent ones hollow. Clicking spends or restores one. */
const pipsHtml = (pool, a, what, extra = '') => `<span class="pips">${Array.from({ length: pool.max }, (_, p) =>
  `<button class="pip ${p >= pool.max - pool.used ? 'spent' : ''}" data-a="${a}" data-p="${p}"${extra} aria-label="${what} ${p + 1}"></button>`).join('')}</span>`;

function resourcesHtml(c) {
  const r = c.res;
  const rxLine = `<div class="resline"><span>Reaction</span><button class="btn sm ${c.rx ? '' : 'ok'}" data-a="rx">${c.rx ? 'Used' : 'Available'}</button>
    <span class="hint">Comes back at the start of its turn.</span></div>`;
  if (!r) return `<div class="blk"><h4>Turn resources</h4>${rxLine}</div>`;
  const maxField = (path, v, label) => `<label class="hint">of <input class="field tiny" type="number" min="0" max="9" data-path="${path}" data-type="num" value="${v}" aria-label="${label}"></label>`;
  const lines = [rxLine];
  if (r.leg) lines.push(`<div class="resline"><span>Legendary actions</span>${pipsHtml(r.leg, 'leg', 'Legendary action')}${maxField('res.leg.max', r.leg.max, 'Legendary actions per round')}
    <span class="hint">Back each turn. One after another creature's turn.</span></div>`);
  if (r.lr) lines.push(`<div class="resline"><span>Legendary Resistance</span>${pipsHtml(r.lr, 'lr', 'Legendary Resistance')}${maxField('res.lr.max', r.lr.max, 'Legendary Resistance per day')}
    <span class="hint">Per day: turn a failed save into a success.</span></div>`);
  r.uses.forEach((u, i) => lines.push(u.kind === 'recharge'
    ? `<div class="resline"><span>${esc(u.name)} <small class="hint">Recharge ${u.p}${u.p < 6 ? '–6' : ''}</small></span>
        <button class="btn sm ${u.used ? 'bad' : 'ok'}" data-a="use" data-i="${i}" title="Click to mark ${u.used ? 'ready' : 'used'}">${u.used ? 'Spent' : 'Ready'}</button>
        ${u.used ? `<button class="btn sm" data-a="recharge" data-i="${i}" title="Roll a d6 now">Roll recharge</button>` : '<span class="hint">Rolls a d6 at the start of its turn once spent.</span>'}</div>`
    : `<div class="resline"><span>${esc(u.name)} <small class="hint">${u.max}/Day</small></span>${pipsHtml(u, 'day', u.name, ` data-i="${i}"`)}</div>`));
  return `<div class="blk"><h4>Turn resources</h4>${lines.join('')}</div>`;
}

function rowHtml(c) {
  const v = R.vit(ctx, c), hp = R.hp(ctx, c), max = R.maxHp(ctx, c), temp = R.tempHp(ctx, c);
  const turn = R.turnState(S.enc, c), life = R.lifeState(ctx, c);
  const classes = [`cb k-${c.kind}`, c.id === S.enc.active && 'is-active', turn === 'done' && 'is-done', S.sel?.type === 'c' && S.sel.id === c.id && 'sel', (hp <= 0 || life === 'dead') && 'is-down', life === 'dead' && 'is-dead'].filter(Boolean).join(' ');
  const tag = life ? { dead: 'Dead', stable: 'Stable', dying: 'Dying', down: 'Down' }[life] : KIND[c.kind];
  const turnTag = turn === 'now' ? '<span class="turn now">Their turn</span>' : turn === 'done' ? '<span class="turn done" title="Already acted this round, or joined after its initiative had passed">✓ Acted</span>' : '';
  const insp = c.kind === 'pc' ? `<button class="insp ${R.inspired(ctx, c) ? 'on' : ''}" data-a="insp" title="Heroic Inspiration: ${R.inspired(ctx, c) ? 'has it (click when spent)' : 'none (click to give)'}">★${R.inspired(ctx, c) ? ' Inspired' : ''}</button>` : '';
  const rx = `<button class="rx ${c.rx ? 'used' : ''}" data-a="rx" title="Reaction ${c.rx ? 'used (comes back at the start of its turn)' : 'available'}. Click to toggle." aria-label="Reaction ${c.rx ? 'used' : 'available'}">Reaction</button>`;
  const leg = c.res?.leg ? `<span class="legmini" title="Legendary actions left this round"><small>Legendary</small>${pipsHtml(c.res.leg, 'leg', 'Legendary action')}</span>` : '';
  const spent = (c.res?.uses || []).filter(u => u.kind === 'recharge' && u.used).map(u => `<span class="spent" title="Rolls to recharge at the start of its turn">${esc(u.name)} spent</span>`).join('');
  return `<div class="${classes}" data-id="${c.id}">
    <input class="field init" type="number" id="init-${c.id}" data-f="init" value="${c.init}" aria-label="Initiative for ${esc(v.name)}">
    <div class="who"><div class="top-line"><span class="nmwrap"><input type="checkbox" class="pick" data-pick${S.targets.has(c.id) ? ' checked' : ''} aria-label="Target ${esc(v.name)}" title="Tick to include in area damage"><span class="nm" title="${esc(v.name)}">${esc(v.name)}</span></span>${turnTag}<span class="tag">${tag}</span></div><div class="resrow">${rx}${insp}${leg}${spent}</div>${chipsHtml(c)}</div>
    <span class="ac${R.acOf(ctx, c) !== v.ac ? ' up' : ''}" title="Armor Class${R.acOf(ctx, c) !== v.ac ? ` (${v.ac} base, raised by a spell)` : ''}"><b>${R.acOf(ctx, c)}</b><small>AC</small></span>
    <div class="hp ${hpState(c)}"><div class="meter"><i style="width:${Math.max(0, Math.min(100, hp / max * 100))}%"></i>${temp ? `<em style="width:${Math.min(100, temp / max * 100)}%"></em>` : ''}</div>
      <span class="num">${hp}<small>/${max}</small>${temp ? ` <span class="tmp">+${temp}</span>` : ''}</span></div>
    <div class="quick"><input class="field" inputmode="text" autocomplete="off" id="q-${c.id}" data-q placeholder="Dmg" aria-label="Amount for ${esc(v.name)}" title="12, 12+7 or 2d6+3 · Enter: damage · Shift+Enter: heal">
      <button class="btn bad" data-a="qdmg" title="Damage (Shift-click: from a critical hit)">−</button><button class="btn ok" data-a="qheal" title="Heal">+</button></div>
  </div>`;
}

/** A party member's sheet decides their defenses, state-dependent AC and Danger Sense in combat. */
function syncFromSheets() {
  for (const c of S.enc.c) {
    const d = ctx.linked(c)?.derived;
    if (!d) continue;
    const def = d.defenses || {};
    c.def = Object.values(def).some(l => l.length) ? { vuln: [], ...def } : null;
    c.cdef = d.cdef || [];
    c.acCond = d.ac_cond || [];
    c.dexSaveAdv = d.dex_save_adv || null;
    c.heroicWarrior = !!d.heroic_warrior;
    c.dr = d.dr || [];
    c.saveAdv = d.save_adv || [];
    // drop-to-1 features with a use left on the sheet right now (it may be ahead of the last save)
    const left = k => { const r = d.resources.find(x => x.key === k); return r && (ctx.linked(c).sheet.resources_used[k] || 0) < r.max; };
    c.cheatDeath = (d.cheat_death || []).filter(x => left(x.key));
  }
}

export function renderTracker() {
  syncFromSheets();
  const L = R.sorted(S.enc);
  const cur = S.enc.c.find(c => c.id === S.enc.active);
  if (S.enc.active && !cur) S.enc.active = null;
  $('#round').textContent = S.enc.active ? S.enc.round : '–';
  $('#turnName').textContent = cur ? `${R.nameOf(ctx, cur)}'s turn` : 'Combat not started';
  const nx = cur && R.nextAfter(ctx, cur.id);
  const left = cur ? L.filter(c => R.turnState(S.enc, c) === 'next' && !R.skippable(ctx, c)).length : 0;
  $('#onDeck').textContent = cur ? (nx ? `On deck: ${R.nameOf(ctx, nx)} · ${left ? `${left} more to act this round` : 'last turn of the round'}` : 'Only one combatant')
    : L.length ? `${L.length} combatant${L.length > 1 ? 's' : ''} ready.` : 'Add monsters from the library and your party from the Party tab.';
  $('#nextBtn').textContent = S.enc.active ? 'Next turn' : 'Start combat';
  $('#nextBtn').disabled = !L.length;
  $('#prevBtn').disabled = !S.enc.active;
  $('#endBtn').hidden = !S.enc.active;
  $('#skipDown').checked = !!S.enc.skip;
  $('#clearAll').textContent = S.confirm.clear ? 'Click again to clear' : 'Clear tracker';
  $('#list').innerHTML = L.length ? L.map(rowHtml).join('') : '<div class="empty-list">No combatants yet.</div>';
  $('#pickFoes').disabled = !L.some(c => c.kind === 'foe' && R.hp(ctx, c) > 0);
  renderGroupBar();
  renderPrompts();
  renderDifficulty();
  renderUndo();
}

// ---------- difficulty and the end-of-combat summary ----------

let fillingXp = false;
const needsStatBlock = c => c.xp === undefined || c.res === undefined || c.def === undefined;
/** Fill what a monster combatant takes from its stat block, if missing. Returns true if anything changed. */
function fillFromStatBlock(c, m) {
  if (!needsStatBlock(c)) return false;
  if (c.xp === undefined) c.xp = +m.experience_points || 0;
  if (c.res === undefined) c.res = R.monsterResources(m);
  if (c.def === undefined) c.def = R.monsterDefenses(m);
  return true;
}
function renderDifficulty() {
  const line = $('#diffLine');
  const foes = S.enc.c.filter(c => c.kind === 'foe');
  // monsters added before XP, resources or defenses were stored: look them up once
  const missing = S.enc.c.filter(c => c.ref && needsStatBlock(c));
  if (missing.length && !fillingXp) {
    fillingXp = true;
    Promise.all(missing.map(c => getEntry(...c.ref.split(':')).then(m => fillFromStatBlock(c, m), () => { c.xp ??= 0; c.res ??= null; c.def ??= null; })))
      .then(() => { fillingXp = false; saveEnc(); renderTracker(); });
  }
  const pcs = S.enc.c.filter(c => c.kind === 'pc');
  const levels = pcs.map(c => ctx.linked(c)?.sheet.level).filter(l => l > 0);
  line.hidden = !foes.length || !pcs.length;
  if (line.hidden) return;
  const xp = fightXp(foes);
  const d = R.difficulty(levels, xp);
  const notes = [];
  const noSheet = pcs.filter(c => !ctx.linked(c)).map(who);
  if (noSheet.length) notes.push(`${noSheet.join(', ')} ${noSheet.length > 1 ? 'have' : 'has'} no sheet, so no level: not counted`);
  const noXp = foes.filter(c => !c.ref && !c.xp).length;
  if (noXp) notes.push(`${noXp} custom foe${noXp > 1 ? 's have' : ' has'} no XP`);
  line.className = `diffline r-${(d.rating || 'none').replace(/\s/g, '').toLowerCase()}`;
  line.innerHTML = d.rating
    ? `<b>${d.rating}</b> encounter · ${xp.toLocaleString()} XP of foes for ${levels.length} character${levels.length > 1 ? 's' : ''}
      <span class="hint">(budgets: Low ${d.low.toLocaleString()} · Moderate ${d.moderate.toLocaleString()} · High ${d.high.toLocaleString()})${notes.length ? ` · ${esc(notes.join('; '))}` : ''}</span>`
    : `<span class="hint">Difficulty needs party members with a character sheet. ${esc(notes.join('; '))}</span>`;
}

function showSummary(s) {
  const dlg = $('#summaryDlg');
  const list = (arr, fmt) => arr.length ? `<ul>${arr.map(fmt).join('')}</ul>` : '<p class="hint">None.</p>';
  dlg.innerHTML = `<h2 id="summaryTitle">Combat over</h2>
    <p>${s.rounds} round${s.rounds === 1 ? '' : 's'}.</p>
    <h4>Defeated foes</h4>${list(s.defeated, d => `<li>${esc(d.name)}${d.xp ? ` <span class="hint">${d.xp.toLocaleString()} XP</span>` : ''}</li>`)}
    ${s.xp ? `<p class="xp"><b>${s.xp.toLocaleString()} XP</b>${s.pcs ? ` · <b>${s.each.toLocaleString()} XP</b> each for ${s.pcs} character${s.pcs > 1 ? 's' : ''}` : ''}</p>` : ''}
    <h4>Dropped to 0 HP</h4>${list(s.downs, d => `<li>${esc(d.name)}${d.n > 1 ? ` (${d.n} times)` : ''}</li>`)}
    <h4>Damage taken</h4>${list(s.taken, d => `<li>${esc(d.name)} <span class="hint">${d.n}</span></li>`)}
    <div class="line">${s.defeated.length ? '<button class="btn" data-sum="clear">Remove defeated foes</button>' : ''}<span class="spacer"></span><button class="btn primary" data-sum="close" autofocus>Close</button></div>`;
  dlg.showModal();
}

// ---------- area damage: one roll against every ticked creature ----------

const targetList = () => [...S.targets].map(([id, t]) => ({ c: S.enc.c.find(x => x.id === id), ...t })).filter(t => t.c);
let groupKey = '';
/** A new area target: its resistance follows the chosen damage type and its stat block. */
const newTarget = c => ({ half: false, mod: R.defenseMod(R.defensesOf(c), S.group.type), note: '' });
const typeOpts = cur => `<option value="">untyped</option>${R.DAMAGE_TYPES.map(t => `<option value="${t}"${t === cur ? ' selected' : ''}>${t}</option>`).join('')}`;
const modOpts = (cur, auto = false) => (auto ? `<option value="auto"${cur === 'auto' ? ' selected' : ''}>From stat block</option>` : '')
  + Object.entries(R.DAMAGE_MODS).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${l}</option>`).join('')
  + (cur === 'resist+vuln' ? '<option value="resist+vuln" selected>Resistant + Vulnerable</option>' : '');

function renderGroupBar() {
  const bar = $('#groupBar'), T = targetList(), G = S.group;
  bar.hidden = !T.length;
  const key = JSON.stringify([G, T.map(t => [t.c.id, who(t.c), t.half, t.mod, t.note, t.c.conds.map(x => x.n)])]);
  if (key === groupKey) return updateGroupPreview();
  groupKey = key;
  if (!T.length) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<div class="gb-head"><b>${T.length} target${T.length > 1 ? 's' : ''}</b>
      <input class="field" id="gAmt" autocomplete="off" placeholder="Damage: 28 or 8d6" aria-label="Damage for all targets" value="${esc(S.groupAmt)}" title="One roll for everyone. Enter: damage">
      <select class="field" data-g="type" aria-label="Damage type">${typeOpts(G.type)}</select>
      <button class="btn bad" data-g="dmg">Damage all</button><button class="btn ok" data-g="heal">Heal all</button>
      <span class="spacer"></span><button class="link" data-g="clear">Clear targets</button></div>
    <div class="gb-head"><label class="hint">Save <select class="field" data-g="ab" aria-label="Saving throw"><option value="">none</option>${S.meta.abilities.map(a => `<option value="${a}"${a === G.ab ? ' selected' : ''}>${a.toUpperCase()}</option>`).join('')}</select></label>
      <label class="hint">DC <input class="field tiny" type="number" min="1" data-g="dc" value="${esc(G.dc)}" aria-label="Save DC"></label>
      <label class="hint">on a success <select class="field" data-g="onsave"><option value="half"${G.onSave === 'half' ? ' selected' : ''}>half damage</option><option value="none"${G.onSave === 'none' ? ' selected' : ''}>no damage</option></select></label>
      <button class="btn sm" data-g="rollsaves"${G.ab && G.dc ? '' : ' disabled'} title="Roll each target's save (Stunned, Paralyzed... fail Str and Dex saves automatically)">Roll saves</button></div>
    <div class="gb-list">${T.map(t => {
      const rule = G.ab ? R.saveRule(t.c, G.ab) : {};
      return `<div class="gb-t" data-id="${t.c.id}"><span class="nm">${esc(who(t.c))}</span>
      <label class="hint"${rule.fail ? ` title="Fails ${G.ab.toUpperCase()} saves automatically: ${rule.fail}"` : ''}><input type="checkbox" data-g="half"${t.half ? ' checked' : ''}${rule.fail ? ' disabled' : ''}> Saved</label>
      <span class="hint gb-note">${esc(rule.fail ? `auto-fails (${rule.fail})` : t.note)}${rule.dis && !t.note ? `Disadvantage (${rule.dis})` : ''}</span>
      <select class="field" data-g="mod" aria-label="Resistance of ${esc(who(t.c))}">${modOpts(t.mod)}</select>
      <span class="gb-n" data-prev></span><button class="link" data-g="drop" title="Remove from targets" aria-label="Remove ${esc(who(t.c))} from targets">×</button></div>`;
    }).join('')}</div>`;
  updateGroupPreview();
}
/** Show what each target takes while the box holds a plain number (dice aren't rolled until you apply). */
function updateGroupPreview() {
  const txt = S.groupAmt.trim();
  const n = /d/i.test(txt) ? null : parseAmount(txt)?.total;
  for (const row of document.querySelectorAll('#groupBar .gb-t')) {
    const t = S.targets.get(row.dataset.id);
    const out = row.querySelector('[data-prev]');
    if (t && out) out.textContent = n ? `takes ${R.adjustDamage(n, { ...t, none: S.group.onSave === 'none' })}` : '';
  }
}

/** Roll every target's save against the DC; conditions can make it fail automatically or roll with Disadvantage. */
async function rollGroupSaves() {
  const G = S.group, dc = parseInt(G.dc, 10), T = targetList();
  if (!G.ab || !(dc > 0)) return toast('Pick the save and its DC first.');
  await Promise.all(T.filter(t => t.c.ref).map(t => getEntry(...t.c.ref.split(':')).catch(() => null)));
  for (const t of T) {
    const rule = R.saveRule(t.c, G.ab), bonus = saveBonus(t.c, G.ab);
    const tgt = S.targets.get(t.c.id);
    if (rule.fail) { tgt.half = false; tgt.note = ''; continue; }
    if (bonus == null) { tgt.note = 'no save bonus known: tick by hand'; continue; }
    const dice = [d20(), d20()];
    const ex = rollExtras(t.c);
    const r = R.rollSave({ dice, bonus, dc, rule, extra: ex.total });
    tgt.half = r.ok;
    tgt.note = `${r.total} ${r.ok ? 'saved' : 'failed'}${rule.dis ? ' (Disadvantage)' : rule.adv ? ' (Advantage)' : ''}`;
    pushLog(`${who(t.c)} ${G.ab.toUpperCase()} save vs DC ${dc}: ${r.ok ? 'success' : 'failure'}`,
      { total: r.total, detail: `${saveDice(dice, rule)} ${signed(bonus)}${ex.detail}` }, r.die === 20 ? 'crit' : r.die === 1 ? 'fumble' : '');
  }
  renderGroupBar();
}

function applyGroup(kind) {
  const T = targetList();
  const what = kind === 'dmg' ? 'Damage' : 'Healing';
  const amount = amountOf(S.groupAmt, `${what} for ${T.length}`);
  if (!amount || !T.length) return;
  remember(`${what} ${amount} to ${T.length} creature${T.length > 1 ? 's' : ''}`);
  let msgs;
  if (kind === 'dmg') {
    for (const t of T) t.dr = amount - R.reduceDamage(t.c, S.group.type, amount);     // Heavy Armor Master
    const r = R.damageMany(ctx, T, amount, false, S.group.onSave === 'none');
    msgs = [r.dealt.map((d, i) => `${d.name} ${d.n}${T[i].mod !== 'normal' ? ` (${(R.DAMAGE_MODS[T[i].mod] || 'resistant + vulnerable').toLowerCase()})` : ''}`).join(', ') + '.', ...r.msgs];
  } else msgs = [`Healed ${T.map(t => who(t.c)).join(', ')} by ${amount}.`, ...T.flatMap(t => R.heal(ctx, t.c, amount))];
  T.forEach(t => { if (ctx.linked(t.c)) scheduleCharSave(t.c.charId); });
  S.targets.clear(); S.groupAmt = '';
  changed(null, msgs);
  renderTracker(); renderInspector();
}
function onGroupEvent(e) {
  const g = e.target.closest('[data-g]')?.dataset.g;
  const row = e.target.closest('.gb-t');
  const t = row && S.targets.get(row.dataset.id);
  const G = S.group;
  if (e.type === 'click') {
    if (g === 'dmg' || g === 'heal') applyGroup(g);
    else if (g === 'rollsaves') rollGroupSaves();
    else if (g === 'clear') { S.targets.clear(); renderTracker(); }
    else if (g === 'drop') { S.targets.delete(row.dataset.id); renderTracker(); }
  } else if (e.type === 'change') {
    if (t && g === 'half') t.half = e.target.checked;
    if (t && g === 'mod') t.mod = e.target.value;
    if (g === 'type') {                       // a new damage type: every target's resistance follows its stat block
      G.type = e.target.value;
      for (const [id, x] of S.targets) { const c = S.enc.c.find(k => k.id === id); x.mod = c ? R.defenseMod(R.defensesOf(c), G.type) : 'normal'; }
    }
    if (g === 'ab' || g === 'dc' || g === 'onsave') {
      G[g === 'onsave' ? 'onSave' : g] = e.target.value;
      if (g !== 'onsave') for (const x of S.targets.values()) { x.note = ''; }
    }
    if (G.ab) for (const [id, x] of S.targets) { const c = S.enc.c.find(k => k.id === id); if (c && R.saveRule(c, G.ab).fail) x.half = false; }
    renderGroupBar();
  } else if (e.type === 'input' && e.target.id === 'gAmt') {
    S.groupAmt = e.target.value;
    updateGroupPreview();
  } else if (e.type === 'keydown' && e.target.id === 'gAmt' && e.key === 'Enter') {
    e.preventDefault();
    applyGroup('dmg');
  }
}

function step(dir) {
  if (!S.enc.c.length) return;
  remember(dir > 0 ? (S.enc.active ? 'Next turn' : 'Start combat') : 'Previous turn');
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
    if (c.sb) $('#sbHost').innerHTML = statBlock(c.sb);      // a summoned creature carries its own stat block
    if (ctx.linked(c)) showMentions($('#wikiHost'), 'char', ctx.linked(c).sheet.name);
    if (c.ref) {
      const [kind, idx] = c.ref.split(':');
      try {
        const m = await getEntry(kind, idx);
        if (kind === 'monster' && fillFromStatBlock(c, m)) {     // added before these fields existed
          saveEnc(); renderTracker();
          if (S.sel?.id === c.id) return renderInspector();
        }
        if (S.sel?.id === c.id) { $('#sbHost').innerHTML = statBlock(m); showMentions($('#wikiHost'), 'monster', m.name); }
      } catch (e) { const host = $('#sbHost'); if (host) host.innerHTML = `<p class="hint">Stat block unavailable: ${esc(e.message)}</p>`; }
    }
    return;
  }
  if (sel.type === 'fight') return renderPlan(box);
  if (sel.type === 'char') {
    const ch = S.chars.get(sel.id);
    box.innerHTML = ch ? `<div class="ins-head"><h2>${esc(ch.sheet.name)}</h2><p>${esc(classLine(ch.sheet))}</p></div><div id="wikiHost"></div>${derivedHtml(ch, { compact: true })}` : '';
    if (ch) showMentions($('#wikiHost'), 'char', ch.sheet.name);
    return;
  }
  box.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const d = await getEntry(sel.kind, sel.idx);
    if (S.sel !== sel) return;                    // the selection changed while loading
    if (sel.kind === 'monster') {
      box.innerHTML = `<div class="ins-head"><h2>${esc(d.name)}</h2><p>${esc(monsterLine(d))}</p></div>
        <div class="line"><button class="btn primary" data-addmon="${esc(sel.idx)}">Add to combat</button><span class="hint">Uses the count and HP setting in the library.</span></div>
        <div class="line"><label class="hint">Prepare: <select class="field" id="toFight" data-idx="${esc(sel.idx)}" aria-label="Add to a prepared fight">${fightOptions()}</select></label></div>
        <div id="wikiHost"></div>${statBlock(d)}`;
      showMentions($('#wikiHost'), 'monster', d.name);
      if (!S.savedLoaded) loadSaved().then(() => { S.savedLoaded = true; const el = $('#toFight'); if (el) el.innerHTML = fightOptions(); }, () => {});
    } else if (sel.kind === 'spell') box.innerHTML = spellHtml(d);
    else if (sel.kind === 'condition') box.innerHTML = `<div class="ins-head"><h2>${esc(d.name)}</h2></div><div class="prose">${mdLite(d.desc)}</div>`;
    else box.innerHTML = itemHtml(sel.kind, sel.idx, d, [...S.chars.values()]);
  } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
}

/** Choices for when a new condition's rounds count down. Defaults to the turn of whoever is acting now. */
function whenOptions(c) {
  const others = R.sorted(S.enc).filter(x => x.id !== c.id);
  const def = S.enc.active && S.enc.active !== c.id ? `end:${S.enc.active}` : 'own';
  const opt = (v, label) => `<option value="${v}"${v === def ? ' selected' : ''}>${esc(label)}</option>`;
  return opt('own', 'end of its own turn') + others.map(x => {
    const nm = R.nameOf(ctx, x);
    return opt(`end:${x.id}`, `end of ${nm}'s turn`) + opt(`start:${x.id}`, `start of ${nm}'s turn`);
  }).join('');
}

/** "Resistant: cold, fire · Immune: poison · Condition immunities: charmed" from the stat block. */
function defensesHtml(c) {
  const d = R.defensesOf(c);
  if (!d) return '';
  const parts = [d.resist.length && `Resistant: ${d.resist.join(', ')}`, d.immune.length && `Immune: ${d.immune.join(', ')}`,
    d.vuln.length && `Vulnerable: ${d.vuln.join(', ')}`, d.condImmune.length && `Condition immunities: ${d.condImmune.join(', ')}`].filter(Boolean);
  return `<p class="hint defenses">${esc(parts.join(' · '))}${d.notes ? `${parts.length ? ' · ' : ''}<b>Decide by hand:</b> ${esc(d.notes.join('; '))}` : ''}</p>`;
}

// ---------- attacks against a target ----------

const MODES = { normal: 'Normal', adv: 'Advantage', dis: 'Disadvantage' };
function targetOf(c) {
  const id = S.atk.target[c.id];
  return id && id !== c.id ? S.enc.c.find(x => x.id === id) || null : null;
}

function attackHtml(c) {
  const others = R.sorted(S.enc).filter(x => x.id !== c.id);
  if (!others.length) return '';
  const t = targetOf(c), mode = S.atk.mode[c.id] || 'normal';
  const hints = t ? R.attackHints(c, t) : [];
  const last = S.atk.last?.by === c.id ? S.atk.last : null;
  const lt = last && S.enc.c.find(x => x.id === last.target);
  let result = '';
  if (last && lt) {
    const vs = `${last.total} vs AC ${last.ac}`;
    const exprs = last.parts.map(p => (last.crit ? doubleDice(p.e) : p.e) + (p.t ? ` ${p.t.toLowerCase()}` : '')).join(' + ');
    result = last.hit
      ? `<div class="atkres hit"><p><b>${esc(last.feat)} ${last.crit ? 'crits' : 'hits'} ${esc(who(lt))}</b> (${last.crit ? `natural ${last.nat}` : vs}).${last.crit ? ' Damage dice are doubled.' : ''}</p>
          ${R.defensesOf(lt) && last.parts.some(p => R.defenseMod(R.defensesOf(lt), p.t) !== 'normal') ? `<p class="hint">${esc(who(lt))}: ${esc(last.parts.map(p => `${p.t || 'untyped'} ${(R.DAMAGE_MODS[R.defenseMod(R.defensesOf(lt), p.t)] || 'resistant + vulnerable').toLowerCase()}`).join(', '))}.</p>` : ''}
          ${hitOptionsHtml(c, lt, last)}
          ${last.parts.length ? `<div class="line"><select class="field" id="atkDmgMod" aria-label="Resistance to this damage">${modOpts('auto', true)}</select>
          <button class="btn bad" data-a="atkapply">Roll ${esc(exprs)} and apply</button>` : '<div class="line"><span class="hint">No damage dice on this attack: apply damage by hand.</span>'}
          <button class="link" data-a="atkclear">Dismiss</button></div></div>`
      : `<div class="atkres miss"><p><b>${esc(last.feat)} misses ${esc(who(lt))}</b> (${last.nat === 1 ? 'natural 1' : vs}).</p>
          ${last.extra?.mastery === 'Graze' && R.grazeDamage(last.extra.mod) > 0 ? `<button class="btn sm bad" data-a="graze">Graze: ${R.grazeDamage(last.extra.mod)} ${esc(last.parts[0]?.t || '')} damage</button>` : ''}
          <button class="link" data-a="atkclear">Dismiss</button></div>`;
  }
  return `<div class="blk"><h4>Attack</h4>
    <div class="line"><label class="hint">Target <select class="field" id="atkTarget"><option value="">None: just roll</option>${others.map(x =>
      `<option value="${x.id}"${t?.id === x.id ? ' selected' : ''}>${esc(who(x))} (AC ${R.acOf(ctx, x)})</option>`).join('')}</select></label>
      <select class="field" id="atkMode" aria-label="Roll with">${Object.entries(MODES).map(([k, l]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <select class="field" id="atkCover" aria-label="Target's cover">${[['none', 'No cover'], ['half', 'Half cover (+2)'], ['three_quarters', 'Three-quarters (+5)']].map(([k, l]) =>
        `<option value="${k}"${k === (S.atk.cover[c.id] || 'none') ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    ${hints.map(h => `<p class="hint atkhint">${esc(h.text)}</p>`).join('')}
    ${result}
    <p class="hint">${t ? `Click a to-hit bonus below to attack ${esc(who(t))}.` : 'Pick a target, then click a to-hit bonus below to roll against its AC.'}</p></div>`;
}

const FIEND_OR_UNDEAD = t => /^(fiend|undead)$/i.test(String(S.entryCache.get(t.ref)?.type?.name || ''));
/** Extra damage the attacker can add on a hit: Sneak Attack, Divine Smite (spends a slot); Rage is automatic. */
function hitOptionsHtml(c, t, last) {
  const x = last.extra || {}, ch = ctx.linked(c), out = [];
  if (x.rage && R.hasCond(c, 'Raging')) out.push(`<p class="hint">Raging: +${x.rage} damage included.</p>`);
  if (x.gwf) out.push('<p class="hint">Great Weapon Fighting: 1s and 2s on the weapon\'s damage dice count as 3.</p>');
  R.hitRiders(c, t, { markDie: ch?.derived.hunters_mark_die }).forEach((r, i) => {
    out.push(`<label class="hint"><input type="checkbox" data-spellrider="${i}" checked> ${esc(r.name)} (+${esc(r.dice)} ${esc(r.type)})</label>`);
  });
  (x.riders || []).forEach((r, i) => {
    if (r.needs && !R.hasCond(c, r.needs)) return;
    out.push(`<label class="hint"><input type="checkbox" data-rider="${i}"> ${esc(r.name)} (+${esc(r.dice)} ${esc(r.type)}${r.once ? ', once per turn' : ''})</label>`);
  });
  const d = ch?.derived;
  if (d?.stunning_dc && x.melee) {
    const focus = d.resources.find(r => r.key === 'focus');
    out.push(`<label class="hint"><input type="checkbox" id="atkStun"${focus && focus.used >= focus.max ? ' disabled' : ''}> Stunning Strike (1 Focus, Con save DC ${d.stunning_dc})</label>`);
  }
  const ms = x.mastery && R.MASTERY[x.mastery];
  if (ms?.on === 'hit') out.push(`<label class="hint" title="${esc(ms.note)}"><input type="checkbox" id="atkMastery" checked> Weapon Mastery: ${esc(x.mastery)} (${esc(ms.note)}${ms.save ? ` DC ${x.dc}` : ''})</label>`);
  if (x.sneak && d?.cunning_dc) {
    const opts = Object.entries(R.CUNNING).filter(([, cs]) => (d.class_levels?.rogue || 0) >= cs.from && parseInt(x.sneak, 10) >= cs.cost);
    out.push(`<label class="hint">Cunning Strike <select class="field" id="atkCunning"><option value="">none</option>${opts.map(([k, cs]) =>
      `<option value="${k}" title="${esc(cs.text)}">${cs.name} (−${cs.cost}d6)</option>`).join('')}</select> <small>DC ${d.cunning_dc}, with Sneak Attack</small></label>`);
  }
  if (x.sneak) out.push(`<label class="hint"><input type="checkbox" id="atkSneak"> Sneak Attack (+${esc(x.sneak)}, once per turn: Advantage or an ally next to the target)</label>`);
  if (x.smite && ch) {
    const fiend = FIEND_OR_UNDEAD(t);
    const opts = ch.sheet.slots.map((s, i) => (s.max - s.used > 0 ? `<option value="${i + 1}">${ordinal(i + 1)}-level slot: ${i + 2 + (fiend ? 1 : 0)}d8 radiant</option>` : '')).join('');
    out.push(opts ? `<label class="hint">Divine Smite <select class="field" id="atkSmite"><option value="">no</option>${opts}</select>${fiend ? ' (+1d8: Fiend or Undead)' : ''}</label>`
      : '<p class="hint">Divine Smite: no spell slots left.</p>');
  }
  return out.join('');
}

/** A to-hit button was clicked while the attacker has a target: roll, compare with AC, remember the result. */
function attackTarget(c, t, btn) {
  const bonus = +((btn.dataset.roll.match(/^1d20([+-]\d+)?$/) || [])[1] || 0);
  const mode = S.atk.mode[c.id] || 'normal';
  const dice = mode === 'normal' ? [d20()] : [d20(), d20()];
  const pen = ctx.linked(c) ? 0 : 2 * R.exhaustion(ctx, c);          // a sheet's bonus already includes Exhaustion
  const coverKey = S.atk.cover[c.id] || 'none';
  const ignoresCover = ctx.linked(c)?.derived.ignore_cover && coverKey !== 'none';
  const cover = ignoresCover ? 0 : R.COVER[coverKey];
  const ac = R.acOf(ctx, t) + cover;
  const critOn = JSON.parse(btn.dataset.extra || '{}').crit || 20;
  const ex = rollExtras(c);
  const r = R.attackOutcome({ dice, mode, bonus, pen, ac, critOn, extra: ex.total });
  const feat = btn.dataset.feat || 'Attack';
  const res = r.crit ? 'critical hit' : r.hit ? 'hit' : 'miss';
  pushLog(`${who(c)} · ${feat} vs ${who(t)}: ${res}`,
    { total: r.total, detail: `[${dice.join(',')}]${mode !== 'normal' ? ` ${mode}` : ''} ${bonus >= 0 ? '+' : '−'} ${Math.abs(bonus)}${pen ? ` − ${pen} exhaustion` : ''}${ex.detail} vs AC ${ac}${cover ? ` (cover +${cover})` : ignoresCover ? ' (Sharpshooter ignores cover)' : ''}` },
    r.crit ? 'crit' : r.nat === 1 ? 'fumble' : '');
  S.atk.last = { by: c.id, target: t.id, feat, parts: JSON.parse(btn.dataset.dmg || '[]'), extra: JSON.parse(btn.dataset.extra || '{}'), ac, ...r };
  renderInspector().then(() => $('.atkres')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function applyAttack(c) {
  const last = S.atk.last, t = last && S.enc.c.find(x => x.id === last.target);
  if (!t) { S.atk.last = null; return; }
  remember(`${last.feat}: damage to ${who(t)}`);
  const x = last.extra || {}, base = last.parts[0]?.t || '';
  const parts = last.parts.map(p => ({ ...p, min: x.gwf ? 3 : 0 }));
  if (x.rage && R.hasCond(c, 'Raging')) parts.push({ e: String(x.rage), t: base, label: 'Rage' });
  const cunning = x.sneak && $('#atkSneak')?.checked ? $('#atkCunning')?.value : '';
  const stun = !!$('#atkStun')?.checked;
  if (x.sneak && $('#atkSneak')?.checked) {
    const dice = cunning ? R.sneakAfter(x.sneak, R.CUNNING[cunning].cost) : x.sneak;   // Cunning Strike costs Sneak Attack dice
    if (dice) parts.push({ e: dice, t: base, label: cunning ? `Sneak Attack (${R.CUNNING[cunning].name})` : 'Sneak Attack' });
  }
  const spellRiders = R.hitRiders(c, t, { markDie: ctx.linked(c)?.derived.hunters_mark_die });
  document.querySelectorAll('#inspect [data-spellrider]:checked').forEach(el => {
    const r = spellRiders[+el.dataset.spellrider];
    if (r) parts.push({ e: r.dice, t: r.type, label: r.name });
  });
  document.querySelectorAll('#inspect [data-rider]:checked').forEach(el => {
    const r = x.riders?.[+el.dataset.rider];
    if (r) parts.push({ e: r.dice, t: r.type || base, label: r.name });
  });
  const smite = +($('#atkSmite')?.value || 0), ch = ctx.linked(c);
  if (smite && ch) {
    parts.push({ e: `${smite + 1 + (FIEND_OR_UNDEAD(t) ? 1 : 0)}d8`, t: 'radiant', label: 'Divine Smite' });
    const slot = ch.sheet.slots[smite - 1];
    slot.used = Math.min(slot.max, slot.used + 1);
  }
  const rolls = parts.map(p => ({ ...p, r: roll(last.crit ? doubleDice(p.e) : p.e, Math.random, { min: p.min || 0 }) })).filter(p => p.r);
  const total = rolls.reduce((n, p) => n + p.r.total, 0);
  const mod = $('#atkDmgMod')?.value || 'auto';
  pushLog(`${who(c)} · ${last.feat} damage to ${who(t)}${last.crit ? ' (crit)' : ''}`,
    { total, detail: rolls.map(p => `${p.r.detail.replace(/^\+ /, '')}${p.t ? ' ' + p.t.toLowerCase() : ''}${p.label ? ` (${p.label})` : ''}`).join(' + ') });
  S.atk.last = null;
  // "From stat block": each damage type meets the target's own resistance or immunity
  // resistance halves the total of each damage type (not each part), so add the parts up per type first
  const byType = new Map();
  for (const p of rolls) { const k = (p.t || '').toLowerCase(); byType.set(k, (byType.get(k) || 0) + p.r.total); }
  const applied = [...byType].map(([type, rolled]) => ({ t: type, m: mod === 'auto' ? R.defenseMod(R.defensesOf(t), type) : mod, rolled: R.reduceDamage(t, type, rolled) }));
  const n = applied.reduce((sum, p) => sum + R.adjustDamage(p.rolled, { mod: p.m }), 0);
  const notes = applied.filter(p => p.m !== 'normal').map(p => `${p.t ? p.t.toLowerCase() + ' ' : ''}${(R.DAMAGE_MODS[p.m] || 'resistant + vulnerable').toLowerCase()}`);
  if (smite && ch) scheduleCharSave(c.charId);
  const dmgMsgs = n > 0 ? R.damage(ctx, t, n, last.crit) : [];
  const standing = R.hp(ctx, t) > 0;                                 // effects only matter if it's still up
  const after = [];
  // on-hit effects with a save: Stunning Strike (spends Focus) and Cunning Strike
  const saveFor = (ab, dc, label) => {
    const rule = R.saveRule(t, ab), bonus = saveBonus(t, ab) ?? 0, dice = [d20(), d20()];
    const r = R.rollSave({ dice, bonus, dc, rule, extra: rollExtras(t).total });
    pushLog(`${who(t)} ${ab.toUpperCase()} save vs ${label} DC ${dc}: ${r.ok ? 'success' : 'failure'}`, { total: r.total ?? 0, detail: r.auto ? `fails automatically (${r.auto})` : `${saveDice(dice, rule)} ${signed(bonus)}` });
    return r.ok;
  };
  if (stun && ch && standing) {
    ch.sheet.resources_used.focus = (ch.sheet.resources_used.focus || 0) + 1;
    scheduleCharSave(c.charId);
    after.push(...R.onHitSave(ctx, c, t, 'stunning', saveFor('con', ch.derived.stunning_dc, 'Stunning Strike'), ch.derived.stunning_dc));
  }
  if ($('#atkMastery')?.checked && x.mastery && standing) {
    const ms = R.MASTERY[x.mastery];
    after.push(...R.masteryOnHit(ctx, c, t, x.mastery, ms.save ? saveFor(ms.save, x.dc, x.mastery) : null));
  }
  if (cunning && ch && standing) {
    const cs = R.CUNNING[cunning];
    if (cs.save) after.push(...R.onHitSave(ctx, c, t, cunning, saveFor(cs.save, ch.derived.cunning_dc, cs.name), ch.derived.cunning_dc));
    else after.push(`${cs.name}: ${cs.text}`);
  }
  changed(t, [`${who(t)} takes ${n}${notes.length ? ` (${notes.join(', ')})` : ''}.`, ...dmgMsgs, ...after]);
}

// ---------- actions: Dodge, Help, Reckless Attack, Second Wind, Lay on Hands ----------

function actionsHtml(c) {
  const ch = ctx.linked(c), d = ch?.derived;
  const res = k => d?.resources.find(r => r.key === k);
  const others = R.sorted(S.enc).filter(x => x.id !== c.id && R.lifeState(ctx, x) !== 'dead');
  const sw = res('second_wind'), loh = res('lay_on_hands');
  return `<div class="blk"><h4>Actions</h4><div class="line">
      <button class="btn sm" data-a="dodge" title="Until the start of its next turn: attacks against it have Disadvantage, Advantage on Dex saves">Dodge</button>
      ${ch?.sheet.class_name.toLowerCase() === 'barbarian' ? '<button class="btn sm" data-a="reckless" title="Advantage on Str attacks this turn; attacks against you have Advantage until your next turn">Reckless Attack</button>' : ''}
      ${sw ? `<button class="btn sm" data-a="secondwind"${sw.used >= sw.max ? ' disabled' : ''} title="Heal 1d10 + Fighter level">Second Wind (${sw.max - sw.used} left)</button>` : ''}</div>
    <div class="line"><select class="field" id="helpTarget" aria-label="Help whom">${others.map(x => `<option value="${x.id}">${esc(who(x))}</option>`).join('')}</select>
      <button class="btn sm" data-a="help" title="The ally has Advantage on its next attack roll or check before your next turn">Help</button></div>
    ${loh ? `<div class="line"><label class="hint">Lay on Hands <input class="field tiny" type="number" min="1" id="lohAmt" placeholder="HP"> of ${loh.max - loh.used}</label>
      <select class="field" id="lohTarget" aria-label="Heal whom"><option value="${c.id}">${esc(who(c))} (self)</option>${others.map(x => `<option value="${x.id}">${esc(who(x))}</option>`).join('')}</select>
      <button class="btn sm ok" data-a="loh">Heal</button></div>` : ''}</div>`;
}

function doAction(c, a) {
  const ch = ctx.linked(c);
  const res = k => ch?.derived.resources.find(r => r.key === k);
  const spend = (k, n = 1) => { ch.sheet.resources_used[k] = (ch.sheet.resources_used[k] || 0) + n; scheduleCharSave(c.charId); };
  if (a === 'dodge') { remember(`${who(c)} Dodges`); return changed(c, [`${who(c)} takes the Dodge action.`, ...R.applyStatus(ctx, c, 'Dodging', c)]); }
  if (a === 'reckless') { remember(`${who(c)}: Reckless Attack`); return changed(c, R.applyStatus(ctx, c, 'Reckless', c)); }
  if (a === 'help') {
    const t = S.enc.c.find(x => x.id === $('#helpTarget')?.value);
    if (!t) return;
    remember(`${who(c)} Helps ${who(t)}`);
    return changed(t, [`${who(c)} helps ${who(t)}.`, ...R.applyStatus(ctx, t, 'Helped', c)]);
  }
  if (a === 'secondwind') {
    const r = res('second_wind');
    if (!r || r.used >= r.max) return toast('No Second Wind left.');
    const heal = roll(`1d10+${ch.derived.class_levels?.fighter || ch.derived.level}`);
    remember(`${who(c)}: Second Wind`);
    spend('second_wind');
    pushLog(`${who(c)} · Second Wind`, heal);
    return changed(c, [`Second Wind: ${who(c)} regains ${heal.total} HP.`, ...R.heal(ctx, c, heal.total)]);
  }
  if (a === 'loh') {
    const r = res('lay_on_hands'), t = S.enc.c.find(x => x.id === $('#lohTarget')?.value);
    const n = Math.min(parseInt($('#lohAmt')?.value, 10) || 0, r ? r.max - r.used : 0);
    if (!t || n <= 0) return toast('Enter how many HP to restore (up to the pool left).');
    remember(`${who(c)}: Lay on Hands ${n} to ${who(t)}`);
    spend('lay_on_hands', n);
    const msgs = R.heal(ctx, t, n);
    if (ctx.linked(t)) scheduleCharSave(t.charId);
    return changed(t, [`Lay on Hands: ${who(t)} regains ${n} HP.`, ...msgs]);
  }
}

// ---------- auras a party member extends to allies ----------

function auraHtml(c) {
  const auras = ctx.linked(c)?.derived.auras || [];
  if (!auras.length) return '';
  const allies = R.sorted(S.enc).filter(x => x.id !== c.id && x.kind !== 'foe');
  const inAura = x => x.conds.some(k => R.STATUS[k.n]?.aura && k.src === c.id);
  return `<div class="blk"><h4>Auras <span class="hint">${esc(auras.map(a => a.name + (a.v ? ` +${a.v}` : '')).join(', '))}</span></h4>
    ${allies.length ? `<div class="checks">${allies.map(x => `<label><input type="checkbox" data-aura="${x.id}"${inAura(x) ? ' checked' : ''}> ${esc(who(x))}</label>`).join('')}</div>
      <p class="hint">Tick the allies within range (10 ft; 30 ft from level 18). They get these auras while ${esc(who(c))} is conscious.</p>` : '<p class="hint">No allies in the fight.</p>'}</div>`;
}

function setAura(c, allyId, on) {
  const ally = S.enc.c.find(x => x.id === allyId);
  if (!ally) return;
  remember(`${on ? 'Extend' : 'Withdraw'} ${who(c)}'s auras ${on ? 'to' : 'from'} ${who(ally)}`);
  ally.conds = ally.conds.filter(k => !(R.STATUS[k.n]?.aura && k.src === c.id));
  const msgs = on ? ctx.linked(c).derived.auras.flatMap(a => R.applyStatus(ctx, ally, a.name, c, a.v)) : [];
  changed(ally, msgs);
  renderTracker(); renderInspector();
}

// ---------- casting spells that leave an effect (Hunter's Mark, Hex, Bless...) ----------

function castHtml(c) {
  const spell = S.castSpell || "Hunter's Mark", e = R.SPELL_EFFECTS[spell];
  const targets = R.sorted(S.enc).filter(x => R.lifeState(ctx, x) !== 'dead');
  return `<div class="blk"><h4>Cast</h4>
    <div class="line"><select class="field" id="castSpell" aria-label="Spell">${Object.entries(R.SPELL_EFFECTS).map(([n, x]) =>
      `<option value="${esc(n)}"${n === spell ? ' selected' : ''}>${esc(n)} (level ${x.level})</option>`).join('')}</select>
      ${e.on === 'self' ? '' : `<select class="field" id="castTarget" aria-label="Target">${targets.map(x =>
        `<option value="${x.id}"${x.id === (S.atk.target[c.id] || '') ? ' selected' : ''}>${esc(who(x))}${x.id === c.id ? ' (self)' : ''}</option>`).join('')}</select>`}
      <button class="btn sm" data-a="cast">Cast</button></div>
    <p class="hint">${esc(e.text)}${e.conc ? ' Concentration.' : ''}${ctx.linked(c) ? ' Spends a slot (Hunter\'s Mark: a free Favored Enemy cast first).' : ''}</p></div>`;
}

function castFor(c) {
  const spell = $('#castSpell').value, e = R.SPELL_EFFECTS[spell];
  const target = e.on === 'self' ? c : S.enc.c.find(x => x.id === $('#castTarget')?.value);
  if (!target) return toast('Pick a target.');
  remember(`${who(c)} casts ${spell}`);
  const { msgs, needsSlot } = R.castEffect(ctx, c, spell, target);
  const ch = ctx.linked(c);
  if (ch && needsSlot && !msgs.some(m => /is immune/.test(m))) {
    const free = spell === "Hunter's Mark" && ch.derived.resources.find(r => r.key === 'favored_enemy' && r.used < r.max);
    if (free) {
      ch.sheet.resources_used.favored_enemy = free.used + 1;
      free.used++;
      msgs.push('Used a free Favored Enemy cast.');
    } else {
      const i = R.pickSlot(ch.sheet.slots, e.level);
      if (i >= 0) { ch.sheet.slots[i].used++; msgs.push(`Used a ${ordinal(i + 1)}-level slot.`); }
      else msgs.push('No spell slot left for it: check the sheet.');
    }
    scheduleCharSave(c.charId);
  }
  changed(target, msgs);
}

/** "Summon Wildfire Spirit" buttons for a party member whose subclass summons creatures. */
function summonHtml(c) {
  const list = ctx.linked(c)?.derived.subclass?.summon_info || [];
  if (!list.length) return '';
  return `<div class="blk"><h4>Summons</h4>${list.map(s => `<div class="line">
      ${s.forms ? `<select class="field" id="form-${s.key}" aria-label="${esc(s.name)} form">${s.forms.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select>` : ''}
      <button class="btn sm" data-a="summon" data-k="${s.key}">Summon ${esc(s.name)}</button></div>`).join('')}
    <p class="hint">Joins the fight as an ally right after ${esc(who(c))} in initiative, with its own stat block.</p></div>`;
}

async function summonFor(c, key) {
  const ch = ctx.linked(c);
  let out;
  try {
    out = await api(`/api/characters/${ch.id}/summon`, { method: 'POST', body: { key, form: $(`#form-${key}`)?.value } });
  } catch (e) { return toast(e.message); }
  remember(`Summon ${out.creature.name}`);
  S.chars.set(ch.id, out.character);
  const m = out.creature;
  const n = { id: uid(), name: m.name, kind: 'ally', init: c.init, mod: c.mod, seq: c.seq + 0.001, ac: m.armor_class, hp: m.hit_points, max: m.hit_points,
    temp: 0, exh: 0, conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', rx: false, xp: 0, owner: c.id, sb: m,
    res: R.monsterResources(m), def: R.monsterDefenses(m) };
  S.enc.c.push(n);
  R.joinCombat(ctx, n);
  saveEnc(); renderTracker(); renderInspector();
  toast(`${m.name} joins the fight after ${who(c)}.${out.note ? ' ' + out.note : ''}`);
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

  const life = R.lifeState(ctx, c);
  const dsPips = `<div>Successes ${[1, 2, 3].map(k => `<button class="pip ${c.ds.s >= k ? 'on' : ''}" data-a="ds" data-t="s" data-v="${k}" aria-label="Success ${k}"></button>`).join('')}</div>
      <div class="f">Failures ${[1, 2, 3].map(k => `<button class="pip ${c.ds.f >= k ? 'on' : ''}" data-a="ds" data-t="f" data-v="${k}" aria-label="Failure ${k}"></button>`).join('')}</div>`;
  const deathSaves = life === 'dead'
    ? `<div class="blk"><h4>Dead</h4><p class="hint">Healing does nothing now. If revival magic brings ${esc(v.name)} back, use Revive (HP from the amount box, or 1).</p>
        <div class="line"><button class="btn sm" data-a="revive">Revive</button></div></div>`
    : c.kind === 'pc' && hp <= 0 ? `<div class="blk"><h4>Death saves${life === 'stable' ? ' <span class="hint">stable: no more saves until it takes damage</span>' : ''}</h4><div class="ds">
      ${dsPips}
      ${life === 'dying' ? '<button class="btn sm" data-a="dsroll">Roll death save</button>' : ''}</div></div>` : '';

  const sub = ch ? classLine(ch.sheet) : c.ref ? 'Monster' : KIND[c.kind];
  return `<div class="ins-head"><h2>${esc(v.name)}</h2><p>${esc(sub)} · initiative ${c.init}</p></div>
    <div class="blk"><h4>Hit points</h4>
      <div class="bigstat"><span class="v">${hp}<small>/${R.maxHp(ctx, c)}</small></span>${temp ? `<span class="v tmp">+${temp}<small> temp</small></span>` : ''}<span class="v">${R.acOf(ctx, c)}<small> AC${R.acOf(ctx, c) !== v.ac ? ` (base ${v.ac})` : ''}</small></span></div>
      <div class="line"><input class="field" autocomplete="off" id="insAmt" placeholder="12, 12+7, 2d6+3" aria-label="Amount">
        <select class="field" id="insType" aria-label="Damage type">${typeOpts('')}</select>
        <select class="field" id="insMod" aria-label="Resistance to this damage">${modOpts('normal')}</select></div>
      ${defensesHtml(c)}
      <div class="line"><button class="btn bad" data-a="dmg" title="Shift-click: damage from a critical hit">Damage</button><button class="btn ok" data-a="heal">Heal</button><button class="btn" data-a="temp">Temp HP</button></div>
      ${ch ? '' : `<div class="line">
        <label class="hint">Max HP <input class="field tiny" type="number" min="1" id="insMax" data-path="max" data-type="num" value="${c.max}"></label>
        <label class="hint">AC <input class="field tiny" type="number" id="insAc" data-path="ac" data-type="num" value="${c.ac}"></label>
        <label class="hint">Name <input class="field" id="insName" data-path="name" data-required value="${esc(c.name)}"></label></div>`}
    </div>
    ${deathSaves}
    ${resourcesHtml(c)}
    <div class="blk"><h4>Conditions</h4>
      ${chipsHtml(c)}
      <div class="line"><input class="field" id="insCond" list="condList" autocomplete="off" placeholder="Condition or effect" aria-label="Condition or effect (pick one or type a spell name)">
        <datalist id="condList">${S.meta.conditions.map(n => `<option value="${n}">`).join('')}</datalist>
        <input class="field rounds" type="number" min="1" id="insRounds" placeholder="Rounds" aria-label="Rounds">
        <button class="btn" data-a="addcond">Add</button></div>
      <div class="line"><label class="hint">Counts down at <select class="field" id="insWhen" aria-label="When the rounds count down">${whenOptions(c)}</select></label></div>
      <details class="condmore"${S.condMoreOpen ? ' open' : ''}><summary class="hint">Concentration and repeated saves</summary>
        <div class="line"><label class="hint">Ends if this creature loses concentration
          <select class="field" id="insConc"><option value="">nobody (not a concentration spell)</option>${R.sorted(S.enc).filter(x => x.id !== c.id).map(x =>
            `<option value="${x.id}">${esc(who(x))}</option>`).join('')}</select></label>
          <label class="hint">Spell <input class="field" id="insSpell" autocomplete="off" placeholder="same as the effect" aria-label="Concentration spell"></label></div>
        <div class="line"><label class="hint">Repeats a save <select class="field" id="insSaveAb"><option value="">no save</option>${S.meta.abilities.map(a => `<option value="${a}">${a.toUpperCase()}</option>`).join('')}</select></label>
          <label class="hint">DC <input class="field tiny" type="number" min="1" id="insSaveDc"></label>
          <label class="hint">at the <select class="field" id="insSaveWhen"><option value="end">end</option><option value="start">start</option></select> of each of its turns</label></div>
        <p class="hint">For Hold Person: add Paralyzed, pick the caster under concentration, spell "Hold Person", and a Wisdom save at the end of each turn. A caster concentrates on one spell at a time: a different spell ends the first one. The tracker asks for the save at the right time, and ending the caster's concentration removes the effect from everyone.</p>
      </details>
      <p class="hint">Blank rounds lasts until removed. For an effect another creature caused ("until the end of your next turn"), pick that creature's turn: it counts down there, and a timer set during that creature's own turn skips that turn. Adding Exhaustion raises its level by one.</p></div>
    <div class="blk"><h4>Spell slots ${ch ? '<span class="hint">from sheet</span>' : `<button class="link" data-a="editslots">${editing ? 'Done' : 'Edit'}</button>`}</h4>${slotHtml}</div>
    ${attackHtml(c)}
    ${actionsHtml(c)}
    ${castHtml(c)}
    ${auraHtml(c)}
    ${summonHtml(c)}
    ${ch ? derivedHtml(ch, { compact: true }) : ''}
    <div id="wikiHost"></div>
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
  if (S.libKind === 'saved') return renderSaved(q);
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

/** An Initiative d20: with Disadvantage when the "Surprised" box is ticked (2024 surprise). */
const rollInit = () => ($('#libSurprised')?.checked ? Math.min(d20(), d20()) : d20());

/** A new combatant for monster `m` (initiative and, if asked, HP rolled). */
function monsterCombatant(m, idx, name, rollHp, i = 0, kind = 'foe') {
  const hp = rollHp ? Math.max(1, roll(m.hit_dice || '')?.total || m.hit_points) : m.hit_points;
  const initBonus = monInit(m);
  return { id: uid(), ref: `monster:${idx}`, name, kind, init: rollInit() + initBonus, mod: m.modifiers?.dexterity ?? initBonus, ac: monAC(m), hp, max: hp,
    temp: 0, exh: 0, conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', seq: Date.now() + i / 100, rx: false,
    res: R.monsterResources(m), def: R.monsterDefenses(m), xp: +m.experience_points || 0 };
}

export async function addMonster(idx) {
  let m;
  try { m = await getEntry('monster', idx); } catch (e) { return toast(`Could not load that monster: ${e.message}`); }
  const qty = Math.max(1, Math.min(20, parseInt($('#libQty').value, 10) || 1));
  const rollHp = $('#libRollHp').checked;
  remember(`Add ${qty > 1 ? qty + '× ' : ''}${m.name}`);
  const names = R.groupNames(S.enc, m.name, qty);
  const rolls = names.map((name, i) => {
    const c = monsterCombatant(m, idx, name, rollHp, i);
    S.enc.c.push(c);
    return c.init;
  });
  const waiting = joined(S.enc.c.slice(-qty));
  saveEnc(); renderTracker();
  toast(`Added ${qty > 1 ? qty + '× ' : ''}${m.name} (initiative ${rolls.join(', ')}).${waiting}`);
}

/** New combatants in a fight in progress: those above the current turn start next round. Returns a note for the toast. */
function joined(list) {
  const waiting = list.filter(c => R.joinCombat(ctx, c)).map(c => R.nameOf(ctx, c));
  return waiting.length ? ` ${waiting.join(', ')} ${waiting.length > 1 ? 'join' : 'joins'} next round: their initiative has already passed.` : '';
}

/** Add a party member; returns "Name 17" (their initiative), or null if they're already in the fight. */
export function addChar(id) {
  const ch = S.chars.get(id);
  if (S.enc.c.some(c => c.charId === id)) { toast(`${ch.sheet.name} is already in the fight.`); return null; }
  remember(`Add ${ch.sheet.name}`);
  const init = rollInit() + ch.derived.initiative;
  S.enc.c.push({ id: uid(), charId: id, name: ch.sheet.name, kind: 'pc', init, mod: ch.derived.mods.dex, ac: ch.derived.ac,
    hp: ch.sheet.hp, max: ch.sheet.max_hp, temp: 0, exh: 0, conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', seq: Date.now() + Math.random() });
  const waiting = R.joinCombat(ctx, S.enc.c[S.enc.c.length - 1]);
  saveEnc(); renderTracker();
  return `${ch.sheet.name} ${init}${waiting ? ' (joins next round)' : ''}`;
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
      const v = amountFrom(`#q-${c.id}`, `${a === 'qdmg' ? 'Damage to' : 'Healing for'} ${who(c)}`);
      if (!v) return;
      remember(`${a === 'qdmg' ? 'Damage' : 'Heal'} ${who(c)} ${v}`);
      changed(c, a === 'qdmg' ? R.damage(ctx, c, v, e.shiftKey) : R.heal(ctx, c, v));
    } else if (a === 'rmcond') { remember(`Remove ${c.conds[+b.dataset.i]?.n} from ${who(c)}`); changed(c, R.removeCondition(ctx, c, +b.dataset.i)); }
    else if (a === 'exhdown') { remember(`Lower ${who(c)}'s Exhaustion`); changed(c, R.setExhaustion(ctx, c, R.exhaustion(ctx, c) - 1)); }
    else if (a === 'rx') { remember(`Reaction for ${who(c)}`); c.rx = !c.rx; changed(c); }
    else if (a === 'insp') { remember(`Heroic Inspiration for ${who(c)}`); R.setInspired(ctx, c, !R.inspired(ctx, c)); changed(c); }
    else if (a === 'leg') { remember(`Legendary action for ${who(c)}`); R.toggleSlot(c.res.leg, +b.dataset.p); changed(c); }
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
  const rc = selected(), rch = rc && ctx.linked(rc);
  if (rch && e.target.closest('[data-res]')) {
    remember(`Resource for ${who(rc)}`);
    onResourceEvent(e, rch);
    return renderInspector();
  }
  const atkBtn = e.target.closest('[data-type="atk"][data-dmg]'), attacker = selected();
  if (atkBtn && attacker && targetOf(attacker)) return attackTarget(attacker, targetOf(attacker), atkBtn);
  if (handleRollClick(e)) return;
  const addBtn = e.target.closest('[data-addmon]');
  if (addBtn) return addMonster(addBtn.dataset.addmon);
  const give = e.target.closest('[data-give]');
  if (give) {
    const [kind, idx] = give.dataset.give.split(':');
    const id = +$('#giveTo')?.value, ch = S.chars.get(id);
    if (!ch) return toast('Pick a character first.');
    try {
      const item = await api(`/api/item-template/${kind}/${idx}`);
      ch.sheet.inventory.push(item);
      await charOp(id);
      return toast(`${item.name} added to ${ch.sheet.name}'s inventory.${item.notes ? ' ' + item.notes : ''}`);
    } catch (e) { return toast(e.message); }
  }
  const b = e.target.closest('[data-a]');
  const c = selected();
  if (!b || !c) return;
  const a = b.dataset.a;
  if (a !== 'del') S.confirm.del = null;
  const LABEL = { dmg: 'Damage', heal: 'Heal', temp: 'Temp HP for' };
  if (LABEL[a]) {
    const n = amountFrom('#insAmt', `${LABEL[a]} ${who(c)}`);
    if (!n) return;
    remember(`${LABEL[a]} ${who(c)} ${n}`);
    changed(c, a === 'dmg' ? hurt(c, n, $('#insMod').value, e.shiftKey, $('#insType')?.value) : a === 'heal' ? R.heal(ctx, c, n) : R.giveTemp(ctx, c, n));
    return (renderTracker(), renderInspector());
  }
  const UNDO = {
    addcond: () => $('#insCond').value.trim() && `Add ${$('#insCond').value.trim()} to ${who(c)}`, rmcond: () => `Remove ${c.conds[+b.dataset.i]?.n} from ${who(c)}`,
    exhdown: () => `Lower ${who(c)}'s Exhaustion`, slot: () => `Spell slot for ${who(c)}`, ds: () => `Death save mark for ${who(c)}`,
    dsroll: () => `Death save for ${who(c)}`, revive: () => `Revive ${who(c)}`, dup: () => `Duplicate ${who(c)}`, del: () => S.confirm.del === c.id && `Remove ${who(c)}`,
    rx: () => `Reaction for ${who(c)}`, leg: () => `Legendary action for ${who(c)}`, lr: () => `Legendary Resistance for ${who(c)}`,
    use: () => `${c.res.uses[+b.dataset.i].name} for ${who(c)}`, day: () => `${c.res.uses[+b.dataset.i].name} for ${who(c)}`,
    recharge: () => `Recharge roll for ${who(c)}`,
  };
  const label = UNDO[a]?.();
  if (label) remember(label);
  switch (a) {
    case 'atkapply': applyAttack(c); break;
    case 'graze': {
      const last = S.atk.last, t = last && S.enc.c.find(x => x.id === last.target);
      if (!t) break;
      const type = last.parts[0]?.t || '';
      const n = R.adjustDamage(R.reduceDamage(t, type, R.grazeDamage(last.extra.mod)), { mod: R.defenseMod(R.defensesOf(t), type) });
      remember(`Graze: ${n} damage to ${who(t)}`);
      S.atk.last = null;
      changed(t, [`Graze: ${who(t)} takes ${n}.`, ...(n > 0 ? R.damage(ctx, t, n) : [])]);
      break;
    }
    case 'summon': return summonFor(c, b.dataset.k);
    case 'cast': castFor(c); break;
    case 'dodge': case 'reckless': case 'help': case 'secondwind': case 'loh': doAction(c, a); break;
    case 'atkclear': S.atk.last = null; break;
    case 'rx': c.rx = !c.rx; changed(c); break;
    case 'leg': R.toggleSlot(c.res.leg, +b.dataset.p); changed(c); break;
    case 'lr': R.toggleSlot(c.res.lr, +b.dataset.p); changed(c); break;
    case 'day': R.toggleSlot(c.res.uses[+b.dataset.i], +b.dataset.p); changed(c); break;
    case 'use': { const u = c.res.uses[+b.dataset.i]; u.used = u.used ? 0 : 1; changed(c); break; }
    case 'recharge': {
      const u = c.res.uses[+b.dataset.i];
      const r = R.rollRecharge(ctx, c, u);
      pushLog(`${who(c)} · ${u.name} ${r.ok ? 'recharged' : 'not recharged'}`, { total: r.die, detail: `[${r.die}] needs ${u.p}${u.p < 6 ? '–6' : ''}` }, r.ok ? 'crit' : '');
      changed(c, [r.msg]);
      break;
    }
    case 'addcond': {
      const name = $('#insCond').value.trim();
      if (!name) { toast('Pick a condition or type an effect name.'); break; }
      const [at, timerSrc] = ($('#insWhen')?.value || 'own').split(':');
      const concSrc = S.condMoreOpen ? $('#insConc')?.value : '';
      const saveAb = S.condMoreOpen ? $('#insSaveAb')?.value : '';
      const opts = { at, src: concSrc || timerSrc, conc: !!concSrc, spell: S.condMoreOpen ? $('#insSpell')?.value.trim() : '' };
      if (concSrc && timerSrc && concSrc !== timerSrc) { toast('The timer and the concentration must come from the same creature.'); break; }
      if (saveAb) opts.save = { ab: saveAb, dc: parseInt($('#insSaveDc').value, 10), when: $('#insSaveWhen').value };
      if (saveAb && !(opts.save.dc > 0)) { toast('Enter the save DC.'); break; }
      changed(c, R.addCondition(ctx, c, name, parseInt($('#insRounds').value, 10), opts));
      S.enc.c.forEach(x => { if (ctx.linked(x)) scheduleCharSave(x.charId); });
      break;
    }
    case 'rmcond': changed(c, R.removeCondition(ctx, c, +b.dataset.i)); break;
    case 'exhdown': changed(c, R.setExhaustion(ctx, c, R.exhaustion(ctx, c) - 1)); break;
    case 'slot': R.toggleSlot(R.vit(ctx, c).slots[+b.dataset.l], +b.dataset.p); changed(c); break;
    case 'editslots': S.editingSlots.has(c.id) ? S.editingSlots.delete(c.id) : S.editingSlots.add(c.id); break;
    case 'ds': { const k = b.dataset.t, n = +b.dataset.v; c.ds[k] = c.ds[k] === n ? n - 1 : n; if (k === 'f') c.dead = false; changed(c); break; }
    case 'revive': {
      const n = parseAmount($('#insAmt')?.value || '')?.total || 1;
      changed(c, R.revive(ctx, c, n));
      break;
    }
    case 'dsroll': {
      const die = d20();
      const r = R.deathSave(ctx, c, die);
      pushLog(`${R.nameOf(ctx, c)} death save: ${r.outcome}`, { total: r.total, detail: r.pen ? `[${die}] − ${r.pen} exhaustion` : `[${die}]` }, r.cls);
      changed(c, r.msgs);
      break;
    }
    case 'dup': {
      const n = JSON.parse(JSON.stringify(c));
      Object.assign(n, { id: uid(), seq: c.seq + 0.001, hp: n.max, temp: 0, exh: 0, conds: [], ds: { s: 0, f: 0 }, rx: false });
      if (n.res) { if (n.res.leg) n.res.leg.used = 0; if (n.res.lr) n.res.lr.used = 0; n.res.uses.forEach(u => { u.used = 0; }); }
      n.name = R.groupNames(S.enc, c.name.replace(/\s+\d+$/, ''), 1)[0];
      S.enc.c.push(n);
      R.joinCombat(ctx, n);
      saveEnc();
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

// ---------- saved encounters (prepared fights) ----------

const baseName = R.baseName;
const fightXp = R.foeXp;

/** Choices for "Prepare: add to a fight" on a monster's stat block. */
const fightOptions = () => '<option value="">Add to a prepared fight…</option>'
  + (S.saved || []).map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('') + '<option value="new">New fight…</option>';

async function renderSaved(q) {
  const ul = $('#libResults');
  const own = S.enc.c.filter(c => c.kind !== 'pc');
  const form = `<li class="savefight"><input class="field" id="saveName" placeholder="Name a fight" aria-label="Name for the fight" autocomplete="off">
    <button class="btn sm primary" data-newfight title="Prepare a new fight in the inspector, without touching the tracker">New</button>
    <button class="btn sm" data-savefight ${own.length ? '' : 'disabled'} title="Save the foes and allies in the tracker (not the party) as a fight">From tracker</button></li>`;
  try {
    S.saved = await loadSaved();
    S.savedLoaded = true;
  } catch (e) { ul.innerHTML = form + `<li class="empty">${esc(e.message)}</li>`; return; }
  const list = S.saved.filter(f => f.name.toLowerCase().includes(q.toLowerCase()));
  ul.innerHTML = form + (list.map(f => {
    const counts = R.fightGroups(f.creatures).map(g => `${g.n > 1 ? `${g.n}× ` : ''}${g.name}${g.kind === 'ally' ? ' (ally)' : ''}`).join(', ') || 'No creatures yet';
    const xp = fightXp(f.creatures);
    const isSel = S.sel?.type === 'fight' && S.sel.id === f.id;
    return `<li class="${isSel ? 'sel' : ''}"><button class="r-main" data-openfight="${f.id}" title="Open in the inspector to prepare it"><span class="r-name">${esc(f.name)}</span><span class="r-meta">${esc(counts)}${xp ? ` · ${xp.toLocaleString()} XP` : ''}</span></button>
      <button class="add" data-loadfight="${f.id}" title="Add to combat"${f.creatures.length ? '' : ' disabled'}>+</button>
      <button class="add del" data-delfight="${f.id}" title="${S.confirm.delFight === f.id ? 'Click again to delete' : 'Delete this fight'}">${S.confirm.delFight === f.id ? '?' : '×'}</button></li>`;
  }).join('') || `<li class="empty">${S.saved.length ? `Nothing matches "${esc(q)}".` : 'No fights yet. Name one above and press New to prepare it, or save the foes in the tracker with From tracker.'}</li>`);
}

async function saveFight() {
  const name = $('#saveName').value.trim();
  if (!name) return toast('Name the fight first.');
  const creatures = S.enc.c.filter(c => c.kind !== 'pc').map(c => ({
    ref: c.ref, name: c.ref ? baseName(c.name) : c.name, kind: c.kind, max: c.max, ac: c.ac, mod: c.mod, xp: +c.xp || 0, notes: c.notes || '',
  }));
  const existing = (S.saved || []).find(f => f.name.toLowerCase() === name.toLowerCase());
  try {
    if (existing) {
      existing.creatures = creatures;          // the same object the planner shows, if it's open there
      await api(`/api/saved-encounters/${existing.id}`, { method: 'PUT', body: { name, creatures, notes: existing.notes || '' } });
      if (S.sel?.type === 'fight' && S.sel.id === existing.id) renderInspector();
    } else await api('/api/saved-encounters', { method: 'POST', body: { name, creatures, notes: '' } });
    toast(`${existing ? 'Updated' : 'Saved'} "${name}" (${creatures.length} creature${creatures.length > 1 ? 's' : ''}).`);
  } catch (e) { toast(e.message); }
  doSearch();
}

/** Add a saved fight's creatures from elsewhere (the wiki), loading the saved fights first if needed. */
export async function addFight(id) {
  if (!(S.saved || []).some(f => f.id === id)) {
    try { await loadSaved(); } catch (e) { return toast(e.message); }
  }
  return loadFight(id);
}

async function loadFight(id) {
  const f = (S.saved || []).find(x => x.id === id);
  if (!f) return;
  if (!f.creatures.length) return toast(`"${f.name}" has no creatures yet.`);
  const rollHp = $('#libRollHp').checked;
  let entries;
  try {
    entries = await Promise.all(f.creatures.map(c => (c.ref ? getEntry(...c.ref.split(':')) : null)));
  } catch (e) { return toast(`Could not load a monster: ${e.message}. Is the SRD imported?`); }
  remember(`Load "${f.name}"`);
  const added = f.creatures.map((s, i) => {
    const [name] = R.groupNames(S.enc, baseName(s.name), 1);
    const m = entries[i];
    const c = m ? monsterCombatant(m, s.ref.split(':')[1], name, rollHp, i, s.kind)
      : { id: uid(), name, kind: s.kind, init: rollInit() + (+s.mod || 0), mod: +s.mod || 0, ac: +s.ac || 10, hp: +s.max || 1, max: +s.max || 1,
        temp: 0, exh: 0, conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', seq: Date.now() + i / 100, rx: false, xp: +s.xp || 0 };
    if (s.notes) c.notes = s.notes;
    S.enc.c.push(c);
    return c;
  });
  const waiting = joined(added);
  saveEnc(); renderTracker();
  toast(`Added "${f.name}": ${added.map(c => `${c.name} ${c.init}`).join(', ')}.${waiting}`);
}

/** "Prepare: add to a fight" on a monster's stat block: adds the library's count to that fight, or to a new one. */
async function toFight(el) {
  const v = el.value, idx = el.dataset.idx;
  el.value = '';
  if (!v) return;
  const qty = Math.max(1, Math.min(20, parseInt($('#libQty').value, 10) || 1));
  if (v !== 'new') return addMonsterToFight(+v, idx, qty);
  const made = await newFight($('#saveName')?.value || 'New fight');
  if (made) await addMonsterToFight(made.id, idx, qty);
}

function onLibraryClick(e) {
  if (e.target.closest('[data-savefight]')) return saveFight();
  if (e.target.closest('[data-newfight]')) return newFight($('#saveName').value);
  const openF = e.target.closest('[data-openfight]');
  if (openF) return openFight(+openF.dataset.openfight);
  const load = e.target.closest('[data-loadfight]');
  if (load) return loadFight(+load.dataset.loadfight);
  const del = e.target.closest('[data-delfight]');
  if (del) {
    const id = +del.dataset.delfight;
    if (S.confirm.delFight === id) {
      S.confirm.delFight = null;
      return api(`/api/saved-encounters/${id}`, { method: 'DELETE' }).then(() => {
        S.saved = (S.saved || []).filter(f => f.id !== id);
        if (S.sel?.type === 'fight' && S.sel.id === id) { S.sel = null; renderInspector(); }
        doSearch();
      }, err => toast(err.message));
    }
    S.confirm.delFight = id;
    return doSearch();
  }
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
  const xp = Math.max(0, parseInt($('#a-xp').value, 10) || 0);
  if (!roll(hpStr)) return toast('HP needs a number or dice, like 45 or 6d8+18.');
  remember(`Add ${n > 1 ? n + '× ' : ''}${name}`);
  R.groupNames(S.enc, name, n).forEach((nm, i) => {
    const hp = Math.max(1, roll(hpStr).total);
    S.enc.c.push({ id: uid(), name: nm, kind, init: initRaw !== '' ? parseInt(initRaw, 10) : rollInit() + md, mod: md,
      ac, hp, max: hp, temp: 0, exh: 0, conds: [], slots: blankSlots(), ds: { s: 0, f: 0 }, notes: '', seq: Date.now() + i / 100, xp });
  });
  const waiting = joined(S.enc.c.slice(-n));
  saveEnc(); renderTracker();
  toast(`Added ${n > 1 ? n + '× ' : ''}${name}.${waiting}`);
  $('#a-name').value = ''; $('#a-init').value = '';
}

export function initCombat() {
  $('#list').addEventListener('click', onListClick);
  $('#list').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('[data-q]')) return;
    const c = S.enc.c.find(x => x.id === e.target.closest('.cb').dataset.id);
    if (!c) return;
    const v = amountOf(e.target.value, `${e.shiftKey ? 'Healing for' : 'Damage to'} ${who(c)}`);
    if (!v) return;
    remember(`${e.shiftKey ? 'Heal' : 'Damage'} ${who(c)} ${v}`);
    changed(c, e.shiftKey ? R.heal(ctx, c, v) : R.damage(ctx, c, v));
    renderTracker();
    if (S.sel?.id === c.id) renderInspector();
    $(`#q-${c.id}`)?.focus();
  });
  $('#list').addEventListener('change', e => {
    const c = S.enc.c.find(x => x.id === e.target.closest('.cb')?.dataset.id);
    if (!c) return;
    if (e.target.matches('[data-pick]')) {
      if (e.target.checked) S.targets.set(c.id, newTarget(c)); else S.targets.delete(c.id);
      return renderTracker();
    }
    if (!e.target.matches('[data-f="init"]')) return;
    remember(`Initiative for ${who(c)}`);
    c.init = parseInt(e.target.value, 10) || 0;
    saveEnc(); renderTracker();
  });

  $('#inspect').addEventListener('click', onInspectClick);
  $('#prompts').addEventListener('click', onPromptClick);
  $('#inspect').addEventListener('toggle', e => { if (e.target.matches('.condmore')) S.condMoreOpen = e.target.open; }, true);
  $('#inspect').addEventListener('change', e => {
    const c = selected();
    if (c && e.target.matches('[data-respool]') && ctx.linked(c)) { remember(`Resource for ${who(c)}`); onResourceEvent(e, ctx.linked(c)); return renderInspector(); }
    if (c && e.target.id === 'insType') { $('#insMod').value = R.defenseMod(R.defensesOf(c), e.target.value); return; }
    if (e.target.id === 'castSpell') { S.castSpell = e.target.value; return renderInspector(); }
    if (e.target.id === 'toFight') return toFight(e.target);
    if (c && e.target.matches('[data-aura]')) return setAura(c, e.target.dataset.aura, e.target.checked);
    if (c && e.target.id === 'atkCover') { S.atk.cover[c.id] = e.target.value; return; }
    if (!c || !['atkTarget', 'atkMode'].includes(e.target.id)) return;
    if (e.target.id === 'atkTarget') { S.atk.target[c.id] = e.target.value; if (S.atk.last?.by === c.id) S.atk.last = null; }
    else S.atk.mode[c.id] = e.target.value;
    renderInspector();
  });
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
      const pool = path.match(/^res\.(leg|lr)\.max$/);
      if (pool) {
        const p = c.res[pool[1]];
        p.max = Math.max(0, Math.min(9, p.max));
        p.used = Math.min(p.used, p.max);
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
    $('#libSearch').placeholder = { monster: 'Search monsters', spell: 'Search spells', item: 'Search weapons, armor, magic items', party: 'Search your party', saved: 'Search saved fights' }[S.libKind];
    doSearch();
  });
  $('#libSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 140); });
  $('#libResults').addEventListener('click', onLibraryClick);
  initFights({ addToCombat: id => loadFight(id), refreshLibrary: doSearch, renderInspector });

  $('#nextBtn').onclick = () => step(1);
  $('#prevBtn').onclick = () => step(-1);
  $('#endBtn').onclick = () => {
    const s = R.summary(ctx);
    remember('End combat'); R.endCombat(S.enc); saveEnc(); renderTracker();
    showSummary(s);
  };
  $('#summaryDlg').addEventListener('click', e => {
    const a = e.target.closest('[data-sum]')?.dataset.sum;
    if (a === 'clear') {
      remember('Remove defeated foes');
      R.removeCombatants(ctx, S.enc.c.filter(c => c.kind === 'foe' && R.hp(ctx, c) <= 0).map(c => c.id));
      if (S.sel?.type === 'c' && !selected()) S.sel = null;
      saveEnc(); renderTracker(); renderInspector();
    }
    if (a) $('#summaryDlg').close();
  });
  $('#undoBtn').onclick = () => undo(-1);
  $('#redoBtn').onclick = () => undo(1);
  $('#pickFoes').onclick = () => {
    S.enc.c.filter(c => c.kind === 'foe' && R.hp(ctx, c) > 0 && !S.targets.has(c.id)).forEach(c => S.targets.set(c.id, newTarget(c)));
    renderTracker();
    $('#gAmt')?.focus();
  };
  for (const type of ['click', 'change', 'input', 'keydown']) $('#groupBar').addEventListener(type, onGroupEvent);
  $('#clearFoes').onclick = () => {
    remember('Remove foes');
    R.removeCombatants(ctx, S.enc.c.filter(c => c.kind !== 'pc').map(c => c.id));
    if (S.sel?.type === 'c' && !selected()) S.sel = null;
    saveEnc(); renderTracker(); renderInspector();
  };
  $('#clearAll').onclick = () => {
    if (S.confirm.clear) {
      remember('Clear tracker');
      S.enc = { round: 1, active: null, acted: [], skip: S.enc.skip, c: [], ticks: [], prompts: [] };
      S.targets.clear();
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
