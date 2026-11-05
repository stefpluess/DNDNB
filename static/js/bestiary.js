// The Bestiary view: homebrew creature list (left), editor (middle), live stat block (right).
// The server (homebrew.py) works out derived values: saves, PB/XP from CR, attacks, auto descriptions.

import { bindForm } from './forms.js';
import { monsterLine, statBlock } from './statblock.js';
import { S, api, onMonSaved, saveMonNow, scheduleMonSave } from './store.js';
import { addMonster } from './tracker.js';
import { handleRollClick } from './ui.js';
import { $, esc, fmtCR, label, signed, toast } from './util.js';

const UP = a => a.toUpperCase();
const ATTACK_FIELDS = /^actions\.(\d+)\.(desc|_hb\.(?:to_hit|reach|dmg|dtype|extra|etype|kind))$/;
const STRUCTURAL = /(_hb\.kind|_hb\.usage|action_type)$/;

async function loadMonList() {
  try { S.monList = await api('/api/homebrew'); } catch { S.monList = []; }
  renderMonList();
}

async function openMon(idx) {
  if (S.curMon) await saveMonNow(S.curMon.idx).catch(() => {});   // don't lose edits to the one we leave
  try { S.curMon = await api(`/api/homebrew/${idx}`); }
  catch (e) { toast(e.message); S.curMon = null; await loadMonList(); }
  S.confirm.delMon = null;
  renderBestiary();
}

function renderBestiary() { renderMonList(); renderMonEditor(); renderMonPreview(); }

function renderMonList() {
  $('#monList').innerHTML = S.monList.map(m => `<li><button class="${S.curMon?.idx === m.idx ? 'on' : ''}" data-mon="${m.idx}">
      <b>${esc(m.name)}</b><span>${esc((m.meta || '').replace(/^Homebrew · /, ''))}</span></button></li>`).join('')
    || '<li class="hint">No homebrew creatures yet. Start from scratch or copy an SRD monster.</li>';
}

function renderMonPreview() {
  const box = $('#monPreview');
  const d = S.curMon?.data;
  box.innerHTML = d ? `<div class="ins-head"><h2>${esc(d.name)}</h2><p>${esc(monsterLine(d))}</p></div>${statBlock(d)}` : '';
}

/** Refresh the values the server works out, without touching the field being typed in. */
function refreshComputed(d) {
  for (const a of S.meta.abilities) {
    const k = S.meta.ability_long[a];
    const m = $(`#mm-${a}`), s = $(`#ms-${a}`);
    if (m) m.textContent = signed(d.modifiers[k]);
    if (s) s.textContent = signed(d.saving_throws_all[k]);
  }
  (d.actions || []).forEach((a, i) => {
    const ta = document.getElementById(`m-actions.${i}.desc`);
    if (ta && a._hb?.autodesc && document.activeElement !== ta) ta.value = a.desc;
    const th = document.getElementById(`m-actions.${i}._hb.to_hit`);
    if (th) th.placeholder = `auto ${signed(a._hb?.to_hit_auto ?? 0)}`;
  });
  const init = document.getElementById('m-_hb.init');
  if (init) init.placeholder = `auto ${signed(d.modifiers.dexterity)}`;
  const ro = $('#monEditor .ro');
  if (ro) ro.textContent = `${signed(d.proficiency_bonus)} · ${(d.experience_points || 0).toLocaleString()} XP`;
}

