"""Tasha's Cauldron of Everything (2020, written for the 2014 rules): 30 subclasses, including the four
Artificer specialists. Summaries in our own words; check the book for the exact rules."""
from .base import LR, SR, TCE, F, S, add

# 2014 Monk Martial Arts die, for the 2014-era Monk subclasses
MA14 = [(1, "1d4"), (5, "1d6"), (11, "1d8"), (17, "1d10")]
DIVINE_STRIKE = [(8, "1d8"), (14, "2d8")]

# ====================================================================== Artificer

add("alchemist-tce", S("artificer", "Alchemist", TCE, [
    F(3, "Tool Proficiency", "Alchemist's supplies."),
    F(3, "Alchemist Spells", "Always prepared.",
      spells={3: ["Healing Word", "Ray of Sickness"], 5: ["Flaming Sphere", "Melf's Acid Arrow"], 9: ["Gaseous Form", "Mass Healing Word"],
              13: ["Blight", "Death Ward"], 17: ["Cloudkill", "Raise Dead"]}),
    F(3, "Experimental Elixir", "After a Long Rest, make a random elixir (healing, swiftness, resilience, boldness, flight or transformation); more by spending spell slots.",
      resource=("experimental_elixir", "Free Experimental Elixirs", [(3, 1), (6, 2), (15, 3)], LR)),
    F(5, "Alchemical Savant", "Spells cast through alchemist's supplies add your Int modifier (minimum +1) to one roll of healing or of acid, fire, necrotic or poison damage."),
    F(9, "Restorative Reagents", "Elixirs also grant 2d6 + Int modifier temp HP; cast Lesser Restoration without a slot Int-modifier times per Long Rest.",
      resource=("restorative_reagents", "Free Lesser Restoration", "max(1, int)", LR)),
    F(15, "Chemical Mastery", "Resistance to acid and poison, immune to Poisoned; cast Tasha's Caustic Brew and Heal once each per Long Rest without a slot.",
      resource=("chemical_mastery", "Chemical Mastery spells", 2, LR), resist=["acid", "poison"], cond_immune=["poisoned"]),
]))

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
                resource=("defensive_field", "Defensive Field (temp HP = level)", "pb", LR))),
          ("infiltrator", "Infiltrator", "Lightning Launcher: 1d6 lightning ranged weapon, 90/300 ft, once per turn +1d6 lightning on a hit. Powered Steps: +5 ft walking speed. Dampening Field: Advantage on Stealth checks.",
           dict(attack=dict(name="Lightning Launcher", dice="1d6", type="lightning", ability="int", range="90/300 ft",
                            rider=dict(name="Lightning Launcher", dice="1d6", type="lightning", once="turn")),
                speed=5)),
      ]),
    F(5, "Extra Attack", "Attack twice when you take the Attack action."),
    F(9, "Armor Modifications", "Your armor counts as separate items for infusions (armor, boots, helmet, special weapon), and you can infuse two more items, only into the armor."),
    F(15, "Perfected Armor", "Guardian: Reaction to pull a Huge-or-smaller creature within 30 ft up to 25 ft toward you (Str save), then a melee hit (Int-modifier times per Long Rest). Infiltrator: a creature hit by the Lightning Launcher glimmers: the next attack against it has Advantage and deals +1d6 lightning."),
]))

add("artillerist-tce", S("artificer", "Artillerist", TCE, [
    F(3, "Tool Proficiency", "Woodcarver's tools."),
    F(3, "Artillerist Spells", "Always prepared.",
      spells={3: ["Shield", "Thunderwave"], 5: ["Scorching Ray", "Shatter"], 9: ["Fireball", "Wind Wall"],
              13: ["Ice Storm", "Wall of Fire"], 17: ["Cone of Cold", "Wall of Force"]}),
    F(3, "Eldritch Cannon", "Action: create a Small or Tiny cannon for 1 hour (flamethrower, force ballista or protector); Bonus Action to activate it. Once per Long Rest, or by spending a spell slot.",
      resource=("eldritch_cannon", "Free Eldritch Cannon", 1, LR), summon="eldritch_cannon"),
    F(5, "Arcane Firearm", "A wand, staff or rod becomes your firearm: Artificer spells cast through it add 1d8 to one damage roll.",
      rider=dict(name="Arcane Firearm", dice="1d8", when="spell")),
    F(9, "Explosive Cannon", "Cannon damage rolls gain +1d8; as an action, detonate the cannon: 3d8 force to creatures within 20 ft (Dex save for half)."),
    F(15, "Fortified Position", "You can have two cannons at once (create both with one action), and you and allies within 10 ft of a cannon have half cover."),
]))

add("battle-smith-tce", S("artificer", "Battle Smith", TCE, [
    F(3, "Tool Proficiency", "Smith's tools."),
    F(3, "Battle Smith Spells", "Always prepared.",
      spells={3: ["Heroism", "Shield"], 5: ["Branding Smite", "Warding Bond"], 9: ["Aura of Vitality", "Conjure Barrage"],
              13: ["Aura of Purity", "Fire Shield"], 17: ["Banishing Smite", "Mass Cure Wounds"]}),
    F(3, "Battle Ready", "Martial weapon training; use Intelligence instead of Strength or Dexterity for attack and damage rolls with magic weapons.",
      weapons=["martial"], magic_weapon_ability="int"),
    F(3, "Steel Defender", "A construct companion that acts on your turn (Bonus Action to command it; otherwise it Dodges). Repair it with Mending, or rebuild it after a Long Rest.",
      summon="steel_defender"),
    F(5, "Extra Attack", "Attack twice when you take the Attack action."),
    F(9, "Arcane Jolt", "Once per turn when you or your defender hit with a magic weapon: +2d6 force damage, or heal a creature within 30 ft of the target 2d6. Int-modifier times per Long Rest.",
      resource=("arcane_jolt", "Arcane Jolt", "max(1, int)", LR),
      rider=dict(name="Arcane Jolt", dice=[(9, "2d6"), (15, "4d6")], type="force", once="turn")),
    F(15, "Improved Defender", "Arcane Jolt becomes 4d6; the defender gets +2 AC and its Deflect Attack deals 1d4 + Int modifier force to the attacker."),
]))

