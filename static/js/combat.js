// Combat rules for the tracker (D&D 2024). DOM-free so it can be tested in Node.
//
// Functions take a context `ctx = { enc, linked(c) }`:
//   enc        the encounter: { round, active, acted: [ids], skip, c: [combatants], ticks: [] }
//   linked(c)  the character ({ sheet, derived }) a PC combatant is linked to, or null
// They change the encounter (and linked sheets) in place and return messages to show the DM.
//
// A combatant: { id, name, kind: 'pc'|'foe'|'ally', init, mod, seq, ac, hp, max, temp, exh,
//                conds: [{ n, d, src?, at?, fresh? }], slots: [{max, used}], ds: { s, f }, ref?, charId?, notes }

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
//
// enc.acted lists who has already taken their turn this round, so editing someone's initiative or adding
// a creature mid-round never makes anyone act twice or lose a turn. Each Next turn saves a snapshot in
// enc.ticks so Previous turn can put back the turn, the round and every condition timer.

export const sorted = enc => [...enc.c].sort((a, b) => b.init - a.init || b.mod - a.mod || a.seq - b.seq);
export const skippable = (ctx, c) => ctx.enc.skip && c.kind !== 'pc' && hp(ctx, c) <= 0;

/** Who has gone this round. Encounters saved before enc.acted existed: everyone above the active creature. */
export function actedIds(enc) {
  if (!enc.active) return [];
  if (!Array.isArray(enc.acted)) {
    const L = sorted(enc);
    enc.acted = L.slice(0, Math.max(0, L.findIndex(c => c.id === enc.active))).map(c => c.id);
  }
  return enc.acted;
}

/** A combatant's place in the round: 'now', 'done' (already acted), 'next' (still to come) or null outside combat. */
export function turnState(enc, c) {
  if (!enc.active) return null;
  if (c.id === enc.active) return 'now';
  return actedIds(enc).includes(c.id) ? 'done' : 'next';
}

const condLabel = (ctx, x) => {
  const src = x.src && ctx.enc.c.find(c => c.id === x.src);
  return src ? `${x.n} (from ${nameOf(ctx, src)})` : x.n;
};

/**
 * Count down condition timers when `who`'s turn hits `at` ('start' or 'end'). A timer without a source
 * counts down at the end of its bearer's own turn; one with a source counts down on the source's turn.
 */
export function tick(ctx, who, at) {
  const msgs = [];
  for (const c of ctx.enc.c) {
    const gone = [];
    c.conds = c.conds.filter(x => {
      const owner = x.src || c.id, when = x.src ? (x.at || 'end') : 'end';
      if (owner !== who.id || when !== at || !(x.d > 0)) return true;
      if (x.fresh) { delete x.fresh; return true; }
      if (--x.d === 0) { gone.push(condLabel(ctx, x)); return false; }
      return true;
    });
    if (gone.length) msgs.push(`${nameOf(ctx, c)}: ${gone.join(', ')} ended.`);
  }
  return msgs;
}
/** Kept for callers that only tick a creature's own conditions at the end of its turn. */
export const tickEnd = (ctx, c) => tick(ctx, c, 'end');

const snapshot = enc => ({
  id: enc.active, round: enc.round, acted: [...actedIds(enc)],
  conds: Object.fromEntries(enc.c.map(c => [c.id, JSON.parse(JSON.stringify(c.conds))])),
});

function dyingNote(ctx) {
  const cur = ctx.enc.c.find(c => c.id === ctx.enc.active);
  return cur && cur.kind === 'pc' && hp(ctx, cur) <= 0 ? [`${nameOf(ctx, cur)} is dying: roll a death save.`] : [];
}

/** The first creature in initiative order that hasn't acted this round and isn't skipped. */
const nextUp = (ctx, acted) => sorted(ctx.enc).find(c => !acted.includes(c.id) && !skippable(ctx, c));

/**
 * Move the turn forward (dir 1) or back (dir -1). Starting combat is step(ctx, 1) with no active turn.
 * Back restores the turn, round and condition timers from before the matching Next.
 */
