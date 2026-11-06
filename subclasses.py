"""Subclasses: a catalog of 2024 Player's Handbook, 2014 Player's Handbook and Tasha's Cauldron subclasses,
and the code that turns a character's subclass into effects on the sheet.

Feature summaries are short descriptions in our own words, written to remind the DM what a feature does.
They are not the books' text: check the book for the exact wording.

The catalog lives in subclass_data.py. A feature is F(level, name, summary, **effects). Effects the rules understand:
  armor=[...], weapons=[...]        extra armor / weapon training ("heavy", "martial", "shields")
  ac_unarmored=(base, [abilities])  an unarmored AC formula (no armor; shields allowed unless no_shield=True)
  crit=19                           critical hit on this natural roll or higher (weapon attacks)
  resource=(key, name, max, recover)  a limited use; max is an int, (level, n) steps or a formula string
  rider=dict(...)                   extra damage offered on a hit: dice, type, once ("turn"), when
                                    ("weapon", "melee", "any"), needs (a condition, e.g. "Raging")
  check=dict(abilities, add, min)   bonus to ability checks of some abilities (add: an ability or "half_pb")
  init="wis"                        add an ability modifier (or "pb") to initiative
  speed=10                          walking speed bonus (no_heavy=True: not in heavy armor)
  attack=dict(...)                  an extra attack entry (armor weapons, psychic blades...)
  magic_weapon_ability="int"        attack and damage with magic weapons may use this ability
  hp_per_level=1                    extra maximum HP per class level (shown as a reminder: max HP is typed in)
  spells={level: [names]}           spells always prepared from that class level
  summon="key"                      can summon a creature (see summons in rules.py)
  third_caster="int"                one-third caster (Eldritch Knight, Arcane Trickster): slots and casting ability
  saves=["wis", "cha"]              extra saving throw proficiencies
  save_bonus="cha"                  add an ability modifier (minimum +1) to every saving throw (Aura of Protection)
  scores={"str": 4}, score_max=25   ability score increases with a higher cap (class features only)
  mark_die="1d10"                   Hunter's Mark's damage die (Foe Slayer)
  melee_ability="cha"               melee weapons may use this ability (Pact of the Blade)
  check=dict(skills=[...], ...)     a check bonus limited to some skills
  resist=[...], immune=[...], cond_immune=[...]   damage resistances / immunities and condition immunities;
                                    with needs="Raging" they apply only while that condition is set
  ac_bonus=dict(add="int", min=1, needs="Bladesong")  AC bonus while a condition is set
  dex_save_adv=True                 Advantage on Dex saves unless Incapacitated (Danger Sense)
  aura=dict(name="Aura of Protection", value="cha")   an aura the character can extend to allies in combat
  save_adv=["int", "wis", "cha"]    Advantage on those saving throws (Gnomish Cunning)
  unarmed_die="1d4"                 Unarmed Strike damage die (Tavern Brawler)
  dr=dict(types=[...], amount="pb", heavy=True)   damage reduction (Heavy Armor Master: only in heavy armor)
  medium_dex_cap=3                  medium armor allows this much Dex (Medium Armor Master)
  ignore_cover=True                 attacks ignore half and three-quarters cover (Sharpshooter)
  cheat_death=dict(key, hp)         drop to `hp` instead of 0 while the resource `key` has a use (Relentless Endurance)
  long_rest_inspiration=True        Heroic Inspiration after every Long Rest (Human Resourceful)
  rider when="heavy"                only on weapons with the Heavy property (Great Weapon Master)
Species, backgrounds and feats (subclass_data/origins.py) run through the same engine.
Class features use the same keys; they live in subclass_data/classes.py.
  options=[(key, name, summary, {effects}), ...]  a choice the player makes; the chosen option's effects apply
Formulas use: level, pb, half (level // 2), str, dex, con, int, wis, cha (modifiers), and max(...).
Dice templates use the same names in braces: "1d6+{half}".
"""
import re


