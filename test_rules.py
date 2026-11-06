"""Run with:  python -m unittest test_rules"""
import unittest

import rules


def prop(name, detail=None, mastery=False):
    return {"property": {"name": name, "type": "Mastery" if mastery else None}, "detail": detail}


def weapon(key, name, dice, dtype, simple, props, rng=0, long=0):
    return {"key": f"srd-2024_{key}", "name": name, "category": {"name": "Weapon", "key": "weapon"}, "armor": None,
            "weapon": {"key": f"srd-2024_{key}", "name": name, "damage_dice": dice,
                       "damage_type": {"name": dtype, "key": dtype.lower()}, "is_simple": simple,
                       "range": rng, "long_range": long, "properties": props}}


def armor(key, name, cat, base, dex=False, cap=None, strength=None):
    return {"key": f"srd-2024_{key}", "name": name, "weapon": None,
            "armor": {"key": f"srd-2024_{key}", "name": name, "category": cat, "ac_base": base,
                      "ac_add_dexmod": dex, "ac_cap_dexmod": cap, "strength_score_required": strength,
                      "grants_stealth_disadvantage": cat == "heavy"}}


LONGSWORD = weapon("longsword", "Longsword", "1d8", "Slashing", False, [prop("Sap", mastery=True), prop("Versatile", "1d10")])
RAPIER = weapon("rapier", "Rapier", "1d8", "Piercing", False, [prop("Finesse"), prop("Vex", mastery=True)])
SCIMITAR = weapon("scimitar", "Scimitar", "1d6", "Slashing", False, [prop("Finesse"), prop("Light"), prop("Nick", mastery=True)])
LONGBOW = weapon("longbow", "Longbow", "1d8", "Piercing", False,
                 [prop("Ammunition", "Range 150/600; Arrow"), prop("Heavy"), prop("Two-Handed"), prop("Slow", mastery=True)], 150, 600)
QUARTERSTAFF = weapon("quarterstaff", "Quarterstaff", "1d6", "Bludgeoning", True, [prop("Versatile", "1d8"), prop("Topple", mastery=True)])
PLATE = armor("plate-armor", "Plate Armor", "heavy", 18, strength=15)
HALF_PLATE = armor("half-plate-armor", "Half Plate Armor", "medium", 15, dex=True, cap=2)
# Open5e really labels the Shield's armor category "heavy" (base AC 2); the rules must still see a shield
SHIELD = armor("shield", "Shield", "heavy", 2)


def eq(kind, d, **kw):
    item = rules.item_from_srd(kind, d)
    item["equipped"] = True
    item.update(kw)
    return item


def fighter(**abil):
    s = rules.blank_sheet("Brakka")
    s["class_name"], s["level"] = "Fighter", 5
    s["abilities"].update({"str": 16, "dex": 14, "con": 14, "int": 10, "wis": 12, "cha": 8, **abil})
    rules.apply_class_defaults(s)
    return s