# ====================================================================== Barbarian

add("beast-tce", S("barbarian", "Path of the Beast", TCE, [
    F(3, "Form of the Beast", "When you rage, grow bite, claws or tail (choose each rage). Natural weapons use Strength.",
      options=[
          ("bite", "Bite", "1d8 piercing; once per turn, if below half HP, a bite hit heals you your proficiency bonus.",
           dict(attack=dict(name="Bite (raging)", dice="1d8", type="piercing", ability="str", melee=True, note="While raging; below half HP: heal PB once per turn"))),
          ("claws", "Claws", "1d6 slashing each; when you attack with a claw as part of the Attack action, make one more claw attack.",
           dict(attack=dict(name="Claws (raging)", dice="1d6", type="slashing", ability="str", melee=True, note="While raging; one extra claw attack per Attack action"))),
          ("tail", "Tail", "1d8 piercing, reach 10 ft; Reaction when hit within 10 ft: add 1d8 to AC against that attack.",
           dict(attack=dict(name="Tail (raging)", dice="1d8", type="piercing", ability="str", melee=True, range="reach 10 ft", note="While raging"))),
      ]),
    F(6, "Bestial Soul", "Natural weapons count as magical; after a rest choose a swim speed and water breathing, a climb speed, or a better jump."),
    F(10, "Infectious Fury", "On a natural-weapon hit, the target makes a Wis save (DC 8 + Con + PB) or must attack another creature or take 2d12 psychic. Con-modifier times per Long Rest.",
      resource=("infectious_fury", "Infectious Fury", "max(1, con)", LR)),
    F(14, "Call the Hunt", "When you rage, choose up to Con-modifier willing creatures within 30 ft: once per turn they add 1d6 to a damage roll, and you gain 5 temp HP per creature. PB times per Long Rest.",
      resource=("call_the_hunt", "Call the Hunt", "pb", LR)),
]))

add("wild-magic-barbarian-tce", S("barbarian", "Path of Wild Magic", TCE, [
    F(3, "Magic Awareness", "Action: sense spells and magic items within 60 ft until the end of your next turn. PB times per Long Rest.",
      resource=("magic_awareness", "Magic Awareness", "pb", LR)),
    F(3, "Wild Surge", "When you rage, roll on the Wild Magic table (d8)."),
    F(6, "Bolstering Magic", "Action: touch a creature to give it +1d3 to attack rolls and ability checks for 10 minutes, or to regain a spell slot of level 1d3. PB times per Long Rest.",
      resource=("bolstering_magic", "Bolstering Magic", "pb", LR)),
    F(10, "Unstable Backlash", "While raging, when you take damage or fail a save, use your Reaction to roll on the Wild Magic table again."),
    F(14, "Controlled Surge", "When you roll on the Wild Magic table, roll twice and choose (or any effect on doubles)."),
]))

# ====================================================================== Bard

add("creation-tce", S("bard", "College of Creation", TCE, [
    F(3, "Mote of Potential", "A Bardic Inspiration die you give carries a mote: on an ability check roll it twice; on an attack, a thunder burst (Con save, damage equal to the die); on a save, temp HP equal to the roll + Cha modifier."),
    F(3, "Performance of Creation", "Action: create a nonmagical item worth up to 20 gp × Bard level (Medium; Large at 6, Huge at 14). Once per Long Rest, or by spending a 2nd-level or higher slot.",
      resource=("performance_of_creation", "Performance of Creation", 1, LR)),
    F(6, "Animating Performance", "Action: animate a Large or smaller nonmagical item as a Dancing Item for 1 hour; it acts on your turn. Once per Long Rest, or by spending a 3rd-level or higher slot.",
      resource=("animating_performance", "Animating Performance", 1, LR)),
    F(14, "Creative Crescendo", "Performance of Creation can make Cha-modifier extra items at once (one may be larger), with no gold limit on the extra items."),
]))

add("eloquence-tce", S("bard", "College of Eloquence", TCE, [
    F(3, "Silver Tongue", "On a Persuasion or Deception check, a d20 roll of 9 or lower counts as a 10."),
    F(3, "Unsettling Words", "Bonus Action: spend a Bardic Inspiration die; a creature within 60 ft subtracts the roll from its next saving throw before your next turn."),
    F(6, "Unfailing Inspiration", "A creature who adds your Bardic Inspiration die to a roll and fails keeps the die."),
    F(6, "Universal Speech", "Action: up to Cha-modifier creatures within 60 ft understand you for 1 hour. Once per Long Rest, or by spending a slot.",
      resource=("universal_speech", "Universal Speech", 1, LR)),
    F(14, "Infectious Inspiration", "When a creature succeeds with your Bardic Inspiration, use your Reaction to inspire another creature without spending a die. Cha-modifier times per Long Rest.",
      resource=("infectious_inspiration", "Infectious Inspiration", "max(1, cha)", LR)),
]))

