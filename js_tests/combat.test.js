import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as R from '../static/js/combat.js';

let n = 0;
function mk(o = {}) {
  n++;
  return { id: `c${n}`, name: `C${n}`, kind: 'foe', init: 10, mod: 0, seq: n, ac: 12, hp: 10, max: 10, temp: 0, exh: 0,
    conds: [], slots: [], ds: { s: 0, f: 0 }, notes: '', ...o };
}
/** A fight with the given combatants; `chars` are linked character sheets by id. */
function fight(cs, chars = {}) {
  const enc = { round: 1, active: null, skip: true, c: cs, ticks: [] };
  return { enc, linked: c => (c.charId && chars[c.charId]) || null };
}
const names = ctx => R.sorted(ctx.enc).map(c => c.name);
const activeName = ctx => ctx.enc.c.find(c => c.id === ctx.enc.active)?.name;

// ---------- hit points ----------

test('temp HP absorbs damage first', () => {
  const c = mk({ temp: 5 }), ctx = fight([c]);
  R.damage(ctx, c, 8);
  assert.deepEqual([c.temp, c.hp], [0, 7]);
});

test('concentration DC is 10 or half the damage, capped at 30', () => {
  assert.equal(R.concentrationDC(7), 10);
  assert.equal(R.concentrationDC(31), 15);
  assert.equal(R.concentrationDC(200), 30);
  const c = mk({ hp: 50, max: 50, conds: [{ n: 'Concentrating', d: null }] }), ctx = fight([c]);
  assert.match(R.damage(ctx, c, 24).join(' '), /DC 12/);
});

test('a PC at 0 HP falls unconscious and loses concentration', () => {
  const c = mk({ kind: 'pc', conds: [{ n: 'Concentrating', d: null }] }), ctx = fight([c]);
  const msgs = R.damage(ctx, c, 12);
  assert.equal(c.hp, 0);
  assert.deepEqual(c.conds.map(x => x.n), ['Unconscious']);
  assert.match(msgs.join(' '), /Concentration lost/);
});

test('massive damage kills outright', () => {
  const c = mk({ kind: 'pc', hp: 5, max: 10 }), ctx = fight([c]);
  assert.match(R.damage(ctx, c, 15).join(' '), /dies outright/);   // 10 left over after reaching 0 = max HP
  const d = mk({ kind: 'pc', hp: 5, max: 10 });
  assert.doesNotMatch(R.damage(fight([d]), d, 14).join(' '), /dies outright/);
});

test('damage at 0 HP: one failure, two from a critical hit', () => {
  const c = mk({ kind: 'pc', hp: 0 }), ctx = fight([c]);
  R.damage(ctx, c, 3);
  assert.equal(c.ds.f, 1);
  R.damage(ctx, c, 3, true);
  assert.equal(c.ds.f, 3);
});

test('healing from 0 resets death saves and removes Unconscious', () => {
  const c = mk({ kind: 'pc', hp: 0, ds: { s: 2, f: 1 }, conds: [{ n: 'Unconscious', d: null }] }), ctx = fight([c]);
  R.heal(ctx, c, 4);
  assert.deepEqual([c.hp, c.ds, c.conds], [4, { s: 0, f: 0 }, []]);
  R.heal(ctx, c, 100);
  assert.equal(c.hp, 10);
});

test("temp HP doesn't stack", () => {
  const c = mk({ temp: 6 }), ctx = fight([c]);
  assert.equal(R.giveTemp(ctx, c, 4).length, 1);
  assert.equal(c.temp, 6);
  R.giveTemp(ctx, c, 9);
  assert.equal(c.temp, 9);
});

// ---------- death saves ----------

test('death saves follow the 2024 rules', () => {
  const pc = () => mk({ kind: 'pc', hp: 0 });
  let c = pc(); R.deathSave(fight([c]), c, 10); assert.deepEqual(c.ds, { s: 1, f: 0 });
  c = pc(); R.deathSave(fight([c]), c, 9); assert.deepEqual(c.ds, { s: 0, f: 1 });
  c = pc(); R.deathSave(fight([c]), c, 1); assert.deepEqual(c.ds, { s: 0, f: 2 });
  c = pc(); const r = R.deathSave(fight([c]), c, 20); assert.equal(c.hp, 1); assert.equal(r.cls, 'crit');
});

