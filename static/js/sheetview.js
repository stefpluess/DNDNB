// The computed side of a character sheet (AC, attacks, saves, skills), shown in the Party view
// and, in a compact form, in the combat inspector.

import { attackAttrs } from './statblock.js';
import { esc, label, plusMinus, signed } from './util.js';

const UP = a => a.toUpperCase();

/** "Dwarf Fighter 5", or "Level 5" when race and class are empty. */
export const classLine = s =>
  [s.race, s.class_name && `${s.class_name} ${s.level}`].filter(Boolean).join(' ') || `Level ${s.level}`;

const RECOVER = { long: 'back on a Long Rest', short: 'back on a Short or Long Rest', short1: 'one back on a Short Rest, all on a Long Rest' };
/** Hit Dice and class resources. Pips (data-res, data-p) spend or restore a use; big pools take a number. */
function resourcesHtml(d) {
  const hd = d.hit_dice?.die ? `<span class="hint">Hit Dice: ${d.hit_dice.left} of ${d.hit_dice.total} d${d.hit_dice.die} left</span>` : '';
  if (!d.resources?.length) return hd ? `<div class="blk"><h4>Resources ${hd}</h4></div>` : '';
  const rows = d.resources.map(r => `<div class="resline"><span title="${esc(RECOVER[r.recover])}">${esc(r.name)}</span>${r.pool
    ? `<label class="hint"><input class="field tiny" type="number" min="0" max="${r.max}" data-respool="${r.key}" value="${r.max - r.used}" aria-label="${esc(r.name)} left"> of ${r.max} left</label>`
    : `<span class="pips">${Array.from({ length: r.max }, (_, p) => `<button class="pip ${p >= r.max - r.used ? 'spent' : ''}" data-res="${r.key}" data-p="${p}" aria-label="${esc(r.name)} ${p + 1}"></button>`).join('')}</span>`}
    <span class="hint">${esc(RECOVER[r.recover])}</span></div>`).join('');
  return `<div class="blk"><h4>Resources ${hd}</h4>${rows}</div>`;
}

/** Feature list items: gained ones in full, later ones dimmed; choices still to make are flagged. */
const featureItems = list => list.map(f => `<li class="${f.gained ? '' : 'later'}"><b>${esc(f.name)}</b> <small class="hint">level ${f.level}</small>
      ${f.choice ? `<span class="tag-s">${esc(f.choice)}</span>` : ''}${f.needs_choice && f.gained ? '<span class="dis">choose on the sheet</span>' : ''}
      <span class="ftext">${esc(f.choice_text || f.text)}</span></li>`).join('');
const spellLine = spells => Object.entries(spells || {}).map(([lv, names]) => `${lv}: ${names.map(esc).join(', ')}`).join(' · ');

/** The class's own features by level (with choices like Divine Order). */
function classFeaturesHtml(d, compact) {
  if (!d.class_features?.length) return '';
  const spells = spellLine(d.class_spells);
  const body = `<ul class="features">${featureItems(d.class_features)}</ul>${spells ? `<p class="hint"><b>Always prepared</b> ${spells}</p>` : ''}`;
  return `<div class="blk"><h4>Class features <span class="hint">${esc(d.class_source)}</span></h4><details${compact ? '' : ' open'}><summary class="hint">Level 1–20</summary>${body}</details></div>`;
}

/** The subclass's features by level. */
function subclassHtml(d, compact) {
  const sc = d.subclass;
  if (!sc) return '';
  const feats = featureItems(sc.features);
  const spells = Object.entries(sc.spells || {}).map(([lv, names]) => `${lv}: ${names.map(esc).join(', ')}`).join(' · ');
  const body = `<ul class="features">${feats}</ul>
    ${spells ? `<p class="hint"><b>Always prepared</b> (by class level) ${spells}</p>` : ''}
    ${sc.hp_per_level ? `<p class="hint">Remember: +${sc.hp_per_level} HP per class level in the Max HP field.</p>` : ''}
    <p class="hint">Summaries in our own words: check the ${esc(sc.source)} for the exact rules.</p>`;
  return `<div class="blk"><h4>${esc(sc.name)} <span class="hint">${esc(sc.source)}</span></h4>${compact ? `<details><summary class="hint">Features</summary>${body}</details>` : body}</div>`;
}

