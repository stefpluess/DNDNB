// Combat rules for the tracker (D&D 2024). DOM-free so it can be tested in Node.
//
// Functions take a context `ctx = { enc, linked(c) }`:
//   enc        the encounter: { round, active, acted: [ids], skip, c: [combatants], ticks: [], prompts: [] }
//   linked(c)  the character ({ sheet, derived }) a PC combatant is linked to, or null
// They change the encounter (and linked sheets) in place and return messages to show the DM.
//
// A combatant: { id, name, kind: 'pc'|'foe'|'ally', init, mod, seq, ac, hp, max, temp, exh,
//                conds: [{ n, d, src?, at?, fresh?, conc?, save?: { ab, dc, when } }], slots: [{max, used}], ds: { s, f }, ref?, charId?, notes,
//                rx (reaction used), res?: monster resources, see monsterResources() }
// ctx.rand (optional) replaces Math.random for recharge rolls in tests.

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
export const skippable = (ctx, c) => ctx.enc.skip && ((c.kind !== 'pc' && hp(ctx, c) <= 0) || isDead(c));

// ---------- life and death (PCs) ----------
// A PC at 0 HP is dying, stable (three successes) or dead (three failures, massive damage, Exhaustion 6).

export const isDead = c => !!c.dead || (c.ds?.f || 0) >= 3;
export const isStable = (ctx, c) => !isDead(c) && hp(ctx, c) <= 0 && (c.ds?.s || 0) >= 3;
/** 'dead', 'stable', 'dying', 'down' (a monster at 0 HP) or null (standing). */
export function lifeState(ctx, c) {
  if (isDead(c)) return 'dead';
  if (hp(ctx, c) > 0) return null;
  if (c.kind !== 'pc') return 'down';
  return isStable(ctx, c) ? 'stable' : 'dying';
}
function die(ctx, c, why) {
  c.dead = true;
  c.conds = c.conds.filter(x => x.n !== 'Concentrating');
  return [`${nameOf(ctx, c)} dies${why ? ` (${why})` : ''}.`];
}

/** Revival magic (Revivify, Raise Dead...): back to life with `amount` HP, death saves cleared. */
export function revive(ctx, c, amount = 1) {
  c.dead = false;
  c.ds = { s: 0, f: 0 };
  set(ctx, c, 'hp', Math.max(1, Math.min(maxHp(ctx, c), amount)));
  c.conds = c.conds.filter(x => x.n !== 'Unconscious');
  return [`${nameOf(ctx, c)} returns to life with ${hp(ctx, c)} HP.`];
}

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

const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
/** Everything a turn change can touch: who's up, who acted, condition timers, reactions and monster resources. */
const snapshot = enc => ({
  id: enc.active, round: enc.round, acted: [...actedIds(enc)], prompts: clone(enc.prompts || []),
  cs: Object.fromEntries(enc.c.map(c => [c.id, { conds: clone(c.conds), rx: !!c.rx, res: clone(c.res) }])),
});
function restoreSnapshot(enc, snap) {
  enc.prompts = (snap.prompts || []).filter(p => enc.c.some(c => c.id === p.cid));
  for (const c of enc.c) {
    const s = snap.cs?.[c.id];
    if (s) { c.conds = s.conds; c.rx = s.rx; if (s.res !== undefined) c.res = s.res; }
    else if (snap.conds?.[c.id]) c.conds = snap.conds[c.id];          // snapshots saved before resources existed
  }
}

