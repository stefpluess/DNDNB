"""Shared D&D 2024 constants and formatting, used by the rules, homebrew, importer and server.

The front end gets the same lists from GET /api/meta, so there is one source of truth.
"""

ABILITIES = ["str", "dex", "con", "int", "wis", "cha"]
ABILITY_LONG = {"str": "strength", "dex": "dexterity", "con": "constitution",
                "int": "intelligence", "wis": "wisdom", "cha": "charisma"}
ABILITY_NAMES = {a: name.title() for a, name in ABILITY_LONG.items()}

# Skill keys use underscores, the same as the SRD data from Open5e.
SKILLS = {
    "acrobatics": "dex", "animal_handling": "wis", "arcana": "int", "athletics": "str",
    "deception": "cha", "history": "int", "insight": "wis", "intimidation": "cha",
    "investigation": "int", "medicine": "wis", "nature": "int", "perception": "wis",
    "performance": "cha", "persuasion": "cha", "religion": "int", "sleight_of_hand": "dex",
    "stealth": "dex", "survival": "wis",
}

SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]
DAMAGE_TYPES = ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing",
                "Poison", "Psychic", "Radiant", "Slashing", "Thunder"]
ACTION_TYPES = {"ACTION": "Action", "BONUS_ACTION": "Bonus action", "REACTION": "Reaction",
                "LEGENDARY_ACTION": "Legendary action"}
# Conditions offered in the tracker: the 2024 conditions plus common effects worth a reminder chip.
CONDITIONS = ["Blinded", "Charmed", "Concentrating", "Deafened", "Exhaustion", "Frightened", "Grappled",
              "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained",
              "Stunned", "Unconscious", "Raging", "Blessed", "Baned", "Hasted", "Hunter's Mark", "Hex",
              "Shield of Faith", "Shield", "Divine Favor"]

CR_VALUES = [0, 0.125, 0.25, 0.5] + list(range(1, 31))
XP_BY_CR = {0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900,
            8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000,
            17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000,
            25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000}

MINUS = "−"  # typographic minus for display; dice expressions use "-"


def mod(score):
    return (int(score) - 10) // 2


def prof_bonus(level):
    """Character proficiency bonus by level (1–20)."""
    return 2 + (max(1, min(20, int(level))) - 1) // 4


def pb_for_cr(cr):
    """Creature proficiency bonus by challenge rating."""
    cr = float(cr or 0)
    return 2 if cr < 5 else min(9, 3 + int((cr - 5) // 4))


def signed(n):
    """+3 / −1 for display."""
    return f"+{n}" if n >= 0 else f"{MINUS}{-n}"


def fmt_cr(cr):
    cr = float(cr or 0)
    return {0.125: "1/8", 0.25: "1/4", 0.5: "1/2"}.get(cr, str(int(cr)) if cr == int(cr) else str(cr))


def ordinal(n):
    return {1: "1st", 2: "2nd", 3: "3rd"}.get(n, f"{n}th")


def short_key(key):
    """'srd-2024_goblin-warrior' -> 'goblin-warrior'"""
    key = key or ""
    return key.split("_", 1)[1] if "_" in key else key


def skill_key(name):
    """'Sleight of Hand', 'sleight-of-hand' or 'sleight_of_hand' -> 'sleight_of_hand'"""
    return str(name or "").strip().lower().replace("-", "_").replace(" ", "_").replace("'", "")


def meta():
    """Everything the front end needs to render forms and labels."""
    from rules import CLASS_DEFAULTS, FIGHTING_STYLES  # local import: rules imports this module
    import subclasses
    return {
        "abilities": ABILITIES, "ability_long": ABILITY_LONG, "skills": SKILLS,
        "classes": sorted(c.title() for c in CLASS_DEFAULTS), "sizes": SIZES,
        "damage_types": DAMAGE_TYPES, "action_types": ACTION_TYPES, "conditions": CONDITIONS,
        "cr_values": CR_VALUES, "fighting_styles": FIGHTING_STYLES,
        "subclasses": subclasses.catalog(), "class_choices": subclasses.class_catalog(),
    }
