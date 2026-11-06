"""The subclass catalog: 2024 Player's Handbook, 2014 Player's Handbook and Tasha's Cauldron of Everything.

Summaries are short reminders in our own words, not the books' text. Numbers that the app uses
(dice, uses, AC formulas) follow the books as far as we know them: check them against your copy.
See subclasses.py for the effect keys a feature can carry.
"""


def F(level, name, text, **effects):
    return {"level": level, "name": name, "text": text, **effects}


def S(cls, name, source, features, level=3):
    return {"class": cls, "name": name, "source": source, "level": level, "features": features}


P24, P14, TCE = "PHB 2024", "PHB 2014", "Tasha's"
SR, SR1, LR = "short", "short1", "long"   # resource recovery: all on a Short Rest / one on a Short Rest / Long Rest
PB_LR = "pb"                              # a common maximum: proficiency bonus uses per Long Rest

CATALOG = {}


def add(key, sub):
    if key in CATALOG:
        raise ValueError(f"duplicate subclass key {key}")
    CATALOG[key] = sub


# ====================================================================== Ranger

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

# ====================================================================== Fighter

add("champion-2024", S("fighter", "Champion", P24, [
    F(3, "Improved Critical", "Weapon and Unarmed Strike attacks score a critical hit on a 19 or 20.", crit=19),
    F(3, "Remarkable Athlete", "Advantage on Initiative and Strength (Athletics) checks; after a critical hit, move up to half your speed without provoking Opportunity Attacks."),
    F(7, "Additional Fighting Style", "Gain another Fighting Style feat."),
    F(10, "Heroic Warrior", "At the start of each of your turns in combat you gain Heroic Inspiration if you don't have it."),
    F(15, "Superior Critical", "Critical hits on an 18–20.", crit=18),
    F(18, "Survivor", "Advantage on death saves (a roll of 18–20 counts as a 20); at the start of each turn with at most half HP (and above 0), regain 5 + Con modifier HP."),
]))
add("champion-2014", S("fighter", "Champion", P14, [
    F(3, "Improved Critical", "Weapon attacks score a critical hit on a 19 or 20.", crit=19),
    F(7, "Remarkable Athlete", "Add half your proficiency bonus (rounded up) to Str, Dex and Con checks that don't already use it; running long jumps go Str-modifier feet farther.",
      check=dict(abilities=["str", "dex", "con"], add="half_pb_up", unproficient=True)),
    F(10, "Additional Fighting Style", "Choose a second Fighting Style."),
    F(15, "Superior Critical", "Critical hits on an 18–20.", crit=18),
    F(18, "Survivor", "At the start of each of your turns, if you have at most half your HP (and more than 0), regain 5 + Con modifier HP."),
]))

# ====================================================================== Sorcerer

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

# ====================================================================== Druid

add("wildfire-tce", S("druid", "Circle of Wildfire", TCE, [
    F(2, "Circle Spells", "Always prepared.",
      spells={2: ["Burning Hands", "Cure Wounds"], 3: ["Flaming Sphere", "Scorching Ray"], 5: ["Plant Growth", "Revivify"],
              7: ["Aura of Life", "Fire Shield"], 9: ["Flame Strike", "Mass Cure Wounds"]}),
    F(2, "Summon Wildfire Spirit", "Action, spend a Wild Shape use: summon your wildfire spirit for 1 hour (it acts on your turn); creatures within 10 ft of where it appears make a Dex save or take 2d6 fire.",
      summon="wildfire_spirit"),
    F(6, "Enhanced Bond", "While your spirit is summoned, a spell that deals fire damage or heals adds 1d8 to one roll, and spells can originate from the spirit.",
      rider=dict(name="Enhanced Bond", dice="1d8", type="fire", when="spell")),
    F(10, "Cauterizing Flames", "When a Small or larger creature dies within 30 ft of you or your spirit, a spectral flame appears; move into it to heal or hurt a creature in it by 2d10 + Wis modifier (Wis-modifier times per Long Rest).",
      resource=("cauterizing_flames", "Cauterizing Flames", "max(1, wis)", LR)),
    F(14, "Blazing Revival", "When you drop to 0 HP with the spirit within 120 ft, it can drop to 0 HP to bring you back with half your HP; once per Long Rest.",
      resource=("blazing_revival", "Blazing Revival", 1, LR)),
], level=2))

# ====================================================================== Artificer

add("armorer-tce", S("artificer", "Armorer", TCE, [
    F(3, "Tools of the Trade", "Heavy armor training and smith's tools.", armor=["heavy"]),
    F(3, "Armorer Spells", "Always prepared.",
      spells={3: ["Magic Missile", "Thunderwave"], 5: ["Mirror Image", "Shatter"], 9: ["Hypnotic Pattern", "Lightning Bolt"],
              13: ["Fire Shield", "Greater Invisibility"], 17: ["Passwall", "Wall of Force"]}),
    F(3, "Arcane Armor", "Your armor becomes your spellcasting focus, covers you completely (no Strength requirement), can't be removed against your will, and you can don or doff it as an action."),
    F(3, "Armor Model", "Choose Guardian or Infiltrator (change on a Short or Long Rest). Armor-model weapons use Intelligence for attack and damage rolls.",
      options=[
          ("guardian", "Guardian", "Thunder Gauntlets: 1d8 thunder melee weapon; a creature hit has Disadvantage on attacks against anyone but you until your next turn. Defensive Field: Bonus Action, gain temp HP equal to your Artificer level (PB times per Long Rest).",
           dict(attack=dict(name="Thunder Gauntlets", dice="1d8", type="thunder", ability="int", melee=True, note="Hit: Disadvantage on attacks against others until your next turn"),
                resource=("defensive_field", "Defensive Field (temp HP = level)", "pb", "long"))),
          ("infiltrator", "Infiltrator", "Lightning Launcher: 1d6 lightning ranged weapon, 90/300 ft, once per turn +1d6 lightning on a hit. Powered Steps: +5 ft walking speed. Dampening Field: Advantage on Stealth checks.",
           dict(attack=dict(name="Lightning Launcher", dice="1d6", type="lightning", ability="int", range="90/300 ft",
                            rider=dict(name="Lightning Launcher", dice="1d6", type="lightning", once="turn")),
                speed=5)),
      ]),
    F(5, "Extra Attack", "Attack twice when you take the Attack action."),
    F(9, "Armor Modifications", "Your armor counts as separate items for infusions (armor, boots, helmet, special weapon), and you can infuse two more items, only into the armor."),
    F(15, "Perfected Armor", "Guardian: Reaction to pull a Huge-or-smaller creature within 30 ft up to 25 ft toward you (Str save), and a melee hit then (Int-modifier times per Long Rest). Infiltrator: a creature hit by the Lightning Launcher glimmers: the next attack against it has Advantage and deals +1d6 lightning."),
]))