function actionHtml(a, i) {
  const ah = a._hb || {};
  const attack = ah.kind === 'melee' || ah.kind === 'ranged';
  const dtypes = [['', '—'], ...S.meta.damage_types.map(x => [x, x])];
  return `<div class="mrow">
    <div class="grid g-act">
      <label class="lbl-f">Name ${txt(`actions.${i}.name`, a.name, 'placeholder="Bite"')}</label>
      <label class="lbl-f">Kind ${sel(`actions.${i}.action_type`, a.action_type, Object.entries(S.meta.action_types))}</label>
      <label class="lbl-f">Limited use ${sel(`actions.${i}._hb.usage`, ah.usage || '', [['', 'None'], ['recharge', 'Recharge'], ['day', 'Per day']])}</label>
      ${ah.usage ? `<label class="lbl-f">${ah.usage === 'recharge' ? 'Recharge on' : 'Uses per day'} ${num(`actions.${i}._hb.usage_param`, ah.usage_param ?? (ah.usage === 'recharge' ? 5 : 1), 'min="1" max="6"')}</label>` : ''}
      ${a.action_type === 'LEGENDARY_ACTION' ? `<label class="lbl-f">Costs ${num(`actions.${i}.legendary_action_cost`, a.legendary_action_cost || 1, 'min="1" max="3"')}</label>` : ''}
    </div>
    <div class="grid g-atk">
      <label class="lbl-f">Attack roll ${sel(`actions.${i}._hb.kind`, ah.kind || 'none', [['none', 'None'], ['melee', 'Melee'], ['ranged', 'Ranged']])}</label>
      ${attack ? `<label class="lbl-f">To hit ${num(`actions.${i}._hb.to_hit`, ah.to_hit, `placeholder="auto ${signed(ah.to_hit_auto ?? 0)}"`, 'numnull')}</label>
      <label class="lbl-f">${ah.kind === 'melee' ? 'Reach' : 'Range'} ${txt(`actions.${i}._hb.reach`, ah.reach, `placeholder="${ah.kind === 'melee' ? '5 ft.' : '80/320 ft.'}"`)}</label>
      <label class="lbl-f">Damage ${txt(`actions.${i}._hb.dmg`, ah.dmg, 'placeholder="2d6+3"')}</label>
      <label class="lbl-f">Type ${sel(`actions.${i}._hb.dtype`, ah.dtype || '', dtypes)}</label>
      <label class="lbl-f">Extra damage ${txt(`actions.${i}._hb.extra`, ah.extra, 'placeholder="1d6"')}</label>
      <label class="lbl-f">Type ${sel(`actions.${i}._hb.etype`, ah.etype || '', dtypes)}</label>` : ''}
    </div>
    <p class="warn" id="stale-${i}" ${attack && ah.stale && !ah.autodesc ? '' : 'hidden'}>The description no longer matches the attack fields.
      <button class="link" data-ma="rewrite" data-i="${i}">Rewrite it from the attack</button></p>
    <label class="lbl-f">Description ${ah.autodesc ? '<span class="hint">written from the attack fields; edit to write your own</span>' : ''}
      <textarea class="field" data-path="actions.${i}.desc" id="m-actions.${i}.desc" rows="2" placeholder="${attack ? 'Leave empty to generate from the attack' : 'What happens, including any saving throw DC'}">${esc(a.desc)}</textarea></label>
    <div class="acts"><button class="link" data-ma="up" data-i="${i}" ${i ? '' : 'disabled'}>Move up</button><button class="link" data-ma="rmaction" data-i="${i}">Remove</button></div>
  </div>`;
}

// field builders for the editor (data-path writes into S.curMon.data)
const txt = (path, val, extra = '') => `<input class="field" data-path="${path}" id="m-${path}" value="${esc(val ?? '')}" ${extra}>`;
const num = (path, val, extra = '', type = 'num') => `<input class="field" type="number" data-path="${path}" data-type="${type}" id="m-${path}" value="${val ?? ''}" ${extra}>`;
const sel = (path, val, opts, type = '') => `<select class="field" data-path="${path}" ${type ? `data-type="${type}"` : ''} id="m-${path}">${opts.map(([v, l]) =>
  `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

