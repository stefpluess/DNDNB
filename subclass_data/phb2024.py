"""2024 Player's Handbook: the 48 subclasses, 4 per class (all start at level 3).
Summaries in our own words; check the book for the exact rules."""
from .base import LR, P24, SR, SR1, F, S, add

MA24 = [(3, "1d6"), (5, "1d8"), (11, "1d10"), (17, "1d12")]          # 2024 Martial Arts die (from level 3 on)
BI24 = [(3, "1d6"), (5, "1d8"), (10, "1d10"), (15, "1d12")]          # Bardic Inspiration die
PSI24 = [(3, 4), (5, 6), (9, 8), (13, 10), (17, 12)]                 # 2024 Psionic Energy dice (number)
PSI_DIE24 = [(3, "1d6"), (5, "1d8"), (11, "1d10"), (17, "1d12")]

# ====================================================================== Barbarian

add("berserker-2024", S("barbarian", "Path of the Berserker", P24, [
    F(3, "Frenzy", "While raging with Reckless Attack, the first creature you hit on your turn takes extra damage: as many d6s as your Rage Damage bonus.",
      rider=dict(name="Frenzy (Reckless Attack)", dice=[(3, "2d6"), (9, "3d6"), (16, "4d6")], once="turn", needs="Raging", unarmed=True)),
    F(6, "Mindless Rage", "Immune to Charmed and Frightened while raging; rage ends those conditions on you."),
    F(10, "Retaliation", "Reaction when a creature within 5 ft damages you: one melee attack against it."),
    F(14, "Intimidating Presence", "Bonus Action: creatures of your choice in a 30-ft emanation make a Wis save (DC 8 + Str + PB) or are Frightened for 1 minute. Once per Long Rest, or spend a Rage use.",
      resource=("intimidating_presence", "Intimidating Presence", 1, LR)),
]))

add("wild-heart-2024", S("barbarian", "Path of the Wild Heart", P24, [
    F(3, "Animal Speaker", "Cast Beast Sense and Speak with Animals as rituals (Wis)."),
    F(3, "Rage of the Wilds", "When you rage, choose a power for that rage: Bear (resistance to every damage type except force, necrotic, psychic and radiant), Eagle (Disengage and Dash as one Bonus Action), or Wolf (allies have Advantage on attacks against enemies within 5 ft of you)."),
    F(6, "Aspect of the Wilds", "Choose one after a Long Rest: Owl (Darkvision 60 ft, or +60), Panther (climb speed), or Salmon (swim speed)."),
    F(10, "Nature Speaker", "Cast Commune with Nature as a ritual."),
    F(14, "Power of the Wilds", "When you rage, choose: Falcon (fly speed), Lion (enemies within 5 ft have Disadvantage against others), or Ram (a Large or smaller creature you hit with a melee attack is knocked Prone)."),
]))

add("world-tree-2024", S("barbarian", "Path of the World Tree", P24, [
    F(3, "Vitality of the Tree", "When you rage, gain temp HP equal to your Barbarian level; at the start of each of your turns while raging, give another creature within 10 ft temp HP: as many d6s as your Rage Damage bonus."),
    F(6, "Branches of the Tree", "Reaction when a creature starts its turn within 30 ft while you rage: it makes a Str save (DC 8 + Str + PB) or is teleported next to you with speed 0 until the end of its turn."),
    F(10, "Battering Roots", "Reach +10 ft with Heavy or Versatile melee weapons; on a hit you can also apply Push or Topple."),
    F(14, "Travel along the Tree", "When you rage and as a Bonus Action while raging: teleport up to 60 ft; once per rage, 150 ft bringing up to six willing creatures."),
]))

add("zealot-2024", S("barbarian", "Path of the Zealot", P24, [
    F(3, "Divine Fury", "While raging, the first creature you hit on each of your turns takes 1d6 + half your Barbarian level necrotic or radiant damage.",
      rider=dict(dice="1d6+{half}", type="radiant", once="turn", needs="Raging", unarmed=True)),
    F(3, "Warrior of the Gods", "A pool of d12s (4; 5 at 6, 6 at 12, 7 at 17): Bonus Action, spend dice to heal the total. All back on a Long Rest.",
      resource=("warrior_of_the_gods", "Warrior of the Gods d12s", [(3, 4), (6, 5), (12, 6), (17, 7)], LR)),
    F(6, "Fanatical Focus", "Once per active rage, reroll a failed save with a bonus equal to your Rage Damage."),
    F(10, "Zealous Presence", "Bonus Action: up to ten creatures within 60 ft have Advantage on attacks and saves until the start of your next turn. Once per Long Rest, or spend a Rage use.",
      resource=("zealous_presence", "Zealous Presence", 1, LR)),
    F(14, "Rage of the Gods", "When you rage, for 1 minute: fly speed, resistance to necrotic, psychic and radiant, and Reaction to spend a Rage use so a creature within 30 ft dropping to 0 HP drops to HP equal to your Barbarian level. Once per Long Rest.",
      resource=("rage_of_the_gods", "Rage of the Gods", 1, LR)),
]))

# ====================================================================== Bard

add("dance-2024", S("bard", "College of Dance", P24, [
    F(3, "Dazzling Footwork", "Without armor or a shield: Advantage on Performance to dance; unarmored AC 10 + Dex + Cha; when you spend Bardic Inspiration as part of an action you can also make an Unarmed Strike; Unarmed Strikes can use Dex and deal your Bardic Inspiration die + Dex bludgeoning.",
      ac_unarmored=(10, ["dex", "cha"]), no_shield=True,
      attack=dict(name="Unarmed Strike (Dazzling Footwork)", dice=BI24, type="bludgeoning", ability="dex", melee=True, note="Without armor or a shield")),
    F(6, "Inspiring Movement", "Reaction when an enemy ends its turn within 5 ft: spend a Bardic Inspiration die to move half your speed, and an ally within 30 ft can move half theirs."),
    F(6, "Tandem Footwork", "When you roll Initiative, spend a Bardic Inspiration die: you and allies within 30 ft add the roll to Initiative."),
    F(14, "Leading Evasion", "Evasion on Dex saves; creatures within 5 ft of you share it."),
]))

add("glamour-2024", S("bard", "College of Glamour", P24, [
    F(3, "Beguiling Magic", "Charm Person and Mirror Image always prepared; after casting an enchantment or illusion spell with a slot, a creature within 60 ft makes a Wis save or is Charmed or Frightened for 1 minute. Once per Long Rest, or spend a Bardic Inspiration die.",
      spells={3: ["Charm Person", "Mirror Image"]}, resource=("beguiling_magic", "Beguiling Magic", 1, LR)),
    F(3, "Mantle of Inspiration", "Bonus Action, spend a Bardic Inspiration die: up to Cha-modifier creatures within 60 ft gain twice the roll in temp HP and can move their speed without provoking Opportunity Attacks."),
    F(6, "Mantle of Majesty", "Command always prepared; Bonus Action: for 1 minute cast Command without a slot as a Bonus Action each turn. Once per Long Rest, or a 3rd-level slot.",
      spells={6: ["Command"]}, resource=("mantle_of_majesty", "Mantle of Majesty", 1, LR)),
    F(14, "Unbreakable Majesty", "Bonus Action, 1 minute: a creature attacking you for the first time on a turn makes a Cha save or must pick another target. Once per Short or Long Rest.",
      resource=("unbreakable_majesty", "Unbreakable Majesty", 1, SR)),
]))

