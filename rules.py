"""D&D 2024 rules (SRD 5.2, "5.5e") math for character sheets.

derive(sheet) takes a stored character sheet and returns everything the table needs:
AC with a breakdown, attack bonuses and damage per weapon, saves, skills, spell DC,
initiative, passive Perception and warnings (e.g. heavy armor without the Strength).
2024 specifics: class proficiencies, half casters casting from level 1, Weapon Mastery,
and Exhaustion (-2 per level to every d20 Test, -5 ft speed per level).

Item shape in sheet["inventory"]:
{
  "uid": "a1", "name": "Longsword", "type": "weapon" | "armor" | "shield" | "gear" | "wondrous",
  "equipped": true, "bonus": 1,            # magic +N on weapons, armor and shields
  "qty": 1, "attune": false, "attuned": false, "notes": "",
  "mods": {"ac": 0, "ac_unarmored": 0, "saves": 0, "attack": 0, "damage": 0,
           "spell_dc": 0, "spell_attack": 0, "set": {"str": 19}},
  "weapon": {"index": "longsword", "category": "Martial", "range": "Melee", "dice": "1d8",
             "dtype": "slashing", "versatile_dice": "1d10", "properties": ["versatile"],
             "mastery": "Sap", "range_normal": null, "range_long": null},
  "armor":  {"category": "Heavy", "base": 16, "dex_bonus": false, "max_bonus": null,
             "str_min": 15, "stealth_dis": true}
}
"""
import math
import random
import re
import uuid

import subclasses
import summons
from common import ABILITIES, ABILITY_NAMES, SKILLS, mod, prof_bonus, short_key, signed, skill_key

# 2024 Player's Handbook / SRD 5.2 starting proficiencies.
# Weapon tokens: "simple", "martial", "martial-light" (martial weapons with Light),
# "martial-finesse-light" (martial weapons with Finesse or Light), or a weapon's key.
CLASS_DEFAULTS = {
    #            armor                                     weapons                               saves          cast   hit die
    "barbarian": (["light", "medium", "shields"],          ["simple", "martial"],                ["str", "con"], None, 12),
    "bard":      (["light"],                               ["simple"],                           ["dex", "cha"], "cha", 8),
    "cleric":    (["light", "medium", "shields"],          ["simple"],                           ["wis", "cha"], "wis", 8),
    "druid":     (["light", "shields"],                    ["simple"],                           ["int", "wis"], "wis", 8),
    "fighter":   (["light", "medium", "heavy", "shields"], ["simple", "martial"],                ["str", "con"], None, 10),
    "monk":      ([],                                      ["simple", "martial-light"],          ["str", "dex"], None, 8),
    "paladin":   (["light", "medium", "heavy", "shields"], ["simple", "martial"],                ["wis", "cha"], "cha", 10),
    "ranger":    (["light", "medium", "shields"],          ["simple", "martial"],                ["str", "dex"], "wis", 10),
    "rogue":     (["light"],                               ["simple", "martial-finesse-light"],  ["dex", "int"], None, 8),
    "sorcerer":  ([],                                      ["simple"],                           ["con", "cha"], "cha", 6),
    "warlock":   (["light"],                               ["simple"],                           ["wis", "cha"], "cha", 8),
    "wizard":    ([],                                      ["simple"],                           ["int", "wis"], "int", 6),
    # Tasha's Cauldron (2014 rules era)
    "artificer": (["light", "medium", "shields"],          ["simple"],                           ["con", "int"], "int", 8),
}
# Weapon Mastery: number of weapons known, as (from level, count) steps (2024 class tables).
MASTERY_STEPS = {"barbarian": [(1, 2), (4, 3), (10, 4)], "fighter": [(1, 3), (4, 4), (10, 5), (16, 6)],
                 "paladin": [(1, 2)], "ranger": [(1, 2)], "rogue": [(1, 2)]}
# Monk Martial Arts die by level.
MARTIAL_ARTS_DIE = [(1, "1d6"), (5, "1d8"), (11, "1d10"), (17, "1d12")]


def _by_level(steps, level, default=0):
    """The value of the last (from level, value) step reached."""
    return next((v for lv, v in reversed(steps) if level >= lv), default)


