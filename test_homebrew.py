"""Run with:  python -m unittest test_homebrew"""
import unittest

import homebrew


class Homebrew(unittest.TestCase):
    def test_derived_fields(self):
        d = homebrew.blank_creature("Bandit Boss")
        d["challenge_rating"] = 5
        d["ability_scores"].update(strength=16, dexterity=14, wisdom=12)
        d["_hb"].update(saves=["strength", "dexterity"], skills_text="Perception +4, Athletics +6, Nonsense +9")
        homebrew.normalize(d, "hb-x")
        self.assertEqual(d["proficiency_bonus"], 3)
        self.assertEqual(d["experience_points"], 1800)
        self.assertEqual(d["saving_throws"], {"strength": 6, "dexterity": 5})
        self.assertEqual(d["saving_throws_all"]["wisdom"], 1)
        self.assertEqual(d["skill_bonuses"], {"perception": 4, "athletics": 6})
        self.assertEqual(d["passive_perception"], 14)
        self.assertEqual(d["initiative_bonus"], 2)
        d["_hb"]["init"] = 7
        self.assertEqual(homebrew.normalize(d, "hb-x")["initiative_bonus"], 7)

    def test_attack_and_auto_description(self):
        d = homebrew.blank_creature("Ogre Chief")
        d["challenge_rating"] = 4
        d["ability_scores"]["strength"] = 19
        d["actions"] = [{"name": "Greatclub", "action_type": "ACTION", "desc": "",
                         "_hb": {"kind": "melee", "to_hit": None, "reach": "10 ft.", "dmg": "2d8+4",
                                 "dtype": "Bludgeoning", "extra": "1d6", "etype": "Fire", "autodesc": True,
                                 "usage": "", "usage_param": None}}]
        homebrew.normalize(d, "hb-x")
        atk = d["actions"][0]["attacks"][0]
        self.assertEqual(atk["to_hit_mod"], 2 + 4)               # PB + Str
        self.assertEqual((atk["damage_die_count"], atk["damage_die_type"], atk["damage_bonus"]), (2, "D8", 4))
        self.assertEqual(atk["reach"], 10)
        self.assertEqual(atk["extra_damage_die_count"], 1)
        self.assertIn("*Melee Attack Roll:* +6, reach 10 ft.", d["actions"][0]["desc"])
        self.assertIn("13 (2d8 + 4) Bludgeoning damage plus 3 (1d6) Fire damage", d["actions"][0]["desc"])
        # a hand-written description is kept
        d["actions"][0]["desc"] = "Custom text."
        d["actions"][0]["_hb"]["autodesc"] = False
        self.assertEqual(homebrew.normalize(d, "hb-x")["actions"][0]["desc"], "Custom text.")

    def test_usage_limits(self):
        d = homebrew.blank_creature()
        d["actions"][0]["_hb"].update(kind="none", usage="recharge", usage_param=5)
        homebrew.normalize(d, "hb-x")
        self.assertEqual(d["actions"][0]["usage_limits"], {"type": "RECHARGE_ON_ROLL", "param": 5})
        self.assertEqual(d["actions"][0]["attacks"], [])

    def test_copy_from_srd(self):
        src = {"key": "srd-2024_goblin-warrior", "name": "Goblin Warrior", "document": {"key": "srd-2024"},
               "size": {"name": "Small"}, "type": {"name": "Fey"}, "armor_class": 15, "hit_points": 10, "hit_dice": "3d6",
               "ability_scores": {"strength": 8, "dexterity": 15, "constitution": 10, "intelligence": 10, "wisdom": 8, "charisma": 8},
               "saving_throws": {}, "skill_bonuses": {"stealth": 6}, "initiative_bonus": 2, "challenge_rating": 0.25,
               "speed_all": {"walk": 30}, "languages": {"as_string": "Common, Goblin"},
               "actions": [{"name": "Scimitar", "desc": "orig", "action_type": "ACTION",
                            "attacks": [{"to_hit_mod": 4, "reach": 5, "range": None, "damage_die_count": 1,
                                         "damage_die_type": "D6", "damage_bonus": 2, "damage_type": {"name": "Slashing"}}]}]}
        d = homebrew.normalize(homebrew.copy_from_srd(src), "hb-y")
        self.assertEqual(d["name"], "Goblin Warrior (variant)")
        self.assertEqual(d["skill_bonuses"], {"stealth": 6})
        self.assertEqual(d["initiative_bonus"], 2)
        a = d["actions"][0]
        self.assertEqual((a["_hb"]["to_hit"], a["_hb"]["dmg"], a["desc"]), (4, "1d6+2", "orig"))
        self.assertEqual(d["document"]["key"], "homebrew")

    def test_pb(self):
        self.assertEqual([homebrew.pb_for_cr(c) for c in (0, 4, 5, 8, 9, 13, 17, 21, 25, 29, 30)],
                         [2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 9])

    def test_negative_to_hit_uses_a_typographic_minus(self):
        d = homebrew.blank_creature("Weakling")
        d["ability_scores"].update(strength=1, dexterity=1)
        d["actions"][0]["_hb"]["to_hit"] = -3
        d = homebrew.normalize(d, "hb-weak")
        self.assertIn("*Melee Attack Roll:* \u22123,", d["actions"][0]["desc"])
        self.assertEqual(d["actions"][0]["attacks"][0]["to_hit_mod"], -3)


if __name__ == "__main__":
    unittest.main()