function renderMonEditor() {
  const box = $('#monEditor');
  if (!S.curMon) {
    box.innerHTML = '<div class="empty-list">Create a creature, or copy an SRD monster as a starting point. Saved creatures show up in the combat library like any other monster.</div>';
    return;
  }
  const d = S.curMon.data, hb = d._hb || {}, mods = d.modifiers || {}, ri = d.resistances_and_immunities || {};
  const traits = (d.traits || []).map((t, i) => `<div class="mrow">
      <div class="line">${txt(`traits.${i}.name`, t.name, 'placeholder="Trait name, e.g. Pack Tactics" aria-label="Trait name"')}<button class="link" data-ma="rmtrait" data-i="${i}">Remove</button></div>
      <textarea class="field" data-path="traits.${i}.desc" id="m-traits.${i}.desc" rows="2" placeholder="What it does" aria-label="Trait description">${esc(t.desc)}</textarea></div>`).join('');
  box.innerHTML = `
  <div class="sec"><h3>${esc(d.name)} <span class="line"><button class="btn sm" data-ma="tocombat">Add to combat</button><button class="btn sm" data-ma="dup">Duplicate</button>
      <button class="btn sm bad" data-ma="delete">${S.confirm.delMon === S.curMon.idx ? 'Click again to delete' : 'Delete'}</button></span></h3>
    <div class="grid g4">
      <label class="lbl-f">Name ${txt('name', d.name, 'data-required')}</label>
      <label class="lbl-f">Size ${sel('size.name', d.size?.name, S.meta.sizes.map(x => [x, x]))}</label>
      <label class="lbl-f">Type ${txt('type.name', d.type?.name, 'placeholder="Humanoid, Undead, Fiend…"')}</label>
      <label class="lbl-f">Tag ${txt('subcategory', d.subcategory, 'placeholder="optional, e.g. Wizard"')}</label>
      <label class="lbl-f">Alignment ${txt('alignment', d.alignment)}</label>
      <label class="lbl-f">Challenge rating ${sel('challenge_rating', d.challenge_rating, S.meta.cr_values.map(c => [c, `CR ${fmtCR(c)}`]), 'num')}</label>
      <label class="lbl-f">AC ${num('armor_class', d.armor_class)}</label>
      <label class="lbl-f">AC note ${txt('armor_detail', d.armor_detail, 'placeholder="natural armor"')}</label>
      <label class="lbl-f">Hit points ${num('hit_points', d.hit_points, 'min="1"')}</label>
      <label class="lbl-f">Hit dice <span class="line">${txt('hit_dice', d.hit_dice, 'placeholder="6d8+12"')}<button class="link" data-ma="avghp" title="Set HP to the average of the hit dice">Average</button></span></label>
      <label class="lbl-f">Initiative ${num('_hb.init', hb.init, `placeholder="auto ${signed(mods.dexterity ?? 0)}"`, 'numnull')}</label>
      <label class="lbl-f">Proficiency / XP <span class="field ro">${signed(d.proficiency_bonus ?? 2)} · ${(d.experience_points || 0).toLocaleString()} XP</span></label>
    </div>
  </div>
  <div class="sec"><h3>Speed</h3><div class="grid g6">
    ${['walk', 'fly', 'climb', 'swim', 'burrow'].map(k => `<label class="lbl-f">${label(k)} (ft.) ${num(`speed_all.${k}`, d.speed_all?.[k] || 0, 'min="0" step="5"')}</label>`).join('')}
    <label class="lbl-f">Hover <span class="checks"><label><input type="checkbox" data-path="speed_all.hover" ${d.speed_all?.hover ? 'checked' : ''}> can hover</label></span></label>
  </div></div>
  <div class="sec"><h3>Ability scores <span class="hint">tick the saves it's proficient in</span></h3>
    <div class="scores">${S.meta.abilities.map(a => { const k = S.meta.ability_long[a]; return `<div class="score"><small>${UP(a)}</small><span class="mod" id="mm-${a}">${signed(mods[k] ?? 0)}</span>
      <input class="field" type="number" min="1" max="30" data-path="ability_scores.${k}" data-type="num" id="m-ability_scores.${k}" value="${d.ability_scores?.[k] ?? 10}" aria-label="${UP(a)} score">
      <label class="hint"><input type="checkbox" data-list="_hb.saves" value="${k}" ${(hb.saves || []).includes(k) ? 'checked' : ''}> save <span id="ms-${a}">${signed(d.saving_throws_all?.[k] ?? 0)}</span></label></div>`; }).join('')}</div>
  </div>
  <div class="sec"><h3>Details</h3><div class="grid g4">
    <label class="lbl-f g-wide">Skills ${txt('_hb.skills_text', hb.skills_text, 'placeholder="Perception +5, Stealth +6"')}</label>
    <label class="lbl-f g-wide">Languages ${txt('languages.as_string', d.languages?.as_string, 'placeholder="Common, Goblin"')}</label>
    <label class="lbl-f">Vulnerabilities ${txt('resistances_and_immunities.damage_vulnerabilities_display', ri.damage_vulnerabilities_display)}</label>
    <label class="lbl-f">Resistances ${txt('resistances_and_immunities.damage_resistances_display', ri.damage_resistances_display, 'placeholder="Cold, Necrotic"')}</label>
    <label class="lbl-f">Damage immunities ${txt('resistances_and_immunities.damage_immunities_display', ri.damage_immunities_display, 'placeholder="Poison"')}</label>
    <label class="lbl-f">Condition immunities ${txt('resistances_and_immunities.condition_immunities_display', ri.condition_immunities_display, 'placeholder="Charmed, Poisoned"')}</label>
    ${['blindsight', 'darkvision', 'tremorsense', 'truesight'].map(k => `<label class="lbl-f">${label(k)} (ft.) ${num(`${k}_range`, d[`${k}_range`] || 0, 'min="0" step="5"')}</label>`).join('')}
  </div></div>
  <div class="sec"><h3>Traits <button class="link" data-ma="addtrait">Add trait</button></h3>${traits || '<p class="hint">No traits.</p>'}</div>
  <div class="sec"><h3>Actions <button class="link" data-ma="addaction">Add action</button></h3>${(d.actions || []).map(actionHtml).join('') || '<p class="hint">No actions.</p>'}
    <p class="hint">Fill in the attack fields and the roll buttons appear in combat. Leave "To hit" empty to use proficiency plus Strength or Dexterity.</p></div>`;
}