# ====================================================================== Cleric

add("order-tce", S("cleric", "Order Domain", TCE, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Command", "Heroism"], 3: ["Hold Person", "Zone of Truth"], 5: ["Mass Healing Word", "Slow"],
              7: ["Compulsion", "Locate Creature"], 9: ["Commune", "Dominate Person"]}),
    F(1, "Bonus Proficiencies", "Heavy armor; Intimidation or Persuasion.", armor=["heavy"]),
    F(1, "Voice of Authority", "When you cast a 1st-level or higher spell on an ally, that ally can use its Reaction to make one weapon attack against a creature you choose."),
    F(2, "Channel Divinity: Order's Demand", "Action: creatures of your choice within 30 ft make a Wis save or are Charmed until the end of your next turn (and may drop what they hold)."),
    F(6, "Embodiment of the Law", "Cast an enchantment spell of 1st level or higher as a Bonus Action. Wis-modifier times per Long Rest.",
      resource=("embodiment_of_the_law", "Embodiment of the Law", "max(1, wis)", LR)),
    F(8, "Divine Strike", "Once on each of your turns, a weapon hit deals +1d8 psychic (2d8 at 14).",
      rider=dict(dice=DIVINE_STRIKE, type="psychic", once="turn")),
    F(17, "Order's Wrath", "A creature you hit with Divine Strike is cursed: the next time an ally hits it before your next turn, it takes +2d8 psychic."),
]))

add("peace-tce", S("cleric", "Peace Domain", TCE, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Heroism", "Sanctuary"], 3: ["Aid", "Warding Bond"], 5: ["Beacon of Hope", "Sending"],
              7: ["Aura of Purity", "Otiluke's Resilient Sphere"], 9: ["Greater Restoration", "Rary's Telepathic Bond"]}),
    F(1, "Implement of Peace", "Insight, Performance or Persuasion."),
    F(1, "Emboldening Bond", "Action: bond up to PB willing creatures within 30 ft for 10 minutes; once per turn each can add 1d4 to an attack, check or save while within 30 ft of another bonded creature. PB times per Long Rest.",
      resource=("emboldening_bond", "Emboldening Bond", "pb", LR)),
    F(2, "Channel Divinity: Balm of Peace", "Action: move up to your speed without provoking Opportunity Attacks; each creature you pass within 5 ft regains 2d6 + Wis modifier HP."),
    F(6, "Protective Bond", "When a bonded creature is about to take damage, another bonded creature within 30 ft can use its Reaction to teleport next to it and take the damage instead."),
    F(8, "Potent Spellcasting", "Add your Wis modifier to the damage of your Cleric cantrips."),
    F(17, "Expansive Bond", "Bond benefits reach 60 ft, and a creature taking damage through Protective Bond has resistance to it."),
]))

add("twilight-tce", S("cleric", "Twilight Domain", TCE, [
    F(1, "Domain Spells", "Always prepared.",
      spells={1: ["Faerie Fire", "Sleep"], 3: ["Moonbeam", "See Invisibility"], 5: ["Aura of Vitality", "Leomund's Tiny Hut"],
              7: ["Aura of Life", "Greater Invisibility"], 9: ["Circle of Power", "Mislead"]}),
    F(1, "Bonus Proficiencies", "Martial weapons and heavy armor.", armor=["heavy"], weapons=["martial"]),
    F(1, "Eyes of Night", "Darkvision 300 ft; as an action, share it with up to Wis-modifier creatures for 1 hour (once per Long Rest, or spend a slot).",
      resource=("eyes_of_night", "Share Eyes of Night", 1, LR)),
    F(1, "Vigilant Blessing", "Action: one creature has Advantage on its next initiative roll."),
    F(2, "Channel Divinity: Twilight Sanctuary", "Action: a 30-ft sphere of twilight around you for 1 minute; a creature ending its turn there gains 1d6 + Cleric level temp HP, or ends Charmed or Frightened."),
    F(6, "Steps of Night", "Bonus Action in dim light or darkness: Fly Speed equal to your walking speed for 1 minute. PB times per Long Rest.",
      resource=("steps_of_night", "Steps of Night", "pb", LR)),
    F(8, "Divine Strike", "Once on each of your turns, a weapon hit deals +1d8 radiant (2d8 at 14).",
      rider=dict(dice=DIVINE_STRIKE, type="radiant", once="turn")),
    F(17, "Twilight Shroud", "You and allies in your Twilight Sanctuary have half cover."),
], level=1))

# ====================================================================== Druid

add("spores-tce", S("druid", "Circle of Spores", TCE, [
    F(2, "Circle Spells", "Always prepared; you also know Chill Touch.",
      spells={2: ["Chill Touch"], 3: ["Blindness/Deafness", "Gentle Repose"], 5: ["Animate Dead", "Gaseous Form"],
              7: ["Blight", "Confusion"], 9: ["Cloudkill", "Contagion"]}),
    F(2, "Halo of Spores", "Reaction when a creature moves within 10 ft of you or starts its turn there: it makes a Con save or takes 1d4 necrotic (1d6 at 6, 1d8 at 10, 1d10 at 14)."),
    F(2, "Symbiotic Entity", "Action, spend a Wild Shape use: gain 4 temp HP per Druid level for 10 minutes; Halo of Spores damage is rolled twice and melee weapon attacks deal +1d6 necrotic. (Add a \"Symbiotic Entity\" condition in combat.)",
      rider=dict(dice="1d6", type="necrotic", when="melee", needs="Symbiotic Entity")),
    F(6, "Fungal Infestation", "Reaction when a Small or Medium beast or humanoid dies within 10 ft: it rises as a 1-HP zombie under your control for 1 hour. Wis-modifier times per Long Rest.",
      resource=("fungal_infestation", "Fungal Infestation", "max(1, wis)", LR)),
    F(10, "Spreading Spores", "While Symbiotic Entity is active, Bonus Action: move your Halo of Spores to a 10-ft cube within 30 ft for 1 minute."),
    F(14, "Fungal Body", "Immune to Blinded, Deafened, Frightened and Poisoned; critical hits against you count as normal hits unless you're Incapacitated.",
      cond_immune=["blinded", "deafened", "frightened", "poisoned"]),
], level=2))

