"""2014 Player's Handbook: the original 40 subclasses. Subclasses start at level 1 (Cleric, Sorcerer,
Warlock), 2 (Druid, Wizard) or 3 (everyone else). Summaries in our own words; check the book for the
exact rules."""
from .base import LR, P14, SR, F, S, add

MA14 = [(1, "1d4"), (5, "1d6"), (11, "1d8"), (17, "1d10")]
DIVINE_STRIKE = [(8, "1d8"), (14, "2d8")]


def school(key, name, savant, features):
    """A 2014 Wizard school: every school starts with its Savant feature at level 2."""
    add(key, S("wizard", name, P14, [F(2, f"{savant} Savant", f"Copying {savant} spells into your spellbook costs half the gold and time.")] + features, level=2))


# ====================================================================== Barbarian

add("berserker-2014", S("barbarian", "Path of the Berserker", P14, [
    F(3, "Frenzy", "When you rage you can frenzy: for the rage, make one melee weapon attack as a Bonus Action on each of your turns; you gain a level of Exhaustion when the rage ends."),
    F(6, "Mindless Rage", "You can't be Charmed or Frightened while raging (they're suspended if already on you).", cond_immune=["charmed", "frightened"], needs="Raging"),
    F(10, "Intimidating Presence", "Action: a creature within 30 ft makes a Wis save (DC 8 + PB + Cha) or is Frightened until the end of your next turn; extend it each turn with your action."),
    F(14, "Retaliation", "Reaction when a creature within 5 ft damages you: one melee weapon attack against it."),
]))

add("totem-warrior-2014", S("barbarian", "Path of the Totem Warrior", P14, [
    F(3, "Spirit Seeker", "Cast Beast Sense and Speak with Animals as rituals."),
    F(3, "Totem Spirit", "Choose a totem animal; its benefit applies while you rage.",
      options=[("bear", "Bear", "While raging, resistance to all damage except psychic.",
                dict(resist=["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "radiant", "slashing", "thunder"], needs="Raging")),
               ("eagle", "Eagle", "While raging (without heavy armor), other creatures have Disadvantage on Opportunity Attacks against you, and you can Dash as a Bonus Action."),
               ("wolf", "Wolf", "While raging, your friends have Advantage on melee attacks against hostile creatures within 5 ft of you.")]),
    F(6, "Aspect of the Beast", "Bear: double carrying capacity, Advantage on Str checks to push, pull, lift or break. Eagle: see a mile clearly, dim light doesn't hinder Perception. Wolf: track at a fast pace, move stealthily at a normal pace."),
    F(10, "Spirit Walker", "Cast Commune with Nature as a ritual."),
    F(14, "Totemic Attunement", "Bear: while raging, enemies within 5 ft have Disadvantage on attacks against others. Eagle: while raging, fly at your walking speed. Wolf: while raging, a Bonus Action knocks a Large or smaller creature you hit Prone."),
]))

# ====================================================================== Bard

add("lore-2014", S("bard", "College of Lore", P14, [
    F(3, "Bonus Proficiencies", "Three skills of your choice."),
    F(3, "Cutting Words", "Reaction when a creature within 60 ft makes an attack roll, ability check or damage roll: spend a Bardic Inspiration die and subtract the roll."),
    F(6, "Additional Magical Secrets", "Two spells from any class's list; they count as Bard spells."),
    F(14, "Peerless Skill", "Spend a Bardic Inspiration die and add it to one of your ability checks."),
]))

add("valor-2014", S("bard", "College of Valor", P14, [
    F(3, "Bonus Proficiencies", "Medium armor, shields and martial weapons.", armor=["medium", "shields"], weapons=["martial"]),
    F(3, "Combat Inspiration", "A creature with your Bardic Inspiration can add the die to a weapon damage roll, or to its AC against one attack (Reaction)."),
    F(6, "Extra Attack", "Attack twice when you take the Attack action."),
    F(14, "Battle Magic", "After you cast a Bard spell with your action, make one weapon attack as a Bonus Action."),
]))

# ====================================================================== Cleric

add("knowledge-2014", S("cleric", "Knowledge Domain", P14, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Command", "Identify"], 3: ["Augury", "Suggestion"], 5: ["Nondetection", "Speak with Dead"],
              7: ["Arcane Eye", "Confusion"], 9: ["Legend Lore", "Scrying"]}),
    F(1, "Blessings of Knowledge", "Two languages, and proficiency with double proficiency bonus (expertise) in two of Arcana, History, Nature or Religion."),
    F(2, "Channel Divinity: Knowledge of the Ages", "Action: proficiency with one skill or tool for 10 minutes."),
    F(6, "Channel Divinity: Read Thoughts", "Read a creature's surface thoughts within 60 ft (Wis save); you can then cast Suggestion on it without a slot."),
    F(8, "Potent Spellcasting", "Add your Wis modifier to the damage of your Cleric cantrips.", cantrip_bonus="wis"),
    F(17, "Visions of the Past", "Meditate to see recent visions of an object or the area around you."),
], level=1))