/**
 * Editing an action's description makes it hand-written; editing its attack fields while the description
 * is hand-written flags it as out of date, so the stat block text and the roll buttons can't silently disagree.
 */
function markActionEdit(path) {
  const m = path.match(ATTACK_FIELDS);
  if (!m) return;
  const i = +m[1], a = S.curMon.data.actions[i];
  a._hb ||= {};
  if (m[2] === 'desc') { a._hb.autodesc = false; a._hb.stale = false; }
  else if (!a._hb.autodesc) a._hb.stale = true;
  const note = document.getElementById(`stale-${i}`);
  if (note) note.hidden = !(a._hb.stale && ['melee', 'ranged'].includes(a._hb.kind));
}

async function onEditorAction(a, i) {
  const d = S.curMon.data, idx = S.curMon.idx;
  if (a !== 'delete') S.confirm.delMon = null;
  switch (a) {
    case 'addtrait': (d.traits ||= []).push({ name: '', desc: '' }); break;
    case 'rmtrait': d.traits.splice(i, 1); break;
    case 'addaction':
      (d.actions ||= []).push({ name: '', action_type: 'ACTION', desc: '',
        _hb: { kind: 'melee', to_hit: null, reach: '5 ft.', dmg: '', dtype: 'Slashing', extra: '', etype: '', autodesc: true, usage: '', usage_param: null } });
      break;
    case 'rmaction': d.actions.splice(i, 1); break;
    case 'up': if (i > 0) [d.actions[i - 1], d.actions[i]] = [d.actions[i], d.actions[i - 1]]; break;
    case 'rewrite': Object.assign(d.actions[i]._hb, { autodesc: true, stale: false }); d.actions[i].desc = ''; break;
    case 'avghp': {
      const m = String(d.hit_dice || '').replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
      if (!m) return toast('Enter hit dice like 6d8+12 first.');
      d.hit_points = Math.max(1, Math.floor(+m[1] * (+m[2] + 1) / 2) + (+m[3] || 0));
      break;
    }
    case 'tocombat':
      await saveMonNow(idx);
      return addMonster(idx);
    case 'dup': {
      await saveMonNow(idx);
      const res = await api('/api/homebrew', { method: 'POST', body: { copy_of: idx } });
      await loadMonList();
      return openMon(res.idx);
    }
    case 'delete':
      if (S.confirm.delMon !== idx) { S.confirm.delMon = idx; return renderMonEditor(); }
      await saveMonNow(idx).catch(() => {});      // let any pending save finish before deleting
      await api(`/api/homebrew/${idx}`, { method: 'DELETE' });
      S.entryCache.delete(`monster:${idx}`);
      S.curMon = null; S.confirm.delMon = null;
      await loadMonList();
      return renderBestiary();
  }
  renderMonEditor();
  scheduleMonSave(idx);
}

