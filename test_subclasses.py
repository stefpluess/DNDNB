"""Run with:  python -m unittest test_subclasses

The subclass engine (subclasses.py) and how rules.derive applies a subclass, plus a check of every
catalog entry so a typo in the data fails here and not at the table.
"""
import unittest

import rules
import subclasses
from subclass_data import CATALOG


def char(cls, level, sub="", **abil):
    s = rules.blank_sheet("Tester")
    s.update(class_name=cls.title(), level=level, subclass=sub)
    s["abilities"].update(abil)
    rules.apply_class_defaults(s)
    return s


class Engine(unittest.TestCase):
    def test_formulas_and_dice(self):
        v = subclasses.values(11, 4, {"str": 0, "dex": 2, "con": 1, "int": 3, "wis": 4, "cha": -1})
        self.assertEqual([subclasses.value(x, v) for x in (3, "pb", "max(1, cha)", "2*pb", "5*level", [(1, 2), (10, 4)])], [3, 4, 1, 8, 55, 4])
        self.assertEqual(subclasses.dice([(3, "1d4"), (11, "1d6")], v), "1d6")
        self.assertEqual(subclasses.dice("1d6+{half}", v), "1d6+5")
        with self.assertRaises(ValueError):
            subclasses.value("__import__('os')", v)

    def test_every_catalog_entry_evaluates(self):
        mods = {a: 2 for a in ("str", "dex", "con", "int", "wis", "cha")}
        for key, sc in CATALOG.items():
            self.assertIn(sc["class"], rules.CLASS_DEFAULTS, key)
            self.assertIn(sc["source"], ("PHB 2024", "PHB 2014", "Tasha's"), key)
            names = [f["name"] for f in sc["features"]]
            self.assertEqual(len(names), len(set(names)), f"{key}: duplicate feature names")
            for level in (1, 3, 6, 10, 14, 20):
                sheet = {"subclass": key, "choices": {f["name"]: f["options"][0][0] for f in sc["features"] if f.get("options")}}
                out = subclasses.effects(sheet, sc["class"], level, rules.prof_bonus(level), mods)
                self.assertFalse([w for w in out["warnings"] if "subclass, but" in w], key)
            for f in sc["features"]:
                for o in f.get("options") or []:
                    self.assertGreaterEqual(len(o), 3, f"{key}: {f['name']} option")

    def test_catalog_for_the_editor(self):
        cat = {c["key"]: c for c in subclasses.catalog()}
        self.assertEqual(cat["armorer-tce"]["choices"][0]["options"][0], {"key": "guardian", "name": "Guardian"})