add("stars-tce", S("druid", "Circle of Stars", TCE, [
    F(2, "Star Map", "Guidance and Guiding Bolt always prepared; cast Guiding Bolt without a slot PB times per Long Rest.",
      spells={2: ["Guidance", "Guiding Bolt"]}, resource=("star_map", "Free Guiding Bolt", "pb", LR)),
    F(2, "Starry Form", "Spend a Wild Shape use: a starry form for 10 minutes (choose its constellation each time).",
      options=[
          ("archer", "Archer", "Bonus Action: ranged spell attack, 60 ft, 1d8 + Wis radiant (2d8 + Wis from level 10).",
           dict(attack=dict(name="Luminous Arrow (Starry Form)", dice=[(2, "1d8"), (10, "2d8")], type="radiant", ability="spell", range="60 ft"))),
          ("chalice", "Chalice", "When you cast a healing spell with a slot, you or another creature within 30 ft also regains 1d8 + Wis HP (2d8 + Wis from level 10)."),
          ("dragon", "Dragon", "Int and Wis checks, and Con saves to keep concentration, treat a d20 roll of 9 or lower as 10 (from level 10: Fly 20 ft, hover)."),
      ]),
    F(6, "Cosmic Omen", "After a Long Rest, roll a die: even = Weal (Reaction: add 1d6 to a roll within 30 ft), odd = Woe (subtract 1d6). PB times per Long Rest.",
      resource=("cosmic_omen", "Cosmic Omen", "pb", LR)),
    F(10, "Twinkling Constellations", "Starry Form's 1d8 becomes 2d8, the Dragon grants Fly 20 ft, and you can switch constellation at the start of each turn."),
    F(14, "Full of Stars", "In Starry Form you have resistance to bludgeoning, piercing and slashing damage. (Add a \"Starry Form\" condition in combat.)",
      resist=["bludgeoning", "piercing", "slashing"], needs="Starry Form"),
], level=2))

add("wildfire-tce", S("druid", "Circle of Wildfire", TCE, [
    F(2, "Circle Spells", "Always prepared.",
      spells={2: ["Burning Hands", "Cure Wounds"], 3: ["Flaming Sphere", "Scorching Ray"], 5: ["Plant Growth", "Revivify"],
              7: ["Aura of Life", "Fire Shield"], 9: ["Flame Strike", "Mass Cure Wounds"]}),
    F(2, "Summon Wildfire Spirit", "Action, spend a Wild Shape use: summon your wildfire spirit for 1 hour (it acts on your turn); creatures within 10 ft of where it appears make a Dex save or take 2d6 fire.",
      summon="wildfire_spirit"),
    F(6, "Enhanced Bond", "While your spirit is summoned, a spell that deals fire damage or heals adds 1d8 to one roll, and spells can originate from the spirit.",
      rider=dict(name="Enhanced Bond", dice="1d8", type="fire", when="spell")),
    F(10, "Cauterizing Flames", "When a Small or larger creature dies within 30 ft of you or your spirit, a spectral flame appears; move into it to heal or hurt a creature in it by 2d10 + Wis modifier. PB times per Long Rest.",
      resource=("cauterizing_flames", "Cauterizing Flames", "pb", LR)),
    F(14, "Blazing Revival", "When you drop to 0 HP with the spirit within 120 ft, it can drop to 0 HP to bring you back with half your HP. Once per Long Rest.",
      resource=("blazing_revival", "Blazing Revival", 1, LR)),
], level=2))

# ====================================================================== Fighter

PSI_DIE = [(3, "1d6"), (5, "1d8"), (11, "1d10"), (17, "1d12")]

add("psi-warrior-tce", S("fighter", "Psi Warrior", TCE, [
    F(3, "Psionic Power", "Psionic Energy dice (2 × PB; d6, d8 at 5, d10 at 11, d12 at 17), all back on a Long Rest; Bonus Action once per Short Rest to regain one. Protective Field: Reaction, reduce damage to someone within 30 ft by a die + Int. Telekinetic Movement: move an object or creature 30 ft.",
      resource=("psionic_energy", "Psionic Energy dice", "2*pb", LR)),
    F(3, "Psionic Strike", "Once on each of your turns after a weapon hit within 30 ft, spend a Psionic Energy die: + the die + Int modifier force damage.",
      rider=dict(name="Psionic Strike (spend a die)", dice=[(3, "1d6+{int}"), (5, "1d8+{int}"), (11, "1d10+{int}"), (17, "1d12+{int}")], type="force", once="turn")),
    F(7, "Telekinetic Adept", "Psi-Powered Leap (Fly speed of twice your walking speed this turn, once per Short Rest or a die); Telekinetic Thrust: a Psionic Strike target makes a Str save or is knocked Prone or pushed 10 ft."),
    F(10, "Guarded Mind", "Resistance to psychic damage; spend a die at the start of your turn to end Charmed and Frightened.", resist=["psychic"]),
    F(15, "Bulwark of Force", "Bonus Action: up to Int-modifier creatures within 30 ft get half cover for 1 minute. Once per Long Rest, or spend a die.",
      resource=("bulwark_of_force", "Bulwark of Force", 1, LR)),
    F(18, "Telekinetic Master", "Cast Telekinesis (Int) without components once per Long Rest (or spend a die); while concentrating on it, make one weapon attack as a Bonus Action.",
      resource=("telekinetic_master", "Free Telekinesis", 1, LR)),
]))