add("lore-2024", S("bard", "College of Lore", P24, [
    F(3, "Bonus Proficiencies", "Three skills of your choice."),
    F(3, "Cutting Words", "Reaction when a creature within 60 ft makes a damage roll or succeeds on an attack roll or ability check: spend a Bardic Inspiration die and subtract the roll."),
    F(6, "Magical Discoveries", "Two spells from the Cleric, Druid or Wizard lists, always prepared."),
    F(14, "Peerless Skill", "When you fail an ability check or attack roll, add a Bardic Inspiration die; it's spent only if you then succeed."),
]))

add("valor-2024", S("bard", "College of Valor", P24, [
    F(3, "Combat Inspiration", "A creature with your Bardic Inspiration can add the die to a weapon damage roll, or to its AC against one attack (Reaction)."),
    F(3, "Martial Training", "Martial weapons, medium armor and shields; a Simple or Martial weapon can be your focus.", armor=["medium", "shields"], weapons=["martial"]),
    F(6, "Extra Attack", "Attack twice when you take the Attack action; you can cast a cantrip with a casting time of an action in place of one attack."),
    F(14, "Battle Magic", "After you cast a spell with a casting time of an action, make one weapon attack as a Bonus Action."),
]))

# ====================================================================== Cleric

add("life-2024", S("cleric", "Life Domain", P24, [
    F(3, "Disciple of Life", "A spell cast with a slot that restores HP restores an extra 2 + the slot's level."),
    F(3, "Life Domain Spells", "Always prepared.",
      spells={3: ["Aid", "Bless", "Cure Wounds", "Lesser Restoration"], 5: ["Mass Healing Word", "Revivify"],
              7: ["Aura of Life", "Death Ward"], 9: ["Greater Restoration", "Mass Cure Wounds"]}),
    F(3, "Preserve Life", "Channel Divinity: restore 5 × Cleric level HP split among Bloodied creatures within 30 ft (no one above half their HP maximum)."),
    F(6, "Blessed Healer", "When you restore HP to another creature with a slot, you regain 2 + the slot's level."),
    F(17, "Supreme Healing", "Healing dice you roll for spells and Channel Divinity count as their maximum."),
]))

add("light-2024", S("cleric", "Light Domain", P24, [
    F(3, "Light Domain Spells", "Always prepared.",
      spells={3: ["Burning Hands", "Faerie Fire", "Scorching Ray", "See Invisibility"], 5: ["Daylight", "Fireball"],
              7: ["Arcane Eye", "Wall of Fire"], 9: ["Flame Strike", "Scrying"]}),
    F(3, "Radiance of the Dawn", "Channel Divinity: dispel magical darkness within 30 ft; creatures of your choice there make a Con save or take 2d10 + Cleric level radiant (half on a success)."),
    F(3, "Warding Flare", "Reaction when a creature within 30 ft attacks you or another creature: Disadvantage on the roll. Wis-modifier times per Long Rest.",
      resource=("warding_flare", "Warding Flare", "max(1, wis)", LR)),
    F(6, "Improved Warding Flare", "Warding Flare comes back on a Short Rest too, and the protected creature gains 2d6 + Wis temp HP.",
      resource=("warding_flare", "Warding Flare", "max(1, wis)", SR)),
    F(17, "Corona of Light", "Action: 1 minute of sunlight around you (60 ft); enemies there have Disadvantage on saves against fire and radiant spells and Radiance of the Dawn. Wis-modifier times per Long Rest.",
      resource=("corona_of_light", "Corona of Light", "max(1, wis)", LR)),
]))

add("trickery-2024", S("cleric", "Trickery Domain", P24, [
    F(3, "Blessing of the Trickster", "Action: you or a willing creature within 30 ft has Advantage on Stealth checks until your next Long Rest."),
    F(3, "Trickery Domain Spells", "Always prepared.",
      spells={3: ["Charm Person", "Disguise Self", "Invisibility", "Pass without Trace"], 5: ["Hypnotic Pattern", "Nondetection"],
              7: ["Confusion", "Dimension Door"], 9: ["Dominate Person", "Modify Memory"]}),
    F(3, "Invoke Duplicity", "Channel Divinity, Bonus Action: an illusion of yourself for 1 minute; cast spells from its space, and Advantage on attacks against creatures within 5 ft of it."),
    F(6, "Trickster's Transposition", "When you move the illusion, you can swap places with it."),
    F(17, "Improved Duplicity", "Allies also have Advantage against creatures near the illusion, and when it ends a creature within 5 ft regains HP equal to your Cleric level."),
]))

add("war-2024", S("cleric", "War Domain", P24, [
    F(3, "Guided Strike", "Channel Divinity: +10 to an attack roll you or a creature within 30 ft just made (after seeing the roll)."),
    F(3, "War Domain Spells", "Always prepared.",
      spells={3: ["Guiding Bolt", "Magic Weapon", "Shield of Faith", "Spiritual Weapon"], 5: ["Crusader's Mantle", "Spirit Guardians"],
              7: ["Fire Shield", "Freedom of Movement"], 9: ["Hold Monster", "Steel Wind Strike"]}),
    F(3, "War Priest", "Bonus Action: a weapon attack or Unarmed Strike. Wis-modifier times per Short or Long Rest.",
      resource=("war_priest", "War Priest", "max(1, wis)", SR)),
    F(6, "War God's Blessing", "Spend Channel Divinity to cast Shield of Faith or Spiritual Weapon without a slot; it lasts 1 minute without concentration."),
    F(17, "Avatar of Battle", "Resistance to bludgeoning, piercing and slashing damage."),
]))

# ====================================================================== Druid

