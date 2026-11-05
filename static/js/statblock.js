// HTML for reference entries in the 2024 style: monster stat blocks, spells and items.
// Monsters from the SRD and homebrew creatures share one shape (Open5e SRD 5.2), so one renderer serves both.

import { S } from './store.js';
import { esc, fmtCR, label, mod, nm, plusMinus, signed } from './util.js';

const UP = a => a.toUpperCase();

/** The small Markdown subset used in SRD text: paragraphs, bullet lists, **bold**, *italic*, tables as text. */
export function mdLite(text) {
  const inline = t => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|\W)[_*](\S.*?\S|\S)[_*](?=\W|$)/g, '$1<i>$2</i>');
  return String(text || '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length && lines.every(l => /^\s*[-*•]\s+/.test(l))) {
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.length && lines.every(l => l.trim().startsWith('|'))) return `<pre class="tbl">${esc(lines.join('\n'))}</pre>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

export const monAC = m => +m.armor_class || 10;
export const monInit = m => m.initiative_bonus ?? m.modifiers?.dexterity ?? 0;

function usage(u) {
  if (!u || !u.type) return '';
  const t = u.type.toUpperCase();
  if (t.startsWith('RECHARGE_ON_ROLL')) return ` (Recharge ${u.param}${u.param < 6 ? '–6' : ''})`;
  if (t.startsWith('PER_DAY')) return ` (${u.param}/Day)`;
  if (t.includes('REST')) return ' (Recharges after a Rest)';
  return u.param ? ` (${u.param}/${label(t.toLowerCase())})` : '';
}

const dieExpr = (count, die, bonus) => {
  const d = count && die ? `${count}${String(die).toLowerCase()}` : '';
  return d ? d + (bonus ? plusMinus(bonus) : '') : (bonus ? String(bonus) : '');
};

const rollBtn = (expr, type, lbl, text, title = '') =>
  `<button class="btn roll" data-roll="${esc(expr)}" data-type="${type}" data-label="${esc(lbl)}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</button>`;

function featHtml(f, who) {
  const btns = [];
  for (const a of f.attacks || []) {
    if (a.to_hit_mod != null) btns.push(rollBtn(`1d20${plusMinus(a.to_hit_mod)}`, 'atk', `${who} · ${f.name} to hit`, `${signed(a.to_hit_mod)} to hit`));
    const dmg = dieExpr(a.damage_die_count, a.damage_die_type, a.damage_bonus);
    if (dmg) btns.push(rollBtn(dmg, 'dmg', `${who} · ${f.name} ${nm(a.damage_type)} damage`, `${dmg} ${nm(a.damage_type).toLowerCase()}`, 'Shift-click for a critical hit'));
    const extra = dieExpr(a.extra_damage_die_count, a.extra_damage_die_type, a.extra_damage_bonus);
    if (extra) btns.push(rollBtn(extra, 'dmg', `${who} · ${f.name} ${nm(a.extra_damage_type)} damage`, `+ ${extra} ${nm(a.extra_damage_type).toLowerCase()}`, 'Shift-click for a critical hit'));
  }
  const cost = f.action_type === 'LEGENDARY_ACTION' && f.legendary_action_cost > 1 ? ` (Costs ${f.legendary_action_cost} Actions)` : '';
  const head = `<span class="fname">${esc(f.name)}${usage(f.usage_limits)}${cost}.</span> `;
  let body = mdLite(f.desc);
  body = body.startsWith('<p>') ? body.replace('<p>', '<p>' + head) : `<p>${head}</p>${body}`;
  return `<div class="feat"><div class="prose">${body}</div>${btns.length ? `<div class="rolls">${btns.join('')}</div>` : ''}</div>`;
}

/** Title line for a monster: "Small Fey (Goblinoid), chaotic neutral". */
export const monsterLine = m =>
  `${nm(m.size)} ${nm(m.type)}${m.subcategory ? ` (${m.subcategory})` : ''}, ${m.alignment || ''}`;