add("rune-knight-tce", S("fighter", "Rune Knight", TCE, [
    F(3, "Bonus Proficiencies", "Smith's tools; speak, read and write Giant."),
    F(3, "Rune Carver", "Learn 2 runes (3 at 7, 4 at 10, 5 at 15) from Cloud, Fire, Frost, Stone, and from 7th Hill and Storm; inscribe them on gear. Each rune's power works once per Short Rest (twice from 15)."),
    F(3, "Giant's Might", "Bonus Action for 1 minute: become Large, Advantage on Str checks and saves, and once on each of your turns a weapon or unarmed hit deals +1d6 (1d8 at 10, 1d10 at 18). PB times per Long Rest. (Add a \"Giant's Might\" condition in combat.)",
      resource=("giants_might", "Giant's Might", "pb", LR),
      rider=dict(name="Giant's Might", dice=[(3, "1d6"), (10, "1d8"), (18, "1d10")], once="turn", needs="Giant's Might", unarmed=True)),
    F(7, "Runic Shield", "Reaction when a creature you can see within 60 ft hits another: force it to reroll. PB times per Long Rest.",
      resource=("runic_shield", "Runic Shield", "pb", LR)),
    F(10, "Great Stature", "Grow 3d4 inches; Giant's Might damage becomes 1d8."),
    F(15, "Master of Runes", "Each rune works twice per Short Rest."),
    F(18, "Runic Juggernaut", "Giant's Might damage becomes 1d10; you can become Huge, and your reach grows by 5 ft."),
]))

# ====================================================================== Monk

add("mercy-tce", S("monk", "Way of Mercy", TCE, [
    F(3, "Implements of Mercy", "Insight, Medicine and the herbalism kit; a mask."),
    F(3, "Hand of Healing", "Action, 1 ki: touch heals a Martial Arts die + Wis modifier; can replace one Flurry of Blows strike."),
    F(3, "Hand of Harm", "Once per turn when an unarmed strike hits, spend 1 ki: + a Martial Arts die + Wis modifier necrotic.",
      rider=dict(name="Hand of Harm (1 ki)", dice=[(3, "1d4+{wis}"), (5, "1d6+{wis}"), (11, "1d8+{wis}"), (17, "1d10+{wis}")], type="necrotic", once="turn", when="unarmed")),
    F(6, "Physician's Touch", "Hand of Healing also ends one disease or Blinded, Deafened, Paralyzed, Poisoned or Stunned; Hand of Harm also poisons until the end of your next turn."),
    F(11, "Flurry of Healing and Harm", "Replace any Flurry of Blows strikes with Hand of Healing without ki; Hand of Harm with a Flurry strike costs no ki (once per turn)."),
    F(17, "Hand of Ultimate Mercy", "Action, 5 ki: revive a creature dead for under 24 hours with 4d10 + Wis HP and no conditions. Once per Long Rest.",
      resource=("ultimate_mercy", "Hand of Ultimate Mercy", 1, LR)),
]))

add("astral-self-tce", S("monk", "Way of the Astral Self", TCE, [
    F(3, "Arms of the Astral Self", "Bonus Action, 1 ki, 10 minutes: creatures within 10 ft make a Dex save or take two Martial Arts dice force; use Wis instead of Str for Str checks and saves; unarmed strikes with the arms reach 10 ft and use Wis, dealing force damage.",
      attack=dict(name="Astral Arms", dice=MA14, type="force", ability="wis", melee=True, range="reach 10 ft", note="While the arms are summoned")),
    F(6, "Visage of the Astral Self", "Bonus Action, 1 ki, 10 minutes: see through magical darkness 120 ft, Advantage on Insight and Intimidation, project your voice."),
    F(11, "Body of the Astral Self", "With arms and visage summoned: Reaction to reduce acid, cold, fire, force, lightning or thunder damage by 1d10 + Wis; once per turn add a Martial Arts die to an arms hit."),
    F(17, "Awakened Astral Self", "Bonus Action, 5 ki: arms, visage and armor for 10 minutes: +2 AC and three arm attacks when you use Extra Attack."),
]))

# ====================================================================== Paladin

add("glory-tce", S("paladin", "Oath of Glory", TCE, [
    F(3, "Oath Spells", "Always prepared.",
      spells={3: ["Guiding Bolt", "Heroism"], 5: ["Enhance Ability", "Magic Weapon"], 9: ["Haste", "Protection from Energy"],
              13: ["Compulsion", "Freedom of Movement"], 17: ["Commune", "Flame Strike"]}),
    F(3, "Channel Divinity", "Peerless Athlete: Bonus Action, 10 minutes of Advantage on Athletics and Acrobatics, double carrying capacity, longer jumps. Inspiring Smite: after a Divine Smite, share 2d8 + Paladin level temp HP among creatures within 30 ft."),
    F(7, "Aura of Alacrity", "+10 ft walking speed; allies starting their turn within 5 ft of you (10 ft at 18) gain +10 ft speed that turn.", speed=10),
    F(15, "Glorious Defense", "Reaction when you or a creature within 10 ft is hit: add your Cha modifier to its AC, and if the attack then misses you can make one weapon attack against the attacker. Cha-modifier times per Long Rest.",
      resource=("glorious_defense", "Glorious Defense", "max(1, cha)", LR)),
    F(20, "Living Legend", "Bonus Action, 1 minute: Advantage on Cha checks, once per turn turn a weapon miss into a hit, and reroll failed saves (Reaction). Once per Long Rest, or a 5th-level slot.",
      resource=("living_legend", "Living Legend", 1, LR)),
]))