function dyingNote(ctx) {
  const cur = ctx.enc.c.find(c => c.id === ctx.enc.active);
  return cur && lifeState(ctx, cur) === 'dying' ? [`${nameOf(ctx, cur)} is dying: roll a death save.`] : [];
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
    enc.stats = { taken: {}, downs: {} };
    enc.active = (nextUp(ctx, []) || L[0]).id;
    const first = enc.c.find(c => c.id === enc.active);
    enc.prompts = [];
    msgs.push(...startTurn(ctx, first), ...tick(ctx, first, 'start'));
    addSavePrompts(ctx, first, 'start');
    return [...msgs, ...dyingNote(ctx)];
  }
  if (dir > 0) {
    const cur = enc.c.find(c => c.id === enc.active);
    enc.ticks.push(snapshot(enc));
    if (enc.ticks.length > 100) enc.ticks.shift();
    msgs.push(...tick(ctx, cur, 'end'));
    enc.prompts = [];
    addSavePrompts(ctx, cur, 'end');
    const acted = [...actedIds(enc), cur.id];
    let nx = nextUp(ctx, acted);
    if (nx) enc.acted = acted;
    else { enc.round++; enc.acted = []; nx = nextUp(ctx, []) || cur; }
    enc.active = nx.id;
    msgs.push(...startTurn(ctx, nx), ...tick(ctx, nx, 'start'));
    addSavePrompts(ctx, nx, 'start');
    return [...msgs, ...dyingNote(ctx)];
  }
  // back
  let snap;
  while ((snap = enc.ticks.pop()) && (!snap.acted || !enc.c.some(c => c.id === snap.id)));
  if (snap) {
    enc.active = snap.id;
    enc.round = snap.round;
    enc.acted = snap.acted.filter(id => enc.c.some(c => c.id === id));
    restoreSnapshot(enc, snap);
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
  enc.prompts = [];
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
  for (const c of enc.c) for (const x of c.conds) if (x.conc && gone.has(x.src)) x.gone = true;
  for (const c of enc.c) c.conds = c.conds.filter(x => !x.gone);
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
  enc.prompts = (enc.prompts || []).filter(p => !gone.has(p.cid));
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
  if (c.kind === 'pc' && isDead(c)) return [`${name} is dead.`];
  const wasDown = hp(ctx, c) <= 0;
  const absorbed = Math.min(tempHp(ctx, c), amount);
  set(ctx, c, 'temp', tempHp(ctx, c) - absorbed);
  const rest = amount - absorbed;
  const before = hp(ctx, c);
  if (wasDown && c.kind === 'pc' && rest > 0) {
    // 2024: damage at 0 HP is a death save failure (two from a critical hit), and it ends being stable;
    // if it equals or exceeds the HP maximum, the character dies
    if (c.ds.s >= 3) { c.ds.s = 0; msgs.push(`${name} is no longer stable.`); }
    if (rest >= maxHp(ctx, c)) return [...msgs, ...die(ctx, c, `${rest} damage at 0 HP is at least its HP maximum`)];
    c.ds.f = Math.min(3, c.ds.f + (crit ? 2 : 1));
    msgs.push(`${name} takes ${crit ? 'a critical hit' : 'damage'} at 0 HP: ${crit ? 'two death save failures' : 'one death save failure'}.`);
    if (c.ds.f >= 3) msgs.push(...die(ctx, c, 'three death save failures'));
  }
  set(ctx, c, 'hp', Math.max(0, before - rest));
  const st = ctx.enc.stats ||= { taken: {}, downs: {} };
  (st.names ||= {})[c.id] = name;                                    // creatures may be removed before the summary
  st.taken[c.id] = (st.taken[c.id] || 0) + absorbed + (before - hp(ctx, c));
  if (!wasDown && hp(ctx, c) === 0 && c.kind === 'pc') st.downs[c.id] = (st.downs[c.id] || 0) + 1;
  if (!wasDown && hp(ctx, c) === 0 && c.kind === 'foe') (st.defeated ||= {})[c.id] = { name, xp: +c.xp || 0 };
  if (!wasDown && hp(ctx, c) === 0) {
    if (c.kind === 'pc' && rest - before >= maxHp(ctx, c)) {
      if (!hasCond(c, 'Unconscious')) c.conds.push({ n: 'Unconscious', d: null });
      return [...msgs, ...die(ctx, c, 'massive damage: the damage left after reaching 0 HP is at least its HP maximum')];
    }
    if (c.kind === 'pc') {
      msgs.push(`${name} drops to 0 HP.`);
      if (!hasCond(c, 'Unconscious')) c.conds.push({ n: 'Unconscious', d: null });
    } else msgs.push(`${name} is down.`);
    if (hasCond(c, 'Concentrating')) msgs.push(...endConcentration(ctx, c));
  } else if (hp(ctx, c) > 0 && hasCond(c, 'Concentrating')) {
    const dc = concentrationDC(amount);
    msgs.push(`${name}: Con save DC ${dc} to keep concentration.`);
    addPrompt(ctx, { cid: c.id, kind: 'conc', ab: 'con', dc });
  }
  return msgs;
}