add("life-2014", S("cleric", "Life Domain", P14, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Bless", "Cure Wounds"], 3: ["Lesser Restoration", "Spiritual Weapon"], 5: ["Beacon of Hope", "Revivify"],
              7: ["Death Ward", "Guardian of Faith"], 9: ["Mass Cure Wounds", "Raise Dead"]}),
    F(1, "Bonus Proficiency", "Heavy armor.", armor=["heavy"]),
    F(1, "Disciple of Life", "Healing spells of 1st level or higher restore an extra 2 + the spell's level."),
    F(2, "Channel Divinity: Preserve Life", "Action: restore 5 × Cleric level HP split among creatures within 30 ft (none above half their HP maximum)."),
    F(6, "Blessed Healer", "When a healing spell of yours heals someone else, you regain 2 + the spell's level."),
    F(8, "Divine Strike", "Once on each of your turns, a weapon hit deals +1d8 radiant (2d8 at 14).",
      rider=dict(dice=DIVINE_STRIKE, type="radiant", once="turn")),
    F(17, "Supreme Healing", "Healing dice count as their maximum."),
], level=1))

add("light-2014", S("cleric", "Light Domain", P14, [
    F(1, "Domain Spells", "Always prepared; you also know the Light cantrip.",
      spells={1: ["Light", "Burning Hands", "Faerie Fire"], 3: ["Flaming Sphere", "Scorching Ray"], 5: ["Daylight", "Fireball"],
              7: ["Guardian of Faith", "Wall of Fire"], 9: ["Flame Strike", "Scrying"]}),
    F(1, "Warding Flare", "Reaction when a creature within 30 ft attacks you: Disadvantage on the roll (not against creatures that can't be blinded). Wis-modifier times per Long Rest.",
      resource=("warding_flare", "Warding Flare", "max(1, wis)", LR)),
    F(2, "Channel Divinity: Radiance of the Dawn", "Action: dispel magical darkness within 30 ft; hostile creatures there make a Con save or take 2d10 + Cleric level radiant (half on a success)."),
    F(6, "Improved Flare", "Warding Flare can also protect another creature."),
    F(8, "Potent Spellcasting", "Add your Wis modifier to the damage of your Cleric cantrips.", cantrip_bonus="wis"),
    F(17, "Corona of Light", "Action: 1 minute of bright light (60 ft); enemies in it have Disadvantage on saves against fire and radiant spells."),
], level=1))

add("nature-2014", S("cleric", "Nature Domain", P14, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Animal Friendship", "Speak with Animals"], 3: ["Barkskin", "Spike Growth"], 5: ["Plant Growth", "Wind Wall"],
              7: ["Dominate Beast", "Grasping Vine"], 9: ["Insect Plague", "Tree Stride"]}),
    F(1, "Acolyte of Nature", "One Druid cantrip, and Animal Handling, Nature or Survival."),
    F(1, "Bonus Proficiency", "Heavy armor.", armor=["heavy"]),
    F(2, "Channel Divinity: Charm Animals and Plants", "Action: beasts and plants within 30 ft make a Wis save or are Charmed for 1 minute."),
    F(6, "Dampen Elements", "Reaction when you or a creature within 30 ft takes acid, cold, fire, lightning or thunder damage: grant resistance to it."),
    F(8, "Divine Strike", "Once on each of your turns, a weapon hit deals +1d8 cold, fire or lightning (2d8 at 14).",
      rider=dict(dice=DIVINE_STRIKE, type="fire", once="turn")),
    F(17, "Master of Nature", "Bonus Action: command creatures charmed by your Charm Animals and Plants."),
], level=1))

add("tempest-2014", S("cleric", "Tempest Domain", P14, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Fog Cloud", "Thunderwave"], 3: ["Gust of Wind", "Shatter"], 5: ["Call Lightning", "Sleet Storm"],
              7: ["Control Water", "Ice Storm"], 9: ["Destructive Wave", "Insect Plague"]}),
    F(1, "Bonus Proficiencies", "Martial weapons and heavy armor.", armor=["heavy"], weapons=["martial"]),
    F(1, "Wrath of the Storm", "Reaction when a creature within 5 ft hits you: it makes a Dex save or takes 2d8 lightning or thunder (half on a success). Wis-modifier times per Long Rest.",
      resource=("wrath_of_the_storm", "Wrath of the Storm", "max(1, wis)", LR)),
    F(2, "Channel Divinity: Destructive Wrath", "When you roll lightning or thunder damage, deal the maximum instead."),
    F(6, "Thunderbolt Strike", "When you deal lightning damage to a Large or smaller creature, push it up to 10 ft."),
    F(8, "Divine Strike", "Once on each of your turns, a weapon hit deals +1d8 thunder (2d8 at 14).",
      rider=dict(dice=DIVINE_STRIKE, type="thunder", once="turn")),
    F(17, "Stormborn", "Fly speed equal to your walking speed outdoors and not underground."),
], level=1))

