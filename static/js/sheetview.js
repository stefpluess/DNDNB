// The computed side of a character sheet (AC, attacks, saves, skills), shown in the Party view
// and, in a compact form, in the combat inspector.

import { esc, label, plusMinus, signed } from './util.js';

const UP = a => a.toUpperCase();

/** "Dwarf Fighter 5", or "Level 5" when race and class are empty. */
export const classLine = s =>
  [s.race, s.class_name && `${s.class_name} ${s.level}`].filter(Boolean).join(' ') || `Level ${s.level}`;

export function derivedHtml(ch, { compact = false } = {}) {
  const d = ch.derived, s = ch.sheet, name = s.name;
  const roll = (expr, type, lbl, text, cls = 'link', title = '') =>
    `<button class="${cls}" data-roll="${esc(expr)}" data-type="${type}" data-label="${esc(lbl)}"${title ? ` title="${esc(title)}"` : ''}>${text}</button>`;

  const attacks = d.attacks.map(a => {
    const notes = [a.equipped ? '' : 'not equipped', a.mastery && a.mastery_known ? `Mastery: ${a.mastery}` : '',
      a.range, a.versatile, a.note].filter(Boolean).map(esc).join(' · ');
    const hitTitle = a.hit_parts.map(([k, v]) => `${k} ${signed(v)}`).join(', ');
    const dmg = a.damage_dice ? `${a.damage_dice}${a.damage_bonus ? plusMinus(a.damage_bonus) : ''}` : '';
    return `<div class="atk ${a.equipped ? '' : 'off'}">
      <div class="top-line"><span class="nm">${esc(a.name)}</span>
        ${roll(`1d20${plusMinus(a.to_hit)}`, 'atk', `${name} · ${a.name} to hit`, signed(a.to_hit), 'btn roll', hitTitle)}
        ${dmg ? roll(dmg, 'dmg', `${name} · ${a.name} damage`, esc(a.damage), 'btn roll', 'Shift-click for a critical hit') : ''}</div>
      <span class="sub">${notes}</span></div>`;
  }).join('') || '<p class="hint">No weapons in the inventory.</p>';

  const saves = Object.entries(d.saves).map(([a, v]) =>
    `<span class="${v.proficient ? 'p' : ''}">${roll(`1d20${plusMinus(v.bonus)}`, 'check', `${name} ${UP(a)} save`, UP(a))}<span class="mono">${signed(v.bonus)}</span></span>`).join('');

  const skills = compact ? '' : `<div class="blk"><h4>Skills</h4><div class="kv">${Object.entries(d.skills).map(([k, v]) =>
    `<span class="${v.proficient ? 'p' : ''}">${roll(`1d20${plusMinus(v.bonus)}`, 'check', `${name} ${label(k)}`, label(k) + (v.expertise ? ' ★' : ''))}<span class="mono">${signed(v.bonus)}</span></span>`).join('')}</div></div>`;

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
    <div class="blk"><h4>Attacks <span class="hint">shift-click damage for a crit</span></h4>${attacks}
      ${d.mastery_slots ? `<p class="hint">Weapon Mastery: ${(s.prof.mastery || []).length} of ${d.mastery_slots} known at level 1 (tick them in the inventory).</p>` : ''}</div>
    <div class="blk"><h4>Saving throws</h4><div class="kv kv3">${saves}</div></div>
    ${skills}`;
}