add("watchers-tce", S("paladin", "Oath of the Watchers", TCE, [
    F(3, "Oath Spells", "Always prepared.",
      spells={3: ["Alarm", "Detect Magic"], 5: ["Moonbeam", "See Invisibility"], 9: ["Counterspell", "Nondetection"],
              13: ["Aura of Purity", "Banishment"], 17: ["Hold Monster", "Scrying"]}),
    F(3, "Channel Divinity", "Watcher's Will: up to Cha-modifier creatures within 30 ft get Advantage on Int, Wis and Cha saves for 1 minute. Abjure the Extraplanar: aberrations, celestials, elementals, fey and fiends within 30 ft make a Wis save or are Turned for 1 minute."),
    F(7, "Aura of the Sentinel", "You and creatures of your choice within 10 ft (30 ft at 18) add your proficiency bonus to initiative.", init="pb"),
    F(15, "Vigilant Rebuke", "Reaction when you or a creature within 30 ft succeeds on an Int, Wis or Cha save: deal 2d8 + Cha modifier force to the creature that forced it."),
    F(20, "Mortal Bulwark", "Bonus Action, 1 minute: truesight 120 ft, Advantage on attacks against aberrations, celestials, elementals, fey and fiends, and a hit can banish them (Cha save). Once per Long Rest, or a 5th-level slot.",
      resource=("mortal_bulwark", "Mortal Bulwark", 1, LR)),
]))

# ====================================================================== Ranger

add("fey-wanderer-tce", S("ranger", "Fey Wanderer", TCE, [
    F(3, "Dreadful Strikes", "Once on each of your turns, a weapon hit deals +1d4 psychic (1d6 at 11).",
      rider=dict(dice=[(3, "1d4"), (11, "1d6")], type="psychic", once="turn")),
    F(3, "Fey Wanderer Magic", "Spells known that don't count against your number; plus a fey gift.",
      spells={3: ["Charm Person"], 5: ["Misty Step"], 9: ["Dispel Magic"], 13: ["Dimension Door"], 17: ["Mislead"]}),
    F(3, "Otherworldly Glamour", "Add your Wisdom modifier (minimum +1) to Charisma checks; gain Deception, Performance or Persuasion.",
      check=dict(abilities=["cha"], add="wis", min=1)),
    F(7, "Beguiling Twist", "Advantage on saves against Charmed and Frightened; when a creature within 120 ft succeeds on such a save, Reaction: another creature makes a Wis save or is charmed or frightened for 1 minute."),
    F(11, "Fey Reinforcements", "Summon Fey known; cast it once per Long Rest without a material component or a slot, optionally without concentration (lasting 1 minute).",
      resource=("fey_reinforcements", "Free Summon Fey", 1, LR)),
    F(15, "Misty Wanderer", "Cast Misty Step without a slot Wis-modifier times per Long Rest, bringing a willing creature within 5 ft along.",
      resource=("misty_wanderer", "Free Misty Step", "max(1, wis)", LR)),
]))

add("swarmkeeper-tce", S("ranger", "Swarmkeeper", TCE, [
    F(3, "Gathered Swarm", "Once on each of your turns after you hit: +1d6 piercing, or push the target 15 ft (Str save), or move yourself 5 ft. 1d8 at 11.",
      rider=dict(dice=[(3, "1d6"), (11, "1d8")], type="piercing", once="turn", when="any")),
    F(3, "Swarmkeeper Magic", "Mage Hand plus spells known that don't count against your number.",
      spells={3: ["Mage Hand", "Faerie Fire"], 5: ["Web"], 9: ["Gaseous Form"], 13: ["Arcane Eye"], 17: ["Insect Plague"]}),
    F(7, "Writhing Tide", "Bonus Action: Fly 10 ft and hover for 1 minute. PB times per Long Rest.",
      resource=("writhing_tide", "Writhing Tide", "pb", LR)),
    F(11, "Mighty Swarm", "Gathered Swarm deals 1d8; a pushed creature can also be knocked Prone; moving yourself grants half cover."),
    F(15, "Swarming Dispersal", "Reaction when you take damage: resistance to it and teleport up to 30 ft. PB times per Long Rest.",
      resource=("swarming_dispersal", "Swarming Dispersal", "pb", LR)),
]))

# ====================================================================== Rogue

