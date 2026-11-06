"""Creatures a subclass summons: Wildfire Spirit (Circle of Wildfire), Steel Defender (Battle Smith),
Eldritch Cannon (Artillerist) and Primal Companion (2024 Beast Master).

build(key, sheet, derived, form) returns a creature in the same shape as SRD monsters (Open5e v2), so the
tracker shows its stat block and rolls its attacks like any monster. Its numbers come from the summoner:
level, proficiency bonus, spell attack and modifiers. Check them against the book (the 2024 Primal
Companion especially).
"""
from common import ABILITY_LONG, mod

SUMMONS = {
    "wildfire_spirit": {"name": "Wildfire Spirit", "cost": "wild_shape", "forms": None},
    "steel_defender": {"name": "Steel Defender", "cost": None, "forms": None},
    "eldritch_cannon": {"name": "Eldritch Cannon", "cost": "eldritch_cannon",
                        "forms": [("flamethrower", "Flamethrower"), ("ballista", "Force Ballista"), ("protector", "Protector")]},
    "primal_companion": {"name": "Primal Companion", "cost": None,
                         "forms": [("land", "Beast of the Land"), ("sea", "Beast of the Sea"), ("sky", "Beast of the Sky")]},
}


def _creature(name, size, ctype, ac, hp, speed, scores, actions, traits=(), immune="", cond_immune="", resist="", note=""):
    mods = {ABILITY_LONG[a]: mod(v) for a, v in scores.items()}
    return {
        "name": name, "size": {"name": size}, "type": {"name": ctype}, "alignment": "summoned",
        "armor_class": ac, "armor_detail": note, "hit_points": hp, "hit_dice": "",
        "speed_all": {"walk": 0, "unit": "feet", **speed},
        "ability_scores": {ABILITY_LONG[a]: v for a, v in scores.items()}, "modifiers": mods,
        "saving_throws": {}, "saving_throws_all": dict(mods), "skill_bonuses": {},
        "passive_perception": 10 + mods["wisdom"], "initiative_bonus": mods["dexterity"],
        "languages": {"as_string": "understands the languages of its creator"},
        "challenge_rating": 0, "experience_points": 0, "proficiency_bonus": None,
        "resistances_and_immunities": {"damage_immunities_display": immune, "condition_immunities_display": cond_immune,
                                       "damage_resistances_display": resist, "damage_vulnerabilities_display": ""},
        "traits": [{"name": n, "desc": d} for n, d in traits],
        "actions": [dict(a, order_in_statblock=i + 1) for i, a in enumerate(actions)],
        "summoned": True,
    }


def _attack(name, kind, desc, to_hit, dice, bonus, dtype, action_type="ACTION", reach=None, rng=None):
    n, d = dice.split("d")
    return {"name": name, "action_type": action_type, "desc": desc,
            "attacks": [{"name": name, "attack_type": kind, "to_hit_mod": to_hit, "reach": reach, "range": rng,
                         "damage_die_count": int(n or 1), "damage_die_type": f"D{d}", "damage_bonus": bonus,
                         "damage_type": {"name": dtype}}]}


def _act(name, desc, action_type="ACTION"):
    return {"name": name, "action_type": action_type, "desc": desc, "attacks": []}