add("trickery-2014", S("cleric", "Trickery Domain", P14, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Charm Person", "Disguise Self"], 3: ["Mirror Image", "Pass without Trace"], 5: ["Blink", "Dispel Magic"],
              7: ["Dimension Door", "Polymorph"], 9: ["Dominate Person", "Modify Memory"]}),
    F(1, "Blessing of the Trickster", "Action: another willing creature has Advantage on Stealth checks for 1 hour."),
    F(2, "Channel Divinity: Invoke Duplicity", "Action: an illusory duplicate for 1 minute (concentration); cast spells from its space, Advantage on attacks against creatures within 5 ft of it."),
    F(6, "Channel Divinity: Cloak of Shadows", "Action: Invisible until the end of your next turn."),
    F(8, "Divine Strike", "Once on each of your turns, a weapon hit deals +1d8 poison (2d8 at 14).",
      rider=dict(dice=DIVINE_STRIKE, type="poison", once="turn")),
    F(17, "Improved Duplicity", "Invoke Duplicity makes up to four duplicates."),
], level=1))

add("war-2014", S("cleric", "War Domain", P14, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Divine Favor", "Shield of Faith"], 3: ["Magic Weapon", "Spiritual Weapon"], 5: ["Crusader's Mantle", "Spirit Guardians"],
              7: ["Freedom of Movement", "Stoneskin"], 9: ["Flame Strike", "Hold Monster"]}),
    F(1, "Bonus Proficiencies", "Martial weapons and heavy armor.", armor=["heavy"], weapons=["martial"]),
    F(1, "War Priest", "When you take the Attack action, make one weapon attack as a Bonus Action. Wis-modifier times per Long Rest.",
      resource=("war_priest", "War Priest", "max(1, wis)", LR)),
    F(2, "Channel Divinity: Guided Strike", "+10 to one of your attack rolls (after seeing the roll)."),
    F(6, "Channel Divinity: War God's Blessing", "Reaction: +10 to the attack roll of a creature within 30 ft."),
    F(8, "Divine Strike", "Once on each of your turns, a weapon hit deals +1d8 of the weapon's damage type (2d8 at 14).",
      rider=dict(dice=DIVINE_STRIKE, once="turn")),
    F(17, "Avatar of Battle", "Resistance to bludgeoning, piercing and slashing damage from nonmagical weapons."),
], level=1))

# ====================================================================== Druid

LAND14 = {
    "arctic": ("Arctic", {3: ["Hold Person", "Spike Growth"], 5: ["Sleet Storm", "Slow"], 7: ["Freedom of Movement", "Ice Storm"], 9: ["Commune with Nature", "Cone of Cold"]}),
    "coast": ("Coast", {3: ["Mirror Image", "Misty Step"], 5: ["Water Breathing", "Water Walk"], 7: ["Control Water", "Freedom of Movement"], 9: ["Conjure Elemental", "Scrying"]}),
    "desert": ("Desert", {3: ["Blur", "Silence"], 5: ["Create Food and Water", "Protection from Energy"], 7: ["Blight", "Hallucinatory Terrain"], 9: ["Insect Plague", "Wall of Stone"]}),
    "forest": ("Forest", {3: ["Barkskin", "Spider Climb"], 5: ["Call Lightning", "Plant Growth"], 7: ["Divination", "Freedom of Movement"], 9: ["Commune with Nature", "Tree Stride"]}),
    "grassland": ("Grassland", {3: ["Invisibility", "Pass without Trace"], 5: ["Daylight", "Haste"], 7: ["Divination", "Freedom of Movement"], 9: ["Dream", "Insect Plague"]}),
    "mountain": ("Mountain", {3: ["Spider Climb", "Spike Growth"], 5: ["Lightning Bolt", "Meld into Stone"], 7: ["Stone Shape", "Stoneskin"], 9: ["Passwall", "Wall of Stone"]}),
    "swamp": ("Swamp", {3: ["Darkness", "Melf's Acid Arrow"], 5: ["Water Walk", "Stinking Cloud"], 7: ["Freedom of Movement", "Locate Creature"], 9: ["Insect Plague", "Scrying"]}),
    "underdark": ("Underdark", {3: ["Spider Climb", "Web"], 5: ["Gaseous Form", "Stinking Cloud"], 7: ["Greater Invisibility", "Stone Shape"], 9: ["Cloudkill", "Insect Plague"]}),
}
add("land-2014", S("druid", "Circle of the Land", P14, [
    F(2, "Bonus Cantrip", "One extra Druid cantrip."),
    F(2, "Natural Recovery", "On a Short Rest, recover slots totalling up to half your Druid level (rounded up), none 6th or higher. Once per Long Rest.",
      resource=("natural_recovery", "Natural Recovery", 1, LR)),
    F(3, "Circle Spells", "Choose your land; its spells are always prepared.",
      options=[(k, n, f"Always prepared: {', '.join(x for lv in sp.values() for x in lv)}.", dict(spells=sp)) for k, (n, sp) in LAND14.items()]),
    F(6, "Land's Stride", "Nonmagical difficult terrain costs no extra movement and plants don't hurt you; Advantage on saves against magically manipulated plants."),
    F(10, "Nature's Ward", "Can't be Charmed or Frightened by elementals or fey; immune to poison and disease.", immune=["poison"], cond_immune=["poisoned"]),
    F(14, "Nature's Sanctuary", "Beasts and plants attacking you must make a Wis save or choose another target."),
], level=2))