add("phantom-tce", S("rogue", "Phantom", TCE, [
    F(3, "Whispers of the Dead", "After a rest, gain one skill or tool proficiency until you change it."),
    F(3, "Wails from the Grave", "After Sneak Attack, a second creature within 30 ft of the first takes necrotic damage equal to half your Sneak Attack dice. PB times per Long Rest.",
      resource=("wails_from_the_grave", "Wails from the Grave", "pb", LR)),
    F(9, "Tokens of the Departed", "Reaction when a creature dies within 30 ft: make a soul trinket (up to PB at once). With one: Advantage on death saves and Con saves; destroy one to use Wails without a use or to ask its spirit a question."),
    F(13, "Ghost Walk", "Bonus Action, 10 minutes: spectral form, Fly 10 ft hover, attacks against you have Disadvantage, move through creatures and objects. Once per Long Rest, or destroy a soul trinket.",
      resource=("ghost_walk", "Ghost Walk", 1, LR)),
    F(17, "Death's Friend", "Wails from the Grave deals necrotic to both creatures; you make a soul trinket after a Long Rest if you have none."),
]))

add("soulknife-tce", S("rogue", "Soulknife", TCE, [
    F(3, "Psionic Power", "Psionic Energy dice (2 × PB; d6, d8 at 5, d10 at 11, d12 at 17), all back on a Long Rest; Bonus Action once per Short Rest to regain one. Psi-Bolstered Knack: add a die to a failed check with a proficient skill or tool. Psychic Whispers: telepathy for hours.",
      resource=("psionic_energy", "Psionic Energy dice", "2*pb", LR)),
    F(3, "Psychic Blades", "Manifest a blade: a simple melee weapon with Finesse and Thrown (60 ft), 1d6 psychic; as a Bonus Action after attacking with one, attack with a second blade (1d4 psychic).",
      attack=dict(name="Psychic Blade", dice="1d6", type="psychic", ability="best", melee=True, range="thrown 60 ft", finesse=True,
                  note="Bonus Action follow-up blade: 1d4 psychic")),
    F(9, "Soul Blades", "Homing Strikes: when a blade misses, add a Psionic Energy die (spent only on a hit). Psychic Teleportation: Bonus Action, throw a blade and teleport (die × 10 ft)."),
    F(13, "Psychic Veil", "Action: Invisible for 1 hour (ends if you damage someone or force a save). Once per Long Rest, or spend a die.",
      resource=("psychic_veil", "Psychic Veil", 1, LR)),
    F(17, "Rend Mind", "When you Sneak Attack with a Psychic Blade, the target makes a Wis save or is Stunned for 1 minute (repeat at the end of each turn). Once per Long Rest, or three dice.",
      resource=("rend_mind", "Rend Mind", 1, LR)),
]))

# ====================================================================== Sorcerer

add("aberrant-mind-tce", S("sorcerer", "Aberrant Mind", TCE, [
    F(1, "Psionic Spells", "Known and not counted against your spells known.",
      spells={1: ["Arms of Hadar", "Dissonant Whispers", "Mind Sliver"], 3: ["Calm Emotions", "Detect Thoughts"],
              5: ["Hunger of Hadar", "Sending"], 7: ["Evard's Black Tentacles", "Summon Aberration"], 9: ["Rary's Telepathic Bond", "Telekinesis"]}),
    F(1, "Telepathic Speech", "Bonus Action: telepathic link with a creature within 30 ft for Sorcerer-level minutes."),
    F(6, "Psionic Sorcery", "Cast a Psionic Spell by spending sorcery points equal to its level, without verbal or somatic components."),
    F(6, "Psychic Defenses", "Resistance to psychic damage; Advantage on saves against Charmed and Frightened.", resist=["psychic"]),
    F(14, "Revelation in Flesh", "Bonus Action, spend sorcery points: see invisible, fly, swim and breathe water, or squeeze through tiny spaces, for 10 minutes."),
    F(18, "Warping Implosion", "Action: teleport up to 120 ft; creatures within 30 ft of where you left make a Str save or take 3d10 force and are pulled toward that spot. Once per Long Rest, or 5 sorcery points.",
      resource=("warping_implosion", "Warping Implosion", 1, LR)),
], level=1))

add("clockwork-soul-tce", S("sorcerer", "Clockwork Soul", TCE, [
    F(1, "Clockwork Magic", "Known and not counted against your spells known.",
      spells={1: ["Alarm", "Protection from Evil and Good"], 3: ["Aid", "Lesser Restoration"], 5: ["Dispel Magic", "Protection from Energy"],
              7: ["Freedom of Movement", "Summon Construct"], 9: ["Greater Restoration", "Wall of Force"]}),
    F(1, "Restore Balance", "Reaction when a creature within 60 ft is about to roll with Advantage or Disadvantage: cancel it. PB times per Long Rest.",
      resource=("restore_balance", "Restore Balance", "pb", LR)),
    F(6, "Bastion of Law", "Action, 1–5 sorcery points: a creature gets that many d8s as a ward; when it takes damage it can spend dice to reduce the damage."),
    F(14, "Trance of Order", "Bonus Action, 1 minute: attacks against you don't have Advantage, and your attack rolls, checks and saves treat a d20 of 9 or lower as 10. Once per Long Rest, or 5 sorcery points.",
      resource=("trance_of_order", "Trance of Order", 1, LR)),
    F(18, "Clockwork Cavalcade", "Action: a 30-ft cube where you restore up to 100 HP among creatures, repair objects, and end spells of 6th level or lower. Once per Long Rest, or 7 sorcery points.",
      resource=("clockwork_cavalcade", "Clockwork Cavalcade", 1, LR)),
], level=1))

# ====================================================================== Warlock