# Class resources (2024 class tables). recover: "long" (all back on a Long Rest), "short" (all back on a
# Short Rest too), "short1" (one back on a Short Rest, all on a Long Rest). max is (from level, count) steps
# or a function of (level, ability modifiers).
RESOURCES = {
    "barbarian": [("rage", "Rage", [(1, 2), (3, 3), (6, 4), (12, 5), (17, 6)], "short1")],
    "bard": [("bardic_inspiration", "Bardic Inspiration", lambda lv, m: max(1, m["cha"]), lambda lv: "short" if lv >= 5 else "long")],
    "cleric": [("channel_divinity", "Channel Divinity", [(2, 2), (6, 3), (18, 4)], "short1")],
    "druid": [("wild_shape", "Wild Shape", [(2, 2), (6, 3), (17, 4)], "short1")],
    "fighter": [("second_wind", "Second Wind", [(1, 2), (4, 3), (10, 4)], "short1"),
                ("action_surge", "Action Surge", [(2, 1), (17, 2)], "short")],
    "monk": [("focus", "Focus Points", lambda lv, m: lv if lv >= 2 else 0, "short")],
    "paladin": [("lay_on_hands", "Lay on Hands (HP pool)", lambda lv, m: 5 * lv, "long"),
                ("channel_divinity", "Channel Divinity", [(3, 2), (11, 3)], "short1")],
    "ranger": [("favored_enemy", "Favored Enemy (free Hunter's Mark)", [(1, 2), (5, 3), (9, 4), (13, 5), (17, 6)], "long")],
    "sorcerer": [("sorcery_points", "Sorcery Points", lambda lv, m: lv if lv >= 2 else 0, "long"),
                 ("innate_sorcery", "Innate Sorcery", [(1, 2)], "long")],
    "warlock": [("magical_cunning", "Magical Cunning", [(2, 1)], "long")],
    "wizard": [("arcane_recovery", "Arcane Recovery", [(1, 1)], "long")],
    "artificer": [("flash_of_genius", "Flash of Genius", lambda lv, m: max(1, m["int"]) if lv >= 7 else 0, "long")],
}
# Unarmored Movement (Monk, no armor or shield) and Fast Movement (Barbarian, no heavy armor)
MONK_SPEED = [(2, 10), (6, 15), (10, 20), (14, 25), (18, 30)]
ATTUNE_LIMIT = {"artificer": [(1, 3), (10, 4), (14, 5), (18, 6)]}
RAGE_DAMAGE = [(1, 2), (9, 3), (16, 4)]
BARDIC_DIE = [(1, "d6"), (5, "d8"), (10, "d10"), (15, "d12")]
FIGHTING_STYLES = ["archery", "defense", "dueling", "great_weapon", "thrown_weapon", "two_weapon", "unarmed"]


def class_resources(cls, level, m, used=None, extra=()):
    """[{key, name, max, used, recover, pool}] for a class at a level, plus `extra` (key, name, max, recover)
    resources from the subclass. pool: track as a number, not pips."""
    out = []
    for key, name, mx, rec in [*RESOURCES.get(cls, []), *extra]:
        n = mx if isinstance(mx, int) else mx(level, m) if callable(mx) else _by_level(mx, level)
        if n <= 0:
            continue
        rec = rec(level) if callable(rec) else rec
        if key == "bardic_inspiration":
            name = f"{name} (1{_by_level(BARDIC_DIE, level)})"
        u = max(0, min(n, int((used or {}).get(key, 0) or 0)))
        out.append({"key": key, "name": name, "max": n, "used": u, "recover": rec, "pool": n > 9})
    return out


def mastery_slots(cls, level):
    return _by_level(MASTERY_STEPS.get(cls, []), level)


def _avg(dice):
    m = re.fullmatch(r"(\d*)d(\d+)", str(dice or "").strip().lower())
    return (int(m.group(1) or 1) * (int(m.group(2)) + 1) / 2) if m else 0

FULL_CASTER_SLOTS = {
    1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3], 7: [4, 3, 3, 1], 8: [4, 3, 3, 2],
    9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2], 11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1],
    13: [4, 3, 3, 3, 2, 1, 1], 14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1],
    16: [4, 3, 3, 3, 2, 1, 1, 1], 17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
    19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
}
FULL_CASTERS = {"bard", "cleric", "druid", "sorcerer", "wizard"}
HALF_CASTERS = {"paladin", "ranger", "artificer"}   # Artificer slots round up: the same table
# Eldritch Knight / Arcane Trickster (one-third casters), by Fighter or Rogue level
THIRD_CASTER_SLOTS = {3: [2], 4: [3], 5: [3], 6: [3], 7: [4, 2], 8: [4, 2], 9: [4, 2], 10: [4, 3], 11: [4, 3], 12: [4, 3],
                      13: [4, 3, 2], 14: [4, 3, 2], 15: [4, 3, 2], 16: [4, 3, 3], 17: [4, 3, 3], 18: [4, 3, 3],
                      19: [4, 3, 3, 1], 20: [4, 3, 3, 1]}
# warlock level -> (number of pact slots, slot level)
PACT_SLOTS = {1: (1, 1), 2: (2, 1), 3: (2, 2), 4: (2, 2), 5: (2, 3), 6: (2, 3), 7: (2, 4), 8: (2, 4),
              9: (2, 5), 10: (2, 5), **{l: (3, 5) for l in range(11, 17)}, **{l: (4, 5) for l in range(17, 21)}}

# SRD magic items with fixed numeric effects, keyed by API index.
KNOWN_MAGIC = {
    "ring-of-protection": {"ac": 1, "saves": 1},
    "cloak-of-protection": {"ac": 1, "saves": 1},
    "bracers-of-defense": {"ac_unarmored": 2},
    "ioun-stone-protection": {"ac": 1},
    "ioun-stone-of-protection": {"ac": 1},
    "gauntlets-of-ogre-power": {"set": {"str": 19}},
    "headband-of-intellect": {"set": {"int": 19}},
    "amulet-of-health": {"set": {"con": 19}},
}
GIANT_BELTS = {"hill": 21, "stone": 23, "frost": 23, "fire": 25, "cloud": 27, "storm": 29}