add("moon-2014", S("druid", "Circle of the Moon", P14, [
    F(2, "Combat Wild Shape", "Wild Shape as a Bonus Action; while transformed, spend a spell slot as a Bonus Action to heal 1d8 per slot level."),
    F(2, "Circle Forms", "Wild Shape into beasts of CR 1 (and from level 6, up to Druid level ÷ 3)."),
    F(6, "Primal Strike", "Attacks in beast form count as magical."),
    F(10, "Elemental Wild Shape", "Spend two Wild Shape uses to become an air, earth, fire or water elemental."),
    F(14, "Thousand Forms", "Cast Alter Self at will."),
], level=2))

# ====================================================================== Fighter

add("battle-master-2014", S("fighter", "Battle Master", P14, [
    F(3, "Combat Superiority", "Superiority dice (4, 5 at 7, 6 at 15; d8, d10 at 10, d12 at 18), all back on a Short or Long Rest; three maneuvers (5 at 7, 7 at 10, 9 at 15). Save DC 8 + PB + Str or Dex.",
      resource=("superiority_dice", "Superiority dice", [(3, 4), (7, 5), (15, 6)], SR),
      rider=dict(name="Maneuver (spend a superiority die)", dice=[(3, "1d8"), (10, "1d10"), (18, "1d12")])),
    F(3, "Student of War", "One artisan's tool."),
    F(7, "Know Your Enemy", "Study a creature for 1 minute to learn whether it's your equal, superior or inferior in two characteristics."),
    F(10, "Improved Combat Superiority", "Superiority dice become d10s."),
    F(15, "Relentless", "When you roll initiative with no superiority dice left, regain one."),
    F(18, "Ultimate Combat Superiority", "Superiority dice become d12s."),
]))

add("champion-2014", S("fighter", "Champion", P14, [
    F(3, "Improved Critical", "Weapon attacks score a critical hit on a 19 or 20.", crit=19),
    F(7, "Remarkable Athlete", "Add half your proficiency bonus (rounded up) to Str, Dex and Con checks that don't already use it; running long jumps go Str-modifier feet farther.",
      check=dict(abilities=["str", "dex", "con"], add="half_pb_up", unproficient=True)),
    F(10, "Additional Fighting Style", "Choose a second Fighting Style."),
    F(15, "Superior Critical", "Critical hits on an 18–20.", crit=18),
    F(18, "Survivor", "At the start of each of your turns, if you have at most half your HP (and more than 0), regain 5 + Con modifier HP."),
]))

add("eldritch-knight-2014", S("fighter", "Eldritch Knight", P14, [
    F(3, "Spellcasting", "Intelligence casting from the Wizard list (mostly abjuration and evocation) as a one-third caster.", third_caster="int"),
    F(3, "Weapon Bond", "Bond with up to two weapons: you can't be disarmed of them and can summon one as a Bonus Action."),
    F(7, "War Magic", "After casting a cantrip with your action, make one weapon attack as a Bonus Action."),
    F(10, "Eldritch Strike", "A creature you hit with a weapon has Disadvantage on its next save against your spells before the end of your next turn."),
    F(15, "Arcane Charge", "When you Action Surge, teleport up to 30 ft."),
    F(18, "Improved War Magic", "After casting a spell with your action, make one weapon attack as a Bonus Action."),
]))

# ====================================================================== Monk

add("open-hand-2014", S("monk", "Way of the Open Hand", P14, [
    F(3, "Open Hand Technique", "A Flurry of Blows hit can knock the target Prone (Dex save), push it 15 ft (Str save), or deny it reactions until the end of your next turn."),
    F(6, "Wholeness of Body", "Action: regain HP equal to three times your Monk level. Once per Long Rest.",
      resource=("wholeness_of_body", "Wholeness of Body", 1, LR)),
    F(11, "Tranquility", "After a Long Rest, gain the effect of Sanctuary until your next Long Rest (Wis save DC 8 + Wis + PB)."),
    F(17, "Quivering Palm", "On an unarmed hit, spend 3 ki: later, an action makes the target make a Con save or drop to 0 HP (10d10 necrotic on a success)."),
]))

