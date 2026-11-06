"""2024 Player's Handbook: the 48 subclasses, 4 per class (subclasses start at level 3).
Summaries in our own words; check the book for the exact rules."""
from .base import LR, P24, SR, SR1, F, S, add

# ====================================================================== Fighter

add("champion-2024", S("fighter", "Champion", P24, [
    F(3, "Improved Critical", "Weapon and Unarmed Strike attacks score a critical hit on a 19 or 20.", crit=19),
    F(3, "Remarkable Athlete", "Advantage on Initiative and Strength (Athletics) checks; after a critical hit, move up to half your speed without provoking Opportunity Attacks."),
    F(7, "Additional Fighting Style", "Gain another Fighting Style feat."),
    F(10, "Heroic Warrior", "At the start of each of your turns in combat you gain Heroic Inspiration if you don't have it."),
    F(15, "Superior Critical", "Critical hits on an 18–20.", crit=18),
    F(18, "Survivor", "Advantage on death saves (a roll of 18–20 counts as a 20); at the start of each turn with at most half HP (and above 0), regain 5 + Con modifier HP."),
]))

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
