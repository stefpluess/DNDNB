// Combat rules for the tracker (D&D 2024). DOM-free so it can be tested in Node.
//
// Functions take a context `ctx = { enc, linked(c) }`:
//   enc        the encounter: { round, active, skip, c: [combatants], ticks: [] }
//   linked(c)  the character ({ sheet, derived }) a PC combatant is linked to, or null
// They change the encounter (and linked sheets) in place and return messages to show the DM.
//
// A combatant: { id, name, kind: 'pc'|'foe'|'ally', init, mod, seq, ac, hp, max, temp, exh,
//                conds: [{ n, d }], slots: [{max, used}], ds: { s, f }, ref?, charId?, notes }

// ---------- reading a combatant (PCs read HP, AC, slots and Exhaustion from their sheet) ----------

export function vit(ctx, c) {
  const ch = ctx.linked(c);
  return ch
    ? { o: ch.sheet, hp: 'hp', max: 'max_hp', temp: 'temp_hp', exh: 'exhaustion', ac: ch.derived.ac, slots: ch.sheet.slots, name: ch.sheet.name }
    : { o: c, hp: 'hp', max: 'max', temp: 'temp', exh: 'exh', ac: c.ac, slots: c.slots, name: c.name };
}
export const nameOf = (ctx, c) => vit(ctx, c).name;
export const hp = (ctx, c) => { const v = vit(ctx, c); return +v.o[v.hp] || 0; };
export const maxHp = (ctx, c) => { const v = vit(ctx, c); return Math.max(1, +v.o[v.max] || 1); };
export const tempHp = (ctx, c) => { const v = vit(ctx, c); return +v.o[v.temp] || 0; };
export const exhaustion = (ctx, c) => { const v = vit(ctx, c); return +v.o[v.exh] || 0; };
const set = (ctx, c, field, n) => { const v = vit(ctx, c); v.o[v[field]] = n; };

export const hasCond = (c, n) => c.conds.some(x => x.n === n);
export const concentrationDC = damage => Math.min(30, Math.max(10, Math.floor(damage / 2)));

// ---------- turn order ----------

export const sorted = enc => [...enc.c].sort((a, b) => b.init - a.init || b.mod - a.mod || a.seq - b.seq);
export const skippable = (ctx, c) => ctx.enc.skip && c.kind !== 'pc' && hp(ctx, c) <= 0;

/** Count down condition durations at the end of a creature's turn. */
export function tickEnd(ctx, c) {
  const gone = [];
  c.conds = c.conds.filter(x => {
    if (x.d > 0 && --x.d === 0) { gone.push(x.n); return false; }
    return true;
  });
  return gone.length ? [`${nameOf(ctx, c)}: ${gone.join(', ')} ended.`] : [];
}

/**
 * Move the turn forward (dir 1) or back (dir -1). Starting combat is step(ctx, 1) with no active turn.
 * Back restores the durations that the matching Next counted down.
 */
export function step(ctx, dir) {
  const { enc } = ctx;
  const L = sorted(enc);
  const msgs = [];
  if (!L.length) return msgs;
  enc.ticks ||= [];
  if (!enc.active) {
    enc.active = (L.find(c => !skippable(ctx, c)) || L[0]).id;
    enc.round = 1;
    enc.ticks = [];
  } else {
    let i = L.findIndex(c => c.id === enc.active);
    if (dir > 0 && i >= 0) {
      enc.ticks.push({ id: L[i].id, conds: JSON.parse(JSON.stringify(L[i].conds)) });
      if (enc.ticks.length > 200) enc.ticks.shift();
      msgs.push(...tickEnd(ctx, L[i]));
    }
    for (let n = 0; n < L.length; n++) {
      i += dir;
      if (i >= L.length) { i = 0; enc.round++; }
      if (i < 0) { i = L.length - 1; enc.round = Math.max(1, enc.round - 1); }
      if (!skippable(ctx, L[i])) break;
    }
    enc.active = L[i].id;
    const last = enc.ticks[enc.ticks.length - 1];
    if (dir < 0 && last && last.id === enc.active) { L[i].conds = last.conds; enc.ticks.pop(); }
  }
  const cur = enc.c.find(c => c.id === enc.active);
  if (cur && cur.kind === 'pc' && hp(ctx, cur) <= 0) msgs.push(`${nameOf(ctx, cur)} is dying: roll a death save.`);
  return msgs;
}

export function nextAfter(ctx, id) {
  const L = sorted(ctx.enc).filter(c => !skippable(ctx, c) || c.id === id);
  const i = L.findIndex(c => c.id === id);
  return L.length > 1 ? L[(i + 1) % L.length] : null;
}

export function endCombat(enc) {
  enc.active = null;
  enc.round = 1;
  enc.ticks = [];
}

/** Remove combatants; if the one whose turn it is goes, the turn passes to the next one in order. */
export function removeCombatants(ctx, ids) {
  const { enc } = ctx;
  const gone = new Set(ids);
  const L = sorted(enc);
  if (enc.active && gone.has(enc.active)) {
    const i = L.findIndex(x => x.id === enc.active);
    let next = null;
    for (let k = 1; k < L.length; k++) {
      const c = L[(i + k) % L.length];
      if (!gone.has(c.id) && !skippable(ctx, c)) { next = c; if (i + k >= L.length) enc.round++; break; }
    }
    enc.active = next ? next.id : null;
  }
  enc.c = enc.c.filter(x => !gone.has(x.id));
  enc.ticks = (enc.ticks || []).filter(t => !gone.has(t.id));
}