add("shadow-2014", S("monk", "Way of Shadow", P14, [
    F(3, "Shadow Arts", "2 ki: cast Darkness, Darkvision, Pass without Trace or Silence; Minor Illusion cantrip."),
    F(6, "Shadow Step", "Bonus Action in dim light or darkness: teleport 60 ft to another such space and have Advantage on your next melee attack this turn."),
    F(11, "Cloak of Shadows", "Action in dim light or darkness: Invisible until you attack, cast a spell, or enter bright light."),
    F(17, "Opportunist", "Reaction when a creature within 5 ft is hit by someone else: one melee attack against it."),
]))

add("four-elements-2014", S("monk", "Way of the Four Elements", P14, [
    F(3, "Disciple of the Elements", "Learn Elemental Attunement and one elemental discipline (Fangs of the Fire Snake, Fist of Four Thunders, Water Whip...); disciplines cost ki, and you learn more at 6, 11 and 17. Save DC is your ki save DC."),
    F(6, "Extra Discipline (6)", "Learn one more elemental discipline; you can swap one."),
    F(11, "Extra Discipline (11)", "Learn one more elemental discipline; you can swap one."),
    F(17, "Extra Discipline (17)", "Learn one more elemental discipline; you can swap one."),
]))

# ====================================================================== Paladin

add("devotion-2014", S("paladin", "Oath of Devotion", P14, [
    F(3, "Oath Spells", "Always prepared.",
      spells={3: ["Protection from Evil and Good", "Sanctuary"], 5: ["Lesser Restoration", "Zone of Truth"], 9: ["Beacon of Hope", "Dispel Magic"],
              13: ["Freedom of Movement", "Guardian of Faith"], 17: ["Commune", "Flame Strike"]}),
    F(3, "Channel Divinity", "Sacred Weapon: 1 minute, add your Cha modifier (minimum +1) to attack rolls with a weapon, which sheds light. Turn the Unholy: fiends and undead within 30 ft make a Wis save or are Turned."),
    F(7, "Aura of Devotion", "You and friendly creatures within 10 ft (30 ft at 18) can't be Charmed while you're conscious.", cond_immune=["charmed"], aura=dict(name="Aura of Devotion")),
    F(15, "Purity of Spirit", "You are always under the effect of Protection from Evil and Good."),
    F(20, "Holy Nimbus", "Action, 1 minute: bright light 30 ft; enemies starting their turn in it take 10 radiant; Advantage on saves against fiends' and undeads' spells. Once per Long Rest.",
      resource=("holy_nimbus", "Holy Nimbus", 1, LR)),
]))

add("ancients-2014", S("paladin", "Oath of the Ancients", P14, [
    F(3, "Oath Spells", "Always prepared.",
      spells={3: ["Ensnaring Strike", "Speak with Animals"], 5: ["Misty Step", "Moonbeam"], 9: ["Plant Growth", "Protection from Energy"],
              13: ["Ice Storm", "Stoneskin"], 17: ["Commune with Nature", "Tree Stride"]}),
    F(3, "Channel Divinity", "Nature's Wrath: a creature within 10 ft makes a Str or Dex save or is Restrained. Turn the Faithless: fey and fiends within 30 ft make a Wis save or are Turned."),
    F(7, "Aura of Warding", "You and friendly creatures within 10 ft (30 ft at 18) have resistance to damage from spells."),
    F(15, "Undying Sentinel", "When you drop to 0 HP and don't die outright, drop to 1 HP instead. Once per Long Rest. You don't age.",
      resource=("undying_sentinel", "Undying Sentinel", 1, LR), cheat_death=dict(key="undying_sentinel", hp="1")),
    F(20, "Elder Champion", "Action, 1 minute: regain 10 HP at the start of each turn, cast 1-action Paladin spells as a Bonus Action, and enemies within 10 ft have Disadvantage on saves against your spells and Channel Divinity. Once per Long Rest.",
      resource=("elder_champion", "Elder Champion", 1, LR)),
]))

add("vengeance-2014", S("paladin", "Oath of Vengeance", P14, [
    F(3, "Oath Spells", "Always prepared.",
      spells={3: ["Bane", "Hunter's Mark"], 5: ["Hold Person", "Misty Step"], 9: ["Haste", "Protection from Energy"],
              13: ["Banishment", "Dimension Door"], 17: ["Hold Monster", "Scrying"]}),
    F(3, "Channel Divinity", "Abjure Enemy: a creature within 60 ft makes a Wis save or is Frightened with speed 0 for 1 minute. Vow of Enmity: Bonus Action, Advantage on attacks against a creature within 10 ft for 1 minute."),
    F(7, "Relentless Avenger", "When your Opportunity Attack hits, move up to half your speed without provoking Opportunity Attacks."),
    F(15, "Soul of Vengeance", "Reaction when the creature under your Vow of Enmity attacks: one melee weapon attack against it."),
    F(20, "Avenging Angel", "Action, 1 hour: fly speed 60 ft and a 30-ft aura of menace (Wis save or Frightened). Once per Long Rest.",
      resource=("avenging_angel", "Avenging Angel", 1, LR)),
]))

# ====================================================================== Ranger

