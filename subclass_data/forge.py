"""Eberron: Forge of the Artificer (December 2025): the 2024-rules Artificer's subclasses.

Built from online summaries (the book wasn't available): wikis, guides and articles that partly mix the
final book with its Unearthed Arcana playtests. Numbers marked "(verify)" in the summaries are the least
certain. Summaries in our own words; check the book for the exact rules.
"""
from .base import LR, F, S, add

FOA = "Forge of the Artificer"

add("armorer-foa", S("artificer", "Armorer", FOA, [
    F(3, "Tools of the Trade", "Heavy armor training and smith's tools; crafting armor takes half the time.", armor=["heavy"]),
    F(3, "Armorer Spells", "Always prepared.",
      spells={3: ["Magic Missile", "Thunderwave"], 5: ["Mirror Image", "Shatter"], 9: ["Hypnotic Pattern", "Lightning Bolt"],
              13: ["Fire Shield", "Greater Invisibility"], 17: ["Passwall", "Wall of Force"]}),
    F(3, "Arcane Armor", "Your armor becomes your spellcasting focus, covers you completely (no Strength requirement), can't be removed against your will, and you can don or doff it as a Magic action."),
    F(3, "Armor Model", "Choose Dreadnaught, Guardian or Infiltrator (change on a Short or Long Rest). Armor-model weapons use Intelligence for attack and damage rolls; their dice grow at 15.",
      options=[
          ("dreadnaught", "Dreadnaught", "Force Demolisher: 1d10 force melee weapon (2d6 at 15). Giant Stature: Bonus Action, become Large (or Huge), reach +10 ft, Advantage on Str checks and saves, for 1 minute (uses: verify).",
           dict(attack=dict(name="Force Demolisher", dice=[(3, "1d10"), (15, "2d6")], type="force", ability="int", melee=True, note="Giant Stature: reach +10 ft"))),
          ("guardian", "Guardian", "Thunder Pulse: 1d8 thunder melee weapon (1d10 at 15, verify); a creature hit has Disadvantage on attacks against anyone but you until your next turn. Defensive Field: while Bloodied, Bonus Action for temp HP equal to your Artificer level.",
           dict(attack=dict(name="Thunder Pulse", dice=[(3, "1d8"), (15, "1d10")], type="thunder", ability="int", melee=True,
                            note="Hit: Disadvantage on attacks against others until your next turn; Defensive Field while Bloodied"))),
          ("infiltrator", "Infiltrator", "Lightning Launcher: 1d6 lightning simple ranged weapon, 90/300 ft (2d6 at 15), once per turn + 1d6 lightning on a hit. Powered Steps: +5 ft speed, and Bonus Action flight. Dampening Field: Advantage on Stealth.",
           dict(attack=dict(name="Lightning Launcher", dice=[(3, "1d6"), (15, "2d6")], type="lightning", ability="int", range="90/300 ft",
                            rider=dict(name="Lightning Launcher", dice="1d6", type="lightning", once="turn")),
                speed=5)),
      ]),
    F(5, "Extra Attack", "Attack twice when you take the Attack action."),
    F(9, "Improved Armorer", "Your armor can hold more replicated items, and the armor models improve (verify the details in the book)."),
    F(15, "Perfected Armor", "The armor-model weapons deal more damage (Force Demolisher 2d6, Thunder Pulse 1d10, Lightning Launcher 2d6) and gain stronger effects."),
]))

add("battle-smith-foa", S("artificer", "Battle Smith", FOA, [
    F(3, "Battle Smith Spells", "Always prepared.",
      spells={3: ["Heroism", "Shield"], 5: ["Shining Smite", "Warding Bond"], 9: ["Aura of Vitality", "Conjure Barrage"],
              13: ["Aura of Purity", "Fire Shield"], 17: ["Banishing Smite", "Mass Cure Wounds"]}),
    F(3, "Battle Ready", "Martial weapon training; use Intelligence for attack and damage rolls with magic weapons.",
      weapons=["martial"], magic_weapon_ability="int"),
    F(3, "Steel Defender", "A construct companion (HP 5 + five times your Artificer level, AC 12 + your Int modifier) that acts on your turn; repair or rebuild it after a Long Rest.",
      summon="steel_defender_2024"),
    F(5, "Extra Attack", "Attack twice when you take the Attack action; your steel defender can make one of the attacks instead."),
    F(9, "Arcane Jolt", "Once per turn when you or your defender hit with a magic weapon or its Rend: +2d6 force, or heal a creature within 30 ft 2d6. Int-modifier times per Long Rest.",
      resource=("arcane_jolt", "Arcane Jolt", "max(1, int)", LR),
      rider=dict(name="Arcane Jolt", dice=[(9, "2d6"), (15, "4d6")], type="force", once="turn")),
    F(15, "Improved Defender", "Arcane Jolt becomes 4d6, and the defender's Deflect Attack damages the attacker."),
]))

