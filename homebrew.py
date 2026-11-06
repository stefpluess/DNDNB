"""Homebrew creatures, stored in campaign.db in the same shape as Open5e SRD 5.2 creatures
so the stat block, search and combat tracker treat them exactly like SRD monsters.

The editor writes plain inputs into an "_hb" block (save proficiencies, skills as text,
attack fields per action). normalize() turns those into the derived 2024 stat block fields:
modifiers, saving throws, initiative, proficiency bonus and XP from CR, passive Perception,
structured attacks and an auto-written attack description.
"""
import copy
import re
import uuid

from common import ABILITY_LONG, ACTION_TYPES, SKILLS, XP_BY_CR, fmt_cr, pb_for_cr, signed, skill_key

LONG = list(ABILITY_LONG.values())


def new_idx(name):
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "creature").lower()).strip("-")[:40] or "creature"
    return f"hb-{slug}-{uuid.uuid4().hex[:5]}"


def parse_dice(expr):
    """'2d6+4' -> (2, 'D6', 4); '7' -> (None, None, 7); '' -> None."""
    s = re.sub(r"\s+", "", str(expr or "")).lower()
    if not s:
        return None
    m = re.fullmatch(r"(\d*)d(\d+)([+-]\d+)?", s)
    if m:
        return int(m.group(1) or 1), f"D{m.group(2)}", int(m.group(3) or 0)
    if re.fullmatch(r"[+-]?\d+", s):
        return None, None, int(s)
    return None


def dice_text(count, die, bonus):
    if count and die:
        base = f"{count}{str(die).lower()}"
        return base + (f" + {bonus}" if bonus > 0 else f" − {-bonus}" if bonus < 0 else "")
    return str(bonus or 0)