add("hunter-2014", S("ranger", "Hunter", P14, [
    F(3, "Hunter's Prey", "Choose one.",
      options=[
          ("colossus", "Colossus Slayer", "Once per turn, a weapon hit on a creature below its HP maximum deals +1d8.",
           dict(rider=dict(name="Colossus Slayer (target below max HP)", dice="1d8", once="turn"))),
          ("giant", "Giant Killer", "Reaction when a Large or larger creature within 5 ft attacks you: one attack against it."),
          ("horde", "Horde Breaker", "Once on each of your turns, attack another creature within 5 ft of the first target."),
      ]),
    F(7, "Defensive Tactics", "Choose one: Escape the Horde (Opportunity Attacks against you have Disadvantage), Multiattack Defense (+4 AC against a creature's later attacks after it hits you), or Steel Will (Advantage against Frightened)."),
    F(11, "Multiattack", "Choose one: Volley (a ranged attack against every creature within 10 ft of a point) or Whirlwind Attack (a melee attack against every creature within 5 ft)."),
    F(15, "Superior Hunter's Defense", "Choose one: Evasion, Stand Against the Tide (redirect a missed melee attack), or Uncanny Dodge (halve an attack's damage)."),
]))

add("beast-master-2014", S("ranger", "Beast Master", P14, [
    F(3, "Ranger's Companion", "A beast companion of CR 1/4 or lower (Medium or smaller); add your PB to its AC, attacks, damage, saves and skills; its HP maximum is the higher of its normal one or four times your Ranger level. Command it with your action."),
    F(7, "Exceptional Training", "Bonus Action: command the beast to Dash, Disengage or Help; its attacks count as magical."),
    F(11, "Bestial Fury", "The beast can make two attacks when commanded to Attack."),
    F(15, "Share Spells", "A spell targeting only you can also affect the beast within 30 ft."),
]))

# ====================================================================== Rogue

add("thief-2014", S("rogue", "Thief", P14, [
    F(3, "Fast Hands", "Cunning Action can also Sleight of Hand, use thieves' tools, or Use an Object."),
    F(3, "Second-Story Work", "Climbing costs no extra movement; running jumps go Dex-modifier feet farther."),
    F(9, "Supreme Sneak", "Advantage on Stealth if you move no more than half your speed that turn."),
    F(13, "Use Magic Device", "Ignore class, race and level requirements for magic items."),
    F(17, "Thief's Reflexes", "Take two turns in the first round of combat (the second at your initiative − 10)."),
]))

add("assassin-2014", S("rogue", "Assassin", P14, [
    F(3, "Bonus Proficiencies", "Disguise kit and poisoner's kit."),
    F(3, "Assassinate", "Advantage on attacks against creatures that haven't taken a turn yet, and any hit against a surprised creature is a critical hit."),
    F(9, "Infiltration Expertise", "Spend 7 days and 25 gp to create a false identity."),
    F(13, "Impostor", "Mimic another person's speech, writing and behavior after studying them for 3 hours."),
    F(17, "Death Strike", "When you hit a surprised creature, it makes a Con save (DC 8 + Dex + PB) or the attack's damage is doubled."),
]))

add("arcane-trickster-2014", S("rogue", "Arcane Trickster", P14, [
    F(3, "Spellcasting", "Intelligence casting from the Wizard list (mostly enchantment and illusion) as a one-third caster; Mage Hand cantrip.", third_caster="int"),
    F(3, "Mage Hand Legerdemain", "Your Mage Hand is invisible and can stow, retrieve, pick locks and disarm traps; control it with Cunning Action."),
    F(9, "Magical Ambush", "If you're hidden when you cast a spell, the target has Disadvantage on its save."),
    F(13, "Versatile Trickster", "Bonus Action: use Mage Hand to distract a creature within 5 ft of it, giving you Advantage on attacks against it this turn."),
    F(17, "Spell Thief", "Reaction when a creature casts a spell targeting you: it makes a save against your DC or the spell fails and you can cast it for 8 hours. Once per Long Rest.",
      resource=("spell_thief", "Spell Thief", 1, LR)),
]))

# ====================================================================== Sorcerer

DRAGONS = [("black", "acid"), ("blue", "lightning"), ("brass", "fire"), ("bronze", "lightning"), ("copper", "acid"),
           ("gold", "fire"), ("green", "poison"), ("red", "fire"), ("silver", "cold"), ("white", "cold")]
add("draconic-2014", S("sorcerer", "Draconic Bloodline", P14, [
    F(1, "Dragon Ancestor", "Choose a dragon: it sets your damage type for Elemental Affinity; you speak Draconic and double your PB on Cha checks with dragons.",
      options=[(k, f"{k.title()} ({t})", f"Your draconic damage type is {t}.") for k, t in DRAGONS]),
    F(1, "Draconic Resilience", "Your HP maximum increases by 1 per Sorcerer level; unarmored AC is 13 + Dex.",
      ac_unarmored=(13, ["dex"]), hp_per_level=1),
    F(6, "Elemental Affinity", "Add your Cha modifier to one damage roll of a spell of your ancestry's type; spend 1 sorcery point for resistance to it for 1 hour."),
    F(14, "Dragon Wings", "Bonus Action: sprout wings for a fly speed equal to your speed (not in armor not made for them)."),
    F(18, "Draconic Presence", "Action, 5 sorcery points: a 60-ft aura of awe or fear for 1 minute (Wis save or Charmed or Frightened)."),
], level=1))