export const DAMAGE_MODS = { normal: 'Normal', resist: 'Resistant', vuln: 'Vulnerable', immune: 'Immune' };

/**
 * Damage a creature actually takes (2024 order of application): halving for a successful save comes
 * first, then resistance halves (rounded down), then vulnerability doubles. Immunity means none.
 */
export function adjustDamage(amount, { half = false, none = false, mod = 'normal' } = {}) {
  let n = Math.max(0, Math.floor(amount));
  if (half && none) return 0;                                          // "no damage on a successful save"
  if (half) n = Math.floor(n / 2);
  if (mod === 'immune') return 0;
  if (mod === 'resist' || mod === 'resist+vuln') n = Math.floor(n / 2);
  if (mod === 'vuln' || mod === 'resist+vuln') n *= 2;
  return n;
}

// ---------- resistances, immunities and vulnerabilities from a stat block ----------

export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing',
  'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const CONDITION_NAMES = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated',
  'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
// 2014-style qualifiers ("from nonmagical attacks") can't be applied automatically
const QUALIFIED = /nonmagical|non-magical|except|that (?:is|are|aren't|isn't)|while|unless|in (?:dim light|darkness)/i;

/**
 * A monster's damage resistances, immunities, vulnerabilities and condition immunities, from the
 * structured lists when the data has them and from the stat block text otherwise. Lists with a
 * qualifier are left out and reported in `notes`, so the DM decides those by hand. null if none.
 */
export function monsterDefenses(m) {
  const ri = m?.resistances_and_immunities || {};
  const notes = [];
  /** Names from vocab found in a structured list and in a stat block text. */
  const read = (list, text, vocab) => {
    const found = new Set((list || []).map(x => String(typeof x === 'string' ? x : x?.name || x?.key || '').toLowerCase()).filter(n => vocab.includes(n)));
    text = String(text || '');
    if (QUALIFIED.test(text)) notes.push(text);
    else for (const v of vocab) if (new RegExp(`\\b${v}\\b`, 'i').test(text)) found.add(v);
    return [...found];
  };
  // some data puts damage and condition immunities in one text ("Poison; Charmed, Poisoned")
  let [dmgImm, condImm] = [ri.damage_immunities_display, ri.condition_immunities_display];
  if (!condImm && String(dmgImm || '').includes(';')) [dmgImm, condImm] = String(dmgImm).split(';');
  const d = {
    resist: read(ri.damage_resistances, ri.damage_resistances_display, DAMAGE_TYPES),
    vuln: read(ri.damage_vulnerabilities, ri.damage_vulnerabilities_display, DAMAGE_TYPES),
    immune: read(ri.damage_immunities, dmgImm, DAMAGE_TYPES),
    condImmune: read(ri.condition_immunities, condImm, CONDITION_NAMES),
  };
  if (notes.length) d.notes = notes;
  return d.resist.length || d.vuln.length || d.immune.length || d.condImmune.length || notes.length ? d : null;
}

/** How a creature with defenses `def` takes damage of `type`: 'immune', 'resist', 'vuln', 'resist+vuln' or 'normal'. */
export function defenseMod(def, type) {
  const t = String(type || '').toLowerCase();
  if (!def || !t) return 'normal';
  if (def.immune.includes(t)) return 'immune';
  const r = def.resist.includes(t), v = def.vuln.includes(t);
  return r && v ? 'resist+vuln' : r ? 'resist' : v ? 'vuln' : 'normal';
}

// ---------- saving throws affected by conditions ----------