LAND = {
    "arid": ("Arid", {3: ["Blur", "Burning Hands", "Fire Bolt"], 5: ["Fireball"], 7: ["Blight"], 9: ["Wall of Stone"]}, "fire"),
    "polar": ("Polar", {3: ["Fog Cloud", "Hold Person", "Ray of Frost"], 5: ["Sleet Storm"], 7: ["Ice Storm"], 9: ["Cone of Cold"]}, "cold"),
    "temperate": ("Temperate", {3: ["Misty Step", "Shocking Grasp", "Sleep"], 5: ["Lightning Bolt"], 7: ["Freedom of Movement"], 9: ["Tree Stride"]}, "lightning"),
    "tropical": ("Tropical", {3: ["Acid Splash", "Ray of Sickness", "Web"], 5: ["Stinking Cloud"], 7: ["Polymorph"], 9: ["Insect Plague"]}, "poison"),
}
add("land-2024", S("druid", "Circle of the Land", P24, [
    F(3, "Circle of the Land Spells", "After a Long Rest, choose a land; its spells are always prepared.",
      options=[(k, n, f"Always prepared: {', '.join(x for lv in sp.values() for x in lv)}. Nature's Ward: resistance to {t}.", dict(spells=sp))
               for k, (n, sp, t) in LAND.items()]),
    F(3, "Land's Aid", "Magic action, spend a Wild Shape use: a 10-ft sphere within 60 ft: creatures of your choice make a Con save or take 2d6 necrotic (half on a success), and one creature regains 2d6 HP (2d10 at 10, 3d10 at 14)."),
    F(6, "Natural Recovery", "Once per Long Rest: cast a prepared Circle spell without a slot; and on a Short Rest recover slots totalling up to half your Druid level (rounded up), none 6th or higher.",
      resource=("natural_recovery", "Natural Recovery", 1, LR)),
    F(10, "Nature's Ward", "Immune to Poisoned; resistance to the damage type of your current land."),
    F(14, "Nature's Sanctuary", "Magic action, spend a Wild Shape use: a 15-ft cube of spectral trees for 1 minute; you and allies in it have half cover and your Nature's Ward resistance."),
]))

add("moon-2024", S("druid", "Circle of the Moon", P24, [
    F(3, "Circle Forms", "Wild Shape into beasts up to CR = Druid level ÷ 3; in that form your AC is at least 13 + Wis and you gain temp HP equal to three times your Druid level."),
    F(3, "Circle of the Moon Spells", "Always prepared; castable in Wild Shape.",
      spells={3: ["Cure Wounds", "Moonbeam", "Starry Wisp"], 5: ["Conjure Animals"], 7: ["Fount of Moonlight"], 9: ["Mass Cure Wounds"]}),
    F(6, "Improved Circle Forms", "In Wild Shape, attacks can deal radiant damage, and add your Wis modifier to Con saves."),
    F(10, "Moonlight Step", "Bonus Action: teleport 30 ft and have Advantage on your next attack this turn. Wis-modifier times per Long Rest, or a 2nd-level slot.",
      resource=("moonlight_step", "Moonlight Step", "max(1, wis)", LR)),
    F(14, "Lunar Form", "In Wild Shape, once per turn a hit deals +2d10 radiant; Moonlight Step can bring a willing creature along.",
      rider=dict(name="Lunar Form (Wild Shape)", dice="2d10", type="radiant", once="turn", when="any", needs="Wild Shape")),
]))

add("sea-2024", S("druid", "Circle of the Sea", P24, [
    F(3, "Circle of the Sea Spells", "Always prepared.",
      spells={3: ["Fog Cloud", "Gust of Wind", "Ray of Frost", "Shatter", "Thunderwave"], 5: ["Lightning Bolt", "Water Breathing"],
              7: ["Control Water", "Ice Storm"], 9: ["Conjure Elemental", "Hold Monster"]}),
    F(3, "Wrath of the Sea", "Bonus Action, spend a Wild Shape use: a 5-ft emanation for 10 minutes; Bonus Action: a creature in it makes a Con save or takes Wis-modifier d6 cold damage and is pushed up to 15 ft."),
    F(6, "Aquatic Affinity", "The emanation grows to 10 ft; swim speed equal to your speed."),
    F(10, "Stormborn", "While the emanation is active: fly speed equal to your speed, and resistance to cold, lightning and thunder."),
    F(14, "Oceanic Gift", "You can manifest Wrath of the Sea around a willing creature within 60 ft instead (or both of you, for two uses)."),
]))

add("stars-2024", S("druid", "Circle of the Stars", P24, [
    F(3, "Star Map", "Guidance and Guiding Bolt always prepared; cast Guiding Bolt without a slot Wis-modifier times per Long Rest.",
      spells={3: ["Guidance", "Guiding Bolt"]}, resource=("star_map", "Free Guiding Bolt", "max(1, wis)", LR)),
    F(3, "Starry Form", "Spend a Wild Shape use: a starry form for 10 minutes (choose a constellation each time).",
      options=[
          ("archer", "Archer", "Bonus Action: ranged spell attack, 60 ft, 1d8 + Wis radiant (2d8 + Wis from level 10).",
           dict(attack=dict(name="Luminous Arrow (Starry Form)", dice=[(3, "1d8"), (10, "2d8")], type="radiant", ability="spell", range="60 ft"))),
          ("chalice", "Chalice", "When you cast a healing spell with a slot, you or another creature within 30 ft also regains 1d8 + Wis HP (2d8 + Wis from level 10)."),
          ("dragon", "Dragon", "Int and Wis checks, and Con saves to keep concentration, treat a d20 roll of 9 or lower as 10 (from level 10: Fly 20 ft, hover)."),
      ]),
    F(6, "Cosmic Omen", "After a Long Rest, roll a die: even = Weal (Reaction: add 1d6 to a roll within 30 ft), odd = Woe (subtract 1d6). Wis-modifier times per Long Rest.",
      resource=("cosmic_omen", "Cosmic Omen", "max(1, wis)", LR)),
    F(10, "Twinkling Constellations", "Starry Form's 1d8 becomes 2d8, the Dragon grants Fly 20 ft, and you can switch constellation at the start of each turn."),
    F(14, "Full of Stars", "In Starry Form you have resistance to bludgeoning, piercing and slashing damage."),
]))

# ====================================================================== Fighter

add("battle-master-2024", S("fighter", "Battle Master", P24, [
    F(3, "Combat Superiority", "Superiority dice (4, 5 at 7, 6 at 15; d8, d10 at 10, d12 at 18), all back on a Short or Long Rest; three maneuvers (5 at 7, 7 at 10, 9 at 15). Save DC 8 + Str or Dex + PB.",
      resource=("superiority_dice", "Superiority dice", [(3, 4), (7, 5), (15, 6)], SR),
      rider=dict(name="Maneuver (spend a superiority die)", dice=[(3, "1d8"), (10, "1d10"), (18, "1d12")], unarmed=True)),
    F(3, "Student of War", "One artisan's tool and one Fighter skill."),
    F(7, "Know Your Enemy", "Bonus Action: learn a creature's immunities, resistances and vulnerabilities. Once per Long Rest, or spend a superiority die.",
      resource=("know_your_enemy", "Know Your Enemy", 1, LR)),
    F(10, "Improved Combat Superiority", "Superiority dice become d10s."),
    F(15, "Relentless", "Once per turn, use a maneuver with a d8 instead of spending a superiority die."),
    F(18, "Ultimate Combat Superiority", "Superiority dice become d12s."),
]))