add("wild-magic-2014", S("sorcerer", "Wild Magic", P14, [
    F(1, "Wild Magic Surge", "After you cast a Sorcerer spell of 1st level or higher, the DM can have you roll a d20; on a 1, roll on the Wild Magic Surge table."),
    F(1, "Tides of Chaos", "Gain Advantage on one attack roll, ability check or save. Once per Long Rest (the DM can recharge it with a surge).",
      resource=("tides_of_chaos", "Tides of Chaos", 1, LR)),
    F(6, "Bend Luck", "Reaction, 2 sorcery points: add or subtract 1d4 from another creature's attack roll, check or save."),
    F(14, "Controlled Chaos", "Roll twice on the surge table and choose."),
    F(18, "Spell Bombardment", "Once per turn, when a damage die of your spell rolls its maximum, roll it again and add it."),
], level=1))

# ====================================================================== Warlock

add("archfey-2014", S("warlock", "The Archfey", P14, [
    F(1, "Expanded Spell List", "These count as Warlock spells for you.",
      spells={1: ["Faerie Fire", "Sleep"], 3: ["Calm Emotions", "Phantasmal Force"], 5: ["Blink", "Plant Growth"],
              7: ["Dominate Beast", "Greater Invisibility"], 9: ["Dominate Person", "Seeming"]}),
    F(1, "Fey Presence", "Action: creatures in a 10-ft cube around you make a Wis save or are Charmed or Frightened until the end of your next turn. Once per Short Rest.",
      resource=("fey_presence", "Fey Presence", 1, SR)),
    F(6, "Misty Escape", "Reaction when you take damage: Invisible and teleport up to 60 ft (until your next turn or you attack or cast). Once per Short Rest.",
      resource=("misty_escape", "Misty Escape", 1, SR)),
    F(10, "Beguiling Defenses", "Immune to Charmed; Reaction when someone tries to charm you: turn it back on them (Wis save)."),
    F(14, "Dark Delirium", "Action: a creature within 60 ft makes a Wis save or is Charmed or Frightened in an illusory realm for 1 minute. Once per Short Rest.",
      resource=("dark_delirium", "Dark Delirium", 1, SR)),
], level=1))

add("fiend-2014", S("warlock", "The Fiend", P14, [
    F(1, "Expanded Spell List", "These count as Warlock spells for you.",
      spells={1: ["Burning Hands", "Command"], 3: ["Blindness/Deafness", "Scorching Ray"], 5: ["Fireball", "Stinking Cloud"],
              7: ["Fire Shield", "Wall of Fire"], 9: ["Flame Strike", "Hallow"]}),
    F(1, "Dark One's Blessing", "When you reduce a hostile creature to 0 HP, gain temp HP equal to Cha modifier + Warlock level."),
    F(6, "Dark One's Own Luck", "Add 1d10 to an ability check or save. Once per Short Rest.",
      resource=("dark_ones_luck", "Dark One's Own Luck", 1, SR)),
    F(10, "Fiendish Resilience", "After a rest, choose a damage type: resistance to it (not from magical or silvered weapons)."),
    F(14, "Hurl Through Hell", "When you hit a creature, send it through the lower planes: it takes 10d10 psychic (non-fiends). Once per Long Rest.",
      resource=("hurl_through_hell", "Hurl Through Hell", 1, LR)),
], level=1))

add("great-old-one-2014", S("warlock", "The Great Old One", P14, [
    F(1, "Expanded Spell List", "These count as Warlock spells for you.",
      spells={1: ["Dissonant Whispers", "Tasha's Hideous Laughter"], 3: ["Detect Thoughts", "Phantasmal Force"], 5: ["Clairvoyance", "Sending"],
              7: ["Dominate Beast", "Evard's Black Tentacles"], 9: ["Dominate Person", "Telekinesis"]}),
    F(1, "Awakened Mind", "Speak telepathically to a creature within 30 ft."),
    F(6, "Entropic Ward", "Reaction when attacked: Disadvantage on the roll; if it misses, Advantage on your next attack against it. Once per Short Rest.",
      resource=("entropic_ward", "Entropic Ward", 1, SR)),
    F(10, "Thought Shield", "Your thoughts can't be read; resistance to psychic damage, and a creature dealing it to you takes the same.", resist=["psychic"]),
    F(14, "Create Thrall", "Action: touch an incapacitated humanoid to charm it until Remove Curse; telepathic contact on the same plane."),
], level=1))

# ====================================================================== Wizard