def new_uid():
    return uuid.uuid4().hex[:8]


def class_key(sheet):
    return (sheet.get("class_name") or "").strip().lower()


# ---------- sheets ----------

def blank_sheet(name="New character"):
    return {
        "name": name, "player": "", "race": "", "class_name": "", "level": 1,
        "abilities": {a: 10 for a in ABILITIES},
        "max_hp": 10, "hp": 10, "temp_hp": 0, "speed": 30,
        "prof": {"armor": [], "weapons": [], "saves": [], "skills": [], "expertise": [], "mastery": []},
        "exhaustion": 0,
        "styles": [], "spell_ability": None, "ac_misc": 0, "init_misc": 0,
        "slots": [{"max": 0, "used": 0} for _ in range(9)],
        "hit_dice_used": 0, "resources_used": {}, "subclass": "", "choices": {}, "inspiration": False,
        "inventory": [], "notes": "",
    }


def normalize(sheet):
    """Fill missing keys so older or hand-edited sheets still work."""
    base = blank_sheet()
    for k, v in base.items():
        sheet.setdefault(k, v)
    for a in ABILITIES:
        sheet["abilities"].setdefault(a, 10)
    for k in base["prof"]:
        sheet["prof"].setdefault(k, [])
    for k in ("skills", "expertise"):  # older sheets used hyphenated skill keys
        sheet["prof"][k] = sorted({skill_key(x) for x in sheet["prof"][k]})
    while len(sheet["slots"]) < 9:
        sheet["slots"].append({"max": 0, "used": 0})
    for k in ("resources_used", "choices"):
        if not isinstance(sheet.get(k), dict):
            sheet[k] = {}
    sheet["styles"] = [{"great-weapon": "great_weapon", "great weapon fighting": "great_weapon"}.get(x, x) for x in sheet["styles"]]
    for item in sheet["inventory"]:
        _repair_shield(item)
        item.setdefault("uid", new_uid())
        item.setdefault("mods", {})
        item.setdefault("bonus", 0)
        item.setdefault("qty", 1)
        item.setdefault("equipped", False)
    return sheet


def _repair_shield(item):
    """Shields added before the is_shield fix were stored as heavy body armor with AC 2."""
    a = item.get("armor") or {}
    if item.get("type") == "armor" and int(a.get("base") or 10) < 10 and SHIELD_WORD.search(item.get("name") or ""):
        item["type"] = "shield"
        item["armor"] = {"category": "Shield", "base": int(a.get("base") or 2)}


def apply_class_defaults(sheet):
    c = CLASS_DEFAULTS.get(class_key(sheet))
    if not c:
        return sheet
    armor, weapons, saves, cast, _ = c
    p = sheet["prof"]
    p["armor"] = sorted(set(p["armor"]) | set(armor))
    p["weapons"] = sorted(set(p["weapons"]) | set(weapons))
    p["saves"] = list(saves)
    if cast and not sheet.get("spell_ability"):
        sheet["spell_ability"] = cast
    return sheet


def default_slots(class_name, level, third_caster=False):
    """Slot maxima for a single-class character. Warlock pact slots are put at their slot level.
    third_caster: an Eldritch Knight or Arcane Trickster."""
    cls, level = class_name.strip().lower(), max(1, min(20, int(level)))
    out = [0] * 9
    if third_caster:
        table = THIRD_CASTER_SLOTS.get(level, [])
    elif cls in FULL_CASTERS:
        table = FULL_CASTER_SLOTS[level]
    elif cls in HALF_CASTERS:  # 2024: Paladins and Rangers cast from level 1
        table = FULL_CASTER_SLOTS[math.ceil(level / 2)]
    elif cls == "warlock":
        n, lvl = PACT_SLOTS[level]
        out[lvl - 1] = n
        return out
    else:
        table = []
    for i, n in enumerate(table):
        out[i] = n
    return out


# ---------- rests ----------

def _con_mod(sheet):
    return derive(sheet)["mods"]["con"]


def long_rest(sheet):
    """2024 Long Rest: all HP, all spent Hit Dice and spell slots back, temp HP gone, Exhaustion −1,
    class resources reset."""
    sheet = normalize(sheet)
    sheet.update(hp=sheet["max_hp"], temp_hp=0, exhaustion=max(0, int(sheet.get("exhaustion") or 0) - 1),
                 hit_dice_used=0, resources_used={})
    for slot in sheet["slots"]:
        slot["used"] = 0
    return {"rest": "long"}