add("champion-2024", S("fighter", "Champion", P24, [
    F(3, "Improved Critical", "Weapon and Unarmed Strike attacks score a critical hit on a 19 or 20.", crit=19),
    F(3, "Remarkable Athlete", "Advantage on Initiative and Strength (Athletics) checks; after a critical hit, move up to half your speed without provoking Opportunity Attacks."),
    F(7, "Additional Fighting Style", "Gain another Fighting Style feat."),
    F(10, "Heroic Warrior", "At the start of each of your turns in combat you gain Heroic Inspiration if you don't have it."),
    F(15, "Superior Critical", "Critical hits on an 18–20.", crit=18),
    F(18, "Survivor", "Advantage on death saves (a roll of 18–20 counts as a 20); at the start of each turn with at most half HP (and above 0), regain 5 + Con modifier HP."),
]))

add("eldritch-knight-2024", S("fighter", "Eldritch Knight", P24, [
    F(3, "Spellcasting", "Intelligence casting from the Wizard list as a one-third caster.", third_caster="int"),
    F(3, "War Bond", "Bond with up to two weapons: they can't be disarmed and you can summon one to your hand as a Bonus Action."),
    F(7, "War Magic", "Replace one attack of the Attack action with a cantrip."),
    F(10, "Eldritch Strike", "A creature you hit with a weapon has Disadvantage on its next save against your spells before the end of your next turn."),
    F(15, "Arcane Charge", "When you Action Surge, teleport up to 30 ft."),
    F(18, "Improved War Magic", "Replace two attacks with a 1st- or 2nd-level Wizard spell that has a casting time of an action."),
]))

add("psi-warrior-2024", S("fighter", "Psi Warrior", P24, [
    F(3, "Psionic Power", "Psionic Energy dice (4 d6 at 3, 6 d8 at 5, 8 at 9, 8 d10 at 11, 10 at 13, 12 d12 at 17); one back on a Short Rest, all on a Long Rest. Protective Field: Reaction, reduce damage by a die + Int. Psionic Strike: once per turn after a hit within 30 ft, + a die + Int force. Telekinetic Movement.",
      resource=("psionic_energy", "Psionic Energy dice", PSI24, SR1),
      rider=dict(name="Psionic Strike (spend a die)", dice=[(3, "1d6+{int}"), (5, "1d8+{int}"), (11, "1d10+{int}"), (17, "1d12+{int}")], type="force", once="turn", unarmed=True)),
    F(7, "Telekinetic Adept", "Psi-Powered Leap (fly speed twice your speed this turn) and Telekinetic Thrust (Psionic Strike can knock Prone or push 10 ft, Str save)."),
    F(10, "Guarded Mind", "Resistance to psychic damage; spend a die to end Charmed or Frightened at the start of your turn."),
    F(15, "Bulwark of Force", "Bonus Action: up to Int-modifier creatures within 30 ft get half cover for 1 minute. Once per Long Rest, or spend a die.",
      resource=("bulwark_of_force", "Bulwark of Force", 1, LR)),
    F(18, "Telekinetic Master", "Telekinesis always prepared; cast it once per Long Rest without a slot (or spend a die), and attack as a Bonus Action while concentrating on it.",
      spells={18: ["Telekinesis"]}, resource=("telekinetic_master", "Free Telekinesis", 1, LR)),
]))

# ====================================================================== Monk

add("mercy-2024", S("monk", "Warrior of Mercy", P24, [
    F(3, "Hand of Harm", "Once per turn when an Unarmed Strike hits, spend 1 Focus Point: + a Martial Arts die + Wis necrotic.",
      rider=dict(name="Hand of Harm (1 Focus)", dice=[(3, "1d6+{wis}"), (5, "1d8+{wis}"), (11, "1d10+{wis}"), (17, "1d12+{wis}")], type="necrotic", once="turn", when="unarmed")),
    F(3, "Hand of Healing", "Magic action, 1 Focus Point: heal a Martial Arts die + Wis; can replace one Flurry of Blows strike."),
    F(3, "Implements of Mercy", "Insight, Medicine and the herbalism kit."),
    F(6, "Physician's Touch", "Hand of Harm can also poison; Hand of Healing can also end a condition (Blinded, Deafened, Paralyzed, Poisoned or Stunned)."),
    F(11, "Flurry of Healing and Harm", "Use Hand of Healing in place of each Flurry strike without Focus, and Hand of Harm with Flurry for free. Wis-modifier times per Long Rest.",
      resource=("flurry_healing_harm", "Flurry of Healing and Harm", "max(1, wis)", LR)),
    F(17, "Hand of Ultimate Mercy", "Magic action, 5 Focus Points: revive a creature dead under 24 hours with 4d10 + Wis HP. Once per Long Rest.",
      resource=("ultimate_mercy", "Hand of Ultimate Mercy", 1, LR)),
]))

add("shadow-2024", S("monk", "Warrior of Shadow", P24, [
    F(3, "Shadow Arts", "Darkness for 1 Focus Point (you can see through it); Darkvision 60 ft (or +60); Minor Illusion cantrip."),
    F(6, "Shadow Step", "Bonus Action in dim light or darkness: teleport 60 ft to another such space and have Advantage on your next melee attack this turn."),
    F(11, "Improved Shadow Step", "Shadow Step can cost 1 Focus Point to ignore the light requirement, and you can make an Unarmed Strike right after."),
    F(17, "Cloak of Shadows", "Magic action, 3 Focus Points: Invisible for 1 minute (unless in bright light), move through creatures and objects, and Flurry of Blows costs no Focus."),
]))

add("elements-2024", S("monk", "Warrior of the Elements", P24, [
    F(3, "Elemental Attunement", "1 Focus Point, 10 minutes: Unarmed Strikes reach +10 ft, can deal acid, cold, fire, lightning or thunder damage, and can push or pull 10 ft (Str save)."),
    F(3, "Manipulate Elements", "Elementalism cantrip."),
    F(6, "Elemental Burst", "Magic action, 2 Focus Points: a 20-ft sphere within 120 ft; Dex save or three Martial Arts dice of an elemental type (half on a success)."),
    F(11, "Stride of the Elements", "While attuned, fly and swim speeds equal to your speed."),
    F(17, "Elemental Epitome", "While attuned: resistance to one elemental type, Step of the Wind deals damage to creatures you pass, and once per turn + a Martial Arts die of your attunement's type."),
]))

add("open-hand-2024", S("monk", "Warrior of the Open Hand", P24, [
    F(3, "Open Hand Technique", "A Flurry of Blows hit can Addle (no Opportunity Attacks), Push 15 ft (Str save) or Topple (Dex save or Prone)."),
    F(6, "Wholeness of Body", "Bonus Action: heal a Martial Arts die + Wis. Wis-modifier times per Long Rest.",
      resource=("wholeness_of_body", "Wholeness of Body", "max(1, wis)", LR)),
    F(11, "Fleet Step", "After another Bonus Action, you can use Step of the Wind right away."),
    F(17, "Quivering Palm", "On an Unarmed Strike hit, spend 4 Focus Points: later, end the vibrations to deal 10d12 force (Con save for half)."),
]))