school("abjuration-2014", "School of Abjuration", "Abjuration", [
    F(2, "Arcane Ward", "When you cast an abjuration spell of 1st level or higher, create a ward with HP maximum twice your Wizard level + Int; it absorbs damage to you, and abjuration spells restore it.",
      resource=("arcane_ward", "Arcane Ward HP", "2*level + int", LR)),
    F(6, "Projected Ward", "Reaction: your ward absorbs damage to a creature within 30 ft."),
    F(10, "Improved Abjuration", "Add your PB to ability checks made as part of abjuration spells (Counterspell, Dispel Magic)."),
    F(14, "Spell Resistance", "Advantage on saves against spells and resistance to their damage."),
])
school("conjuration-2014", "School of Conjuration", "Conjuration", [
    F(2, "Minor Conjuration", "Action: conjure a nonmagical object up to 3 ft and 10 lb for 1 hour."),
    F(6, "Benign Transposition", "Action: teleport up to 30 ft, or swap places with a willing Small or Medium creature. Once per Long Rest, or after casting a conjuration spell.",
      resource=("benign_transposition", "Benign Transposition", 1, LR)),
    F(10, "Focused Conjuration", "Damage can't break your concentration on conjuration spells."),
    F(14, "Durable Summons", "Creatures you summon or create with conjuration spells have 30 temp HP."),
])
school("divination-2014", "School of Divination", "Divination", [
    F(2, "Portent", "After a Long Rest, roll two d20s (three at 14); replace any attack roll, save or check you can see with one of them.",
      resource=("portent", "Portent dice", [(2, 2), (14, 3)], LR)),
    F(6, "Expert Divination", "Casting a divination spell of 2nd level or higher regains a lower slot (up to 5th)."),
    F(10, "The Third Eye", "Action until a rest: darkvision 60 ft, see the Ethereal Plane, read any language, or see invisibility. Once per Short Rest.",
      resource=("third_eye", "The Third Eye", 1, SR)),
    F(14, "Greater Portent", "Roll three Portent dice."),
])
school("enchantment-2014", "School of Enchantment", "Enchantment", [
    F(2, "Hypnotic Gaze", "Action: a creature within 5 ft makes a Wis save or is Charmed and Incapacitated while you keep using your action."),
    F(6, "Instinctive Charm", "Reaction when attacked: the attacker makes a Wis save or attacks the nearest other creature instead."),
    F(10, "Split Enchantment", "An enchantment spell that targets one creature can target a second."),
    F(14, "Alter Memories", "A creature charmed by your spell forgets it was charmed (and possibly more, Int save)."),
])
school("evocation-2014", "School of Evocation", "Evocation", [
    F(2, "Sculpt Spells", "Protect 1 + spell-level creatures from your evocation spells: they succeed on the save and take no damage."),
    F(6, "Potent Cantrip", "Creatures that succeed on a save against your cantrip still take half damage."),
    F(10, "Empowered Evocation", "Add your Int modifier to one damage roll of a Wizard evocation spell."),
    F(14, "Overchannel", "Maximize the damage of a 1st- to 5th-level spell; again before a Long Rest costs 2d12 necrotic per spell level (more each time).",
      resource=("overchannel", "Overchannel (free)", 1, LR)),
])
school("illusion-2014", "School of Illusion", "Illusion", [
    F(2, "Improved Minor Illusion", "Minor Illusion makes a sound and an image together."),
    F(6, "Malleable Illusions", "Action: change an illusion spell of yours with a duration of 1 minute or more."),
    F(10, "Illusory Self", "Reaction when attacked: the attack misses. Once per Short Rest.",
      resource=("illusory_self", "Illusory Self", 1, SR)),
    F(14, "Illusory Reality", "Bonus Action: make one inanimate, nonmagical object of your illusion real for 1 minute."),
])
school("necromancy-2014", "School of Necromancy", "Necromancy", [
    F(2, "Grim Harvest", "Once per turn when your spell kills a creature, regain HP equal to twice the spell's level (three times for necromancy)."),
    F(6, "Undead Thralls", "Animate Dead raises one more creature, and your undead get + Wizard level HP and + PB to damage."),
    F(10, "Inured to Undeath", "Resistance to necrotic damage; your HP maximum can't be reduced.", resist=["necrotic"]),
    F(14, "Command Undead", "Action: an undead within 60 ft makes a Cha save or obeys you."),
])
school("transmutation-2014", "School of Transmutation", "Transmutation", [
    F(2, "Minor Alchemy", "Turn an object of wood, stone, iron, copper or silver into another of those materials for 1 hour."),
    F(6, "Transmuter's Stone", "Make a stone granting darkvision, +10 ft speed, Con save proficiency, or a damage resistance."),
    F(10, "Shapechanger", "Cast Polymorph on yourself without a slot (beast of CR 1 or lower). Once per Short Rest.",
      resource=("shapechanger", "Shapechanger", 1, SR)),
    F(14, "Master Transmuter", "Destroy your stone for a major transmutation, panacea, restore life or restore youth."),
])
