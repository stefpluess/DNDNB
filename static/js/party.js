// The Party view: character list (left), sheet editor (middle), computed stats (right).
// All rules math happens on the server (rules.py); this view edits the sheet and shows the result.

import { bindForm } from './forms.js';
import { classLine, derivedHtml } from './sheetview.js';
import { S, api, charOp, onCharSaved, onResourceEvent, scheduleCharSave } from './store.js';
import { addChar } from './tracker.js';
import { handleRollClick } from './ui.js';
import { $, esc, label, ordinal, signed, toast, uid } from './util.js';

const UP = a => a.toUpperCase();
const BASE_WEAPONS = ['simple', 'martial', 'martial-light', 'martial-finesse-light'];
const current = () => S.chars.get(S.currentChar) || null;

export function renderParty() { renderCharList(); renderSheet(); renderDerived(); }

function renderCharList() {
  const list = [...S.chars.values()].sort((a, b) => a.sheet.name.localeCompare(b.sheet.name));
  $('#charList').innerHTML = list.map(c => `<li><button class="${c.id === S.currentChar ? 'on' : ''}" data-char="${c.id}">
      <b>${esc(c.sheet.name)}</b><span>${esc(classLine(c.sheet))}</span></button></li>`).join('')
    || '<li class="hint">No characters yet.</li>';
}

function renderDerived() {
  const ch = current();
  $('#derived').innerHTML = ch ? derivedHtml(ch) : '';
}

function updateScoreMods() {
  const ch = current();
  if (!ch) return;
  for (const a of S.meta.abilities) {
    const m = $(`#mod-${a}`), n = $(`#note-${a}`);
    if (m) m.textContent = signed(ch.derived.mods[a]);
    if (n) n.textContent = ch.derived.score_notes[a] ? `${ch.derived.scores[a]} from ${ch.derived.score_notes[a]}` : '';
  }
}

function inventoryRows(s) {
  const magicish = it => ['wondrous', 'gear'].includes(it.type);
  return s.inventory.map((it, i) => {
    const p = `inventory.${i}`;
    const mastery = it.weapon?.mastery ? `<label class="itype" title="This character can use the weapon's mastery property">
        <input type="checkbox" data-list="prof.mastery" value="${esc(it.weapon.index)}" ${(s.prof.mastery || []).includes(it.weapon.index) ? 'checked' : ''}> ${esc(it.weapon.mastery)}</label>` : '';
    const mods = magicish(it) ? `<div class="mods">${[['ac', 'AC'], ['saves', 'Saves'], ['attack', 'Attack'], ['damage', 'Damage'], ['spell_dc', 'Spell DC']].map(([k, l]) =>
        `<label>${l} <input class="field n" type="number" data-path="${p}.mods.${k}" data-type="num" value="${(it.mods || {})[k] || 0}"></label>`).join('')}
        <label><input type="checkbox" data-path="${p}.attune" ${it.attune ? 'checked' : ''}> needs attunement</label></div>` : '';
    return `<tr>
      <td><input type="checkbox" data-path="${p}.equipped" ${it.equipped ? 'checked' : ''} aria-label="Equipped"></td>
      <td><input class="field wide" data-path="${p}.name" data-required value="${esc(it.name)}" aria-label="Name"></td>
      <td class="itype">${esc(it.type)}${it.weapon ? ` · ${esc(it.weapon.dice || '')}` : ''}${it.armor && it.type === 'armor' ? ` · AC ${it.armor.base}` : ''}</td>
      <td>${['weapon', 'armor', 'shield'].includes(it.type) ? `<input class="field n" type="number" data-path="${p}.bonus" data-type="num" value="${it.bonus || 0}" aria-label="Magic bonus">` : ''}</td>
      <td>${it.attune ? `<label class="itype"><input type="checkbox" data-path="${p}.attuned" ${it.attuned ? 'checked' : ''}> attuned</label>` : ''}${mastery}</td>
      <td><input class="field n" type="number" min="0" data-path="${p}.qty" data-type="num" value="${it.qty ?? 1}" aria-label="Quantity"></td>
      <td><button class="link" data-rmitem="${i}" aria-label="Remove ${esc(it.name)}">Remove</button></td>
    </tr>${mods || it.notes ? `<tr class="sub"><td></td><td colspan="6">${mods}${it.notes ? `<p class="hint">${esc(it.notes)}</p>` : ''}</td></tr>` : ''}`;
  }).join('');
}