export function statBlock(m) {
  const who = m.name;
  const { abilities, ability_long: LONG } = S.meta;
  const sp = m.speed_all || m.speed || {};
  const unit = sp.unit === 'feet' || !sp.unit ? 'ft.' : sp.unit;
  const speed = ['walk', 'burrow', 'climb', 'fly', 'swim'].filter(k => sp[k])
    .map(k => k === 'walk' ? `${sp[k]} ${unit}` : `${label(k)} ${sp[k]} ${unit}${k === 'fly' && sp.hover ? ' (hover)' : ''}`).join(', ');
  const ri = m.resistances_and_immunities || {};
  const skills = Object.entries(m.skill_bonuses || {}).map(([k, v]) => `${label(k)} ${signed(v)}`).join(', ');
  const senses = ['blindsight', 'darkvision', 'tremorsense', 'truesight'].filter(k => m[`${k}_range`]).map(k => `${label(k)} ${m[`${k}_range`]} ft.`);
  senses.push(`Passive Perception ${m.passive_perception}`);
  const immunities = [ri.damage_immunities_display, ri.condition_immunities_display].filter(Boolean).join('; ');
  const prop = (k, v) => v ? `<div><b>${k}</b> ${esc(v)}</div>` : '';
  const actions = (m.actions || []).slice().sort((a, b) => (a.order_in_statblock || 0) - (b.order_in_statblock || 0));
  const group = (title, type) => {
    const arr = actions.filter(a => (a.action_type || 'ACTION') === type);
    return arr.length ? `<div class="blk"><h4>${title}</h4>${arr.map(f => featHtml(f, who)).join('')}</div>` : '';
  };
  const saveAll = m.saving_throws_all || m.saving_throws || {};
  const init = monInit(m);
  const rows = abilities.map(a => {
    const k = LONG[a];
    const score = (m.ability_scores || {})[k] ?? 10;
    const md = (m.modifiers || {})[k] ?? mod(score);
    const sv = saveAll[k] ?? md;
    const prof = (m.saving_throws || {})[k] != null && sv !== md;
    return `<tr><th>${UP(a)}</th><td class="mono">${score}</td>
      <td><button class="link mono" data-roll="1d20${plusMinus(md)}" data-type="check" data-label="${esc(who)} ${UP(a)} check">${signed(md)}</button></td>
      <td><button class="link mono ${prof ? 'p' : ''}" data-roll="1d20${plusMinus(sv)}" data-type="check" data-label="${esc(who)} ${UP(a)} save">${signed(sv)}</button></td></tr>`;
  }).join('');
  return `<div class="statblock">
    <div class="props">
      <div><b>AC</b> ${monAC(m)}${m.armor_detail ? ` (${esc(m.armor_detail)})` : ''} <b class="gap">Initiative</b> ${rollBtn(`1d20${plusMinus(init)}`, 'check', `${who} initiative`, `${signed(init)} (${10 + init})`)}</div>
      <div><b>HP</b> ${m.hit_points} (${esc(m.hit_dice || '')}) ${m.hit_dice ? rollBtn(m.hit_dice, 'hp', `${who} HP`, 'Roll') : ''}</div>
      ${prop('Speed', speed)}
    </div>
    <table class="abil"><thead><tr><th></th><th>Score</th><th>Mod</th><th>Save</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="props">
      ${prop('Skills', skills)}
      ${prop('Vulnerabilities', ri.damage_vulnerabilities_display)}${prop('Resistances', ri.damage_resistances_display)}${prop('Immunities', immunities)}
      ${prop('Senses', senses.join(', '))}${prop('Languages', m.languages?.as_string || 'None')}
      <div><b>CR</b> ${fmtCR(+m.challenge_rating)} (XP ${(m.experience_points || 0).toLocaleString()}; PB ${signed(m.proficiency_bonus ?? 2)})</div>
    </div>
    ${(m.traits || []).length ? `<div class="blk"><h4>Traits</h4>${m.traits.map(f => featHtml(f, who)).join('')}</div>` : ''}
    ${group('Actions', 'ACTION')}${group('Bonus Actions', 'BONUS_ACTION')}${group('Reactions', 'REACTION')}${group('Legendary Actions', 'LEGENDARY_ACTION')}
  </div>`;
}