def build(key, sheet, derived, form=None):
    level = int(sheet.get("level") or 1)
    pb = derived["prof_bonus"]
    m = derived["mods"]
    spell_atk = (derived.get("spell") or {}).get("attack", pb + m["int"])
    owner = sheet.get("name") or "its creator"
    if key == "wildfire_spirit":
        return _creature(f"Wildfire Spirit ({owner})", "Small", "Elemental", 13, 5 + 5 * level, {"walk": 30, "fly": 30, "hover": True},
                         {"str": 10, "dex": 14, "con": 14, "int": 13, "wis": 15, "cha": 11}, [
            _attack("Flame Seed", "SPELL", f"Ranged attack using {owner}'s spell attack modifier, range 60 ft.", spell_atk, "1d6", pb, "Fire", rng=60),
            _act("Fiery Teleportation", f"The spirit and each willing creature of {owner}'s choice within 5 ft teleport up to 15 ft; each other creature within 5 ft of where the spirit left makes a Dex save against {owner}'s spell DC or takes 1d6 + {pb} fire damage."),
        ], traits=[("Summoned", f"Acts on {owner}'s turn; dodges unless commanded (Bonus Action). Lasts 1 hour, until 0 HP, or until summoned again.")],
            immune="Fire", cond_immune="Charmed, Frightened, Grappled, Prone, Restrained", note="natural armor")
    if key == "steel_defender":
        hp = 2 + m["int"] + 5 * level
        bonus_ac = 2 if level >= 15 else 0
        return _creature(f"Steel Defender ({owner})", "Medium", "Construct", 15 + bonus_ac, hp, {"walk": 40},
                         {"str": 14, "dex": 12, "con": 14, "int": 4, "wis": 10, "cha": 6}, [
            _attack("Force-Empowered Rend", "SPELL", f"Melee attack using {owner}'s spell attack modifier, reach 5 ft.", spell_atk, "1d8", pb, "Force", reach=5),
            _act("Repair (3/Day)", f"Mends a construct or object within 5 ft: it regains 2d8 + {pb} HP."),
            _act("Deflect Attack", "Reaction: impose Disadvantage on an attack against a creature within 5 ft (other than itself)"
                 + (f"; on a miss the attacker takes 1d4 + {m['int']} force." if level >= 15 else "."), "REACTION"),
        ], traits=[("Vigilant", "Can't be surprised."), ("Summoned", f"Acts on {owner}'s turn; takes the Dodge action unless commanded (Bonus Action).")],
            immune="Poison", cond_immune="Charmed, Exhaustion, Poisoned", note="natural armor")
    if key == "eldritch_cannon":
        extra = "+1d8 (Explosive Cannon) " if level >= 9 else ""
        dice = "3d8" if level >= 9 else "2d8"
        form = form or "flamethrower"
        acts = {
            "flamethrower": _act("Flamethrower", f"15-ft cone: Dex save against {owner}'s spell DC, {dice} fire on a failure (half on a success); ignites unattended flammable objects."),
            "ballista": _attack("Force Ballista", "SPELL", f"Ranged attack using {owner}'s spell attack modifier, range 120 ft; a hit pushes the target 5 ft.", spell_atk, dice, 0, "Force", rng=120),
            "protector": _act("Protector", f"Creatures of {owner}'s choice within 10 ft gain 1d8 + {max(1, m['int'])} temp HP."),
        }
        return _creature(f"Eldritch Cannon: {dict(SUMMONS['eldritch_cannon']['forms'])[form]} ({owner})", "Small", "Object", 18, 5 * level,
                         {"walk": 15, "climb": 15}, {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10},
                         [acts[form], _act("Detonate" if level >= 9 else "Dismiss", "Action: the cannon explodes, 3d8 force to creatures within 20 ft (Dex save for half)." if level >= 9 else "The cannon vanishes.")],
                         traits=[("Cannon", f"Activated with {owner}'s Bonus Action. {extra}Lasts 1 hour or until 0 HP.")],
                         immune="Poison, Psychic", cond_immune="all conditions")
    if key == "primal_companion":
        wis = m["wis"]
        form = form or "land"
        if form == "land":
            return _creature(f"Beast of the Land ({owner})", "Medium", "Beast", 13 + wis, 5 + 5 * level, {"walk": 40, "climb": 40},
                             {"str": 14, "dex": 14, "con": 15, "int": 8, "wis": 14, "cha": 11},
                             [_attack("Beast's Strike", "WEAPON", f"Melee attack using {owner}'s spell attack modifier, reach 5 ft; bludgeoning, piercing or slashing.", spell_atk, "1d8", 2 + wis, "Piercing", reach=5)],
                             traits=[("Charge", "If it moves 20 ft straight toward a target and hits with Beast's Strike, +1d6 damage, and a Large or smaller target makes a Str save or falls Prone."),
                                     ("Primal Bond", f"Add {owner}'s PB to its ability checks and saves. Acts on {owner}'s turn; dodges unless commanded.")])
        if form == "sea":
            return _creature(f"Beast of the Sea ({owner})", "Medium", "Beast", 13 + wis, 5 + 5 * level, {"walk": 5, "swim": 60},
                             {"str": 14, "dex": 14, "con": 15, "int": 8, "wis": 14, "cha": 11},
                             [_attack("Beast's Strike", "WEAPON", f"Melee attack using {owner}'s spell attack modifier, reach 5 ft; a hit can grapple.", spell_atk, "1d6", 2 + wis, "Bludgeoning", reach=5)],
                             traits=[("Amphibious", "Breathes air and water."), ("Primal Bond", f"Add {owner}'s PB to its ability checks and saves.")])
        return _creature(f"Beast of the Sky ({owner})", "Small", "Beast", 13 + wis, 4 + 4 * level, {"walk": 10, "fly": 60},
                         {"str": 6, "dex": 16, "con": 13, "int": 8, "wis": 14, "cha": 11},
                         [_attack("Beast's Strike", "WEAPON", f"Melee attack using {owner}'s spell attack modifier, reach 5 ft.", spell_atk, "1d4", 3 + wis, "Slashing", reach=5)],
                         traits=[("Flyby", "Doesn't provoke Opportunity Attacks when it flies out of reach."), ("Primal Bond", f"Add {owner}'s PB to its ability checks and saves.")])
    raise KeyError(key)