class OnTheSheet(unittest.TestCase):
    def test_champion_crit_range_by_level(self):
        s = char("fighter", 3, "champion-2024", str=16)
        self.assertEqual(rules.derive(s)["attacks"][0]["crit"], 19)
        s["level"] = 15
        self.assertEqual(rules.derive(s)["crit_range"], 18)

    def test_remarkable_athlete_2014_and_initiative(self):
        s = char("fighter", 7, "champion-2014", dex=14)        # PB 3: half rounded up = 2
        d = rules.derive(s)
        self.assertEqual(d["skills"]["acrobatics"]["bonus"], 2 + 2)
        self.assertEqual(d["initiative"], 2 + 2)
        s["prof"]["skills"] = ["acrobatics"]
        self.assertEqual(rules.derive(s)["skills"]["acrobatics"]["bonus"], 2 + 3)   # proficient: not added

    def test_fey_wanderer(self):
        s = char("ranger", 11, "fey-wanderer-2024", wis=16, cha=8)
        s["inventory"] = [{"uid": "b", "name": "Longbow", "type": "weapon", "equipped": True,
                           "weapon": {"index": "longbow", "category": "Martial", "range": "Ranged", "dice": "1d8", "dtype": "piercing", "properties": []}}]
        d = rules.derive(s)
        self.assertEqual(d["skills"]["persuasion"]["bonus"], -1 + 3)       # Cha −1, Wis +3
        bow = d["attacks"][0]
        self.assertEqual(bow["riders"], [{"dice": "1d6", "type": "psychic", "once": "turn", "name": "Dreadful Strikes", "when": "weapon"}])
        self.assertNotIn("riders", next(a for a in d["attacks"] if a["name"] == "Unarmed Strike"))   # not a weapon
        self.assertIn("Misty Step", d["subclass"]["spells"][5])

    def test_draconic_resilience_ac(self):
        s = char("sorcerer", 3, "draconic-2024", dex=14, cha=16)
        d = rules.derive(s)
        self.assertEqual(d["ac"], 10 + 2 + 3)
        self.assertEqual(d["subclass"]["hp_per_level"], 1)

    def test_armorer_models(self):
        s = char("artificer", 5, "armorer-tce", int=16)
        d = rules.derive(s)
        self.assertTrue(any(f["needs_choice"] for f in d["subclass"]["features"]))
        s["choices"] = {"Armor Model": "guardian"}
        d = rules.derive(s)
        g = next(a for a in d["attacks"] if a["name"] == "Thunder Gauntlets")
        self.assertEqual((g["to_hit"], g["damage"], g["ranged"]), (3 + 3, "1d8+3 thunder", False))
        self.assertEqual(next(r for r in d["resources"] if r["key"] == "defensive_field")["max"], 3)
        s["choices"] = {"Armor Model": "infiltrator"}
        d = rules.derive(s)
        ll = next(a for a in d["attacks"] if a["name"] == "Lightning Launcher")
        self.assertEqual((ll["range"], ll["riders"][0]["dice"]), ("90/300 ft", "1d6"))
        self.assertEqual(d["speed"], 35)

    def test_armorer_heavy_armor_training(self):
        s = char("artificer", 3, "armorer-tce", str=10)
        s["inventory"] = [{"uid": "p", "name": "Plate", "type": "armor", "equipped": True,
                           "armor": {"category": "Heavy", "base": 18, "dex_bonus": False, "str_min": 0}}]
        self.assertFalse([w for w in rules.derive(s)["warnings"] if "Not proficient" in w])
        s["subclass"] = ""
        self.assertTrue([w for w in rules.derive(s)["warnings"] if "Not proficient" in w])

    def test_battle_smith_uses_int_with_magic_weapons(self):
        s = char("artificer", 3, "battle-smith-tce", str=10, int=18)
        mace = {"uid": "m", "name": "Mace", "type": "weapon", "equipped": True, "bonus": 0,
                "weapon": {"index": "mace", "category": "Simple", "range": "Melee", "dice": "1d6", "dtype": "bludgeoning", "properties": []}}
        s["inventory"] = [mace]
        self.assertEqual(rules.derive(s)["attacks"][0]["ability"], "str")
        mace["bonus"] = 1
        a = rules.derive(s)["attacks"][0]
        self.assertEqual((a["ability"], a["to_hit"]), ("int", 4 + 2 + 1))

    def test_soulknife_blades_and_sneak_attack(self):
        s = char("rogue", 5, "soulknife-tce", dex=16)
        blade = next(a for a in rules.derive(s)["attacks"] if a["name"] == "Psychic Blade")
        self.assertEqual((blade["damage"], blade["sneak"], blade["ability"]), ("1d6+3 psychic", "3d6", "dex"))

    def test_genie_wrath_follows_the_genie_kind(self):
        s = char("warlock", 5, "genie-tce")
        s["choices"] = {"Genie Kind": "efreeti"}
        r = next(a for a in rules.derive(s)["attacks"] if a["name"] == "Unarmed Strike")["riders"][0]
        self.assertEqual((r["name"], r["dice"], r["type"]), ("Genie's Wrath", "3", "fire"))

    def test_hand_of_harm_only_on_unarmed_strikes(self):
        s = char("monk", 5, "mercy-tce", wis=16)
        s["inventory"] = [{"uid": "q", "name": "Quarterstaff", "type": "weapon", "equipped": True,
                           "weapon": {"index": "quarterstaff", "category": "Simple", "range": "Melee", "dice": "1d6", "dtype": "bludgeoning", "properties": []}}]
        atk = {a["name"]: a for a in rules.derive(s)["attacks"]}
        self.assertNotIn("riders", atk["Quarterstaff"])
        self.assertEqual(atk["Unarmed Strike"]["riders"][0]["dice"], "1d6+3")

    def test_eldritch_knight_is_a_third_caster(self):
        s = char("fighter", 7, "eldritch-knight-2024", int=14)
        d = rules.derive(s)
        self.assertEqual((d["suggested_slots"][:3], d["spell"]["ability"], d["spell"]["dc"]), ([4, 2, 0], "int", 8 + 3 + 2))
        self.assertEqual(rules.derive(char("rogue", 3, "arcane-trickster-2024"))["suggested_slots"][:2], [2, 0])

    def test_gloom_stalker_initiative_and_dreadful_strike(self):
        s = char("ranger", 3, "gloom-stalker-2024", dex=14, wis=16)
        d = rules.derive(s)
        self.assertEqual(d["initiative"], 2 + 3)
        self.assertEqual(next(r for r in d["resources"] if r["key"] == "dreadful_strike")["max"], 3)

    def test_valor_training_and_dance_ac(self):
        v = rules.derive(char("bard", 3, "valor-2024"))
        self.assertFalse([w for w in v["warnings"] if "Not proficient" in w])
        d = char("bard", 3, "dance-2024", dex=16, cha=16)
        self.assertEqual(rules.derive(d)["ac"], 10 + 3 + 3)
        d["inventory"] = [{"uid": "s", "name": "Shield", "type": "shield", "equipped": True, "armor": {"category": "Shield", "base": 2}}]
        self.assertEqual(rules.derive(d)["ac"], 10 + 3)          # no Dazzling Footwork with a shield (and no shield training)

    def test_2014_draconic_resilience_and_divine_strike(self):
        s = char("sorcerer", 1, "draconic-2014", dex=14)
        self.assertEqual(rules.derive(s)["ac"], 13 + 2)
        c = char("cleric", 8, "tempest-2014", str=14)
        c["inventory"] = [{"uid": "w", "name": "Warhammer", "type": "weapon", "equipped": True,
                           "weapon": {"index": "warhammer", "category": "Martial", "range": "Melee", "dice": "1d8", "dtype": "bludgeoning", "properties": []}}]
        d = rules.derive(c)
        hammer = d["attacks"][0]
        self.assertEqual((hammer["proficient"], hammer["riders"][0]["dice"], hammer["riders"][0]["type"]), (True, "1d8", "thunder"))

    def test_the_catalog_is_complete(self):
        from collections import Counter
        self.assertEqual(Counter(v["source"] for v in CATALOG.values()), {"PHB 2024": 48, "PHB 2014": 40, "Tasha's": 30})

    def test_wrong_class_or_level_warns(self):
        self.assertTrue([w for w in rules.derive(char("wizard", 5, "champion-2024"))["warnings"] if "Fighter subclass" in w])
        self.assertTrue([w for w in rules.derive(char("fighter", 2, "champion-2024"))["warnings"] if "starts at" in w])

    def test_class_movement_and_artificer_basics(self):
        self.assertEqual(rules.derive(char("monk", 6))["speed"], 30 + 15)
        self.assertEqual(rules.derive(char("barbarian", 5))["speed"], 40)
        a = char("artificer", 10, int=16)
        d = rules.derive(a)
        self.assertEqual((d["spell"]["ability"], d["attune_limit"], d["hit_die"]), ("int", 4, 8))
        self.assertEqual(rules.default_slots("Artificer", 1)[:1], [2])
        self.assertEqual(next(r for r in d["resources"] if r["key"] == "flash_of_genius")["max"], 3)


if __name__ == "__main__":
    unittest.main()