test('exhaustion lowers death saves, but a natural 20 still counts', () => {
  const c = mk({ kind: 'pc', hp: 0, exh: 1 }), ctx = fight([c]);
  const r = R.deathSave(ctx, c, 11);               // 11 − 2 = 9: a failure
  assert.equal(r.total, 9);
  assert.deepEqual(c.ds, { s: 0, f: 1 });
});

test('three successes means stable, three failures means dead', () => {
  const c = mk({ kind: 'pc', hp: 0, ds: { s: 2, f: 2 } }), ctx = fight([c]);
  assert.match(R.deathSave(ctx, c, 15).msgs[0], /stable/);
  const d = mk({ kind: 'pc', hp: 0, ds: { s: 0, f: 2 } });
  assert.match(R.deathSave(fight([d]), d, 5).msgs[0], /died/);
});

// ---------- linked PCs ----------

test('a linked PC reads and writes HP and exhaustion on its sheet', () => {
  const ch = { sheet: { name: 'Brakka', hp: 20, max_hp: 30, temp_hp: 0, exhaustion: 0, slots: [] }, derived: { ac: 18 } };
  const c = mk({ kind: 'pc', charId: 7, hp: 999 }), ctx = fight([c], { 7: ch });
  assert.equal(R.vit(ctx, c).ac, 18);
  R.damage(ctx, c, 5);
  assert.equal(ch.sheet.hp, 15);
  assert.equal(c.hp, 999);                          // the combatant's own copy is untouched
  R.addCondition(ctx, c, 'Exhaustion');
  assert.equal(ch.sheet.exhaustion, 1);
});

test('damage adjustments: half on a save first, then resistance, then vulnerability', () => {
  assert.equal(R.adjustDamage(25), 25);
  assert.equal(R.adjustDamage(25, { half: true }), 12);
  assert.equal(R.adjustDamage(25, { mod: 'resist' }), 12);
  assert.equal(R.adjustDamage(25, { half: true, mod: 'resist' }), 6);   // 25 → 12 → 6, not 25 / 4
  assert.equal(R.adjustDamage(25, { mod: 'vuln' }), 50);
  assert.equal(R.adjustDamage(25, { half: true, mod: 'vuln' }), 24);
  assert.equal(R.adjustDamage(25, { mod: 'immune' }), 0);
  assert.equal(R.adjustDamage(1, { mod: 'resist' }), 0);
});

test('one roll damages several creatures, each with its own save and resistance', () => {
  const a = mk({ name: 'A', hp: 30, max: 30 }), b = mk({ name: 'B', hp: 30, max: 30 }), c = mk({ name: 'C', hp: 30, max: 30 });
  const ctx = fight([a, b, c]);
  const { dealt } = R.damageMany(ctx, [{ c: a }, { c: b, half: true }, { c, mod: 'immune' }], 21);
  assert.deepEqual(dealt, [{ name: 'A', n: 21 }, { name: 'B', n: 10 }, { name: 'C', n: 0 }]);
  assert.deepEqual([a.hp, b.hp, c.hp], [9, 20, 30]);
});

// ---------- turns ----------

test('turns go in initiative order and wrap into the next round', () => {
  const ctx = fight([mk({ name: 'A', init: 5 }), mk({ name: 'B', init: 18 }), mk({ name: 'C', init: 12 })]);
  assert.deepEqual(names(ctx), ['B', 'C', 'A']);
  R.step(ctx, 1);
  assert.equal(activeName(ctx), 'B');
  R.step(ctx, 1); R.step(ctx, 1); R.step(ctx, 1);
  assert.deepEqual([activeName(ctx), ctx.enc.round], ['B', 2]);
  R.step(ctx, -1);
  assert.deepEqual([activeName(ctx), ctx.enc.round], ['A', 1]);
});