export function derivedHtml(ch, { compact = false } = {}) {
  const d = ch.derived, s = ch.sheet, name = s.name;
  const roll = (expr, type, lbl, text, cls = 'link', title = '', attrs = '') =>
    `<button class="${cls}" data-roll="${esc(expr)}" data-type="${type}" data-label="${esc(lbl)}"${title ? ` title="${esc(title)}"` : ''}${attrs}>${text}</button>`;

  const attacks = d.attacks.map(a => {
    const notes = [a.equipped ? '' : 'not equipped', a.mastery && a.mastery_known ? `Mastery: ${a.mastery}` : '',
      a.range, a.versatile, a.note].filter(Boolean).map(esc).join(' · ');
    const hitTitle = a.hit_parts.map(([k, v]) => `${k} ${signed(v)}`).join(', ');
    // flat damage (an Unarmed Strike without Martial Arts) still rolls as a number
    const dmg = a.damage_dice ? `${a.damage_dice}${a.damage_bonus ? plusMinus(a.damage_bonus) : ''}` : a.damage_bonus > 0 ? String(a.damage_bonus) : '';
    // what the tracker adds on a hit: Rage (while Raging), Sneak Attack, Divine Smite, Great Weapon Fighting
    const extra = { melee: !a.ranged, ...(a.rage ? { rage: a.rage } : {}), ...(a.sneak ? { sneak: a.sneak } : {}),
      ...(a.gwf ? { gwf: true } : {}), ...(d.smite && !a.ranged ? { smite: true } : {}),
      ...(a.crit ? { crit: a.crit } : {}), ...(a.riders ? { riders: a.riders } : {}),
      ...(a.mastery && a.mastery_known ? { mastery: a.mastery, mod: a.ability_mod, dc: a.mastery_dc } : {}) };
    return `<div class="atk ${a.equipped ? '' : 'off'}">
      <div class="top-line"><span class="nm">${esc(a.name)}</span>
        ${roll(`1d20${plusMinus(a.to_hit)}`, 'atk', `${name} · ${a.name} to hit`, signed(a.to_hit), 'btn roll', hitTitle, attackAttrs(a.name, [{ e: dmg, t: a.damage_type || '' }], extra))}
        ${dmg ? roll(dmg, 'dmg', `${name} · ${a.name} damage`, esc(a.damage), 'btn roll', `Shift-click for a critical hit${a.gwf ? '. Great Weapon Fighting: 1s and 2s count as 3' : ''}`, a.gwf ? ' data-min="3"' : '') : ''}</div>
      <span class="sub">${notes}</span></div>`;
  }).join('') || '<p class="hint">No weapons in the inventory.</p>';

  const saves = Object.entries(d.saves).map(([a, v]) =>
    `<span class="${v.proficient ? 'p' : ''}">${roll(`1d20${plusMinus(v.bonus)}`, 'check', `${name} ${UP(a)} save`, UP(a))}<span class="mono">${signed(v.bonus)}</span></span>`).join('');

  const skills = compact ? '' : `<div class="blk"><h4>Skills</h4><div class="kv">${Object.entries(d.skills).map(([k, v]) =>
    `<span class="${v.proficient ? 'p' : ''}">${roll(`1d20${plusMinus(v.bonus)}`, 'check', `${name} ${label(k)}`, label(k) + (v.expertise ? ' ★' : '') + (v.jack ? ' <span class="hint" title="Jack of All Trades: half your Proficiency Bonus">½</span>' : '') + (v.disadvantage ? ` <span class="dis" title="Disadvantage: ${esc(v.disadvantage)}">Dis.</span>` : ''))}<span class="mono">${signed(v.bonus)}</span></span>`).join('')}</div></div>`;

  const spell = d.spell ? `<div class="tiles">
      <div class="tile"><b>${d.spell.dc}</b><small>SPELL DC</small></div><div class="tile"><b>${signed(d.spell.attack)}</b><small>SPELL ATK</small></div>
      <div class="tile"><b>${UP(d.spell.ability)}</b><small>ABILITY</small></div><div class="tile"><b>${d.attuned}/3</b><small>ATTUNED</small></div></div>` : '';

  return `${d.warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('')}
    <div class="acbig"><div class="shield"><b>${d.ac}</b><small>AC</small></div>
      <ul class="breakdown">${d.ac_parts.map(([k, v]) => `<li><span>${esc(k)}</span><span class="mono">${signed(v)}</span></li>`).join('')}</ul></div>
    <div class="tiles">
      <div class="tile"><b>${signed(d.initiative)}</b><small>INIT</small></div><div class="tile"><b>${signed(d.prof_bonus)}</b><small>PROF</small></div>
      <div class="tile"><b>${d.speed}</b><small>SPEED</small></div><div class="tile"><b>${d.passive_perception}</b><small>PASSIVE PER.</small></div></div>
    ${spell}
    ${d.rage_damage || d.sneak_attack ? `<div class="tiles">${d.rage_damage ? `<div class="tile"><b>+${d.rage_damage}</b><small>RAGE DAMAGE</small></div>` : ''}${d.sneak_attack
      ? `<div class="tile">${roll(d.sneak_attack, 'dmg', `${name} · Sneak Attack`, `<b>${d.sneak_attack}</b>`, 'link', 'Once per turn: Finesse or Ranged weapon with Advantage, or an ally next to the target. Shift-click for a crit')}<small>SNEAK ATTACK</small></div>` : ''}</div>` : ''}
    ${resourcesHtml(d)}
    ${classFeaturesHtml(d, compact)}
    ${subclassHtml(d, compact)}
    <div class="blk"><h4>Attacks <span class="hint">shift-click damage for a crit</span></h4>${attacks}
      ${d.mastery_slots ? `<p class="hint">Weapon Mastery: ${(s.prof.mastery || []).length} of ${d.mastery_slots} known at level ${d.level} (tick them in the inventory).</p>` : ''}</div>
    <div class="blk"><h4>Saving throws</h4><div class="kv kv3">${saves}</div></div>
    ${skills}`;
}