# ====================================================================== Paladin

add("devotion-2024", S("paladin", "Oath of Devotion", P24, [
    F(3, "Oath of Devotion Spells", "Always prepared.",
      spells={3: ["Protection from Evil and Good", "Shield of Faith"], 5: ["Aid", "Zone of Truth"], 9: ["Beacon of Hope", "Dispel Magic"],
              13: ["Freedom of Movement", "Guardian of Faith"], 17: ["Commune", "Flame Strike"]}),
    F(3, "Sacred Weapon", "Channel Divinity, 10 minutes: add your Cha modifier (minimum +1) to attack rolls with a melee weapon, which can deal radiant damage and sheds light."),
    F(7, "Aura of Devotion", "You and allies in your Aura of Protection are immune to Charmed."),
    F(15, "Smite of Protection", "When you cast Divine Smite, you and allies in your aura have half cover until the start of your next turn."),
    F(20, "Holy Nimbus", "Bonus Action, 10 minutes: enemies starting their turn in your aura take Cha + PB radiant; Advantage on saves against Fiends and Undead; bright light. Once per Long Rest, or a 5th-level slot.",
      resource=("holy_nimbus", "Holy Nimbus", 1, LR)),
]))

add("glory-2024", S("paladin", "Oath of Glory", P24, [
    F(3, "Oath of Glory Spells", "Always prepared.",
      spells={3: ["Guiding Bolt", "Heroism"], 5: ["Enhance Ability", "Magic Weapon"], 9: ["Haste", "Protection from Energy"],
              13: ["Compulsion", "Freedom of Movement"], 17: ["Legend Lore", "Yolande's Regal Presence"]}),
    F(3, "Inspiring Smite", "After casting Divine Smite, spend Channel Divinity: share 2d8 + Paladin level temp HP among creatures within 30 ft."),
    F(3, "Peerless Athlete", "Channel Divinity, Bonus Action, 1 hour: Advantage on Athletics and Acrobatics, and longer jumps."),
    F(7, "Aura of Alacrity", "+10 ft speed; allies entering or starting their turn in your aura gain +10 ft that turn.", speed=10),
    F(15, "Glorious Defense", "Reaction when you or a creature in your aura is hit: add your Cha modifier (minimum +1) to its AC, and if it then misses, make one weapon attack against the attacker. Cha-modifier times per Long Rest.",
      resource=("glorious_defense", "Glorious Defense", "max(1, cha)", LR)),
    F(20, "Living Legend", "Bonus Action, 10 minutes: Advantage on Cha checks, once per turn turn a miss into a hit, and reroll a failed save (Reaction). Once per Long Rest, or a 5th-level slot.",
      resource=("living_legend", "Living Legend", 1, LR)),
]))

add("ancients-2024", S("paladin", "Oath of the Ancients", P24, [
    F(3, "Oath of the Ancients Spells", "Always prepared.",
      spells={3: ["Ensnaring Strike", "Speak with Animals"], 5: ["Misty Step", "Moonbeam"], 9: ["Plant Growth", "Protection from Energy"],
              13: ["Ice Storm", "Stoneskin"], 17: ["Commune with Nature", "Tree Stride"]}),
    F(3, "Nature's Wrath", "Channel Divinity: creatures of your choice in a 15-ft emanation make a Str save or are Restrained for 1 minute (repeat the save each turn)."),
    F(7, "Aura of Warding", "You and allies in your aura have resistance to necrotic, psychic and radiant damage."),
    F(15, "Undying Sentinel", "When you would drop to 0 HP and not die, drop to 1 HP and regain three times your Paladin level instead. Once per Long Rest. You don't age.",
      resource=("undying_sentinel", "Undying Sentinel", 1, LR)),
    F(20, "Elder Champion", "Bonus Action, 1 minute: regain 10 HP at the start of each turn, cast 1-action Paladin spells as a Bonus Action, and enemies in your aura have Disadvantage on saves against your spells and Channel Divinity. Once per Long Rest, or a 5th-level slot.",
      resource=("elder_champion", "Elder Champion", 1, LR)),
]))

add("vengeance-2024", S("paladin", "Oath of Vengeance", P24, [
    F(3, "Oath of Vengeance Spells", "Always prepared.",
      spells={3: ["Bane", "Hunter's Mark"], 5: ["Hold Person", "Misty Step"], 9: ["Haste", "Protection from Energy"],
              13: ["Banishment", "Dimension Door"], 17: ["Hold Monster", "Scrying"]}),
    F(3, "Vow of Enmity", "When you Attack, spend Channel Divinity: Advantage on attacks against one creature within 30 ft for 1 minute (move the vow if it drops to 0 HP)."),
    F(7, "Relentless Avenger", "When your Opportunity Attack hits, the creature's speed drops to 0 and you can move half your speed."),
    F(15, "Soul of Vengeance", "Reaction when the creature under your Vow of Enmity hits or misses with an attack: one melee attack against it."),
    F(20, "Avenging Angel", "Bonus Action, 10 minutes: fly speed 60 ft and an aura of menace (Wis save or Frightened; attacks against frightened ones have Advantage). Once per Long Rest, or a 5th-level slot.",
      resource=("avenging_angel", "Avenging Angel", 1, LR)),
]))

# ====================================================================== Ranger

add("beast-master-2024", S("ranger", "Beast Master", P24, [
    F(3, "Primal Companion", "A primal beast of the land, sea or sky that acts on your turn (Bonus Action to command it); revive it with a slot.", summon="primal_companion"),
    F(7, "Exceptional Training", "When you command the beast it can also Dash, Disengage, Dodge or Help as a Bonus Action, and its strikes can deal force damage."),
    F(11, "Bestial Fury", "The beast makes two attacks with Beast's Strike; the first hit each turn against your Hunter's Mark target takes the mark's damage."),
    F(15, "Share Spells", "A spell you cast on yourself can also target your beast within 30 ft."),
]))

add("fey-wanderer-2024", S("ranger", "Fey Wanderer", P24, [
    F(3, "Dreadful Strikes", "Once on each of your turns, a weapon hit deals extra psychic damage.",
      rider=dict(dice=[(3, "1d4"), (11, "1d6")], type="psychic", once="turn")),
    F(3, "Otherworldly Glamour", "Add your Wisdom modifier (minimum +1) to Charisma checks; gain Deception, Performance or Persuasion.",
      check=dict(abilities=["cha"], add="wis", min=1)),
    F(3, "Fey Wanderer Spells", "Always prepared; plus a fey trinket or flourish.",
      spells={3: ["Charm Person"], 5: ["Misty Step"], 9: ["Summon Fey"], 13: ["Dimension Door"], 17: ["Mislead"]}),
    F(7, "Beguiling Twist", "Advantage on saves against Charmed and Frightened; when a creature you can see saves against either, use your Reaction to charm or frighten another creature within 120 ft (Wis save)."),
    F(11, "Fey Reinforcements", "Summon Fey without a slot or material component once per Long Rest; it can skip concentration (lasting 1 minute).",
      resource=("fey_reinforcements", "Free Summon Fey", 1, LR)),
    F(15, "Misty Wanderer", "Cast Misty Step without a slot Wisdom-modifier times per Long Rest, bringing a willing creature within 5 ft along.",
      resource=("misty_wanderer", "Free Misty Step", "max(1, wis)", LR)),
]))