const AUTO_FAIL_STR_DEX = ['Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];
/** 2024 conditions on a save: { fail: 'Stunned' } (fails automatically), { dis: 'Restrained' } or {}. */
export function saveRule(c, ab) {
  if (ab === 'str' || ab === 'dex') {
    const x = c.conds.find(k => AUTO_FAIL_STR_DEX.includes(k.n));
    if (x) return { fail: x.n };
  }
  if (ab === 'dex' && hasCond(c, 'Restrained')) return { dis: 'Restrained' };
  return {};
}

/** Resolve a save: `dice` are d20 rolls (two for Disadvantage, the lower counts). Returns { die, total, ok, auto }. */
export function rollSave({ dice, bonus, dc, rule = {} }) {
  if (rule.fail) return { die: null, total: null, ok: false, auto: rule.fail };
  const die = rule.dis ? Math.min(...dice) : dice[0];
  const total = die + bonus;
  return { die, total, ok: total >= dc, auto: null };
}

/**
 * One damage roll against several creatures (Fireball, a breath weapon). Each target is { c, half, mod }.
 * Returns { msgs, dealt: [{ name, n }] }.
 */
export function damageMany(ctx, targets, amount, crit = false, none = false) {
  const msgs = [], dealt = [];
  for (const t of targets) {
    const n = adjustDamage(amount, { ...t, none });
    dealt.push({ name: nameOf(ctx, t.c), n });
    if (n > 0) msgs.push(...damage(ctx, t.c, n, crit));
  }
  return { msgs, dealt };
}

export function heal(ctx, c, amount) {
  if (isDead(c)) return [`${nameOf(ctx, c)} is dead: healing does nothing. Use Revive for revival magic.`];
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
  if (isDead(c) || isStable(ctx, c) || hp(ctx, c) > 0) {
    return { total: die, outcome: 'no save needed', pen: 0, cls: '',
      msgs: [isDead(c) ? `${name} is dead.` : hp(ctx, c) > 0 ? `${name} isn't dying.` : `${name} is stable: no death saves needed.`] };
  }
  const pen = 2 * exhaustion(ctx, c);
  const total = die - pen;
  let outcome;
  if (die === 20) { heal(ctx, c, 1); outcome = 'natural 20, regains 1 HP'; }
  else if (die === 1) { c.ds.f = Math.min(3, c.ds.f + 2); outcome = 'natural 1, two failures'; }
  else if (total >= 10) { c.ds.s = Math.min(3, c.ds.s + 1); outcome = 'success'; }
  else { c.ds.f = Math.min(3, c.ds.f + 1); outcome = 'failure'; }
  const msgs = c.ds.s >= 3 ? [`${name} is stable.`] : c.ds.f >= 3 ? deathOf(ctx, c)
    : die === 20 ? [`${name} is back up with 1 HP.`] : [`Death save: ${outcome}.`];
  return { total, outcome, pen, msgs, cls: die === 20 ? 'crit' : die === 1 ? 'fumble' : '' };
}

const deathOf = (ctx, c) => die(ctx, c, 'three death save failures');

// ---------- attacks ----------

/**
 * An attack roll against a target's AC (2024): `dice` holds one d20, or two for Advantage/Disadvantage.
 * A natural 20 always hits and is a critical hit; a natural 1 always misses.
 * `pen` is subtracted from the total (Exhaustion, when the bonus doesn't already include it).
 */
export function attackOutcome({ dice, mode = 'normal', bonus = 0, pen = 0, ac }) {
  const nat = mode === 'adv' ? Math.max(...dice) : mode === 'dis' ? Math.min(...dice) : dice[0];
  const total = nat + bonus - pen;
  const crit = nat === 20;
  const hit = crit || (nat !== 1 && total >= ac);
  return { nat, total, hit, crit };
}

const TARGET_ADV = { Blinded: 'Blinded', Paralyzed: 'Paralyzed', Petrified: 'Petrified', Restrained: 'Restrained', Stunned: 'Stunned', Unconscious: 'Unconscious' };
/**
 * Reminders for an attack from `atk` against `tgt` from their conditions (2024 rules). The DM still
 * picks Advantage or Disadvantage, since range and senses aren't tracked. Returns [{ text, mode }].
 */
export function attackHints(atk, tgt) {
  const out = [];
  for (const x of tgt.conds) {
    if (TARGET_ADV[x.n]) out.push({ text: `${x.n} target: attacks have Advantage`, mode: 'adv' });
    if (x.n === 'Paralyzed' || x.n === 'Unconscious') out.push({ text: `${x.n} target: a hit from within 5 ft is a critical hit`, mode: null });
    if (x.n === 'Prone') out.push({ text: 'Prone target: Advantage within 5 ft, Disadvantage farther away', mode: null });
    if (x.n === 'Invisible') out.push({ text: 'Invisible target: attacks have Disadvantage', mode: 'dis' });
  }
  for (const x of atk.conds) {
    if (x.n === 'Grappled' && x.src !== tgt.id) out.push({ text: `Grappled attacker: Disadvantage against anyone but the grappler`, mode: 'dis' });
    if (x.n === 'Charmed' && x.src === tgt.id) out.push({ text: 'Charmed attacker: it can\'t attack the creature that charmed it', mode: null });
    if (['Blinded', 'Poisoned', 'Restrained', 'Prone'].includes(x.n)) out.push({ text: `${x.n} attacker: Disadvantage`, mode: 'dis' });
    if (x.n === 'Frightened') out.push({ text: 'Frightened attacker: Disadvantage while the source is in sight', mode: 'dis' });
    if (x.n === 'Invisible') out.push({ text: 'Invisible attacker: Advantage', mode: 'adv' });
  }
  return out;
}

// ---------- reactions and monster resources ----------
//
// c.res = { leg: { max, used } | null,        legendary actions, regained at the start of the monster's turn
//           lr:  { max, used } | null,        Legendary Resistance (per day: never resets during a fight)
//           uses: [{ name, kind: 'recharge', p, used: 0|1 } | { name, kind: 'day', max, used }] }

const allText = m => [m.legendary_desc, m.desc, ...(m.traits || []).map(t => `${t.name} ${t.desc}`),
  ...(m.actions || []).map(a => `${a.name} ${a.desc}`)].filter(Boolean).join('\n');

/** Read legendary actions, Legendary Resistance and limited-use abilities from a monster (SRD or homebrew). */
export function monsterResources(m) {
  const text = allText(m);
  const actions = m.actions || [];
  let leg = null;
  if (actions.some(a => a.action_type === 'LEGENDARY_ACTION')) {
    const n = +(m.legendary_actions ?? m.legendary_action_uses ?? 0)
      || +((text.match(/Legendary Action Uses:?\**\s*(\d+)/i) || text.match(/can take (\d+) legendary actions/i) || [])[1] || 0) || 3;
    leg = { max: n, used: 0 };
  }
  let lr = null;
  const uses = [];
  for (const f of [...(m.traits || []), ...actions]) {
    const u = f.usage_limits || {};
    const t = String(u.type || '').toUpperCase();
    if (/^Legendary Resistance/i.test(f.name || '')) {
      const n = (t.startsWith('PER_DAY') && +u.param) || +((`${f.name} ${f.desc || ''}`.match(/(\d+)\s*\/\s*Day/i) || [])[1] || 0) || 3;
      lr = { max: n, used: 0 };
    } else if (t.startsWith('RECHARGE_ON_ROLL')) uses.push({ name: f.name, kind: 'recharge', p: +u.param || 6, used: 0 });
    else if (t.startsWith('PER_DAY')) uses.push({ name: f.name, kind: 'day', max: +u.param || 1, used: 0 });
  }
  return leg || lr || uses.length ? { leg, lr, uses } : null;
}

/**
 * The start of a creature's turn: it regains its reaction and its legendary actions, and rolls a d6 for
 * every spent Recharge ability (it's ready again on a roll of its number or higher).
 */
export function startTurn(ctx, c) {
  const msgs = [];
  c.rx = false;
  if (!c.res) return msgs;
  if (c.res.leg) c.res.leg.used = 0;
  for (const u of c.res.uses || []) if (u.kind === 'recharge' && u.used) msgs.push(rollRecharge(ctx, c, u).msg);
  return msgs;
}

/** Roll a d6 for a spent Recharge ability. Returns { die, ok, msg }. */
export function rollRecharge(ctx, c, u) {
  const die = 1 + Math.floor((ctx.rand || Math.random)() * 6);
  const ok = die >= u.p;
  if (ok) u.used = 0;
  const msg = ok ? `${nameOf(ctx, c)}: ${u.name} recharged (rolled ${die}).`
    : `${nameOf(ctx, c)}: ${u.name} not recharged (rolled ${die}, needs ${u.p}${u.p < 6 ? '–6' : ''}).`;
  return { die, ok, msg };
}

/** Spend or restore one use from a { max, used } pool (legendary actions, Legendary Resistance, x/Day). */
export function spend(pool, delta = 1) {
  pool.used = Math.max(0, Math.min(pool.max, pool.used + delta));
}

// ---------- conditions ----------

/** 2024: these conditions include Incapacitated, which ends concentration. */
export const INCAPACITATING = ['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];

/**
 * Add a condition (or reset its duration). Adding Exhaustion raises its level instead. Options:
 *   src, at   the creature whose turn the rounds count down on ('end' or 'start' of that turn; default:
 *             the end of the bearer's own turn). A timer set during its source's own turn skips that
 *             turn's end, so "until the end of your next turn" lasts through the next turn.
 *   conc      the condition comes from `src`'s concentration spell: it ends when that concentration ends,
 *             and `src` is marked Concentrating. `spell` names the spell (default: the condition's name).
 *             A creature concentrates on one spell at a time: starting another ends the first.
 *   save      { ab, dc, when }: the bearer repeats a save at the 'end' (or 'start') of each of its turns.
 */
export function addCondition(ctx, c, name, rounds, opts = {}) {
  if (c.def?.condImmune?.includes(String(name).toLowerCase())) return [`${nameOf(ctx, c)} is immune to ${name}.`];
  if (name === 'Exhaustion') return setExhaustion(ctx, c, exhaustion(ctx, c) + 1);
  const msgs = [];
  const d = rounds > 0 ? rounds : null;
  const srcC = opts.src && opts.src !== c.id ? ctx.enc.c.find(x => x.id === opts.src) : null;
  const cond = { n: name, d };
  if (srcC) {
    cond.src = srcC.id;
    if (d) {
      cond.at = opts.at === 'start' ? 'start' : 'end';
      if (cond.at === 'end' && ctx.enc.active === srcC.id) cond.fresh = true;
    }
    if (opts.conc) {
      cond.conc = true;
      cond.spell = String(opts.spell || name).trim();
      msgs.push(...concentrateOn(ctx, srcC, cond.spell));
    }
  }
  if (opts.save?.ab && opts.save.dc > 0) cond.save = { ab: opts.save.ab, dc: +opts.save.dc, when: opts.save.when === 'start' ? 'start' : 'end' };
  const i = c.conds.findIndex(x => x.n === name);
  if (i >= 0) c.conds[i] = cond; else c.conds.push(cond);
  if (INCAPACITATING.includes(name) && hasCond(c, 'Concentrating')) msgs.push(...endConcentration(ctx, c));
  return msgs;
}

/**
 * `c` concentrates on `spell`. Already concentrating on a different spell: that one ends first
 * (with its effects). Returns messages.
 */
export function concentrateOn(ctx, c, spell) {
  const cur = c.conds.find(x => x.n === 'Concentrating');
  const msgs = [];
  if (cur && cur.spell && spell && cur.spell.toLowerCase() !== spell.toLowerCase()) {
    msgs.push(...endConcentration(ctx, c).map(m => m.replace('loses concentration', `stops concentrating on ${cur.spell}`)));
  } else if (cur) {
    if (spell && !cur.spell) cur.spell = spell;
    return msgs;
  }
  c.conds.push({ n: 'Concentrating', d: null, ...(spell ? { spell } : {}) });
  return msgs;
}

/** Remove the condition at index i. Removing Concentrating ends everything that depended on it. */
export function removeCondition(ctx, c, i) {
  const x = c.conds[i];
  if (!x) return [];
  if (x.n === 'Concentrating') return endConcentration(ctx, c);
  c.conds.splice(i, 1);
  return [];
}

/** `c` loses concentration: Concentrating goes, and so does every condition tied to it. */
export function endConcentration(ctx, c) {
  c.conds = c.conds.filter(x => x.n !== 'Concentrating');
  const ended = [];
  for (const o of ctx.enc.c) {
    const keep = o.conds.filter(x => !(x.conc && x.src === c.id));
    if (keep.length !== o.conds.length) ended.push(...o.conds.filter(x => !keep.includes(x)).map(x => `${x.n} on ${nameOf(ctx, o)}`));
    o.conds = keep;
  }
  ctx.enc.prompts = (ctx.enc.prompts || []).filter(p => !(p.kind === 'conc' && p.cid === c.id));
  return [`${nameOf(ctx, c)} loses concentration${ended.length ? `: ${ended.join(', ')} ended` : ''}.`];
}

// ---------- saving throw prompts ----------
// enc.prompts lists saves the DM still has to resolve: { id, cid, kind: 'save' | 'conc', n?, ab, dc }.
// They're replaced at every turn change.

function addPrompt(ctx, p) {
  const { enc } = ctx;
  enc.prompts ||= [];
  enc.pseq = (enc.pseq || 0) + 1;
  enc.prompts.push({ id: `p${enc.pseq}`, ...p });
}

/** Repeated saves for `c`'s conditions at the 'start' or 'end' of its turn. */
function addSavePrompts(ctx, c, when) {
  for (const x of c.conds) if (x.save && x.save.when === when) addPrompt(ctx, { cid: c.id, kind: 'save', n: x.n, ab: x.save.ab, dc: x.save.dc });
}

/** The DM resolved a prompt: a successful repeat save ends the condition, a failed concentration save ends concentration. */
export function resolvePrompt(ctx, id, success) {
  const { enc } = ctx;
  const p = (enc.prompts || []).find(x => x.id === id);
  if (!p) return [];
  enc.prompts = enc.prompts.filter(x => x !== p);
  const c = enc.c.find(x => x.id === p.cid);
  if (!c) return [];
  const name = nameOf(ctx, c);
  if (p.kind === 'conc') return success ? [`${name} keeps concentration.`] : endConcentration(ctx, c);
  if (!success) return [`${name} fails the save: still ${p.n}.`];
  const i = c.conds.findIndex(x => x.n === p.n);
  return [`${name} succeeds: ${p.n} ends.`, ...(i >= 0 ? removeCondition(ctx, c, i) : [])];
}

export function setExhaustion(ctx, c, level) {
  const n = Math.max(0, Math.min(6, level));
  set(ctx, c, 'exh', n);
  return n === 6 ? die(ctx, c, 'Exhaustion 6') : [];
}

// ---------- spell slots ----------

/** Clicking pip p: an available slot is spent, a spent one is restored. */
export function toggleSlot(slot, p) {
  if (p < slot.max - slot.used) slot.used++;
  else slot.used = Math.max(0, slot.used - 1);
}

// ---------- encounter difficulty and the end-of-combat summary ----------

/** 2024 Dungeon Master's Guide: XP budget per character by level, [Low, Moderate, High]. */
export const XP_BUDGET = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100],
  6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100],
  11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800],
  16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
};