export function initBestiary() {
  bindForm($('#monEditor'), {
    target: () => S.curMon?.data,
    onEdit: (path, value, el, phase) => {
      markActionEdit(path);
      if (phase === 'change' && STRUCTURAL.test(path)) renderMonEditor();
      scheduleMonSave(S.curMon.idx);
    },
  });
  $('#monEditor').addEventListener('click', e => {
    const b = e.target.closest('[data-ma]');
    if (b && S.curMon) onEditorAction(b.dataset.ma, +b.dataset.i);
  });
  $('#monPreview').addEventListener('click', handleRollClick);
  $('#monList').addEventListener('click', e => { const b = e.target.closest('[data-mon]'); if (b) openMon(b.dataset.mon); });
  $('#newMon').onclick = async () => {
    const res = await api('/api/homebrew', { method: 'POST', body: { name: 'New creature' } });
    await loadMonList();
    await openMon(res.idx);
    document.getElementById('m-name')?.select();
  };

  let copyTimer;
  $('#copySearch').addEventListener('input', e => {
    clearTimeout(copyTimer);
    copyTimer = setTimeout(async () => {
      const q = e.target.value.trim(), ul = $('#copyResults');
      if (!q) { ul.hidden = true; return; }
      const rows = (await api(`/api/search?kind=monster&q=${encodeURIComponent(q)}&limit=30`).catch(() => [])).filter(r => !r.idx.startsWith('hb-'));
      ul.innerHTML = rows.map(r => `<li><button class="r-main" data-copy="${r.idx}"><span class="r-name">${esc(r.name)}</span><span class="r-meta">${esc(r.meta)}</span></button></li>`).join('')
        || `<li class="empty">${S.srdCounts.monster ? 'Nothing matches.' : 'No SRD data yet. Run python import_srd.py first.'}</li>`;
      ul.hidden = false;
    }, 140);
  });
  $('#copyResults').addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    $('#copyResults').hidden = true;
    $('#copySearch').value = '';
    const res = await api('/api/homebrew', { method: 'POST', body: { copy_of: b.dataset.copy } });
    await loadMonList();
    await openMon(res.idx);
    toast(`Copied ${res.data.name.replace(/ \(variant\)$/, '')}. Change whatever you like.`);
  });
  document.addEventListener('click', e => {
    const ul = $('#copyResults');
    if (ul && !e.target.closest('#view-bestiary .itemsearch')) ul.hidden = true;
  });

  onMonSaved((idx, res, latest) => {
    if (S.curMon?.idx !== idx) return;
    if (latest) S.curMon.data = res.data;     // newer typing is already queued otherwise
    renderMonList();
    renderMonPreview();
    if (latest) refreshComputed(res.data);
  });
}

export async function showBestiary() {
  await loadMonList();
  if (!S.curMon && S.monList.length) return openMon(S.monList[0].idx);
  renderBestiary();
}