add("gloom-stalker-2024", S("ranger", "Gloom Stalker", P24, [
    F(3, "Dread Ambusher", "Add your Wis modifier to Initiative; +10 ft speed on your first turn; Dreadful Strike: once per turn a weapon hit deals +2d6 psychic, Wis-modifier times per Long Rest.",
      init="wis", resource=("dreadful_strike", "Dreadful Strike", "max(1, wis)", LR),
      rider=dict(name="Dreadful Strike", dice=[(3, "2d6"), (11, "2d8")], type="psychic", once="turn")),
    F(3, "Gloom Stalker Spells", "Always prepared.",
      spells={3: ["Disguise Self"], 5: ["Rope Trick"], 9: ["Fear"], 13: ["Greater Invisibility"], 17: ["Seeming"]}),
    F(3, "Umbral Sight", "Darkvision 60 ft (or +60); in darkness you are invisible to creatures relying on darkvision."),
    F(7, "Iron Mind", "Proficiency in Wisdom saves (or Int or Cha if you already have it)."),
    F(11, "Stalker's Flurry", "Dreadful Strike becomes 2d8, and adds Sudden Strike (another attack) or Mass Fear (Wis save, Frightened)."),
    F(15, "Shadowy Dodge", "Reaction when attacked without Advantage: impose Disadvantage, then teleport 30 ft if it misses."),
]))

add("hunter-2024", S("ranger", "Hunter", P24, [
    F(3, "Hunter's Lore", "While a creature is marked by your Hunter's Mark, you know its immunities, resistances and vulnerabilities."),
    F(3, "Hunter's Prey", "Choose one (change on a Short or Long Rest).",
      options=[
          ("colossus", "Colossus Slayer", "Once per turn, a weapon hit on a creature missing any HP deals +1d8.",
           dict(rider=dict(name="Colossus Slayer (target below max HP)", dice="1d8", once="turn"))),
          ("horde", "Horde Breaker", "Once on each of your turns, attack another creature within 5 ft of the first target with the same weapon."),
      ]),
    F(7, "Defensive Tactics", "Choose (change on a rest): Escape the Horde (Opportunity Attacks against you have Disadvantage) or Multiattack Defense (after a creature hits you, its other attacks this turn have Disadvantage)."),
    F(11, "Superior Hunter's Prey", "Once per turn when your Hunter's Mark damages a creature, deal the mark's extra damage to another creature within 30 ft too."),
    F(15, "Superior Hunter's Defense", "Reaction when you take damage: resistance to that and other damage of that type this turn."),
]))

# ====================================================================== Rogue

add("arcane-trickster-2024", S("rogue", "Arcane Trickster", P24, [
    F(3, "Spellcasting", "Intelligence casting from the Wizard list as a one-third caster; Mage Hand is invisible and can do more.", third_caster="int"),
    F(3, "Mage Hand Legerdemain", "Invisible Mage Hand that can stow, retrieve, pick locks and disarm traps at range (Bonus Action via Cunning Action)."),
    F(9, "Magical Ambush", "If you're hidden when you cast a spell, the target has Disadvantage on its save."),
    F(13, "Versatile Trickster", "Spend a Cunning Strike option use to trip with your Mage Hand: Advantage on your next attack against a creature within 5 ft of it."),
    F(17, "Spell Thief", "Reaction when a creature casts a spell on you: Int save to negate it and steal it for 8 hours. Once per Long Rest.",
      resource=("spell_thief", "Spell Thief", 1, LR)),
]))

add("assassin-2024", S("rogue", "Assassin", P24, [
    F(3, "Assassinate", "Advantage on Initiative; in the first round, Advantage against creatures that haven't taken a turn, and a Sneak Attack then deals extra damage equal to your Rogue level.",
      rider=dict(name="Surprising Strikes (first round, with Sneak Attack)", dice="{level}", once="turn")),
    F(3, "Assassin's Tools", "Disguise kit and poisoner's kit."),
    F(9, "Infiltration Expertise", "Masterful Mimicry and Roving Aim: no speed penalty from Steady Aim, mimic voices and handwriting."),
    F(13, "Envenom Weapons", "Poison Cunning Strike deals + 2d6 poison, ignoring poison resistance."),
    F(17, "Death Strike", "A first-round Sneak Attack: the target makes a Con save (DC 8 + Dex + PB) or the attack's damage is doubled."),
]))

add("soulknife-2024", S("rogue", "Soulknife", P24, [
    F(3, "Psionic Power", "Psionic Energy dice (4 d6 at 3, 6 d8 at 5, 8 at 9, 8 d10 at 11, 10 at 13, 12 d12 at 17); one back on a Short Rest, all on a Long Rest. Psi-Bolstered Knack, Psychic Whispers.",
      resource=("psionic_energy", "Psionic Energy dice", PSI24, SR1)),
    F(3, "Psychic Blades", "Manifest a blade: simple melee weapon, Finesse, Thrown 60 ft, 1d6 psychic, Vex mastery; Bonus Action second blade 1d4 psychic.",
      attack=dict(name="Psychic Blade", dice="1d6", type="psychic", ability="best", melee=True, range="thrown 60 ft", finesse=True,
                  note="Vex; Bonus Action follow-up blade: 1d4 psychic")),
    F(9, "Soul Blades", "Homing Strikes (add a die to a missed blade attack; spent on a hit) and Psychic Teleportation."),
    F(13, "Psychic Veil", "Magic action: Invisible for 1 hour. Once per Long Rest, or spend a die.",
      resource=("psychic_veil", "Psychic Veil", 1, LR)),
    F(17, "Rend Mind", "A Sneak Attack with a blade: Wis save or Stunned for 1 minute. Once per Long Rest, or three dice.",
      resource=("rend_mind", "Rend Mind", 1, LR)),
]))

add("thief-2024", S("rogue", "Thief", P24, [
    F(3, "Fast Hands", "Cunning Action can also Sleight of Hand, Utilize an object or Use Magic Item."),
    F(3, "Second-Story Work", "Climb speed equal to your speed; jump distance uses Dex."),
    F(9, "Supreme Sneak", "Stealth Attack Cunning Strike: stay hidden after an attack if you have cover."),
    F(13, "Use Magic Device", "Attune to up to four items; use scrolls and charges more freely."),
    F(17, "Thief's Reflexes", "Take two turns in the first round of combat (the second at your Initiative − 10)."),
]))