/** The subclass picker (subclasses of the sheet's class, every edition) and the choices it asks for. */
function subclassFields(s) {
  const cls = (s.class_name || '').trim().toLowerCase();
  const list = S.meta.subclasses.filter(x => x.class === cls);
  const cur = S.meta.subclasses.find(x => x.key === s.subclass);
  // 2024 versions first; versions replaced by a 2024 one go under "Older versions"
  const opt = x => `<option value="${x.key}"${x.key === s.subclass ? ' selected' : ''}>${esc(x.name)} (${esc(x.source)}${x.rules === '2014' && !x.superseded_by ? ', 2014 rules' : ''})</option>`;
  const current = list.filter(x => !x.superseded_by), older = list.filter(x => x.superseded_by);
  const opts = `<optgroup label="Current">${current.map(opt).join('')}</optgroup>`
    + (older.length ? `<optgroup label="Older versions (replaced in 2024)">${older.map(opt).join('')}</optgroup>` : '');
  const stale = cur && cur.class !== cls ? `<option value="${cur.key}" selected>${esc(cur.name)} (${esc(cur.source)}, not ${esc(s.class_name || 'this class')})</option>` : '';
  const choices = (cur?.choices || []).map(c => `<label class="lbl-f">${esc(c.feature)} <small class="hint">level ${c.level}</small>
      <select class="field" data-path="choices.${esc(c.feature)}" data-type="opt"><option value="">Choose…</option>${c.options.map(o =>
        `<option value="${o.key}"${(s.choices || {})[c.feature] === o.key ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`).join('');
  return `<label class="lbl-f">Subclass <select class="field" data-path="subclass" data-type="opt" id="f-subclass">
      <option value="">${list.length ? 'None yet' : cls ? 'No subclasses for this class' : 'Set a class first'}</option>${stale}${opts}</select></label>${choices}`;
}

function renderSheet() {
  const box = $('#sheet'), ch = current();
  if (!ch) {
    box.innerHTML = '<div class="empty-list">Create a character to track their sheet. AC, attack bonuses and damage are worked out from abilities, proficiencies and equipped gear.</div>';
    return;
  }
  const s = ch.sheet, p = s.prof;
  const num = (path, val, extra = '') => `<input class="field" type="number" data-path="${path}" data-type="num" id="f-${path}" value="${val ?? ''}" ${extra}>`;
  const txt = (path, val, extra = '') => `<input class="field" data-path="${path}" id="f-${path}" value="${esc(val ?? '')}" ${extra}>`;
  const chk = (list, value, text) => `<label><input type="checkbox" data-list="${list}" value="${value}" ${(list.split('.').reduce((o, k) => o?.[k], s) || []).includes(value) ? 'checked' : ''}> ${text}</label>`;
  const inv = inventoryRows(s);
  box.innerHTML = `
  <div class="sec"><h3>${esc(s.name)} <span class="line"><label class="hint" title="Hit Dice to spend on the Short Rest">Spend <input class="field tiny" type="number" min="0" max="${ch.derived.hit_dice.left}" id="restDice" value="0"> of ${ch.derived.hit_dice.left} HD</label>
    <button class="btn sm" data-sa="shortrest">Short rest</button><button class="btn sm" data-sa="rest">Long rest</button><button class="btn sm" data-sa="tocombat">Add to combat</button></span></h3>
    <div class="grid g4">
      <label class="lbl-f">Name ${txt('name', s.name, 'data-required')}</label><label class="lbl-f">Player ${txt('player', s.player)}</label>
      <label class="lbl-f">Race ${txt('race', s.race)}</label><label class="lbl-f">Class ${txt('class_name', s.class_name, 'list="classList"')}</label>
      ${subclassFields(s)}
      <label class="lbl-f">Level ${num('level', s.level, 'min="1" max="20"')}</label><label class="lbl-f">Max HP ${num('max_hp', s.max_hp, 'min="1"')}</label>
      <label class="lbl-f">Current HP ${num('hp', s.hp, 'min="0"')}</label><label class="lbl-f">Temp HP ${num('temp_hp', s.temp_hp, 'min="0"')}</label>
      <label class="lbl-f">Speed ${num('speed', s.speed)}</label><label class="lbl-f">Other AC bonus ${num('ac_misc', s.ac_misc)}</label>
      <label class="lbl-f">Initiative bonus ${num('init_misc', s.init_misc)}</label><label class="lbl-f">Exhaustion (0–6) ${num('exhaustion', s.exhaustion || 0, 'min="0" max="6"')}</label>
      <label class="lbl-f">Spellcasting ability <select class="field" data-path="spell_ability" data-type="opt" id="f-spell_ability"><option value="">From class</option>
        ${S.meta.abilities.map(a => `<option value="${a}" ${s.spell_ability === a ? 'selected' : ''}>${UP(a)}</option>`).join('')}</select></label>
    </div>
    <datalist id="classList">${S.meta.classes.map(c => `<option value="${c}">`).join('')}</datalist>
  </div>
  <div class="sec"><h3>Ability scores</h3>
    <div class="scores">${S.meta.abilities.map(a => `<div class="score"><small>${UP(a)}</small><span class="mod" id="mod-${a}"></span>
      <input class="field" type="number" min="1" max="30" data-path="abilities.${a}" data-type="num" id="f-abilities.${a}" value="${s.abilities[a]}" aria-label="${UP(a)} score">
      <span class="note" id="note-${a}"></span></div>`).join('')}</div>
  </div>
  <div class="sec"><h3>Proficiencies <button class="link" data-sa="classdefaults">Fill from class</button></h3>
    <div class="blk"><h4>Saving throws</h4><div class="checks">${S.meta.abilities.map(a => chk('prof.saves', a, UP(a))).join('')}</div></div>
    <div class="blk"><h4>Armor</h4><div class="checks">${['light', 'medium', 'heavy', 'shields'].map(a => chk('prof.armor', a, label(a))).join('')}</div></div>
    <div class="blk"><h4>Weapons</h4><div class="checks">${chk('prof.weapons', 'simple', 'Simple')}${chk('prof.weapons', 'martial', 'Martial')}
      ${chk('prof.weapons', 'martial-light', 'Martial with Light')}${chk('prof.weapons', 'martial-finesse-light', 'Martial with Finesse or Light')}
      <label class="grow">Others <input class="field" id="f-otherweapons" data-special="otherweapons" value="${esc(p.weapons.filter(w => !BASE_WEAPONS.includes(w)).join(', '))}" placeholder="rapier, hand-crossbow"></label></div></div>
    <div class="blk"><h4>Skills <span class="hint">second box is expertise</span></h4><div class="skillgrid">${Object.entries(S.meta.skills).map(([k, a]) =>
      `<label><input type="checkbox" data-list="prof.skills" value="${k}" ${p.skills.includes(k) ? 'checked' : ''} aria-label="${label(k)} proficiency"><input type="checkbox" data-list="prof.expertise" value="${k}" ${p.expertise.includes(k) ? 'checked' : ''} aria-label="${label(k)} expertise"> ${label(k)}<span class="ab">${UP(a)}</span></label>`).join('')}</div></div>
    <div class="blk"><h4>Fighting style</h4><div class="checks">${S.meta.fighting_styles.map(f => chk('styles', f, label(f) + (['great_weapon', 'thrown_weapon', 'two_weapon', 'unarmed'].includes(f) ? ' Fighting' : ''))).join('')}</div></div>
  </div>
  <div class="sec"><h3>Inventory <span class="line"><button class="link" data-sa="customitem">Add custom item</button></span></h3>
    <div class="itemsearch"><input class="field wide" type="search" id="itemSearch" placeholder="Search weapons, armor and magic items to add" autocomplete="off"><ul class="results" id="itemResults" hidden></ul></div>
    <table class="inv"><thead><tr><th title="Equipped">Eq.</th><th>Item</th><th>Type</th><th>Magic</th><th>Attuned / Mastery</th><th>Qty</th><th></th></tr></thead>
      <tbody>${inv || '<tr><td colspan="7" class="hint">Nothing carried yet. Search above to add gear; tick Eq. to wear or wield it.</td></tr>'}</tbody></table>
    <p class="hint">Equipped armor, shields and items count toward AC and bonuses. Attack bonuses are listed for every weapon carried.</p>
  </div>
  <div class="sec"><h3>Spell slots <button class="link" data-sa="slots">Use ${esc(s.class_name || 'class')} table</button></h3>
    <div class="slotedit">${s.slots.map((sl, i) => `<label>${ordinal(i + 1)}<input class="field" type="number" min="0" max="9" id="f-slot-${i}" data-path="slots.${i}.max" data-type="num" value="${sl.max}"></label>`).join('')}</div>
  </div>
  <div class="sec"><h3>Notes</h3><textarea class="field" data-path="notes" id="f-notes" rows="4">${esc(s.notes)}</textarea></div>
  <div class="acts"><button class="btn sm bad" data-sa="delete">${S.confirm.delChar === ch.id ? 'Click again to delete' : 'Delete character'}</button></div>`;
  updateScoreMods();
}

async function onSheetAction(a, ch) {
  if (a !== 'delete') S.confirm.delChar = null;
  switch (a) {
    case 'classdefaults':
      if (!ch.sheet.class_name) return toast('Set a class first.');
      await charOp(ch.id, { apply_class_defaults: true });
      return toast(`Filled saves, armor and weapon proficiencies for ${ch.sheet.class_name}.`);
    case 'slots':
      await charOp(ch.id, { apply_slots: true });
      return toast('Spell slots set from the class table.');
    case 'customitem':
      ch.sheet.inventory.push({ uid: uid(), name: 'Custom item', type: 'wondrous', equipped: true, bonus: 0, qty: 1, mods: {}, notes: '', attune: false, attuned: false });
      return charOp(ch.id);
    case 'rest':
      await charOp(ch.id, { rest: 'long' });
      return toast(`${ch.sheet.name} finished a Long Rest: HP, Hit Dice, spell slots and class resources back; Exhaustion −1.`);
    case 'shortrest': {
      const n = parseInt($('#restDice')?.value, 10) || 0;
      const { res } = await charOp(ch.id, { rest: 'short', hit_dice: n });
      const r = res.rest;
      return toast(`${ch.sheet.name} finished a Short Rest${r.rolls.length ? `: rolled ${r.rolls.join(', ')} on d${r.die} ${signed(r.con)} Con each, regained ${r.healed} HP` : ''}.`
        + `${ch.sheet.class_name.toLowerCase() === 'warlock' ? ' Pact slots back.' : ''}`);
    }
    case 'tocombat': {
      const r = addChar(ch.id);
      if (r) toast(`Added to combat with initiative ${r.split(' ').pop()}.`);
      return;
    }
    case 'delete':
      if (S.confirm.delChar === ch.id) {
        await api(`/api/characters/${ch.id}`, { method: 'DELETE' });
        S.chars.delete(ch.id);
        S.enc.c.forEach(c => { if (c.charId === ch.id) c.charId = null; });   // keeps them in the fight as plain combatants
        S.currentChar = S.chars.keys().next().value ?? null;
        S.confirm.delChar = null;
      } else S.confirm.delChar = ch.id;
      return renderParty();
  }
}

export function initParty() {
  $('#newChar').onclick = async () => {
    const res = await api('/api/characters', { method: 'POST', body: { sheet: { name: 'New character' } } });
    S.chars.set(res.id, res);
    S.currentChar = res.id;
    renderParty();
    $('#f-name')?.select();
  };
  $('#charList').addEventListener('click', e => {
    const b = e.target.closest('[data-char]');
    if (!b) return;
    S.currentChar = +b.dataset.char;
    S.confirm.delChar = null;
    renderParty();
  });

  bindForm($('#sheet'), {
    target: () => current()?.sheet,
    onEdit: (path, _value, _el, phase) => {
      const ch = current();
      const slot = path.match(/^slots\.(\d+)\.max$/);
      if (slot) { const s = ch.sheet.slots[+slot[1]]; s.max = Math.max(0, Math.min(9, s.max)); s.used = Math.min(s.used, s.max); }
      scheduleCharSave(ch.id);
      if (['name', 'class_name', 'level', 'race'].includes(path)) renderCharList();
      // the subclass list follows the class, and a subclass brings its own choices
      if (phase === 'change' && (path === 'class_name' || path === 'subclass')) renderSheet();
      if (/\.attune$/.test(path)) renderSheet();
    },
  });
  $('#sheet').addEventListener('change', e => {
    const ch = current();
    if (!ch || e.target.dataset.special !== 'otherweapons') return;
    const base = ch.sheet.prof.weapons.filter(w => BASE_WEAPONS.includes(w));
    const others = e.target.value.split(',').map(x => x.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
    ch.sheet.prof.weapons = [...new Set([...base, ...others])];
    scheduleCharSave(ch.id);
  });
  $('#sheet').addEventListener('click', async e => {
    const ch = current();
    if (!ch) return;
    const rm = e.target.closest('[data-rmitem]');
    if (rm) { ch.sheet.inventory.splice(+rm.dataset.rmitem, 1); return charOp(ch.id); }
    const add = e.target.closest('[data-additem]');
    if (add) {
      const [kind, idx] = add.dataset.additem.split(':');
      const item = await api(`/api/item-template/${kind}/${idx}`);
      // wield new weapons; wear new armor or a shield unless one is already worn
      item.equipped = item.type === 'weapon'
        || (['armor', 'shield'].includes(item.type) && !ch.sheet.inventory.some(i => i.type === item.type && i.equipped));
      ch.sheet.inventory.push(item);
      await charOp(ch.id);
      if (item.notes) toast(item.notes);
      return $('#itemSearch')?.focus();
    }
    const b = e.target.closest('[data-sa]');
    if (b) onSheetAction(b.dataset.sa, ch);
  });

  let itemTimer;
  $('#sheet').addEventListener('input', e => {
    if (e.target.id !== 'itemSearch') return;
    clearTimeout(itemTimer);
    itemTimer = setTimeout(async () => {
      const q = e.target.value.trim(), ul = $('#itemResults');
      if (!q) { ul.hidden = true; return; }
      const rows = await api(`/api/search?kind=equipment,magic-item&q=${encodeURIComponent(q)}&limit=30`).catch(() => []);
      ul.innerHTML = rows.map(r => `<li><button class="r-main" data-additem="${r.kind}:${r.idx}"><span class="r-name">${esc(r.name)}</span><span class="r-meta">${esc(r.meta)}</span></button></li>`).join('')
        || `<li class="empty">${S.srdCounts.equipment ? 'Nothing matches.' : 'No item data. Run python import_srd.py first.'}</li>`;
      ul.hidden = false;
    }, 140);
  });
  document.addEventListener('click', e => {
    const ul = $('#itemResults');
    if (ul && !e.target.closest('#sheet .itemsearch')) ul.hidden = true;
  });
  $('#derived').addEventListener('click', e => {
    if (onResourceEvent(e, current())) return renderDerived();
    handleRollClick(e);
  });
  $('#derived').addEventListener('change', e => { if (onResourceEvent(e, current())) renderDerived(); });

  onCharSaved((id, { structural }) => {
    if (S.view !== 'party' || S.currentChar !== id) return;
    if (structural) renderParty();
    else { renderDerived(); updateScoreMods(); }
  });
}

export function showParty() {
  if (!S.currentChar && S.chars.size) S.currentChar = S.chars.keys().next().value;
  renderParty();
}