def average(count, die, bonus):
    if count and die:
        return max(1, count * (int(str(die)[1:]) + 1) // 2 + (bonus or 0))
    return bonus or 0


def blank_creature(name="New creature"):
    return {
        "name": name, "size": {"name": "Medium"}, "type": {"name": "Humanoid"}, "subcategory": "",
        "alignment": "neutral", "armor_class": 12, "armor_detail": "", "hit_points": 11, "hit_dice": "2d8+2",
        "speed_all": {"unit": "feet", "walk": 30, "fly": 0, "climb": 0, "swim": 0, "burrow": 0, "hover": False},
        "ability_scores": {a: 10 for a in LONG},
        "resistances_and_immunities": {"damage_vulnerabilities_display": "", "damage_resistances_display": "",
                                       "damage_immunities_display": "", "condition_immunities_display": ""},
        "blindsight_range": 0, "darkvision_range": 0, "tremorsense_range": 0, "truesight_range": 0,
        "languages": {"as_string": "Common"}, "challenge_rating": 0.5,
        "traits": [],
        "actions": [{"name": "Club", "action_type": "ACTION", "desc": "",
                     "_hb": {"kind": "melee", "to_hit": None, "reach": "5 ft.", "dmg": "1d4", "dtype": "Bludgeoning",
                             "extra": "", "etype": "", "autodesc": True, "usage": "", "usage_param": None}}],
        "_hb": {"saves": [], "skills_text": "", "init": None},
    }


def _action_hb_from_srd(a):
    """Build editor fields for an action copied from an SRD creature."""
    hb = {"kind": "none", "to_hit": None, "reach": "", "dmg": "", "dtype": "", "extra": "", "etype": "",
          "autodesc": False, "usage": "", "usage_param": None}
    atk = (a.get("attacks") or [None])[0]
    if atk and atk.get("to_hit_mod") is not None:
        hb["kind"] = "ranged" if atk.get("range") else "melee"
        hb["to_hit"] = atk["to_hit_mod"]
        if atk.get("range"):
            hb["reach"] = f"{atk['range']}/{atk['long_range']} ft." if atk.get("long_range") else f"{atk['range']} ft."
        elif atk.get("reach"):
            hb["reach"] = f"{atk['reach']} ft."
        hb["dmg"] = dice_text(atk.get("damage_die_count"), atk.get("damage_die_type"), atk.get("damage_bonus") or 0).replace(" ", "").replace("−", "-")
        hb["dtype"] = (atk.get("damage_type") or {}).get("name", "")
        if atk.get("extra_damage_die_count") or atk.get("extra_damage_bonus"):
            hb["extra"] = dice_text(atk.get("extra_damage_die_count"), atk.get("extra_damage_die_type"), atk.get("extra_damage_bonus") or 0).replace(" ", "").replace("−", "-")
            hb["etype"] = (atk.get("extra_damage_type") or {}).get("name", "")
    u = a.get("usage_limits") or {}
    t = (u.get("type") or "").upper()
    if t.startswith("RECHARGE_ON_ROLL"):
        hb["usage"], hb["usage_param"] = "recharge", u.get("param")
    elif t.startswith("PER_DAY"):
        hb["usage"], hb["usage_param"] = "day", u.get("param")
    return hb


def _attack_desc(hb, a):
    kind = "Melee" if hb["kind"] == "melee" else "Ranged"
    reach = (hb.get("reach") or ("5 ft" if hb["kind"] == "melee" else "")).strip().rstrip(".")
    if reach and not reach.endswith("ft"):
        reach += " ft"
    reach = reach + "." if reach else ""
    where = (f"reach {reach}" if hb["kind"] == "melee" else f"range {reach}") if reach else ""
    text = f"*{kind} Attack Roll:* {signed(hb['to_hit'])}{', ' + where if where else ''}"
    text += "" if text.endswith(".") else "."
    atk = (a.get("attacks") or [{}])[0]
    if atk.get("damage_die_count") or atk.get("damage_bonus"):
        c, d, b = atk.get("damage_die_count"), atk.get("damage_die_type"), atk.get("damage_bonus") or 0
        text += f" *Hit:* {average(c, d, b)} ({dice_text(c, d, b)}) {hb.get('dtype') or ''} damage".rstrip()
        if atk.get("extra_damage_die_count") or atk.get("extra_damage_bonus"):
            c, d, b = atk.get("extra_damage_die_count"), atk.get("extra_damage_die_type"), atk.get("extra_damage_bonus") or 0
            text += f" plus {average(c, d, b)} ({dice_text(c, d, b)}) {hb.get('etype') or ''} damage".rstrip()
        text += "."
    return text


def _parse_reach(text):
    nums = [int(n) for n in re.findall(r"\d+", text or "")]
    return (nums + [None, None])[:2]


def normalize(d, idx):
    """Fill derived fields in place and return d."""
    base = blank_creature(d.get("name") or "New creature")
    for k, v in base.items():
        if k not in d:
            d[k] = copy.deepcopy(v) if k not in ("actions",) else []
    for k, v in base["speed_all"].items():
        d["speed_all"].setdefault(k, v)
    for k, v in base["resistances_and_immunities"].items():
        d["resistances_and_immunities"].setdefault(k, "")
    hb = d.setdefault("_hb", {})
    if not isinstance(d.get("size"), dict):
        d["size"] = {"name": str(d.get("size") or "Medium")}
    if not isinstance(d.get("type"), dict):
        d["type"] = {"name": str(d.get("type") or "Humanoid")}
    if not isinstance(d.get("languages"), dict):
        d["languages"] = {"as_string": str(d.get("languages") or "")}

    scores = d["ability_scores"]
    for a in LONG:
        try:
            scores[a] = max(1, min(30, int(scores.get(a, 10))))
        except (TypeError, ValueError):
            scores[a] = 10
    mods = {a: (scores[a] - 10) // 2 for a in LONG}
    d["modifiers"] = mods

    try:
        cr = float(d.get("challenge_rating") or 0)
    except (TypeError, ValueError):
        cr = 0.0
    d["challenge_rating"] = cr
    pb = pb_for_cr(cr)
    d["proficiency_bonus"] = pb
    d["experience_points"] = XP_BY_CR.get(cr, XP_BY_CR.get(int(cr), 0))

    # saves: list of proficient abilities (taken from SRD values when copying)
    if hb.get("saves") is None:
        hb["saves"] = [a for a in (d.get("saving_throws") or {}) if a in LONG]
    saves = [a for a in hb["saves"] if a in LONG]
    d["saving_throws"] = {a: mods[a] + pb for a in saves}
    d["saving_throws_all"] = {a: mods[a] + (pb if a in saves else 0) for a in LONG}

    # skills as free text: "Perception +5, Stealth +6"
    if hb.get("skills_text") is None:
        hb["skills_text"] = ", ".join(f"{k.replace('_', ' ').title()} {v:+d}" for k, v in (d.get("skill_bonuses") or {}).items())
    skills = {}
    for m in re.finditer(r"([A-Za-z][A-Za-z ']*?)\s*([+-]\s*\d+)", hb["skills_text"] or ""):
        key = skill_key(m.group(1))
        if key in SKILLS:
            skills[key] = int(m.group(2).replace(" ", ""))
    d["skill_bonuses"] = skills
    d["passive_perception"] = 10 + skills.get("perception", mods["wisdom"])

    if "init" not in hb:
        auto = mods["dexterity"]
        hb["init"] = d.get("initiative_bonus") if d.get("initiative_bonus") not in (None, auto) else None
    d["initiative_bonus"] = mods["dexterity"] if hb["init"] in (None, "") else int(hb["init"])

    for t in d.get("traits") or []:
        t.setdefault("name", "")
        t.setdefault("desc", "")

    for i, a in enumerate(d.get("actions") or []):
        a.setdefault("name", "")
        a.setdefault("desc", "")
        if a.get("action_type") not in ACTION_TYPES:
            a["action_type"] = "ACTION"
        ahb = a.get("_hb") or _action_hb_from_srd(a)
        a["_hb"] = ahb
        a["order_in_statblock"] = i + 1
        a["legendary_action_cost"] = int(a.get("legendary_action_cost") or 1)
        # usage
        p = ahb.get("usage_param")
        if ahb.get("usage") == "recharge":
            a["usage_limits"] = {"type": "RECHARGE_ON_ROLL", "param": int(p or 5)}
        elif ahb.get("usage") == "day":
            a["usage_limits"] = {"type": "PER_DAY", "param": int(p or 1)}
        else:
            a["usage_limits"] = None
        # attack
        a["attacks"] = []
        if ahb.get("kind") in ("melee", "ranged"):
            if ahb.get("to_hit") in (None, ""):
                best = max(mods["strength"], mods["dexterity"]) if ahb["kind"] == "melee" else mods["dexterity"]
                ahb["to_hit_auto"] = best + pb
            else:
                ahb.pop("to_hit_auto", None)
            to_hit = int(ahb["to_hit"]) if ahb.get("to_hit") not in (None, "") else ahb["to_hit_auto"]
            dmg = parse_dice(ahb.get("dmg")) or (None, None, 0)
            extra = parse_dice(ahb.get("extra")) or (None, None, 0)
            n1, n2 = _parse_reach(ahb.get("reach"))
            atk = {"name": f"{a['name']} attack", "attack_type": "WEAPON", "to_hit_mod": to_hit,
                   "reach": (n1 or 5) if ahb["kind"] == "melee" else None,
                   "range": n1 if ahb["kind"] == "ranged" else None,
                   "long_range": n2 if ahb["kind"] == "ranged" else None,
                   "damage_die_count": dmg[0], "damage_die_type": dmg[1], "damage_bonus": dmg[2],
                   "damage_type": {"name": ahb.get("dtype") or ""},
                   "extra_damage_die_count": extra[0], "extra_damage_die_type": extra[1],
                   "extra_damage_bonus": extra[2] or None,
                   "extra_damage_type": {"name": ahb.get("etype") or ""} if ahb.get("extra") else None,
                   "distance_unit": "feet"}
            a["attacks"] = [atk]
            if ahb.get("autodesc") or not a["desc"].strip():
                ahb["autodesc"] = True
                ahb["stale"] = False
                a["desc"] = _attack_desc({**ahb, "to_hit": to_hit}, a)

    d["key"] = f"homebrew_{idx}"
    d["document"] = {"key": "homebrew", "name": "Homebrew"}
    return d


def meta(d):
    return f"Homebrew · {d['size'].get('name', '')} {d['type'].get('name', '').lower()} · CR {fmt_cr(d['challenge_rating'])}"


def copy_from_srd(src):
    d = copy.deepcopy(src)
    d["name"] = f"{src['name']} (variant)"
    for k in ("key", "document", "crossreferences", "illustration", "creaturesets", "environments"):
        d.pop(k, None)
    if "speed_all" not in d and isinstance(d.get("speed"), dict):
        d["speed_all"] = dict(d["speed"])
    d["_hb"] = {"saves": None, "skills_text": None}
    for a in d.get("actions") or []:
        a.pop("_hb", None)
    return d