test('ties go to the higher initiative modifier', () => {
  const ctx = fight([mk({ name: 'slow', init: 12, mod: 0 }), mk({ name: 'quick', init: 12, mod: 3 })]);
  assert.deepEqual(names(ctx), ['quick', 'slow']);
});

test('defeated foes are skipped, downed PCs are not', () => {
  const ctx = fight([mk({ name: 'A', init: 20 }), mk({ name: 'dead', init: 15, hp: 0 }), mk({ name: 'pc', kind: 'pc', init: 10, hp: 0 })]);
  R.step(ctx, 1); R.step(ctx, 1);
  assert.equal(activeName(ctx), 'pc');
});

test('durations count down at the end of the turn, and Back restores them', () => {
  const a = mk({ name: 'A', init: 20, conds: [{ n: 'Frightened', d: 1 }] });
  const ctx = fight([a, mk({ name: 'B', init: 10 })]);
  R.step(ctx, 1);
  const msgs = R.step(ctx, 1);                       // A's turn ends: Frightened (1 round) ends
  assert.deepEqual(a.conds, []);
  assert.match(msgs.join(' '), /Frightened ended/);
  R.step(ctx, -1);                                    // back to A: it returns
  assert.deepEqual(a.conds, [{ n: 'Frightened', d: 1 }]);
  R.step(ctx, 1);                                     // forward again: counted once, not twice
  assert.deepEqual(a.conds, []);
});

test('removing the active creature passes the turn onward', () => {
  const ctx = fight([mk({ name: 'A', init: 20 }), mk({ name: 'B', init: 15 }), mk({ name: 'C', init: 10 })]);
  R.step(ctx, 1); R.step(ctx, 1);                     // B is active
  R.removeCombatants(ctx, [ctx.enc.active]);
  assert.deepEqual([activeName(ctx), ctx.enc.round], ['C', 1]);
  R.removeCombatants(ctx, [ctx.enc.active]);          // removing the last in order wraps to a new round
  assert.deepEqual([activeName(ctx), ctx.enc.round], ['A', 2]);
  R.removeCombatants(ctx, [ctx.enc.active]);
  assert.equal(ctx.enc.active, null);
});

test('turn state shows who has acted, who is up and who is still to come', () => {
  const ctx = fight([mk({ name: 'A', init: 20 }), mk({ name: 'B', init: 15 }), mk({ name: 'C', init: 10 })]);
  const states = () => R.sorted(ctx.enc).map(c => R.turnState(ctx.enc, c));
  assert.deepEqual(states(), [null, null, null]);
  R.step(ctx, 1); R.step(ctx, 1);
  assert.deepEqual(states(), ['done', 'now', 'next']);
  R.step(ctx, 1); R.step(ctx, 1);                     // new round: nobody has acted yet
  assert.deepEqual(states(), ['now', 'next', 'next']);
});

test('changing initiative mid-round never skips a turn or gives a second one', () => {
  const a = mk({ name: 'A', init: 20 }), b = mk({ name: 'B', init: 15 }), c = mk({ name: 'C', init: 10 });
  const ctx = fight([a, b, c]);
  R.step(ctx, 1); R.step(ctx, 1);                     // A went, B is up
  c.init = 25;                                        // C moves above everyone but hasn't gone yet
  R.step(ctx, 1);
  assert.deepEqual([activeName(ctx), ctx.enc.round], ['C', 1]);
  a.init = 5;                                         // A already went: moving it down doesn't give it another turn
  R.step(ctx, 1);
  assert.deepEqual([activeName(ctx), ctx.enc.round], ['C', 2]);
});