export function step(ctx, dir) {
  const { enc } = ctx;
  const L = sorted(enc);
  const msgs = [];
  if (!L.length) return msgs;
  enc.ticks ||= [];
  if (!enc.active) {
    enc.round = 1;
    enc.acted = [];
    enc.ticks = [];
    enc.active = (nextUp(ctx, []) || L[0]).id;
    msgs.push(...tick(ctx, enc.c.find(c => c.id === enc.active), 'start'));
    return [...msgs, ...dyingNote(ctx)];
  }
  if (dir > 0) {
    const cur = enc.c.find(c => c.id === enc.active);
    enc.ticks.push(snapshot(enc));
    if (enc.ticks.length > 100) enc.ticks.shift();
    msgs.push(...tick(ctx, cur, 'end'));
    const acted = [...actedIds(enc), cur.id];
    let nx = nextUp(ctx, acted);
    if (nx) enc.acted = acted;
    else { enc.round++; enc.acted = []; nx = nextUp(ctx, []) || cur; }
    enc.active = nx.id;
    msgs.push(...tick(ctx, nx, 'start'));
    return [...msgs, ...dyingNote(ctx)];
  }
  // back
  let snap;
  while ((snap = enc.ticks.pop()) && (!snap.acted || !enc.c.some(c => c.id === snap.id)));
  if (snap) {
    enc.active = snap.id;
    enc.round = snap.round;
    enc.acted = snap.acted.filter(id => enc.c.some(c => c.id === id));
    for (const c of enc.c) if (snap.conds[c.id]) c.conds = snap.conds[c.id];
  } else {
    // no history (an older save): step back in initiative order without touching timers
    let i = L.findIndex(c => c.id === enc.active);
    for (let n = 0; n < L.length; n++) {
      i--;
      if (i < 0) { i = L.length - 1; enc.round = Math.max(1, enc.round - 1); }
      if (!skippable(ctx, L[i])) break;
    }
    enc.active = L[i].id;
    enc.acted = L.slice(0, i).map(c => c.id);
  }
  return dyingNote(ctx);
}

/** Who goes after `id`: the rest of this round first, then the top of the next round. */
export function nextAfter(ctx, id) {
  const { enc } = ctx;
  const acted = [...actedIds(enc), id];
  const nx = nextUp(ctx, acted) || sorted(enc).find(c => !skippable(ctx, c) && c.id !== id);
  return nx && nx.id !== id ? nx : null;
}

export function endCombat(enc) {
  enc.active = null;
  enc.round = 1;
  enc.acted = [];
  enc.ticks = [];
}

/**
 * A creature joined a fight in progress. If its initiative is above the creature whose turn it is,
 * its turn this round has already passed, so it starts acting next round.
 * Returns true when it has to wait for the next round.
 */
export function joinCombat(ctx, c) {
  const { enc } = ctx;
  if (!enc.active || c.id === enc.active) return false;
  const L = sorted(enc);
  const waits = L.findIndex(x => x.id === c.id) < L.findIndex(x => x.id === enc.active);
  if (waits) enc.acted = [...actedIds(enc), c.id];
  return waits;
}

/**
 * Remove combatants. If the one whose turn it is goes, the turn passes to the next one in order.
 * Conditions they were the source of now count down on their bearer's own turn instead.
 */
export function removeCombatants(ctx, ids) {
  const { enc } = ctx;
  const gone = new Set(ids);
  const acted = actedIds(enc).filter(id => !gone.has(id));
  if (enc.active && gone.has(enc.active)) {
    const left = { ...ctx, enc: { ...enc, c: enc.c.filter(x => !gone.has(x.id)) } };
    let next = nextUp(left, acted);
    if (!next) { next = nextUp(left, []); if (next) { enc.round++; acted.length = 0; } }
    enc.active = next ? next.id : null;
  }
  enc.c = enc.c.filter(x => !gone.has(x.id));
  enc.acted = enc.active ? acted : [];
  for (const c of enc.c) for (const x of c.conds) if (x.src && gone.has(x.src)) { delete x.src; delete x.at; delete x.fresh; }
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

/**
 * Add a condition (or reset its duration). Adding Exhaustion raises its level instead.
 * `opts.src` is the creature whose turn the timer counts down on (default: the bearer's own turn end),
 * `opts.at` is 'end' or 'start' of that turn. A timer set during its source's own turn skips that
 * turn's end, so "until the end of your next turn" lasts through the next turn.
 */
export function addCondition(ctx, c, name, rounds, opts = {}) {
  if (name === 'Exhaustion') return setExhaustion(ctx, c, exhaustion(ctx, c) + 1);
  const d = rounds > 0 ? rounds : null;
  const src = opts.src && opts.src !== c.id && ctx.enc.c.some(x => x.id === opts.src) ? opts.src : null;
  const cond = { n: name, d };
  if (d && src) {
    cond.src = src;
    cond.at = opts.at === 'start' ? 'start' : 'end';
    if (cond.at === 'end' && ctx.enc.active === src) cond.fresh = true;
  }
  const i = c.conds.findIndex(x => x.n === name);
  if (i >= 0) c.conds[i] = cond; else c.conds.push(cond);
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