add("alchemist-foa", S("artificer", "Alchemist", FOA, [
    F(3, "Tools of the Trade", "Alchemist's supplies; crafting potions takes half the time."),
    F(3, "Alchemist Spells", "Always prepared.",
      spells={3: ["Healing Word", "Ray of Sickness"], 5: ["Flaming Sphere", "Melf's Acid Arrow"], 9: ["Gaseous Form", "Mass Healing Word"],
              13: ["Blight", "Death Ward"], 17: ["Cloudkill", "Raise Dead"]}),
    F(3, "Experimental Elixir", "After a Long Rest, make elixirs (healing, swiftness, resilience, boldness, flight or transformation); more by spending spell slots. (Carried over from Tasha's: verify the 2024 changes.)",
      resource=("experimental_elixir", "Free Experimental Elixirs", [(3, 1), (6, 2), (15, 3)], LR)),
    F(5, "Alchemical Savant", "Spells cast through alchemist's supplies add your Int modifier (minimum +1) to one roll of healing or acid, fire, necrotic or poison damage."),
    F(9, "Restorative Reagents", "Elixirs also grant temp HP; cast Lesser Restoration without a slot Int-modifier times per Long Rest.",
      resource=("restorative_reagents", "Free Lesser Restoration", "max(1, int)", LR)),
    F(15, "Chemical Mastery", "Resistance to acid and poison, immune to Poisoned; cast Tasha's Caustic Brew and Heal once each per Long Rest without a slot.",
      resource=("chemical_mastery", "Chemical Mastery spells", 2, LR), resist=["acid", "poison"], cond_immune=["poisoned"]),
]))

add("artillerist-foa", S("artificer", "Artillerist", FOA, [
    F(3, "Tools of the Trade", "Woodcarver's tools; crafting wands takes half the time."),
    F(3, "Artillerist Spells", "Always prepared.",
      spells={3: ["Shield", "Thunderwave"], 5: ["Scorching Ray", "Shatter"], 9: ["Fireball", "Wind Wall"],
              13: ["Ice Storm", "Wall of Fire"], 17: ["Cone of Cold", "Wall of Force"]}),
    F(3, "Eldritch Cannon", "Create a Small or Tiny cannon (flamethrower, force ballista or protector) that you activate as a Bonus Action. Once per Long Rest, or by spending a spell slot. (Carried over from Tasha's: verify the 2024 changes.)",
      resource=("eldritch_cannon", "Free Eldritch Cannon", 1, LR), summon="eldritch_cannon"),
    F(5, "Arcane Firearm", "A wand, staff or rod becomes your firearm: Artificer spells cast through it add 1d8 to one damage roll.",
      rider=dict(name="Arcane Firearm", dice="1d8", when="spell")),
    F(9, "Explosive Cannon", "Cannon damage +1d8; detonate it for 3d8 force within 20 ft (Dex save for half)."),
    F(15, "Fortified Position", "Two cannons at once; you and allies within 10 ft of a cannon have half cover."),
]))

add("cartographer-foa", S("artificer", "Cartographer", FOA, [
    F(3, "Cartographer Spells", "Always prepared (the list wasn't confirmed: check the book)."),
    F(3, "Adventurer's Atlas", "Magical maps you hand to allies; map holders gain combat and travel benefits, such as help with Initiative and finding each other (verify the details in the book)."),
    F(3, "Scouting Gadgets", "Tools for scouting and mapping (verify the details in the book)."),
    F(5, "Guided Precision", "Map holders' attacks become more precise (verify the details in the book)."),
    F(9, "Portal Jump", "Teleport between map holders (verify the details in the book)."),
    F(15, "Superior Atlas", "Your maps grow stronger (verify the details in the book)."),
]))