# ====================================================================== Sorcerer

add("aberrant-2024", S("sorcerer", "Aberrant Sorcery", P24, [
    F(3, "Psionic Spells", "Always prepared.",
      spells={3: ["Arms of Hadar", "Calm Emotions", "Detect Thoughts", "Dissonant Whispers", "Mind Sliver"], 5: ["Hunger of Hadar", "Sending"],
              7: ["Evard's Black Tentacles", "Summon Aberration"], 9: ["Rary's Telepathic Bond", "Telekinesis"]}),
    F(3, "Telepathic Speech", "Bonus Action: telepathic link with a creature for Sorcerer-level minutes."),
    F(6, "Psionic Sorcery", "Cast a Psionic Spell with sorcery points equal to its level, without verbal or somatic components."),
    F(6, "Psychic Defenses", "Resistance to psychic damage; Advantage on saves against Charmed and Frightened."),
    F(14, "Revelation in Flesh", "Bonus Action, spend sorcery points: see invisible, fly, swim, or squeeze, for 10 minutes."),
    F(18, "Warping Implosion", "Magic action: teleport 120 ft; creatures within 30 ft of where you were make a Str save or take 3d10 force and are pulled. Once per Long Rest, or 5 sorcery points.",
      resource=("warping_implosion", "Warping Implosion", 1, LR)),
]))

add("clockwork-2024", S("sorcerer", "Clockwork Sorcery", P24, [
    F(3, "Clockwork Spells", "Always prepared.",
      spells={3: ["Aid", "Alarm", "Lesser Restoration", "Protection from Evil and Good"], 5: ["Dispel Magic", "Protection from Energy"],
              7: ["Freedom of Movement", "Summon Construct"], 9: ["Greater Restoration", "Wall of Force"]}),
    F(3, "Restore Balance", "Reaction when a creature within 60 ft rolls with Advantage or Disadvantage: cancel it. Cha-modifier times per Long Rest.",
      resource=("restore_balance", "Restore Balance", "max(1, cha)", LR)),
    F(6, "Bastion of Law", "Magic action, 1–5 sorcery points: a creature gets that many d8s as a ward to reduce damage."),
    F(14, "Trance of Order", "Bonus Action, 1 minute: attacks against you lack Advantage and your d20 Tests treat 9 or lower as 10. Once per Long Rest, or 5 sorcery points.",
      resource=("trance_of_order", "Trance of Order", 1, LR)),
    F(18, "Clockwork Cavalcade", "Magic action: a 30-ft cube that restores up to 100 HP, repairs objects and ends spells of 6th level or lower. Once per Long Rest, or 7 sorcery points.",
      resource=("clockwork_cavalcade", "Clockwork Cavalcade", 1, LR)),
]))

add("draconic-2024", S("sorcerer", "Draconic Sorcery", P24, [
    F(3, "Draconic Resilience", "Your HP maximum rises by 3, then by 1 per Sorcerer level after 3rd; unarmored AC is 10 + Dex + Cha.",
      ac_unarmored=(10, ["dex", "cha"]), hp_per_level=1),
    F(3, "Draconic Spells", "Always prepared.",
      spells={3: ["Alter Self", "Chromatic Orb", "Command", "Dragon's Breath"], 5: ["Fear", "Fly"], 7: ["Arcane Eye", "Charm Monster"],
              9: ["Legend Lore", "Summon Dragon"]}),
    F(6, "Elemental Affinity", "Choose acid, cold, fire, lightning or poison: resistance to it, and add your Cha modifier to one damage roll of a spell dealing that type.",
      options=[(t, t.title(), f"Resistance to {t}; +Cha to one damage roll of {t} spells.") for t in ("acid", "cold", "fire", "lightning", "poison")]),
    F(14, "Dragon Wings", "Bonus Action: sprout wings for 1 hour, Fly Speed 60 ft; once per Long Rest unless you spend 3 Sorcery Points.",
      resource=("dragon_wings", "Dragon Wings", 1, LR)),
    F(18, "Dragon Companion", "Cast Summon Dragon without a material component, once per Long Rest without a slot; it can last 1 minute without concentration.",
      resource=("dragon_companion", "Free Summon Dragon", 1, LR)),
]))

add("wild-magic-sorcerer-2024", S("sorcerer", "Wild Magic Sorcery", P24, [
    F(3, "Wild Magic Surge", "After casting a Sorcerer spell with a slot, roll a d20: on a 20, roll on the Wild Magic Surge table."),
    F(3, "Tides of Chaos", "Give yourself Advantage on one d20 Test before rolling. Once per Long Rest (it comes back early if you trigger a surge).",
      resource=("tides_of_chaos", "Tides of Chaos", 1, LR)),
    F(6, "Bend Luck", "Reaction, 1 sorcery point: add or subtract 1d4 from another creature's d20 roll."),
    F(14, "Controlled Chaos", "Roll twice on the surge table and choose."),
    F(18, "Tamed Surge", "After casting a Sorcerer spell with a slot, choose a surge effect instead of rolling. Once per Long Rest.",
      resource=("tamed_surge", "Tamed Surge", 1, LR)),
]))

# ====================================================================== Warlock

add("archfey-2024", S("warlock", "Archfey Patron", P24, [
    F(3, "Archfey Spells", "Always prepared.",
      spells={3: ["Calm Emotions", "Faerie Fire", "Misty Step", "Phantasmal Force", "Sleep"], 5: ["Blink", "Plant Growth"],
              7: ["Dominate Beast", "Greater Invisibility"], 9: ["Dominate Person", "Seeming"]}),
    F(3, "Steps of the Fey", "Cast Misty Step without a slot Cha-modifier times per Long Rest, adding Refreshing Step (1d10 temp HP) or Taunting Step (Wis save, Disadvantage on attacks against others).",
      resource=("steps_of_the_fey", "Free Misty Step", "max(1, cha)", LR)),
    F(6, "Misty Escape", "Cast Misty Step as a Reaction when you take damage; new options Disappearing Step (Invisible) and Dreadful Step (Wis save or 2d10 psychic)."),
    F(10, "Beguiling Defenses", "Immune to Charmed; Reaction when hit, reduce the damage by half and the attacker takes psychic damage equal to that (Wis save). Once per Long Rest, or a Pact slot.",
      resource=("beguiling_defenses", "Beguiling Defenses", 1, LR)),
    F(14, "Bewitching Magic", "After casting an enchantment or illusion spell with a slot, cast Misty Step for free as part of it."),
]))