test('a creature joining above the current turn waits for the next round', () => {
  const ctx = fight([mk({ name: 'A', init: 20 }), mk({ name: 'B', init: 10 })]);
  R.step(ctx, 1); R.step(ctx, 1);                     // B is up
  const early = mk({ name: 'early', init: 18 }), late = mk({ name: 'late', init: 5 });
  ctx.enc.c.push(early, late);
  assert.equal(R.joinCombat(ctx, early), true);
  assert.equal(R.joinCombat(ctx, late), false);
  assert.equal(R.nextAfter(ctx, ctx.enc.active).name, 'late');
  R.step(ctx, 1); R.step(ctx, 1);
  assert.deepEqual([activeName(ctx), ctx.enc.round], ['A', 2]);
  R.step(ctx, 1);
  assert.equal(activeName(ctx), 'early');
});

test("a timer tied to another creature counts down on that creature's turn", () => {
  const wiz = mk({ name: 'Wizard', init: 20 }), orc = mk({ name: 'Orc', init: 10 });
  const ctx = fight([wiz, orc]);
  R.step(ctx, 1);                                     // the Wizard's turn: it frightens the Orc until the end of its next turn
  R.addCondition(ctx, orc, 'Frightened', 1, { src: wiz.id, at: 'end' });
  R.step(ctx, 1);                                     // end of this Wizard turn doesn't count
  assert.deepEqual(orc.conds.map(x => x.n), ['Frightened']);
  R.step(ctx, 1);                                     // the Orc's own turn end doesn't count either
  assert.deepEqual(orc.conds.map(x => x.n), ['Frightened']);
  const msgs = R.step(ctx, 1);                        // end of the Wizard's next turn: it ends
  assert.deepEqual(orc.conds, []);
  assert.match(msgs.join(' '), /Orc: Frightened \(from Wizard\) ended/);
  R.step(ctx, -1);                                    // Back puts it back
  assert.deepEqual(orc.conds.map(x => x.n), ['Frightened']);
});

test("a timer can end at the start of its source's turn", () => {
  const pal = mk({ name: 'Paladin', init: 20 }), orc = mk({ name: 'Orc', init: 10 });
  const ctx = fight([pal, orc]);
  R.step(ctx, 1);
  R.addCondition(ctx, orc, 'Prone', 1, { src: pal.id, at: 'start' });
  R.step(ctx, 1);
  assert.deepEqual(orc.conds.map(x => x.n), ['Prone']);
  R.step(ctx, 1);                                     // start of the Paladin's next turn
  assert.deepEqual(orc.conds, []);
});

test("removing a timer's source moves the timer to its bearer's own turn", () => {
  const wiz = mk({ name: 'Wizard', init: 20 }), orc = mk({ name: 'Orc', init: 10 });
  const ctx = fight([wiz, orc]);
  R.addCondition(ctx, orc, 'Frightened', 2, { src: wiz.id });
  R.removeCombatants(ctx, [wiz.id]);
  assert.deepEqual(orc.conds, [{ n: 'Frightened', d: 2 }]);
});

// ---------- reactions and monster resources ----------

const DRAGON = {
  name: 'Adult Red Dragon',
  traits: [{ name: 'Legendary Resistance (3/Day, or 4/Day in Lair)', desc: 'If the dragon fails a saving throw, it can choose to succeed instead.',
    usage_limits: { type: 'PER_DAY', param: 3 } }],
  actions: [
    { name: 'Fire Breath', action_type: 'ACTION', desc: 'Dexterity Saving Throw: DC 21.', usage_limits: { type: 'RECHARGE_ON_ROLL', param: 5 } },
    { name: 'Scorching Ray', action_type: 'ACTION', desc: '', usage_limits: { type: 'PER_DAY', param: 1 } },
    { name: 'Pounce', action_type: 'LEGENDARY_ACTION', desc: '' },
  ],
  legendary_desc: 'Legendary Action Uses: 3 (4 in Lair). Immediately after another creature\'s turn, the dragon can expend a use.',
};