def short_rest(sheet, spend=0, roll=None):
    """2024 Short Rest: spend Hit Dice (each: roll + Con modifier, at least 0) to heal; Warlock pact slots
    come back; "short" resources reset and "short1" resources regain one use. Returns a report."""
    sheet = normalize(sheet)
    roll = roll or (lambda faces: random.randint(1, faces))
    cls, level = class_key(sheet), max(1, min(20, int(sheet.get("level") or 1)))
    die = (CLASS_DEFAULTS.get(cls) or (None,) * 5)[4] or 8
    left = level - int(sheet.get("hit_dice_used") or 0)
    spend = max(0, min(int(spend or 0), left))
    con = _con_mod(sheet)
    rolls = [roll(die) for _ in range(spend)]
    healed = sum(max(0, r + con) for r in rolls)
    before = int(sheet.get("hp") or 0)
    sheet["hp"] = min(int(sheet["max_hp"]), before + healed)
    sheet["hit_dice_used"] = int(sheet.get("hit_dice_used") or 0) + spend
    if cls == "warlock":
        for slot in sheet["slots"]:
            slot["used"] = 0
    used = sheet["resources_used"]
    for r in derive(sheet)["resources"]:
        if r["recover"] == "short":
            used[r["key"]] = 0
        elif r["recover"] == "short1" and used.get(r["key"]):
            used[r["key"]] = max(0, used[r["key"]] - 1)
    return {"rest": "short", "die": die, "rolls": rolls, "con": con, "healed": sheet["hp"] - before}


# ---------- items from SRD entries ----------

def _weapon_template(w, fallback_key):
    props, mastery, versatile, ranged = [], None, None, False
    for p in w.get("properties") or []:
        prop = p.get("property") or {}
        name = (prop.get("name") or "").lower()
        if (prop.get("type") or "").lower() == "mastery":
            mastery = prop.get("name")
            continue
        props.append(name)
        if name == "versatile":
            versatile = p.get("detail")
        if name == "ammunition":
            ranged = True
    key = short_key(w.get("key")) or fallback_key
    if key == "dart":
        ranged = True
    return {
        "index": key, "category": "Simple" if w.get("is_simple") else "Martial",
        "range": "Ranged" if ranged else "Melee",
        "dice": w.get("damage_dice"), "dtype": ((w.get("damage_type") or {}).get("name") or "").lower(),
        "versatile_dice": versatile, "properties": props, "mastery": mastery,
        "range_normal": w.get("range") or None, "range_long": w.get("long_range") or None,
    }




SHIELD_WORD = re.compile(r"\bshields?\b", re.I)


def is_shield(a, item_name=""):
    """Is this armor entry a shield?

    Open5e's SRD 5.2 data labels the Shield's armor category "heavy" (with base AC 2), so the category
    can't be trusted. A shield is named like one and adds a small bonus: no body armor has a base AC
    below 11. An explicit "shield" category also counts.
    """
    cat = (a.get("category") or "").lower()
    if cat in ("shield", "shields"):
        return True
    if cat in ("light", "medium"):     # only "heavy" has been seen mislabeled
        return False
    names = f"{a.get('name') or ''} {short_key(a.get('key'))} {item_name}".replace("-", " ")
    base = a.get("ac_base")
    return bool(SHIELD_WORD.search(names)) and (base is None or int(base) < 10)


def _armor_template(a, item_name=""):
    if is_shield(a, item_name):
        return "shield", {"category": "Shield", "base": a.get("ac_base") or 2}
    return "armor", {"category": (a.get("category") or "").title(), "base": a.get("ac_base") or 10,
                     "dex_bonus": bool(a.get("ac_add_dexmod")), "max_bonus": a.get("ac_cap_dexmod"),
                     "str_min": a.get("strength_score_required") or 0,
                     "stealth_dis": bool(a.get("grants_stealth_disadvantage"))}


def item_from_srd(kind, d):
    """Build an inventory item from an Open5e (SRD 5.2) item or magic item."""
    idx = short_key(d.get("key")) or d.get("index", "")
    name = d["name"]
    item = {"uid": new_uid(), "name": name, "ref": f"{kind}:{idx}", "type": "gear",
            "equipped": False, "bonus": 0, "qty": 1, "mods": {}, "notes": "",
            "attune": bool(d.get("requires_attunement")), "attuned": False}
    w, a = d.get("weapon"), d.get("armor")
    if w:
        item["type"] = "weapon"
        item["weapon"] = _weapon_template(w, idx)
    elif a:
        item["type"], item["armor"] = _armor_template(a, name)
    elif SHIELD_WORD.search(name or "") and ((d.get("category") or {}).get("key") == "armor" or name.lower() == "shield"):
        # magic shields (Shield of Missile Attraction, Animated Shield…) come without an armor block
        item["type"], item["armor"] = "shield", {"category": "Shield", "base": 2}
    if kind == "magic-item":
        if item["type"] == "gear":
            item["type"] = "wondrous"
        bonus = re.search(r"\+(\d)", name)
        if bonus and item["type"] in ("weapon", "armor", "shield"):
            item["bonus"] = int(bonus.group(1))
        elif bonus:
            item["notes"] = (f"Add the base item from the equipment list and set its Magic bonus to +{bonus.group(1)}.")
        if idx in KNOWN_MAGIC:
            item["mods"] = dict(KNOWN_MAGIC[idx])
        belt = re.search(r"belt of (\w+) giant strength", name, re.I)
        if belt and belt.group(1).lower() in GIANT_BELTS:
            item["mods"] = {"set": {"str": GIANT_BELTS[belt.group(1).lower()]}}
    return item


# ---------- derived stats ----------

def _active_items(sheet):
    """Equipped items whose effects apply (attunement items only when attuned)."""
    return [i for i in sheet["inventory"]
            if i.get("equipped") and (not i.get("attune") or i.get("attuned"))]