export function spellHtml(s) {
  const school = nm(s.school);
  const lvl = s.level ? `Level ${s.level} ${school}` : `${school} cantrip`;
  const comps = [s.verbal && 'V', s.somatic && 'S', s.material && 'M'].filter(Boolean).join(', ')
    + (s.material && s.material_specified ? ` (${s.material_specified})` : '');
  const classes = (s.classes || []).map(nm).join(', ');
  return `<div class="ins-head"><h2>${esc(s.name)}</h2><p>${esc(lvl)}${classes ? ` (${esc(classes)})` : ''}</p></div>
    <div class="props">
      <div><b>Casting Time</b> ${esc(label(s.casting_time || ''))}${s.ritual ? ' or Ritual' : ''}</div>
      <div><b>Range</b> ${esc(s.range_text || '')}</div>
      <div><b>Components</b> ${esc(comps)}</div>
      <div><b>Duration</b> ${s.concentration ? 'Concentration, ' : ''}${esc(s.duration || '')}</div>
      ${s.saving_throw_ability ? `<div><b>Save</b> ${esc(label(s.saving_throw_ability))}</div>` : ''}
      ${s.attack_roll ? '<div><b>Attack</b> Spell attack roll</div>' : ''}
      ${s.damage_roll ? `<div><b>Damage</b> ${rollBtn(s.damage_roll, 'dmg', `${s.name} damage`, `${s.damage_roll} ${(s.damage_types || []).join(', ')}`)}</div>` : ''}
    </div>
    <div class="prose">${mdLite(s.desc)}${s.higher_level ? `<p><b>Using a Higher-Level Spell Slot.</b> ${esc(s.higher_level)}</p>` : ''}</div>`;
}

const masteryOf = w => (w?.properties || []).find(p => (p.property?.type || '').toLowerCase() === 'mastery');

/** An equipment or magic item, with a "Give to a character" control when characters exist. */
export function itemHtml(kind, idx, it, characters) {
  const rows = [];
  const w = it.weapon, a = it.armor, mastery = masteryOf(w);
  if (w) {
    rows.push(['Weapon', w.is_simple ? 'Simple' : 'Martial']);
    rows.push(['Damage', `${w.damage_dice} ${nm(w.damage_type).toLowerCase()}`]);
    const others = (w.properties || []).filter(p => p !== mastery).map(p => nm(p.property) + (p.detail ? ` (${p.detail})` : ''));
    if (others.length) rows.push(['Properties', others.join(', ')]);
    if (mastery) rows.push(['Mastery', nm(mastery.property)]);
  }
  if (a) {
    // Open5e labels the Shield "heavy"; like rules.is_shield, trust a shield's name and its small AC bonus
    const shield = (a.category || '').toLowerCase() === 'shield' || (/\bshields?\b/i.test(it.name) && +a.ac_base < 10);
    rows.push(['Armor', shield ? 'Shield' : label(a.category || '')]);
    rows.push(['AC', shield ? `+${a.ac_base}` : a.ac_display || a.ac_base]);
    if (a.strength_score_required) rows.push(['Strength', a.strength_score_required]);
    if (a.grants_stealth_disadvantage) rows.push(['Stealth', 'Disadvantage']);
  }
  if (it.rarity) rows.push(['Rarity', nm(it.rarity) + (it.requires_attunement ? ` (requires attunement${it.attunement_detail ? ' ' + it.attunement_detail : ''})` : '')]);
  if (+it.cost) rows.push(['Cost', `${+it.cost} GP`]);
  if (+it.weight) rows.push(['Weight', `${+it.weight} ${it.weight_unit || 'lb'}`]);
  const opts = characters.map(c => `<option value="${c.id}">${esc(c.sheet.name)}</option>`).join('');
  return `<div class="ins-head"><h2>${esc(it.name)}</h2><p>${esc(nm(it.category))}</p></div>
    <div class="props">${rows.map(([k, v]) => `<div><b>${k}</b> ${esc(v)}</div>`).join('')}</div>
    <div class="prose">${mdLite(it.desc)}${mastery?.property?.desc ? `<p><b>${esc(nm(mastery.property))} (mastery).</b> ${esc(mastery.property.desc)}</p>` : ''}</div>
    ${opts ? `<div class="blk"><h4>Give to a character</h4><div class="line"><select class="field" id="giveTo">${opts}</select>
      <button class="btn" data-give="${esc(kind)}:${esc(idx)}">Add to inventory</button></div></div>` : ''}`;
}