/**
 * Names for `count` new creatures called `base`. Numbers never repeat during a fight: new ones continue
 * after the highest number in use, and a lone unnumbered "Goblin" is renamed "Goblin 1".
 */
export function groupNames(enc, base, count) {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
  const own = enc.c.filter(c => !c.charId);
  let next = Math.max(0, ...own.map(c => +((c.name.match(re) || [])[1] || 0))) + 1;
  const plain = own.filter(c => c.name === base);
  if (count === 1 && !plain.length && next === 1) return [base];
  plain.forEach(c => { c.name = `${base} ${next++}`; });
  return Array.from({ length: count }, () => `${base} ${next++}`);
}

// ---------- hit points ----------

/** Apply damage. Temp HP absorbs it first; a critical hit at 0 HP counts as two death save failures. */
export function damage(ctx, c, amount, crit = false) {
  const name = nameOf(ctx, c);
  const msgs = [];
  const wasDown = hp(ctx, c) <= 0;
  const absorbed = Math.min(tempHp(ctx, c), amount);
  set(ctx, c, 'temp', tempHp(ctx, c) - absorbed);
  const rest = amount - absorbed;
  const before = hp(ctx, c);
  if (wasDown && c.kind === 'pc' && rest > 0) {
    c.ds.f = Math.min(3, c.ds.f + (crit ? 2 : 1));
    msgs.push(`${name} takes ${crit ? 'a critical hit' : 'damage'} at 0 HP: ${crit ? 'two death save failures' : 'one death save failure'}.`);
    if (c.ds.f >= 3) msgs.push(`${name} has died.`);
  }
  set(ctx, c, 'hp', Math.max(0, before - rest));
  if (!wasDown && hp(ctx, c) === 0) {
    if (c.kind === 'pc' && rest - before >= maxHp(ctx, c)) msgs.push(`Massive damage: ${name} dies outright.`);
    if (c.kind === 'pc') {
      msgs.push(`${name} drops to 0 HP.`);
      if (!hasCond(c, 'Unconscious')) c.conds.push({ n: 'Unconscious', d: null });
    } else msgs.push(`${name} is down.`);
    if (hasCond(c, 'Concentrating')) {
      c.conds = c.conds.filter(x => x.n !== 'Concentrating');
      msgs.push('Concentration lost.');
    }
  } else if (hp(ctx, c) > 0 && hasCond(c, 'Concentrating')) {
    msgs.push(`${name}: Con save DC ${concentrationDC(amount)} to keep concentration.`);
  }
  return msgs;
}

export function heal(ctx, c, amount) {
  const wasDown = hp(ctx, c) <= 0;
  set(ctx, c, 'hp', Math.min(maxHp(ctx, c), hp(ctx, c) + amount));
  if (wasDown && hp(ctx, c) > 0) {
    c.ds = { s: 0, f: 0 };
    c.conds = c.conds.filter(x => x.n !== 'Unconscious');
    return [`${nameOf(ctx, c)} is back up.`];
  }
  return [];
}

/** Temp HP doesn't stack: keep the higher value. */
export function giveTemp(ctx, c, amount) {
  const msgs = amount <= tempHp(ctx, c) ? [`Kept ${tempHp(ctx, c)} temp HP; temp HP doesn't stack.`] : [];
  set(ctx, c, 'temp', Math.max(tempHp(ctx, c), amount));
  return msgs;
}

/**
 * 2024 death save with a natural d20 roll `die`: 10+ succeeds, a natural 20 regains 1 HP,
 * a natural 1 counts as two failures. Exhaustion applies (it's a d20 Test).
 */
export function deathSave(ctx, c, die) {
  const name = nameOf(ctx, c);
  const pen = 2 * exhaustion(ctx, c);
  const total = die - pen;
  let outcome;
  if (die === 20) { heal(ctx, c, 1); outcome = 'natural 20, regains 1 HP'; }
  else if (die === 1) { c.ds.f = Math.min(3, c.ds.f + 2); outcome = 'natural 1, two failures'; }
  else if (total >= 10) { c.ds.s = Math.min(3, c.ds.s + 1); outcome = 'success'; }
  else { c.ds.f = Math.min(3, c.ds.f + 1); outcome = 'failure'; }
  const msgs = c.ds.s >= 3 ? [`${name} is stable.`] : c.ds.f >= 3 ? [`${name} has died.`]
    : die === 20 ? [`${name} is back up with 1 HP.`] : [`Death save: ${outcome}.`];
  return { total, outcome, pen, msgs, cls: die === 20 ? 'crit' : die === 1 ? 'fumble' : '' };
}

// ---------- conditions ----------

/** Add a condition (or reset its duration). Adding Exhaustion raises its level instead. */
export function addCondition(ctx, c, name, rounds) {
  if (name === 'Exhaustion') return setExhaustion(ctx, c, exhaustion(ctx, c) + 1);
  const d = rounds > 0 ? rounds : null;
  const existing = c.conds.find(x => x.n === name);
  if (existing) existing.d = d; else c.conds.push({ n: name, d });
  return [];
}

export function setExhaustion(ctx, c, level) {
  const n = Math.max(0, Math.min(6, level));
  set(ctx, c, 'exh', n);
  return n === 6 ? [`${nameOf(ctx, c)} reaches Exhaustion 6 and dies.`] : [];
}

// ---------- spell slots ----------

/** Clicking pip p: an available slot is spent, a spent one is restored. */
export function toggleSlot(slot, p) {
  if (p < slot.max - slot.used) slot.used++;
  else slot.used = Math.max(0, slot.used - 1);
}