def _mod_total(items, key):
    return sum(int((i.get("mods") or {}).get(key, 0) or 0) for i in items)


def _proficient_weapon(w, item_name, profs):
    profs = {p.lower() for p in profs}
    cat = w.get("category", "").lower()
    props = set(w.get("properties") or [])
    return bool(cat in profs
            or (cat == "martial" and "martial-light" in profs and "light" in props)
            or (cat == "martial" and "martial-finesse-light" in profs and props & {"finesse", "light"})
            or (w.get("index") or "").lower() in profs
            or item_name.lower().replace(" ", "-") in profs)


def _check_extra(chk, m, pb):
    """The bonus a subclass check effect adds: an ability modifier (with a minimum) or half the PB."""
    add = chk["add"]
    if add == "half_pb_up":
        return math.ceil(pb / 2)
    if add == "half_pb":
        return pb // 2
    return max(chk.get("min", -99), m[add])


def derive(sheet):
    sheet = normalize(sheet)
    level = int(sheet.get("level") or 1)
    pb = prof_bonus(level)
    cls = class_key(sheet)
    styles = {s.lower() for s in sheet.get("styles", [])}
    prof = sheet["prof"]
    active = _active_items(sheet)
    warnings = []
    exh = max(0, min(6, int(sheet.get("exhaustion") or 0)))
    pen = 2 * exh   # 2024 Exhaustion: -2 per level to every d20 Test
    if exh >= 6:
        warnings.append("Exhaustion 6: the character dies.")
    elif exh:
        warnings.append(f"Exhaustion {exh}: −{pen} to d20 Tests, −{5 * exh} ft speed.")

    # ability scores, with "set to N" items (they only raise a score)
    scores = {a: int(sheet["abilities"].get(a, 10)) for a in ABILITIES}
    score_notes = {}
    boosts, cap = subclasses.score_boosts(cls, level)   # Primal Champion, Body and Mind
    for a, n in boosts.items():
        scores[a] = min(cap, scores[a] + n)
        score_notes[a] = "class feature"
    for item in active:
        for a, v in ((item.get("mods") or {}).get("set") or {}).items():
            if a in scores and int(v) > scores[a]:
                scores[a] = int(v)
                score_notes[a] = item["name"]
    m = {a: mod(s) for a, s in scores.items()}

    # class features and subclass: their effects join the sheet's (training is added here, never written
    # into the sheet)
    sub = subclasses.effects(sheet, cls, level, pb, m)
    warnings += sub["warnings"]
    prof = {**prof, "armor": sorted(set(prof["armor"]) | set(sub["armor"])),
            "weapons": sorted(set(prof["weapons"]) | set(sub["weapons"])),
            "saves": sorted(set(prof["saves"]) | set(sub["saves"]))}

    # armor class
    armor = next((i for i in active if i.get("type") == "armor"), None)
    shield = next((i for i in active if i.get("type") == "shield"), None)
    if sum(1 for i in active if i.get("type") == "armor") > 1:
        warnings.append("More than one armor is equipped; only the first counts.")
    ac_parts = []
    if armor:
        a = armor.get("armor") or {}
        ac_parts.append((armor["name"], int(a.get("base", 10))))
        if a.get("dex_bonus"):
            dex = m["dex"] if a.get("max_bonus") is None else min(m["dex"], int(a["max_bonus"]))
            ac_parts.append(("Dexterity" + (f" (max {a['max_bonus']})" if a.get("max_bonus") is not None else ""), dex))
        if armor.get("bonus"):
            ac_parts.append((f"Magic armor +{armor['bonus']}", int(armor["bonus"])))
        cat = (a.get("category") or "").lower()
        if cat and cat not in {p.lower() for p in prof["armor"]}:
            warnings.append(f"Not proficient with {cat} armor: disadvantage on Str/Dex checks, saves and attacks; no spellcasting.")
        if a.get("str_min") and scores["str"] < int(a["str_min"]):
            warnings.append(f"{armor['name']} needs Str {a['str_min']}: speed −10 ft.")
        if "defense" in styles:
            ac_parts.append(("Defense fighting style", 1))
    else:
        # unarmored: the best of the formulas the character has
        options = [[("Unarmored", 10), ("Dexterity", m["dex"])]]
        if cls == "barbarian":
            options.append(options[0] + [("Constitution (Unarmored Defense)", m["con"])])
        elif cls == "monk" and not shield:
            options.append(options[0] + [("Wisdom (Unarmored Defense)", m["wis"])])
        for f in (sub or {}).get("ac_unarmored", []):
            if not (f["no_shield"] and shield):
                options.append([(f["name"], f["base"])] + [(ABILITY_NAMES[a], m[a]) for a in f["abilities"]])
        ac_parts += max(options, key=lambda o: sum(v for _, v in o))
    if shield:
        a = shield.get("armor") or {}
        if "shields" in {p.lower() for p in prof["armor"]}:
            ac_parts.append((shield["name"], int(a.get("base", 2)) + int(shield.get("bonus") or 0)))
        else:  # 2024: a Shield without training gives no AC
            warnings.append(f"No Shield training: {shield['name']} gives no AC.")
    for item in active:
        mods = item.get("mods") or {}
        if mods.get("ac"):
            ac_parts.append((item["name"], int(mods["ac"])))
        if mods.get("ac_unarmored") and not armor and not shield:
            ac_parts.append((item["name"], int(mods["ac_unarmored"])))
    if sheet.get("ac_misc"):
        ac_parts.append(("Other", int(sheet["ac_misc"])))
    ac = sum(v for _, v in ac_parts)

    # saves
    save_bonus = _mod_total(active, "saves") + sum(max(b["min"], m[b["add"]]) for b in sub["save_bonus"])
    saves = {}
    for a in ABILITIES:
        p = a in prof["saves"]
        saves[a] = {"bonus": m[a] + (pb if p else 0) + save_bonus - pen, "proficient": p}

    # skills
    skills = {}
    jack = cls == "bard" and level >= 2     # Jack of All Trades: half PB (rounded down) to skills you lack
    for s, a in SKILLS.items():
        exp = s in prof["expertise"]
        p = s in prof["skills"] or exp
        skills[s] = {"bonus": m[a] + (pb * 2 if exp else pb if p else pb // 2 if jack else 0) - pen, "ability": a,
                     "proficient": p, "expertise": exp}
        if jack and not p:
            skills[s]["jack"] = True
        for chk in (sub or {}).get("checks", []):
            applies = s in chk["skills"] if chk.get("skills") else a in chk.get("abilities", [])
            if applies and not (chk.get("unproficient") and p):
                extra = _check_extra(chk, m, pb)
                if extra and not (jack and not p and chk["add"].startswith("half_pb")):
                    skills[s]["bonus"] += extra
                    skills[s]["from"] = chk["from"]
    if armor and (armor.get("armor") or {}).get("stealth_dis"):
        skills["stealth"]["disadvantage"] = armor["name"]
    passive = 10 + skills["perception"]["bonus"] + pen   # passive scores aren't d20 Tests

    # speed
    speed = int(sheet.get("speed") or 30)
    if armor and (armor.get("armor") or {}).get("str_min") and scores["str"] < int(armor["armor"]["str_min"]):
        speed -= 10
    heavy = bool(armor) and ((armor.get("armor") or {}).get("category") or "").lower() == "heavy"
    speed_notes = []
    if cls == "monk" and not armor and not shield and level >= 2:
        speed += _by_level(MONK_SPEED, level)
        speed_notes.append(("Unarmored Movement", _by_level(MONK_SPEED, level)))
    if cls == "barbarian" and level >= 5 and not heavy:
        speed += 10
        speed_notes.append(("Fast Movement", 10))
    for bonus, no_heavy, no_armor in (sub or {}).get("speed_rules", []):
        if not (no_heavy and heavy) and not (no_armor and armor):
            speed += bonus
    speed = max(0, speed - 5 * exh)

    # attacks
    atk_bonus_items = _mod_total(active, "attack")
    dmg_bonus_items = _mod_total(active, "damage")
    weapons = [i for i in sheet["inventory"] if i.get("type") == "weapon" and i.get("weapon")]
    melee_equipped = [i for i in weapons if i.get("equipped") and i["weapon"].get("range") == "Melee"]
    attacks = []
    # 2024 Monk Martial Arts: while unarmored and without a shield, Monk weapons (Simple melee weapons and
    # Martial melee weapons with Light) and Unarmed Strikes can use Dex and the Martial Arts die
    martial_arts = cls == "monk" and not armor and not shield
    ma_die = _by_level(MARTIAL_ARTS_DIE, level, "1d6") if martial_arts else None
    rage = _by_level(RAGE_DAMAGE, level) if cls == "barbarian" else 0
    sneak = f"{math.ceil(level / 2)}d6" if cls == "rogue" else None
    for item in weapons:
        w = item["weapon"]
        props = set(w.get("properties") or [])
        ranged = w.get("range") == "Ranged"
        monk_weapon = martial_arts and not ranged and (
            (w.get("category") or "").lower() == "simple" or "light" in props)
        if ranged:
            ab = "dex"
        elif "finesse" in props or monk_weapon:
            ab = "dex" if m["dex"] > m["str"] else "str"
        else:
            ab = "str"
        magic = int(item.get("bonus") or 0)
        mwa = (sub or {}).get("magic_weapon_ability")    # e.g. Battle Smith: Int with magic weapons
        if mwa and magic and m[mwa] > m[ab]:
            ab = mwa
        mla = (sub or {}).get("melee_ability")           # e.g. Pact of the Blade: Cha with the pact weapon
        if mla and not ranged and m[mla] > m[ab]:
            ab = mla
        proficient = _proficient_weapon(w, item["name"], prof["weapons"])
        hit_parts = [(ABILITY_NAMES[ab], m[ab])]
        if proficient:
            hit_parts.append(("Proficiency", pb))
        if magic:
            hit_parts.append((f"Magic +{magic}", magic))
        if ranged and "archery" in styles:
            hit_parts.append(("Archery", 2))
        if atk_bonus_items:
            hit_parts.append(("Items", atk_bonus_items))
        if pen:
            hit_parts.append(("Exhaustion", -pen))
        dmg_parts = [(ABILITY_NAMES[ab], m[ab])]
        if magic:
            dmg_parts.append((f"Magic +{magic}", magic))
        if ("dueling" in styles and not ranged and "two-handed" not in props
                and item.get("equipped") and len(melee_equipped) <= 1):
            dmg_parts.append(("Dueling", 2))
        if dmg_bonus_items:
            dmg_parts.append(("Items", dmg_bonus_items))
        to_hit = sum(v for _, v in hit_parts)
        dmg_bonus = sum(v for _, v in dmg_parts)
        dice = w.get("dice")
        if monk_weapon and _avg(ma_die) > _avg(dice):
            dice = ma_die
        entry = {
            "uid": item["uid"], "name": item["name"] + (f" +{magic}" if magic else ""),
            "equipped": bool(item.get("equipped")), "ability": ab, "proficient": proficient,
            "to_hit": to_hit, "hit_parts": hit_parts, "ranged": ranged,
            "damage_dice": dice, "damage_bonus": dmg_bonus, "damage_type": w.get("dtype", ""),
            "damage": f"{dice}{signed(dmg_bonus) if dmg_bonus else ''} {w.get('dtype', '')}".strip() if dice else "special",
            "dmg_parts": dmg_parts, "range": None, "versatile": None,
            "mastery": w.get("mastery"),
            "mastery_known": (w.get("index") or "").lower() in {x.lower() for x in prof.get("mastery", [])},
        }
        if w.get("range_normal") and (ranged or "thrown" in props):
            entry["range"] = f"{w['range_normal']}/{w['range_long']} ft" if w.get("range_long") else f"{w['range_normal']} ft"
        if "versatile" in props and w.get("versatile_dice"):
            two_bonus = dmg_bonus - sum(v for k, v in dmg_parts if k == "Dueling")  # Dueling is one-handed only
            entry["versatile"] = f"{w['versatile_dice']}{signed(two_bonus) if two_bonus else ''} two-handed"
            if shield:
                entry["versatile"] += " (not with a shield)"
        if not proficient:
            entry["note"] = "Not proficient"
        if monk_weapon:
            entry["note"] = "Monk weapon (Martial Arts)"
        notes = []
        if "great_weapon" in styles and not ranged and "two-handed" in props:
            entry["gwf"] = True             # Great Weapon Fighting: damage dice 1 or 2 count as 3
            notes.append("Great Weapon Fighting: 1s and 2s on damage dice count as 3")
        if "thrown" in props and "thrown_weapon" in styles:
            notes.append("Thrown Weapon Fighting: +2 damage when thrown")
        if "light" in props:
            notes.append("Light: extra attack with a different Light weapon as a Bonus Action, "
                         + ("ability modifier to damage included (Two-Weapon Fighting)" if "two_weapon" in styles
                            else "no ability modifier to its damage unless negative"))
        if rage and ab == "str":
            entry["rage"] = rage
            notes.append(f"Rage: +{rage} damage while raging")
        if sneak and ("finesse" in props or ranged):
            entry["sneak"] = sneak
        if notes:
            entry["note"] = "; ".join(filter(None, [entry.get("note"), *notes]))
        attacks.append(entry)
    attacks.sort(key=lambda a: (not a["equipped"], a["name"]))
    # everyone can make an Unarmed Strike: Str + PB to hit, 1 + Str bludgeoning (Monks: Martial Arts;
    # Unarmed Fighting style: 1d6, or 1d8 holding no weapons or shield)
    ua = "dex" if martial_arts and m["dex"] > m["str"] else "str"
    if "unarmed" in styles:
        empty = not shield and not any(i.get("equipped") for i in weapons)
        uf_die = "1d8" if empty else "1d6"
        if _avg(uf_die) > _avg(ma_die):
            ma_die = uf_die
    ua_hit = [(ABILITY_NAMES[ua], m[ua]), ("Proficiency", pb)] + ([("Exhaustion", -pen)] if pen else [])
    attacks.append({
        "uid": "unarmed", "name": "Unarmed Strike", "equipped": True, "ability": ua, "proficient": True, "ranged": False,
        "to_hit": sum(v for _, v in ua_hit), "hit_parts": ua_hit,
        "damage_dice": ma_die, "damage_bonus": m[ua] + (0 if ma_die else 1), "damage_type": "bludgeoning",
        "damage": (f"{ma_die}{signed(m[ua]) if m[ua] else ''} bludgeoning" if ma_die
                   else f"{max(0, 1 + m[ua])} bludgeoning"),
        "dmg_parts": [(ABILITY_NAMES[ua], m[ua])] + ([] if ma_die else [("Unarmed", 1)]),
        "range": None, "versatile": None, "mastery": None, "mastery_known": False,
        "note": ("Martial Arts" if martial_arts else "Unarmed Fighting") if ma_die else "Or Grapple / Shove: DC 8 + Str + PB",
        **({"rage": rage} if rage and ua == "str" else {}),
        "unarmed": True,
    })

    # subclass attacks (armor weapons, psychic blades...), then the subclass's critical range and damage riders
    spell_ab = sheet.get("spell_ability") or (CLASS_DEFAULTS.get(cls, (None,) * 5)[3]) or (sub or {}).get("third_caster")
    for a in (sub or {}).get("attacks", []):
        ab = {"spell": spell_ab or "int", "best": "dex" if m["dex"] > m["str"] else "str"}.get(a.get("ability"), a.get("ability") or "str")
        hit = [(ABILITY_NAMES[ab], m[ab]), ("Proficiency", pb)] + ([("Exhaustion", -pen)] if pen else [])
        bonus = m[ab] if a.get("add_mod", True) else 0
        attacks.append({
            "uid": f"sub-{a['name']}", "name": a["name"], "equipped": True, "ability": ab, "proficient": True,
            "to_hit": sum(v for _, v in hit), "hit_parts": hit, "ranged": not a.get("melee"),
            "damage_dice": a["dice"], "damage_bonus": bonus, "damage_type": a["type"],
            "damage": f"{a['dice']}{signed(bonus) if bonus else ''} {a['type']}",
            "dmg_parts": [(ABILITY_NAMES[ab], bonus)], "range": a.get("range"), "versatile": None,
            "mastery": None, "mastery_known": False, "note": "; ".join(filter(None, [a["from"], a.get("note")])),
            **({"own_riders": [a["rider"]]} if a.get("rider") else {}),
            **({"sneak": sneak} if sneak and a.get("finesse") else {}),
        })
    crit = (sub or {}).get("crit", 20)
    for e in attacks:
        if crit < 20 and not e.get("spell"):
            e["crit"] = crit
        riders = list(e.pop("own_riders", []))
        for r in (sub or {}).get("riders", []):
            if r["when"] == "any" or (r["when"] == "unarmed" and e.get("unarmed")) or (
                    r["when"] in ("weapon", "melee") and (not e.get("unarmed") or r.get("unarmed"))
                    and not (r["when"] == "melee" and e["ranged"])):
                riders.append(r)
        if riders:
            e["riders"] = riders

    # spellcasting
    spell = None
    sa = sheet.get("spell_ability") or (CLASS_DEFAULTS.get(cls, (None,) * 5)[3]) or (sub or {}).get("third_caster")
    if sa in m:
        spell = {"ability": sa,
                 "dc": 8 + pb + m[sa] + _mod_total(active, "spell_dc"),
                 "attack": pb + m[sa] + _mod_total(active, "spell_attack") - pen}

    # initiative: a Dexterity check, so Dex-check bonuses from the subclass count
    init = m["dex"] + int(sheet.get("init_misc") or 0) - pen + (sub or {}).get("init", 0)
    for chk in (sub or {}).get("checks", []):
        if not chk.get("skills") and "dex" in chk.get("abilities", []):
            init += _check_extra(chk, m, pb)

    attuned = sum(1 for i in sheet["inventory"] if i.get("attune") and i.get("attuned"))
    attune_limit = _by_level(ATTUNE_LIMIT.get(cls, [(1, 3)]), level)
    if attuned > attune_limit:
        warnings.append(f"{attuned} items attuned; the limit is {attune_limit}.")

    return {
        "level": level, "prof_bonus": pb,
        "scores": scores, "mods": m, "score_notes": score_notes,
        "ac": ac, "ac_parts": ac_parts,
        "initiative": init,
        "exhaustion": exh, "mastery_slots": mastery_slots(cls, level),
        "speed": speed, "passive_perception": passive,
        "saves": saves, "skills": skills, "attacks": attacks, "spell": spell,
        "attuned": attuned, "warnings": warnings,
        "suggested_slots": default_slots(sheet.get("class_name") or "", level, bool((sub or {}).get("third_caster"))),
        "hit_dice": {"die": (CLASS_DEFAULTS.get(cls) or (None,) * 5)[4], "total": level,
                     "left": max(0, level - int(sheet.get("hit_dice_used") or 0))},
        "resources": class_resources(cls, level, m, sheet.get("resources_used"), (sub or {}).get("resources", [])),
        "attune_limit": attune_limit, "speed_notes": speed_notes,
        "crit_range": crit,
        "subclass": {**{k: sub[k] for k in ("key", "name", "source", "features", "spells", "summons", "hp_per_level")},
                     "summon_info": [{"key": k, "name": summons.SUMMONS[k]["name"], "forms": summons.SUMMONS[k]["forms"]} for k in sub["summons"]]}
        if sub["key"] else None,
        "class_source": "Tasha's" if cls == "artificer" else "PHB 2024",
        "defenses": sub["defenses"], "cdef": sub["cdef"], "ac_cond": sub["ac_cond"],
        "dex_save_adv": sub["dex_save_adv"], "auras": sub["auras"],
        "class_features": sub["class_features"], "heroic_warrior": sub["heroic_warrior"],
        # save DCs of on-hit features: Stunning Strike (Monk 5+), Cunning Strike (Rogue 5+)
        "stunning_dc": 8 + m["wis"] + pb if cls == "monk" and level >= 5 else None,
        "cunning_dc": 8 + m["dex"] + pb if cls == "rogue" and level >= 5 else None, "class_spells": sub["class_spells"], "hunters_mark_die": sub["mark_die"],
        "rage_damage": rage, "sneak_attack": sneak,
        "smite": cls == "paladin" and level >= 2,
        "hit_die": (CLASS_DEFAULTS.get(cls) or (None,) * 5)[4],
    }