test('monster resources come from the stat block', () => {
  assert.deepEqual(R.monsterResources(DRAGON), {
    leg: { max: 3, used: 0 }, lr: { max: 3, used: 0 },
    uses: [{ name: 'Fire Breath', kind: 'recharge', p: 5, used: 0 }, { name: 'Scorching Ray', kind: 'day', max: 1, used: 0 }],
  });
  assert.equal(R.monsterResources({ name: 'Goblin', actions: [{ name: 'Scimitar', action_type: 'ACTION' }] }), null);
  // no count in the text: the usual 3
  assert.deepEqual(R.monsterResources({ actions: [{ name: 'Swipe', action_type: 'LEGENDARY_ACTION' }] }).leg, { max: 3, used: 0 });
});

test('the start of a turn restores the reaction and legendary actions, and rolls recharges', () => {
  const d = mk({ name: 'Dragon', init: 20, res: R.monsterResources(DRAGON), rx: true });
  const pc = mk({ name: 'PC', kind: 'pc', init: 10, rx: true });
  const ctx = fight([d, pc]);
  let rolls = [];
  ctx.rand = () => (rolls.shift() - 1) / 6;
  R.step(ctx, 1);                                     // the Dragon's turn
  assert.equal(d.rx, false);
  assert.equal(pc.rx, true);                          // not the PC's turn yet
  d.res.uses[0].used = 1;                             // breathes
  R.spend(d.res.leg); R.spend(d.res.leg);
  R.spend(d.res.lr);
  R.step(ctx, 1);                                     // the PC's turn
  assert.equal(pc.rx, false);
  assert.equal(d.res.leg.used, 2);                    // legendary actions come back on the dragon's own turn
  rolls = [4];
  let msgs = R.step(ctx, 1);                          // round 2, the Dragon: rolls a 4, needs 5
  assert.match(msgs.join(' '), /Fire Breath not recharged \(rolled 4, needs 5–6\)/);
  assert.deepEqual([d.res.leg.used, d.res.uses[0].used, d.res.lr.used], [0, 1, 1]);
  R.step(ctx, 1);
  rolls = [5];
  msgs = R.step(ctx, 1);
  assert.match(msgs.join(' '), /Fire Breath recharged/);
  assert.equal(d.res.uses[0].used, 0);
  R.step(ctx, -1);                                    // Back undoes the recharge
  assert.equal(d.res.uses[0].used, 1);
});

test('spending uses stays within the pool', () => {
  const pool = { max: 3, used: 2 };
  R.spend(pool); R.spend(pool);
  assert.equal(pool.used, 3);
  R.spend(pool, -5);
  assert.equal(pool.used, 0);
});

// ---------- names ----------

test('group names number creatures and never repeat a number', () => {
  const ctx = fight([]);
  const add = (base, k) => R.groupNames(ctx.enc, base, k).forEach(name => ctx.enc.c.push(mk({ name })));
  add('Goblin', 1);
  assert.deepEqual(ctx.enc.c.map(c => c.name), ['Goblin']);
  add('Goblin', 2);
  assert.deepEqual(ctx.enc.c.map(c => c.name), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
  ctx.enc.c = ctx.enc.c.filter(c => c.name !== 'Goblin 2');
  add('Goblin', 1);
  assert.deepEqual(ctx.enc.c.map(c => c.name).sort(), ['Goblin 1', 'Goblin 3', 'Goblin 4']);
  assert.deepEqual(R.groupNames(ctx.enc, 'Ogre (Chief)', 1), ['Ogre (Chief)']);   // names with symbols are safe
});

// ---------- conditions and slots ----------

test('adding a condition again resets its duration; Exhaustion stacks to 6', () => {
  const c = mk(), ctx = fight([c]);
  R.addCondition(ctx, c, 'Poisoned', 3);
  R.addCondition(ctx, c, 'Poisoned', 1);
  assert.deepEqual(c.conds, [{ n: 'Poisoned', d: 1 }]);
  for (let i = 0; i < 7; i++) R.addCondition(ctx, c, 'Exhaustion');
  assert.equal(c.exh, 6);
});

test('slot pips spend and restore', () => {
  const s = { max: 3, used: 0 };
  R.toggleSlot(s, 0); assert.equal(s.used, 1);
  R.toggleSlot(s, 2); assert.equal(s.used, 0);       // pip 2 was spent: restore
});
