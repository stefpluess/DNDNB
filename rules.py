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
import re
import uuid

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
}
MASTERY_CLASSES = {"barbarian": 2, "fighter": 3, "paladin": 2, "ranger": 2, "rogue": 2}

FULL_CASTER_SLOTS = {
    1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3], 7: [4, 3, 3, 1], 8: [4, 3, 3, 2],
    9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2], 11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1],
    13: [4, 3, 3, 3, 2, 1, 1], 14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1],
    16: [4, 3, 3, 3, 2, 1, 1, 1], 17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
    19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
}
FULL_CASTERS = {"bard", "cleric", "druid", "sorcerer", "wizard"}
HALF_CASTERS = {"paladin", "ranger"}
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


def default_slots(class_name, level):
    """Slot maxima for a single-class character. Warlock pact slots are put at their slot level."""
    cls, level = class_name.strip().lower(), max(1, min(20, int(level)))
    out = [0] * 9
    if cls in FULL_CASTERS:
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
    for item in active:
        for a, v in ((item.get("mods") or {}).get("set") or {}).items():
            if a in scores and int(v) > scores[a]:
                scores[a] = int(v)
                score_notes[a] = item["name"]
    m = {a: mod(s) for a, s in scores.items()}

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
        ac_parts.append(("Unarmored", 10))
        ac_parts.append(("Dexterity", m["dex"]))
        if cls == "barbarian":
            ac_parts.append(("Constitution (Unarmored Defense)", m["con"]))
        elif cls == "monk" and not shield:
            ac_parts.append(("Wisdom (Unarmored Defense)", m["wis"]))
    if shield:
        a = shield.get("armor") or {}
        ac_parts.append((shield["name"], int(a.get("base", 2)) + int(shield.get("bonus") or 0)))
        if "shields" not in {p.lower() for p in prof["armor"]}:
            warnings.append("Not proficient with shields.")
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
    save_bonus = _mod_total(active, "saves")
    saves = {}
    for a in ABILITIES:
        p = a in prof["saves"]
        saves[a] = {"bonus": m[a] + (pb if p else 0) + save_bonus - pen, "proficient": p}

    # skills
    skills = {}
    for s, a in SKILLS.items():
        exp = s in prof["expertise"]
        p = s in prof["skills"] or exp
        skills[s] = {"bonus": m[a] + (pb * 2 if exp else pb if p else 0) - pen, "ability": a,
                     "proficient": p, "expertise": exp}
    passive = 10 + skills["perception"]["bonus"] + pen   # passive scores aren't d20 Tests

    # speed
    speed = int(sheet.get("speed") or 30)
    if armor and (armor.get("armor") or {}).get("str_min") and scores["str"] < int(armor["armor"]["str_min"]):
        speed -= 10
    speed = max(0, speed - 5 * exh)

    # attacks
    atk_bonus_items = _mod_total(active, "attack")
    dmg_bonus_items = _mod_total(active, "damage")
    weapons = [i for i in sheet["inventory"] if i.get("type") == "weapon" and i.get("weapon")]
    melee_equipped = [i for i in weapons if i.get("equipped") and i["weapon"].get("range") == "Melee"]
    attacks = []
    for item in weapons:
        w = item["weapon"]
        props = set(w.get("properties") or [])
        ranged = w.get("range") == "Ranged"
        if ranged:
            ab = "dex"
        elif "finesse" in props:
            ab = "dex" if m["dex"] > m["str"] else "str"
        else:
            ab = "str"
        proficient = _proficient_weapon(w, item["name"], prof["weapons"])
        magic = int(item.get("bonus") or 0)
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
        entry = {
            "uid": item["uid"], "name": item["name"] + (f" +{magic}" if magic else ""),
            "equipped": bool(item.get("equipped")), "ability": ab, "proficient": proficient,
            "to_hit": to_hit, "hit_parts": hit_parts,
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
        attacks.append(entry)
    attacks.sort(key=lambda a: (not a["equipped"], a["name"]))

    # spellcasting
    spell = None
    sa = sheet.get("spell_ability") or (CLASS_DEFAULTS.get(cls, (None,) * 5)[3])
    if sa in m:
        spell = {"ability": sa,
                 "dc": 8 + pb + m[sa] + _mod_total(active, "spell_dc"),
                 "attack": pb + m[sa] + _mod_total(active, "spell_attack") - pen}

    attuned = sum(1 for i in sheet["inventory"] if i.get("attune") and i.get("attuned"))
    if attuned > 3:
        warnings.append(f"{attuned} items attuned; the limit is 3.")

    return {
        "level": level, "prof_bonus": pb,
        "scores": scores, "mods": m, "score_notes": score_notes,
        "ac": ac, "ac_parts": ac_parts,
        "initiative": m["dex"] + int(sheet.get("init_misc") or 0) - pen,
        "exhaustion": exh, "mastery_slots": MASTERY_CLASSES.get(cls, 0),
        "speed": speed, "passive_perception": passive,
        "saves": saves, "skills": skills, "attacks": attacks, "spell": spell,
        "attuned": attuned, "warnings": warnings,
        "suggested_slots": default_slots(sheet.get("class_name") or "", level),
        "hit_die": (CLASS_DEFAULTS.get(cls) or (None,) * 5)[4],
    }