from subclass_data import CATALOG as SUBCLASSES  # the data, written with F() and S() from that module
from subclass_data import SUPERSEDED
from subclass_data.classes import CLASS_FEATURES
from subclass_data.origins import BACKGROUNDS, FEATS, SPECIES


# ---------- evaluating formulas ----------

_FORMULA = re.compile(r"^[\w\s+\-*/(),]+$")
_NAMES = {"level", "pb", "half", "str", "dex", "con", "int", "wis", "cha", "max", "min"}


def values(level, pb, mods):
    return {"level": level, "pb": pb, "half": level // 2, **mods}


def value(spec, v):
    """An int, (level, n) steps, or a formula string, evaluated for the character."""
    if spec is None:
        return 0
    if isinstance(spec, (int, float)):
        return int(spec)
    if isinstance(spec, list):
        return next((n for lv, n in reversed(spec) if v["level"] >= lv), 0)
    if not _FORMULA.match(spec) or set(re.findall(r"[a-z_]+", spec)) - _NAMES:
        raise ValueError(f"bad formula: {spec}")
    return int(eval(spec, {"__builtins__": {}}, {**v, "max": max, "min": min}))  # names checked above


def dice(spec, v):
    """A dice template ("1d6+{half}") or (level, template) steps, filled in for the character."""
    if isinstance(spec, list):
        spec = next((d for lv, d in reversed(spec) if v["level"] >= lv), spec[0][1])
    return re.sub(r"\{(\w+)\}", lambda m: str(v[m.group(1)]), spec).replace("+-", "-").replace("+0", "")


# ---------- the catalog for the front end ----------

def catalog():
    """Subclass choices for the sheet editor: [{key, class, name, source, choices: [{feature, name, options}]}]."""
    out = []
    for key, sc in SUBCLASSES.items():
        choices = [{"feature": f["name"], "level": f["level"], "options": [{"key": k, "name": n} for k, n, *_ in f["options"]]}
                   for f in sc["features"] if f.get("options")]
        new = SUPERSEDED.get(key)
        out.append({"key": key, "class": sc["class"], "name": sc["name"], "source": sc["source"], "choices": choices,
                    "superseded_by": new, "rules": "2024" if sc["source"] == "PHB 2024" else "2014"})
    return sorted(out, key=lambda s: (s["class"], s["name"], s["source"]))


# ---------- a character's class and subclass ----------

def _features(fs, level, choices, out_list, out, v):
    """Run a feature list: list each for display and collect the effects of those gained."""
    for f in fs:
        gained = level >= f["level"]
        chosen = None
        if f.get("options"):
            key = choices.get(f["name"])
            chosen = next((o for o in f["options"] if o[0] == key), None)
        out_list.append({"level": f["level"], "name": f["name"], "text": f["text"], "gained": gained,
                         "choice": chosen[1] if chosen else None, "choice_text": chosen[2] if chosen else None,
                         "needs_choice": bool(f.get("options")) and not chosen})
        if gained:
            for eff in [f] + ([chosen[3]] if chosen and len(chosen) > 3 else []):
                _collect(out, eff, v, f["name"])


def effects(sheet, cls, level, pb, mods):
    """What the character's class features and subclass give at its level.

    Always returns a dict: `key`, `name`, `source` describe the subclass (None without one), `features`
    are the subclass's features and `class_features` the class's, for display; the rest are the collected
    effects: armor, weapons, ac_unarmored, crit, resources, riders, checks, init, speed_rules, attacks,
    magic_weapon_ability, melee_ability, hp_per_level, spells, summons, third_caster, saves, save_bonus,
    scores, mark_die, warnings.
    """
    v = values(level, pb, mods)
    choices = sheet.get("choices") or {}
    out = {"key": None, "name": None, "source": None, "features": [], "class_features": [], "warnings": [],
           "armor": [], "weapons": [], "ac_unarmored": [], "crit": 20, "resources": [], "riders": [], "checks": [],
           "init": 0, "attacks": [], "magic_weapon_ability": None, "melee_ability": None, "hp_per_level": 0,
           "spells": {}, "summons": [], "third_caster": None, "saves": [], "save_bonus": [], "scores": {}, "mark_die": None,
           "defenses": {"resist": [], "immune": [], "vuln": [], "condImmune": []}, "cdef": [], "ac_cond": [],
           "dex_save_adv": None, "auras": [], "heroic_warrior": False, "origin_features": [],
           "save_adv": [], "unarmed_die": None, "dr": [], "medium_dex_cap": None, "ignore_cover": False, "cheat_death": [],
           "long_rest_inspiration": False}
    _features(CLASS_FEATURES.get(cls, []), level, choices, out["class_features"], out, v)
    out["class_spells"], out["spells"] = out["spells"], {}          # the class's always-prepared spells, shown apart
    # species, then the background's Origin feat and the chosen feats (character level gates species traits)
    sp = SPECIES.get(sheet.get("species") or "")
    if sp:
        _features(sp[1], level, choices, out["origin_features"], out, v)
    for key in feat_keys(sheet):
        _features(FEATS[key][2], level, choices, out["origin_features"], out, v)
    out["origin_spells"], out["spells"] = out["spells"], {}
    sc = SUBCLASSES.get(sheet.get("subclass") or "")
    if not sc:
        return out
    out.update(key=sheet["subclass"], name=sc["name"], source=sc["source"])
    if sc["class"] != cls:
        out["warnings"].append(f"{sc['name']} is a {sc['class'].title()} subclass, but the class is {cls.title() or 'not set'}.")
        return out
    new = SUPERSEDED.get(sheet["subclass"])
    if new:
        n = SUBCLASSES[new]
        out["warnings"].append(f"Older version: {sc['name']} ({sc['source']}) has a 2024 version, {n['name']} ({n['source']}).")
    if level < sc["level"]:
        out["warnings"].append(f"{sc['name']} starts at {sc['class'].title()} level {sc['level']}.")
    _features(sc["features"], level, choices, out["features"], out, v)
    return out


def feat_keys(sheet):
    """The character's feats: the background's Origin feat first, then the ones picked (no duplicates)."""
    bg = BACKGROUNDS.get(sheet.get("background") or "")
    keys = ([bg[1]] if bg else []) + [k for k in (sheet.get("feats") or []) if k in FEATS]
    return list(dict.fromkeys(keys))


def origin_catalog():
    """Species, backgrounds and feats for the sheet editor, with the choices each asks for."""
    ch = lambda fs: [{"feature": f["name"], "level": f["level"], "options": [{"key": k, "name": n} for k, n, *_ in f["options"]]}
                     for f in fs if f.get("options")]
    return {
        "species": [{"key": k, "name": n, "choices": ch(fs)} for k, (n, fs) in SPECIES.items()],
        "backgrounds": [{"key": k, "name": n, "feat": f, "grants": g} for k, (n, f, g) in BACKGROUNDS.items()],
        "feats": [{"key": k, "name": n, "category": c, "choices": ch(fs)} for k, (n, c, fs) in FEATS.items()],
    }


def score_boosts(cls, level):
    """Ability score increases from class features (Primal Champion, Body and Mind): ({ability: n}, cap)."""
    boosts, cap = {}, 20
    for f in CLASS_FEATURES.get(cls, []):
        if level >= f["level"] and f.get("scores"):
            for a, n in f["scores"].items():
                boosts[a] = boosts.get(a, 0) + n
            cap = max(cap, f.get("score_max", 20))
    return boosts, cap


def class_catalog():
    """Class feature choices for the sheet editor: {class: [{feature, level, options: [{key, name}]}]}."""
    return {cls: [{"feature": f["name"], "level": f["level"], "options": [{"key": k, "name": n} for k, n, *_ in f["options"]]}
                  for f in fs if f.get("options")] for cls, fs in CLASS_FEATURES.items()}


def _collect(out, e, v, feature):
    if any(k in e for k in ("resist", "immune", "cond_immune")):
        g = {"resist": e.get("resist", []), "immune": e.get("immune", []), "condImmune": e.get("cond_immune", [])}
        if e.get("needs"):
            out["cdef"].append({"needs": e["needs"], **g, "from": feature})
        else:
            for k, xs in g.items():
                out["defenses"][k] = sorted(set(out["defenses"][k]) | set(xs))
    if "ac_bonus" in e:
        b = e["ac_bonus"]
        out["ac_cond"].append({"needs": b["needs"], "ac": max(b.get("min", -99), v[b["add"]]) if b.get("add") else b["ac"], "from": feature})
    out["save_adv"] += e.get("save_adv", [])
    if "unarmed_die" in e:
        out["unarmed_die"] = e["unarmed_die"]
    if "dr" in e:
        out["dr"].append({**e["dr"], "amount": value(e["dr"]["amount"], v), "from": feature})
    if "medium_dex_cap" in e:
        out["medium_dex_cap"] = e["medium_dex_cap"]
    if e.get("ignore_cover"):
        out["ignore_cover"] = True
    if "cheat_death" in e:
        out["cheat_death"].append({"key": e["cheat_death"]["key"], "hp": value(e["cheat_death"]["hp"], v), "from": feature})
    if e.get("long_rest_inspiration"):
        out["long_rest_inspiration"] = True
    if e.get("heroic_warrior"):
        out["heroic_warrior"] = True
    if e.get("dex_save_adv"):
        out["dex_save_adv"] = feature
    if "aura" in e:
        out["auras"].append({"name": e["aura"]["name"], "v": max(1, v[e["aura"]["value"]]) if e["aura"].get("value") else None, "from": feature})
    out["armor"] += e.get("armor", [])
    out["weapons"] += e.get("weapons", [])
    out["saves"] += e.get("saves", [])
    if "save_bonus" in e:
        out["save_bonus"].append({"from": feature, "add": e["save_bonus"], "min": e.get("save_min", 1)})
    if "mark_die" in e:
        out["mark_die"] = e["mark_die"]
    if "melee_ability" in e:
        out["melee_ability"] = e["melee_ability"]
    if "ac_unarmored" in e:
        base, abil = e["ac_unarmored"]
        out["ac_unarmored"].append({"name": feature, "base": base, "abilities": abil, "no_shield": e.get("no_shield", False)})
    if "crit" in e:
        out["crit"] = min(out["crit"], e["crit"])
    if "resource" in e:
        key, name, mx, rec = e["resource"]
        n = value(mx, v)
        if n > 0:
            out["resources"] = [r for r in out["resources"] if r[0] != key] + [(key, name, n, rec)]
    if "rider" in e:
        r = dict(e["rider"])
        r["dice"] = dice(r["dice"], v)
        r.setdefault("name", feature)
        r.setdefault("when", "weapon")
        out["riders"] = [x for x in out["riders"] if x["name"] != r["name"]] + [r]
    if "check" in e:
        out["checks"].append({**e["check"], "from": feature})
    if "init" in e:
        out["init"] += value(e["init"], v)
    if "speed" in e:
        out["speed_rules"] = out.get("speed_rules", []) + [(e["speed"], e.get("no_heavy", False), e.get("no_armor", False))]
    if "attack" in e:
        a = dict(e["attack"])
        a["dice"] = dice(a["dice"], v)
        if a.get("rider"):
            a["rider"] = {**a["rider"], "dice": dice(a["rider"]["dice"], v)}
        a.setdefault("from", feature)
        out["attacks"].append(a)
    if "magic_weapon_ability" in e:
        out["magic_weapon_ability"] = e["magic_weapon_ability"]
    out["hp_per_level"] += e.get("hp_per_level", 0)
    for lv, names in (e.get("spells") or {}).items():
        if v["level"] >= lv:
            out["spells"].setdefault(lv, []).extend(names)
    if "summon" in e:
        out["summons"].append(e["summon"])
    if "third_caster" in e:
        out["third_caster"] = e["third_caster"]
