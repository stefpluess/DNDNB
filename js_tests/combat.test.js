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
  assert.match(msgs.join(' '), /loses concentration/);
});

test('massive damage kills outright', () => {
  const c = mk({ kind: 'pc', hp: 5, max: 10 }), ctx = fight([c]);
  assert.match(R.damage(ctx, c, 15).join(' '), /dies \(massive damage/);   // 10 left over after reaching 0 = max HP
  assert.equal(R.lifeState(ctx, c), 'dead');
  const d = mk({ kind: 'pc', hp: 5, max: 10 }), dctx = fight([d]);
  assert.doesNotMatch(R.damage(dctx, d, 14).join(' '), /dies/);
  assert.equal(R.lifeState(dctx, d), 'dying');
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
  assert.match(R.deathSave(fight([d]), d, 5).msgs[0], /dies \(three death save failures\)/);
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

test('damage at 0 HP that equals the HP maximum kills', () => {
  const c = mk({ kind: 'pc', hp: 0, max: 10 }), ctx = fight([c]);
  assert.match(R.damage(ctx, c, 10).join(' '), /dies/);
  assert.ok(R.isDead(c));
  const d = mk({ kind: 'pc', hp: 0, max: 10 }), dctx = fight([d]);
  R.damage(dctx, d, 9);
  assert.deepEqual([R.isDead(d), d.ds.f], [false, 1]);
});

test('a stable character that takes damage is dying again', () => {
  const c = mk({ kind: 'pc', hp: 0, ds: { s: 3, f: 0 } }), ctx = fight([c]);
  assert.equal(R.lifeState(ctx, c), 'stable');
  assert.match(R.deathSave(ctx, c, 5).msgs[0], /stable: no death saves/);   // no save while stable
  assert.match(R.damage(ctx, c, 2).join(' '), /no longer stable/);
  assert.deepEqual([c.ds, R.lifeState(ctx, c)], [{ s: 0, f: 1 }, 'dying']);
});

test('only dying characters are asked for death saves; the dead are skipped', () => {
  const stable = mk({ name: 'S', kind: 'pc', hp: 0, init: 20, ds: { s: 3, f: 0 } });
  const dead = mk({ name: 'D', kind: 'pc', hp: 0, init: 15, ds: { s: 0, f: 3 } });
  const dying = mk({ name: 'Y', kind: 'pc', hp: 0, init: 10 });
  const ctx = fight([stable, dead, dying]);
  assert.deepEqual(R.step(ctx, 1), []);                           // the stable one: no prompt
  assert.match(R.step(ctx, 1).join(' '), /Y is dying/);          // the dead one is skipped
  assert.equal(activeName(ctx), 'Y');
});

test("the dead can't be healed, only revived", () => {
  const c = mk({ kind: 'pc', hp: 0, ds: { s: 1, f: 3 }, conds: [{ n: 'Unconscious', d: null }] }), ctx = fight([c]);
  assert.match(R.heal(ctx, c, 8).join(' '), /dead: healing does nothing/);
  assert.equal(c.hp, 0);
  R.revive(ctx, c, 1);
  assert.deepEqual([c.hp, c.ds, c.dead, c.conds], [1, { s: 0, f: 0 }, false, []]);
});

test('Exhaustion 6 kills', () => {
  const c = mk({ kind: 'pc', exh: 5 }), ctx = fight([c]);
  R.setExhaustion(ctx, c, 6);
  assert.equal(R.lifeState(ctx, c), 'dead');
});

test('defenses are read from the stat block', () => {
  const d = R.monsterDefenses({ resistances_and_immunities: {
    damage_resistances_display: 'Cold, Fire', damage_vulnerabilities_display: 'Radiant',
    damage_immunities_display: 'Poison; Charmed, Poisoned', condition_immunities_display: '' } });
  assert.deepEqual(d, { resist: ['cold', 'fire'], vuln: ['radiant'], immune: ['poison'], condImmune: ['charmed', 'poisoned'] });
  // structured lists count too
  assert.deepEqual(R.monsterDefenses({ resistances_and_immunities: { damage_immunities: [{ name: 'Fire' }], condition_immunities: [{ name: 'Frightened' }] } }),
    { resist: [], vuln: [], immune: ['fire'], condImmune: ['frightened'] });
  // qualified (2014-style) text is left to the DM
  const q = R.monsterDefenses({ resistances_and_immunities: { damage_resistances_display: 'Bludgeoning, Piercing, and Slashing from Nonmagical Attacks' } });
  assert.deepEqual([q.resist, q.notes.length], [[], 1]);
  assert.equal(R.monsterDefenses({ resistances_and_immunities: {} }), null);
  assert.deepEqual(['fire', 'poison', 'radiant', 'acid', ''].map(t => R.defenseMod({ ...d, resist: ['fire', 'radiant'] }, t)),
    ['resist', 'immune', 'resist+vuln', 'normal', 'normal']);
  assert.equal(R.adjustDamage(11, { mod: 'resist+vuln' }), 10);
  assert.equal(R.adjustDamage(11, { half: true, none: true }), 0);
});

test('a creature immune to a condition doesn\'t get it', () => {
  const c = mk({ name: 'Zombie', def: { resist: [], vuln: [], immune: [], condImmune: ['poisoned', 'exhaustion'] } }), ctx = fight([c]);
  assert.match(R.addCondition(ctx, c, 'Poisoned').join(' '), /immune to Poisoned/);
  R.addCondition(ctx, c, 'Exhaustion');
  assert.deepEqual([c.conds, c.exh], [[], 0]);
  R.addCondition(ctx, c, 'Prone');
  assert.deepEqual(c.conds.map(x => x.n), ['Prone']);
});

test('conditions make some saves fail automatically or roll with Disadvantage', () => {
  const stunned = mk({ conds: [{ n: 'Stunned', d: null }] }), held = mk({ conds: [{ n: 'Restrained', d: null }] });
  assert.deepEqual([R.saveRule(stunned, 'dex'), R.saveRule(stunned, 'str'), R.saveRule(stunned, 'wis')], [{ fail: 'Stunned' }, { fail: 'Stunned' }, {}]);
  assert.deepEqual([R.saveRule(held, 'dex'), R.saveRule(held, 'str')], [{ dis: 'Restrained' }, {}]);
  assert.deepEqual(R.rollSave({ dice: [20], bonus: 5, dc: 10, rule: { fail: 'Stunned' } }), { die: null, total: null, ok: false, auto: 'Stunned' });
  assert.deepEqual(R.rollSave({ dice: [18, 4], bonus: 2, dc: 10, rule: { dis: 'Restrained' } }), { die: 4, total: 6, ok: false, auto: null });
  assert.equal(R.rollSave({ dice: [8], bonus: 2, dc: 10 }).ok, true);
});

test('grappled and charmed attackers', () => {
  const grappler = mk({ name: 'G' }), other = mk({ name: 'O' });
  const atk = mk({ conds: [{ n: 'Grappled', d: null, src: grappler.id }, { n: 'Charmed', d: null, src: other.id }] });
  assert.deepEqual(R.attackHints(atk, grappler).map(h => h.mode), []);
  assert.deepEqual(R.attackHints(atk, other).map(h => h.mode), ['dis', null]);
});

test('Rage and Petrified grant defenses; Rage ends concentration', () => {
  const b = mk({ conds: [{ n: 'Concentrating', d: null }] }), ctx = fight([b]);
  assert.equal(R.defensesOf(b), null);
  assert.match(R.addCondition(ctx, b, 'Raging').join(' '), /loses concentration/);
  assert.deepEqual(['slashing', 'fire'].map(t => R.defenseMod(R.defensesOf(b), t)), ['resist', 'normal']);
  const stone = mk({ def: { resist: [], vuln: ['bludgeoning'], immune: [], condImmune: [] }, conds: [{ n: 'Petrified', d: null }] });
  assert.deepEqual(['fire', 'poison', 'bludgeoning'].map(t => R.defenseMod(R.defensesOf(stone), t)), ['resist', 'immune', 'resist+vuln']);
  assert.match(R.addCondition(fight([stone]), stone, 'Poisoned').join(' '), /immune to Poisoned/);
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

// ---------- attacks ----------

test('attack rolls: total against AC, natural 20 crits, natural 1 misses', () => {
  assert.deepEqual(R.attackOutcome({ dice: [12], bonus: 5, ac: 17 }), { nat: 12, total: 17, hit: true, crit: false });
  assert.equal(R.attackOutcome({ dice: [11], bonus: 5, ac: 17 }).hit, false);
  assert.deepEqual(R.attackOutcome({ dice: [20], bonus: -5, ac: 30 }), { nat: 20, total: 15, hit: true, crit: true });
  assert.equal(R.attackOutcome({ dice: [1], bonus: 30, ac: 10 }).hit, false);
  assert.equal(R.attackOutcome({ dice: [4, 15], mode: 'adv', bonus: 2, ac: 17 }).total, 17);
  assert.equal(R.attackOutcome({ dice: [4, 15], mode: 'dis', bonus: 2, ac: 17 }).total, 6);
  assert.equal(R.attackOutcome({ dice: [15], bonus: 2, pen: 4, ac: 15 }).hit, false);   // Exhaustion 2
  assert.deepEqual(R.attackOutcome({ dice: [19], bonus: 0, ac: 25, critOn: 19 }), { nat: 19, total: 19, hit: true, crit: true });   // Champion
});

test('attack reminders come from both creatures\' conditions', () => {
  const tgt = mk({ conds: [{ n: 'Restrained', d: null }, { n: 'Prone', d: null }] });
  const atk = mk({ conds: [{ n: 'Poisoned', d: null }] });
  const hints = R.attackHints(atk, tgt);
  assert.deepEqual(hints.map(h => h.mode), ['adv', null, 'dis']);
  assert.match(hints[2].text, /Poisoned attacker/);
  assert.deepEqual(R.attackHints(mk(), mk()), []);
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

// ---------- concentration and repeated saves ----------

test('effects tied to concentration end with it', () => {
  const cleric = mk({ name: 'Cleric', hp: 30, max: 30 }), a = mk({ name: 'A' }), b = mk({ name: 'B' });
  const ctx = fight([cleric, a, b]);
  R.addCondition(ctx, a, 'Blessed', 10, { src: cleric.id, conc: true });
  R.addCondition(ctx, b, 'Blessed', 10, { src: cleric.id, conc: true });
  R.addCondition(ctx, b, 'Frightened', 1, { src: cleric.id });                  // not concentration
  assert.ok(R.hasCond(cleric, 'Concentrating'));                                 // marked automatically
  R.damage(ctx, cleric, 8);
  assert.deepEqual(ctx.enc.prompts.map(p => [p.kind, p.dc]), [['conc', 10]]);
  const msgs = R.resolvePrompt(ctx, ctx.enc.prompts[0].id, false);              // fails the Con save
  assert.match(msgs.join(' '), /Cleric loses concentration: Blessed on A, Blessed on B ended/);
  assert.deepEqual([a.conds, b.conds.map(x => x.n), cleric.conds], [[], ['Frightened'], []]);
});

test('removing Concentrating by hand, incapacitation or leaving the fight ends linked effects', () => {
  const w = mk({ name: 'W' }), t = mk({ name: 'T' });
  let ctx = fight([w, t]);
  R.addCondition(ctx, t, 'Slowed', null, { src: w.id, conc: true });
  R.removeCondition(ctx, w, w.conds.findIndex(x => x.n === 'Concentrating'));
  assert.deepEqual(t.conds, []);
  R.addCondition(ctx, t, 'Slowed', null, { src: w.id, conc: true });
  assert.match(R.addCondition(ctx, w, 'Stunned').join(' '), /W loses concentration/);
  assert.deepEqual(t.conds, []);
  R.addCondition(ctx, t, 'Slowed', null, { src: w.id, conc: true });
  R.removeCombatants(ctx, [w.id]);
  assert.deepEqual(t.conds, []);
});

test('a repeated save is asked at the end of the bearer\'s turn and a success ends the condition', () => {
  const orc = mk({ name: 'Orc', init: 20 }), pc = mk({ name: 'PC', kind: 'pc', init: 10 });
  const ctx = fight([orc, pc]);
  R.step(ctx, 1);
  R.addCondition(ctx, orc, 'Paralyzed', null, { save: { ab: 'wis', dc: 15 } });
  assert.deepEqual(ctx.enc.prompts, []);
  R.step(ctx, 1);                                                               // the Orc's turn ends
  assert.deepEqual(ctx.enc.prompts.map(p => [p.cid, p.n, p.ab, p.dc]), [[orc.id, 'Paralyzed', 'wis', 15]]);
  assert.match(R.resolvePrompt(ctx, ctx.enc.prompts[0].id, false).join(' '), /still Paralyzed/);
  assert.ok(R.hasCond(orc, 'Paralyzed'));
  R.step(ctx, 1); R.step(ctx, 1);                                               // its next turn ends
  R.resolvePrompt(ctx, ctx.enc.prompts[0].id, true);
  assert.ok(!R.hasCond(orc, 'Paralyzed'));
  R.step(ctx, -1);                                                              // Back: before its turn ended
  assert.ok(R.hasCond(orc, 'Paralyzed'));
  assert.equal(ctx.enc.prompts.length, 0);
  R.step(ctx, 1);                                                               // ending the turn again asks again
  assert.equal(ctx.enc.prompts.length, 1);
});

// ---------- difficulty and summary ----------

test('2024 encounter difficulty adds up each character\'s budget', () => {
  const four5 = [5, 5, 5, 5];                                                   // budgets 2000 / 3000 / 4400
  assert.deepEqual(R.difficulty(four5, 1800), { low: 2000, moderate: 3000, high: 4400, xp: 1800, rating: 'Low' });
  assert.equal(R.difficulty(four5, 3000).rating, 'Moderate');
  assert.equal(R.difficulty(four5, 3001).rating, 'High');
  assert.equal(R.difficulty(four5, 5000).rating, 'Above High');
  assert.equal(R.difficulty([1, 20], 0).high, 100 + 22000);
  assert.equal(R.difficulty([], 500).rating, null);
});

test('the summary counts rounds, defeated foes, XP per character, knockouts and damage taken', () => {
  const pc1 = mk({ name: 'Mira', kind: 'pc', init: 20, hp: 10, max: 10 }), pc2 = mk({ name: 'Bram', kind: 'pc', init: 15 });
  const orc = mk({ name: 'Orc', init: 10, hp: 15, max: 15, xp: 100 }), wolf = mk({ name: 'Wolf', init: 5, xp: 50 });
  const ctx = fight([pc1, pc2, orc, wolf]);
  R.step(ctx, 1);
  R.damage(ctx, pc1, 12);                                                       // Mira goes down
  R.damage(ctx, orc, 20);                                                       // the Orc is defeated
  R.removeCombatants(ctx, [orc.id]);                                            // and removed: still counted by name
  for (let i = 0; i < 4; i++) R.step(ctx, 1);
  const s = R.summary(ctx);
  assert.equal(s.rounds, 2);
  assert.deepEqual(s.downs, [{ name: 'Mira', n: 1 }]);
  assert.deepEqual(s.taken, [{ name: 'Orc', n: 15 }, { name: 'Mira', n: 10 }]);
  assert.deepEqual([s.defeated, s.xp, s.each], [[{ name: 'Orc', xp: 100 }], 100, 50]);
  R.damage(ctx, wolf, 99);
  assert.deepEqual([R.summary(ctx).xp, R.summary(ctx).each], [150, 75]);
});

test('concentrating on a new spell ends the old one; more targets of the same spell are fine', () => {
  const w = mk({ name: 'W' }), a = mk({ name: 'A' }), b = mk({ name: 'B' }), ctx = fight([w, a, b]);
  R.addCondition(ctx, a, 'Blessed', null, { src: w.id, conc: true, spell: 'Bless' });
  R.addCondition(ctx, b, 'Blessed', null, { src: w.id, conc: true, spell: 'Bless' });
  assert.deepEqual([a.conds.length, b.conds.length], [1, 1]);
  assert.equal(w.conds.find(x => x.n === 'Concentrating').spell, 'Bless');
  const msgs = R.addCondition(ctx, b, 'Paralyzed', null, { src: w.id, conc: true, spell: 'Hold Person' });
  assert.match(msgs.join(' '), /W stops concentrating on Bless: Blessed on A, Blessed on B ended/);
  assert.deepEqual([a.conds, b.conds.map(x => x.n)], [[], ['Paralyzed']]);
  assert.equal(w.conds.filter(x => x.n === 'Concentrating').length, 1);
});

// ---------- spell effects ----------

test("Hunter's Mark adds damage to the caster's hits on the target only, and ends with concentration", () => {
  const ranger = mk({ name: 'Ranger' }), orc = mk({ name: 'Orc' }), ally = mk({ name: 'Ally' });
  const ctx = fight([ranger, orc, ally]);
  const r = R.castEffect(ctx, ranger, "Hunter's Mark", orc);
  assert.equal(r.needsSlot, true);
  assert.equal(ranger.conds.find(x => x.n === 'Concentrating').spell, "Hunter's Mark");
  assert.deepEqual(R.hitRiders(ranger, orc), [{ name: "Hunter's Mark", dice: '1d6', type: 'force' }]);
  assert.deepEqual(R.hitRiders(ally, orc), []);                                   // someone else's hits
  assert.deepEqual(R.hitRiders(ranger, orc, { markDie: '1d10' })[0].dice, '1d10');  // Foe Slayer
  R.endConcentration(ctx, ranger);
  assert.deepEqual(R.hitRiders(ranger, orc), []);
});

test('a marked creature at 0 HP lets its caster move the mark', () => {
  const warlock = mk({ name: 'Warlock' }), a = mk({ name: 'A', hp: 5 }), b = mk({ name: 'B' });
  const ctx = fight([warlock, a, b]);
  R.castEffect(ctx, warlock, 'Hex', a);
  R.damage(ctx, a, 10);
  const p = ctx.enc.prompts.find(x => x.kind === 'mark');
  assert.deepEqual([p.cid, p.n, p.from], [warlock.id, 'Hex', a.id]);
  assert.match(R.resolvePrompt(ctx, p.id, b.id).join(' '), /Warlock moves Hex to B/);
  assert.deepEqual([a.conds.some(x => x.n === 'Hex'), R.hitRiders(warlock, b)[0].type], [false, 'necrotic']);
});

test('Bless and Bane change rolls; Shield of Faith, Haste and Shield raise AC', () => {
  const cleric = mk({ name: 'Cleric', init: 20 }), a = mk({ name: 'A', ac: 15, init: 10 }), b = mk({ name: 'B' });
  const ctx = fight([cleric, a, b]);
  assert.equal(R.castEffect(ctx, cleric, 'Bless', a).needsSlot, true);
  assert.equal(R.castEffect(ctx, cleric, 'Bless', b).needsSlot, false);           // same casting, second target
  assert.deepEqual(R.rollMods(a), ['1d4']);
  assert.equal(R.attackOutcome({ dice: [10], bonus: 2, ac: 15, extra: 3 }).hit, true);
  assert.equal(R.rollSave({ dice: [8], bonus: 0, dc: 10, extra: 2 }).ok, true);
  R.castEffect(ctx, cleric, 'Shield of Faith', a);                                // a new spell ends Bless
  assert.deepEqual([R.rollMods(a), R.acOf(ctx, a)], [[], 17]);
  R.step(ctx, 1);                                                                  // the Cleric's turn
  R.castEffect(ctx, cleric, 'Shield', null);
  assert.equal(R.acOf(ctx, cleric), 12 + 5);
  R.step(ctx, 1); R.step(ctx, 1); R.step(ctx, 1);                                  // start of the Cleric's next turn
  assert.equal(R.acOf(ctx, cleric), 12);
});

test('Divine Favor adds to its caster\'s weapon hits; the slot to spend is the lowest available', () => {
  const p = mk({ name: 'Paladin' }), o = mk({ name: 'O' }), ctx = fight([p, o]);
  R.castEffect(ctx, p, 'Divine Favor', null);
  assert.deepEqual(R.hitRiders(p, o), [{ name: 'Divine Favor', dice: '1d4', type: 'radiant' }]);
  assert.deepEqual(R.hitRiders(p, o, { weapon: false }), []);
  const slots = [{ max: 2, used: 2 }, { max: 1, used: 0 }, { max: 0, used: 0 }];
  assert.deepEqual([R.pickSlot(slots, 1), R.pickSlot(slots, 3)], [1, -1]);
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