add("celestial-2024", S("warlock", "Celestial Patron", P24, [
    F(3, "Celestial Spells", "Always prepared.",
      spells={3: ["Aid", "Cure Wounds", "Guiding Bolt", "Lesser Restoration", "Light", "Sacred Flame"], 5: ["Daylight", "Revivify"],
              7: ["Guardian of Faith", "Wall of Fire"], 9: ["Greater Restoration", "Summon Celestial"]}),
    F(3, "Healing Light", "A pool of d6s (1 + Warlock level): Bonus Action, heal a creature within 60 ft by spending up to Cha-modifier dice. All back on a Long Rest.",
      resource=("healing_light", "Healing Light d6s", "1 + level", LR)),
    F(6, "Radiant Soul", "Resistance to radiant damage; once per turn add your Cha modifier to one fire or radiant damage roll of a spell."),
    F(10, "Celestial Resilience", "After a rest or Magical Cunning: temp HP equal to Warlock level + Cha for you, and half that for up to five creatures."),
    F(14, "Searing Vengeance", "When you or an ally within 60 ft makes a death save, regain half your HP maximum and stand; creatures within 30 ft take 2d8 + Cha radiant and are Blinded. Once per Long Rest.",
      resource=("searing_vengeance", "Searing Vengeance", 1, LR)),
]))

add("fiend-2024", S("warlock", "Fiend Patron", P24, [
    F(3, "Fiend Spells", "Always prepared.",
      spells={3: ["Burning Hands", "Command", "Scorching Ray", "Suggestion"], 5: ["Fireball", "Stinking Cloud"],
              7: ["Fire Shield", "Wall of Fire"], 9: ["Geas", "Insect Plague"]}),
    F(3, "Dark One's Blessing", "When you (or someone within 10 ft) reduce an enemy to 0 HP, gain temp HP equal to Cha modifier + Warlock level."),
    F(6, "Dark One's Own Luck", "Add 1d10 to an ability check or save. Cha-modifier times per Long Rest.",
      resource=("dark_ones_luck", "Dark One's Own Luck", "max(1, cha)", LR)),
    F(10, "Fiendish Resilience", "After a rest, choose a damage type (not force): resistance to it."),
    F(14, "Hurl Through Hell", "Once per turn after a hit: the target makes a Cha save or vanishes through the lower planes and takes 8d10 psychic. Once per Long Rest, or a Pact slot.",
      resource=("hurl_through_hell", "Hurl Through Hell", 1, LR)),
]))

add("great-old-one-2024", S("warlock", "Great Old One Patron", P24, [
    F(3, "Great Old One Spells", "Always prepared.",
      spells={3: ["Detect Thoughts", "Dissonant Whispers", "Phantasmal Force", "Tasha's Hideous Laughter"], 5: ["Clairvoyance", "Hunger of Hadar"],
              7: ["Confusion", "Summon Aberration"], 9: ["Modify Memory", "Telekinesis"]}),
    F(3, "Awakened Mind", "Bonus Action: telepathic link with a creature within 30 ft for Warlock-level minutes."),
    F(3, "Psychic Spells", "Your Warlock spells can deal psychic damage instead; enchantment and illusion spells need no verbal or somatic components."),
    F(6, "Clairvoyant Combatant", "When you link with Awakened Mind, the creature makes a Wis save or has Disadvantage against you and you Advantage against it for the link. Once per Short Rest, or a Pact slot.",
      resource=("clairvoyant_combatant", "Clairvoyant Combatant", 1, SR)),
    F(10, "Eldritch Hex", "Hex always prepared; its target has Disadvantage on saves of the chosen ability. Thought Shield: resistance to psychic, and reflect psychic damage.",
      spells={10: ["Hex"]}),
    F(14, "Create Thrall", "Summon Aberration gains temp HP and its attacks deal extra psychic damage."),
]))

# ====================================================================== Wizard

add("abjurer-2024", S("wizard", "Abjurer", P24, [
    F(3, "Abjuration Savant", "Two Abjuration spells added to your spellbook for free, and one more each new spell level."),
    F(3, "Arcane Ward", "When you cast an Abjuration spell with a slot, create a ward with HP maximum twice your Wizard level + Int; it absorbs damage to you. Casting more Abjuration spells restores it.",
      resource=("arcane_ward", "Arcane Ward HP", "2*level + int", LR)),
    F(6, "Projected Ward", "Reaction: your ward absorbs damage to a creature within 30 ft."),
    F(10, "Spell Breaker", "Counterspell and Dispel Magic always prepared; Dispel Magic as a Bonus Action, with your PB added; a failed Counterspell or Dispel doesn't spend the slot.",
      spells={10: ["Counterspell", "Dispel Magic"]}),
    F(14, "Spell Resistance", "Advantage on saves against spells and resistance to their damage."),
]))

add("diviner-2024", S("wizard", "Diviner", P24, [
    F(3, "Divination Savant", "Two Divination spells added to your spellbook for free, and one more each new spell level."),
    F(3, "Portent", "After a Long Rest, roll two d20s (three at 14) and record them; replace any d20 Test you can see with one of them.",
      resource=("portent", "Portent dice", [(3, 2), (14, 3)], LR)),
    F(6, "Expert Divination", "Casting a Divination spell with a 2nd-level or higher slot regains a lower slot (up to 5th)."),
    F(10, "The Third Eye", "Bonus Action until a rest: darkvision 120 ft, see the Ethereal Plane, or see invisibility. Once per Short Rest, or a slot.",
      resource=("third_eye", "The Third Eye", 1, SR)),
    F(14, "Greater Portent", "Roll three Portent dice."),
]))

add("evoker-2024", S("wizard", "Evoker", P24, [
    F(3, "Evocation Savant", "Two Evocation spells added to your spellbook for free, and one more each new spell level."),
    F(3, "Potent Cantrip", "Damaging cantrips deal half damage on a miss or a successful save."),
    F(6, "Sculpt Spells", "Protect 1 + spell-level creatures from your Evocation spells: they succeed on the save and take no damage."),
    F(10, "Empowered Evocation", "Add your Int modifier to one damage roll of a Wizard Evocation spell."),
    F(14, "Overchannel", "Maximize the damage of a 1st- to 5th-level damage spell; again before a Long Rest costs 2d12 necrotic per spell level (more each time).",
      resource=("overchannel", "Overchannel (free)", 1, LR)),
]))

add("illusionist-2024", S("wizard", "Illusionist", P24, [
    F(3, "Illusion Savant", "Two Illusion spells added to your spellbook for free, and one more each new spell level."),
    F(3, "Improved Illusions", "Cast illusions without verbal components, with longer range; Minor Illusion can do sound and image together and as a Bonus Action."),
    F(6, "Phantasmal Creatures", "Summon Beast and Summon Fey always prepared; cast each once per Long Rest without a slot as illusions (half HP).",
      spells={6: ["Summon Beast", "Summon Fey"]}, resource=("phantasmal_creatures", "Free phantasmal summons", 2, LR)),
    F(10, "Illusory Self", "Reaction when attacked: the attack misses. Once per Short Rest, or a 2nd-level or higher slot.",
      resource=("illusory_self", "Illusory Self", 1, SR)),
    F(14, "Illusory Reality", "When you cast an Illusion spell with a slot, make one nonmagical object in it real for 1 minute."),
]))