/**
 * Difficulty of `xp` worth of monsters for characters of the given levels: the party's budgets added up,
 * and the lowest difficulty whose budget covers the XP (2024 has no multiplier for many monsters).
 */
export function difficulty(levels, xp) {
  const lv = levels.map(l => Math.max(1, Math.min(20, Math.floor(+l) || 1)));
  const [low, moderate, high] = [0, 1, 2].map(i => lv.reduce((n, l) => n + XP_BUDGET[l][i], 0));
  const rating = !lv.length ? null : xp <= low ? 'Low' : xp <= moderate ? 'Moderate' : xp <= high ? 'High' : 'Above High';
  return { low, moderate, high, xp, rating };
}

/** What happened in the fight, for the summary when combat ends. XP for defeated foes is split between the PCs. */
export function summary(ctx) {
  const { enc } = ctx;
  const st = enc.stats || { taken: {}, downs: {} };
  const pcs = enc.c.filter(c => c.kind === 'pc');
  const defeated = [
    ...enc.c.filter(c => c.kind === 'foe' && hp(ctx, c) <= 0).map(c => ({ name: nameOf(ctx, c), xp: +c.xp || 0 })),
    ...Object.entries(st.defeated || {}).filter(([id]) => !enc.c.some(c => c.id === id)).map(([, d]) => d),   // removed since
  ];
  const xp = defeated.reduce((n, d) => n + d.xp, 0);
  const nameFor = id => { const c = enc.c.find(x => x.id === id); return c ? nameOf(ctx, c) : st.names?.[id] || 'Someone'; };
  const named = obj => Object.entries(obj).map(([id, n]) => ({ name: nameFor(id), n }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  return {
    rounds: enc.active ? enc.round : 0, defeated, xp, pcs: pcs.length,
    each: pcs.length ? Math.floor(xp / pcs.length) : 0,
    downs: named(st.downs), taken: named(st.taken),
  };
}