class Rules(unittest.TestCase):
    def test_prof_bonus(self):
        self.assertEqual([rules.prof_bonus(l) for l in (1, 4, 5, 9, 13, 17, 20)], [2, 2, 3, 4, 5, 6, 6])

    def test_item_templates(self):
        ls = rules.item_from_srd("equipment", LONGSWORD)
        self.assertEqual(ls["weapon"]["mastery"], "Sap")
        self.assertEqual(ls["weapon"]["versatile_dice"], "1d10")
        self.assertEqual(ls["weapon"]["range"], "Melee")
        self.assertEqual(rules.item_from_srd("equipment", LONGBOW)["weapon"]["range"], "Ranged")
        self.assertEqual(rules.item_from_srd("equipment", SHIELD)["type"], "shield")

    def test_plate_and_shield(self):
        s = fighter()
        s["inventory"] = [eq("equipment", PLATE), eq("equipment", SHIELD, bonus=1)]
        d = rules.derive(s)
        self.assertEqual(d["ac"], 18 + 3)
        self.assertEqual(d["speed"], 30)

    def test_heavy_armor_strength(self):
        s = fighter(str=13)
        s["inventory"] = [eq("equipment", PLATE)]
        d = rules.derive(s)
        self.assertEqual(d["speed"], 20)
        self.assertTrue(any("Str 15" in w for w in d["warnings"]))

    def test_medium_armor_dex_cap_and_defense(self):
        s = fighter(dex=18)
        s["styles"] = ["defense"]
        s["inventory"] = [eq("equipment", HALF_PLATE)]
        self.assertEqual(rules.derive(s)["ac"], 15 + 2 + 1)

    def test_unarmored_defense(self):
        s = rules.blank_sheet()
        s["class_name"] = "Monk"
        s["abilities"].update(dex=16, wis=16)
        self.assertEqual(rules.derive(s)["ac"], 10 + 3 + 3)
        s["class_name"] = "Barbarian"
        s["abilities"].update(con=14)
        self.assertEqual(rules.derive(s)["ac"], 10 + 3 + 2)

    def test_longsword_dueling_magic_mastery(self):
        s = fighter()
        s["styles"] = ["dueling"]
        s["prof"]["mastery"] = ["longsword"]
        s["inventory"] = [eq("equipment", LONGSWORD, bonus=1), eq("equipment", SHIELD)]
        atk = rules.derive(s)["attacks"][0]
        self.assertEqual(atk["to_hit"], 3 + 3 + 1)
        self.assertEqual(atk["damage"], "1d8+6 slashing")          # Str 3 + magic 1 + Dueling 2
        self.assertTrue(atk["versatile"].startswith("1d10+4"))       # no Dueling two-handed
        self.assertEqual((atk["mastery"], atk["mastery_known"]), ("Sap", True))

    def test_2024_weapon_proficiency(self):
        rogue = rules.blank_sheet()
        rogue.update(class_name="Rogue", level=1)
        rules.apply_class_defaults(rogue)
        rogue["inventory"] = [eq("equipment", RAPIER), eq("equipment", LONGSWORD)]
        prof = {a["name"]: a["proficient"] for a in rules.derive(rogue)["attacks"]}
        self.assertEqual(prof, {"Rapier": True, "Longsword": False, "Unarmed Strike": True})
        monk = rules.blank_sheet()
        monk.update(class_name="Monk")
        rules.apply_class_defaults(monk)
        monk["inventory"] = [eq("equipment", SCIMITAR), eq("equipment", RAPIER)]
        prof = {a["name"]: a["proficient"] for a in rules.derive(monk)["attacks"]}
        self.assertEqual(prof, {"Scimitar": True, "Rapier": False, "Unarmed Strike": True})

    def test_finesse_uses_better_ability(self):
        s = fighter(str=10, dex=18)
        s["inventory"] = [eq("equipment", RAPIER)]
        atk = rules.derive(s)["attacks"][0]
        self.assertEqual(atk["ability"], "dex")
        self.assertEqual(atk["to_hit"], 4 + 3)

    def test_archery_range(self):
        s = fighter()
        s["styles"] = ["archery"]
        s["inventory"] = [eq("equipment", LONGBOW)]
        atk = rules.derive(s)["attacks"][0]
        self.assertEqual(atk["to_hit"], 2 + 3 + 2)
        self.assertEqual(atk["range"], "150/600 ft")

    def test_exhaustion(self):
        s = fighter()
        s["exhaustion"] = 2
        s["inventory"] = [eq("equipment", LONGBOW)]
        d = rules.derive(s)
        self.assertEqual(d["attacks"][0]["to_hit"], 2 + 3 - 4)
        self.assertEqual(d["saves"]["str"]["bonus"], 3 + 3 - 4)
        self.assertEqual(d["initiative"], 2 - 4)
        self.assertEqual(d["speed"], 20)
        self.assertEqual(d["passive_perception"], 10 + 1)   # passive isn't a d20 Test

    def test_magic_items(self):
        s = fighter()
        ring = rules.item_from_srd("magic-item", {"key": "srd-2024_ring-of-protection", "name": "Ring of Protection",
                                                  "requires_attunement": True, "weapon": None, "armor": None})
        ring["equipped"] = True
        s["inventory"] = [ring]
        self.assertEqual(rules.derive(s)["ac"], 10 + 2)      # not attuned yet
        ring["attuned"] = True
        d = rules.derive(s)
        self.assertEqual(d["ac"], 10 + 2 + 1)
        self.assertEqual(d["saves"]["str"]["bonus"], 3 + 3 + 1)
        shield = rules.item_from_srd("magic-item", {**SHIELD, "key": "srd-2024_shield-2", "name": "Shield, +2"})
        self.assertEqual((shield["type"], shield["bonus"]), ("shield", 2))
        belt = rules.item_from_srd("magic-item", {"key": "srd-2024_belt-of-fire-giant-strength",
                                                  "name": "Belt of Fire Giant Strength", "requires_attunement": True})
        belt.update(equipped=True, attuned=True)
        s["inventory"] = [belt]
        self.assertEqual(rules.derive(s)["scores"]["str"], 25)

    def test_spellcasting_and_slots(self):
        s = rules.blank_sheet()
        s.update(class_name="Wizard", level=5)
        s["abilities"]["int"] = 18
        rules.apply_class_defaults(s)
        d = rules.derive(s)
        self.assertEqual(d["spell"], {"ability": "int", "dc": 15, "attack": 7})
        self.assertEqual(d["suggested_slots"][:3], [4, 3, 2])
        self.assertEqual(rules.default_slots("Paladin", 1)[0], 2)      # 2024: casts from level 1
        self.assertEqual(rules.default_slots("Ranger", 5)[:2], [4, 2])
        self.assertEqual(rules.default_slots("Warlock", 5)[2], 2)
        self.assertEqual(rules.default_slots("Fighter", 5), [0] * 9)

    def test_skills_expertise(self):
        s = rules.blank_sheet()
        s.update(class_name="Rogue", level=5)
        s["abilities"]["dex"] = 16
        s["prof"]["skills"] = ["perception"]
        s["prof"]["expertise"] = ["stealth"]
        d = rules.derive(s)
        self.assertEqual(d["skills"]["stealth"]["bonus"], 3 + 6)
        self.assertEqual(d["passive_perception"], 10 + 0 + 3)

    def test_shield_as_open5e_ships_it(self):
        s = fighter(dex=14)
        s["inventory"] = [eq("equipment", SHIELD)]
        d = rules.derive(s)
        self.assertEqual(d["ac"], 10 + 2 + 2)                       # unarmored 10 + Dex 2 + shield 2
        self.assertEqual([k for k, _ in d["ac_parts"]], ["Unarmored", "Dexterity", "Shield"])
        self.assertFalse(any("heavy" in w for w in d["warnings"]))

    def test_shield_without_training_gives_no_ac(self):
        s = rules.blank_sheet()
        s.update(class_name="Wizard")
        rules.apply_class_defaults(s)
        s["abilities"]["dex"] = 14
        s["inventory"] = [eq("equipment", SHIELD)]
        d = rules.derive(s)
        self.assertEqual(d["ac"], 10 + 2)
        self.assertTrue(any("No Shield training" in w for w in d["warnings"]))

    def test_monk_martial_arts(self):
        s = rules.blank_sheet()
        s.update(class_name="Monk", level=5)
        rules.apply_class_defaults(s)
        s["abilities"].update(str=8, dex=16, wis=14)
        s["inventory"] = [eq("equipment", QUARTERSTAFF), eq("equipment", RAPIER)]
        atk = {a["name"]: a for a in rules.derive(s)["attacks"]}
        staff = atk["Quarterstaff"]
        self.assertEqual((staff["ability"], staff["to_hit"], staff["damage"]), ("dex", 3 + 3, "1d8+3 bludgeoning"))   # die 1d8 at level 5
        self.assertEqual(atk["Rapier"]["proficient"], False)                         # martial, not Light: not a Monk weapon
        self.assertEqual(atk["Unarmed Strike"]["damage"], "1d8+3 bludgeoning")
        s["inventory"].append(eq("equipment", SHIELD))                                # no Martial Arts with a shield
        self.assertEqual(rules.derive(s)["attacks"][0]["ability"], "str")

    def test_unarmed_strike_for_everyone(self):
        ua = next(a for a in rules.derive(fighter())["attacks"] if a["name"] == "Unarmed Strike")
        self.assertEqual((ua["to_hit"], ua["damage"]), (3 + 3, "4 bludgeoning"))       # Str 16, PB 3; 1 + Str

    def test_weapon_mastery_grows_with_level(self):
        f = fighter()
        self.assertEqual([rules.derive({**f, "level": lv})["mastery_slots"] for lv in (1, 4, 10, 16)], [3, 4, 5, 6])
        b = {**fighter(), "class_name": "Barbarian"}
        self.assertEqual([rules.derive({**b, "level": lv})["mastery_slots"] for lv in (1, 4, 10, 20)], [2, 3, 4, 4])
        self.assertEqual(rules.derive({**f, "class_name": "Wizard"})["mastery_slots"], 0)

    def test_heavy_armor_stealth_disadvantage(self):
        s = fighter()
        s["inventory"] = [eq("equipment", PLATE)]
        self.assertEqual(rules.derive(s)["skills"]["stealth"]["disadvantage"], "Plate Armor")
        s["inventory"] = []
        self.assertNotIn("disadvantage", rules.derive(s)["skills"]["stealth"])

    def test_shield_saved_before_the_fix_is_repaired(self):
        s = fighter(dex=14)
        broken = {"uid": "x1", "name": "Shield", "type": "armor", "equipped": True, "bonus": 1,
                  "armor": {"category": "Heavy", "base": 2, "dex_bonus": False, "max_bonus": None, "str_min": 0}}
        s["inventory"] = [broken]
        d = rules.derive(s)
        self.assertEqual(s["inventory"][0]["type"], "shield")
        self.assertEqual(d["ac"], 10 + 2 + 3)                       # +2 shield, +1 magic

    def test_magic_shield_without_armor_block(self):
        item = rules.item_from_srd("magic-item", {"key": "srd-2024_shield-of-missile-attraction", "name": "Shield of Missile Attraction",
                                                  "category": {"key": "armor", "name": "Armor"}, "armor": None, "weapon": None,
                                                  "requires_attunement": True})
        self.assertEqual((item["type"], item["armor"]["base"]), ("shield", 2))

    def test_old_hyphenated_skill_keys_still_count(self):
        s = rules.blank_sheet()
        s["abilities"]["dex"] = 14
        s["prof"]["skills"] = ["sleight-of-hand", "animal-handling"]
        d = rules.derive(s)
        self.assertTrue(d["skills"]["sleight_of_hand"]["proficient"])
        self.assertTrue(d["skills"]["animal_handling"]["proficient"])
        self.assertEqual(s["prof"]["skills"], ["animal_handling", "sleight_of_hand"])

    def test_negative_bonus_uses_minus_sign(self):
        s = fighter(str=8)
        s["inventory"] = [eq("equipment", LONGSWORD)]
        self.assertEqual(rules.derive(s)["attacks"][0]["damage"], "1d8−1 slashing")


if __name__ == "__main__":
    unittest.main()