add("fathomless-tce", S("warlock", "The Fathomless", TCE, [
    F(1, "Expanded Spell List", "These count as Warlock spells for you.",
      spells={1: ["Create or Destroy Water", "Thunderwave"], 3: ["Gust of Wind", "Silence"], 5: ["Lightning Bolt", "Sleet Storm"],
              7: ["Control Water", "Summon Elemental"], 9: ["Bigby's Hand", "Cone of Cold"]}),
    F(1, "Tentacle of the Deeps", "Bonus Action: a 10-ft tentacle for 1 minute; Bonus Action to attack: melee spell attack, 1d8 cold (2d8 at 10) and the target's speed drops by 10 ft. PB times per Long Rest.",
      resource=("tentacle", "Tentacle of the Deeps", "pb", LR),
      attack=dict(name="Tentacle of the Deeps", dice=[(1, "1d8"), (10, "2d8")], type="cold", ability="spell", melee=True, add_mod=False,
                  range="10 ft of the tentacle", note="Bonus Action; hit: speed −10 ft until your next turn")),
    F(1, "Gift of the Sea", "Swim speed 40 ft; breathe underwater."),
    F(6, "Oceanic Soul", "Resistance to cold damage; you and fully submerged creatures understand each other.", resist=["cold"]),
    F(6, "Guardian Coil", "Reaction when a creature within 10 ft of the tentacle takes damage: reduce it by 1d8 (2d8 at 10)."),
    F(10, "Grasping Tentacles", "Evard's Black Tentacles always known; cast it once per Long Rest without a slot, gaining temp HP equal to your Warlock level; damage can't break your concentration on it.",
      resource=("grasping_tentacles", "Free Black Tentacles", 1, LR)),
    F(14, "Fathomless Plunge", "Action: teleport yourself and up to five willing creatures within 30 ft to a body of water you've seen within 1 mile. Once per Short Rest.",
      resource=("fathomless_plunge", "Fathomless Plunge", 1, SR)),
], level=1))

add("genie-tce", S("warlock", "The Genie", TCE, [
    F(1, "Genie Kind", "Choose your patron's kind: it sets the damage type of Genie's Wrath and adds to your expanded spells.",
      options=[(k, n, f"Genie's Wrath and Elemental Gift use {t} damage.", dict(rider=dict(name="Genie's Wrath", dice="{pb}", type=t, once="turn", when="any")))
               for k, n, t in (("dao", "Dao (earth)", "bludgeoning"), ("djinni", "Djinni (air)", "thunder"),
                               ("efreeti", "Efreeti (fire)", "fire"), ("marid", "Marid (water)", "cold"))]),
    F(1, "Genie's Vessel", "A Tiny vessel as your focus. Bottled Respite: Action, vanish into it for up to twice PB hours (once per Long Rest). Genie's Wrath: once on each of your turns, a hit deals + PB damage of your genie's type.",
      resource=("bottled_respite", "Bottled Respite", 1, LR)),
    F(6, "Elemental Gift", "Resistance to your genie's damage type; Bonus Action: Fly 30 ft hover for 10 minutes, PB times per Long Rest.",
      resource=("elemental_gift", "Elemental Gift flight", "pb", LR)),
    F(10, "Sanctuary Vessel", "Bring up to five willing creatures into the vessel; a Short Rest there grants extra HP per Hit Die equal to your PB."),
    F(14, "Limited Wish", "Action: duplicate a 6th-level or lower spell with a casting time of one action. Then not again until you finish 1d4 Long Rests.",
      resource=("limited_wish", "Limited Wish", 1, LR)),
], level=1))

# ====================================================================== Wizard

add("bladesinging-tce", S("wizard", "Bladesinging", TCE, [
    F(2, "Training in War and Song", "Light armor training and one type of one-handed melee weapon; Performance.", armor=["light"]),
    F(2, "Bladesong", "Bonus Action, 1 minute (not in medium or heavy armor or with a shield): + Int modifier (minimum +1) to AC, +10 ft walking speed, Advantage on Acrobatics, + Int modifier to Con saves for concentration. PB times per Long Rest. (Add a \"Bladesong\" condition in combat and raise AC by hand.)",
      resource=("bladesong", "Bladesong", "pb", LR), ac_bonus=dict(add="int", min=1, needs="Bladesong")),
    F(6, "Extra Attack", "Attack twice when you take the Attack action; you can cast a cantrip in place of one attack."),
    F(10, "Song of Defense", "Reaction when you take damage while Bladesong is active: spend a spell slot to reduce the damage by five times the slot's level."),
    F(14, "Song of Victory", "While Bladesong is active, add your Int modifier (minimum +1) to melee weapon damage.",
      rider=dict(name="Song of Victory", dice="{int}", when="melee", needs="Bladesong")),
], level=2))

add("scribes-tce", S("wizard", "Order of Scribes", TCE, [
    F(2, "Wizardly Quill", "Bonus Action: a magic quill that copies spells into your book in 2 minutes per spell level."),
    F(2, "Awakened Spellbook", "Your spellbook is your focus; when you cast a damage spell, switch its damage type to that of another spell in your book of the same level; cast a ritual at normal speed once per Long Rest."),
    F(6, "Manifest Mind", "Bonus Action: a spectral mind within 60 ft that sees in darkness; cast spells as though you were in its space PB times per Long Rest.",
      resource=("manifest_mind", "Cast through Manifest Mind", "pb", LR)),
    F(10, "Master Scrivener", "After a Long Rest, make a scroll of a 1st- or 2nd-level spell from your book; it's cast one level higher."),
    F(14, "One with the Word", "Advantage on Arcana; Reaction when you take damage while the book is manifested: avoid it by removing spells from your book (3d6 levels' worth). Once per Long Rest.",
      resource=("one_with_the_word", "One with the Word", 1, LR)),
], level=2))
