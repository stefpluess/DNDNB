"""Run with:  python -m unittest test_fight_import

Prepared fights as text: parsing (as another Claude chat or a DM's notes write them), matching names to
creatures, export and import back. The server part uses temporary databases, never your real data/ folder.
"""
import json
import unittest

import db
import fight_import as F
import server
from test_server import TempData, _Body

CLAUDE_STYLE = """Here are your fights for the session:

## Fight 1: Goblin Ambush
**Creatures:**
- 3 Goblin Warriors
- 1x Bugbear Warrior
- Wolf x2 (ally)
- Bandit Boss (HP 65, AC 15, XP 450, Init +2)

**Notes:**
- The goblins hide in the reeds.
- Treasure: 30 gp

## Kampf 2: Brücke
Verbündete:
2 Guard
Gegner:
Troll (TP 94, RK 15, EP 1800)
Notizen: Die Brücke ist morsch.
"""


def monster(name, hp=10, ac=12, xp=50, init=1):
    return json.dumps({"name": name, "hit_points": hp, "armor_class": ac, "experience_points": xp, "initiative_bonus": init})


class Parse(unittest.TestCase):
    def test_markdown_from_a_chat(self):
        a, b = F.parse(CLAUDE_STYLE)
        self.assertEqual(a["name"], "Goblin Ambush")
        self.assertEqual([(c["name"], c["count"], c["kind"]) for c in a["creatures"]], [
            ("Goblin Warriors", 3, "foe"), ("Bugbear Warrior", 1, "foe"), ("Wolf", 2, "ally"), ("Bandit Boss", 1, "foe")])
        self.assertEqual({k: a["creatures"][3][k] for k in ("hp", "ac", "xp", "mod")}, {"hp": 65, "ac": 15, "xp": 450, "mod": 2})
        self.assertEqual(a["notes"], "- The goblins hide in the reeds.\n- Treasure: 30 gp")
        self.assertEqual(b["name"], "Brücke")
        self.assertEqual([(c["name"], c["kind"]) for c in b["creatures"]], [("Guard", "ally"), ("Troll", "foe")])
        self.assertEqual((b["creatures"][1]["hp"], b["creatures"][1]["ac"], b["creatures"][1]["xp"]), (94, 15, 1800))
        self.assertEqual(b["notes"], "Die Brücke ist morsch.")

    def test_without_a_heading_the_first_line_names_the_fight(self):
        (f,) = F.parse("Hinterhalt im Sumpf\n3 Goblin Warrior\nSie warten im Schilf.")
        self.assertEqual((f["name"], f["creatures"][0]["count"], f["notes"]), ("Hinterhalt im Sumpf", 3, "Sie warten im Schilf."))
        (g,) = F.parse("2 Orc\n1 Ogre")
        self.assertEqual(g["name"], F.DEFAULT_NAME)

    def test_counts_and_sides_in_many_spellings(self):
        cases = {"3 Goblin": (3, "foe"), "3x Goblin": (3, "foe"), "3× Goblin": (3, "foe"), "Goblin x3": (3, "foe"),
                 "Goblin (3)": (3, "foe"), "Ally: 2 Goblin": (2, "ally"), "Verbündeter: Goblin": (1, "ally"),
                 "- 4 Goblin (Verbündete)": (4, "ally"), "1. Goblin": (1, "foe")}
        for text, want in cases.items():
            c = F.parse_creature(text)
            self.assertEqual((c["name"], c["count"], c["kind"]), ("Goblin", *want), text)

    def test_creatures_know_their_line(self):
        text = "Here they are:\n```\n# Ambush\n3 Goblin\nNotes:\nx\n```\nLet me know if you want changes!"
        (f,) = F.parse(text)                             # only the code block counts, not the chat around it
        self.assertEqual(text.split("\n")[f["creatures"][0]["line"]], "3 Goblin")
        self.assertEqual((f["name"], f["notes"]), ("Ambush", "x"))
        (g,) = F.parse("\n\n```text\n# A\n\n2 Orc\n```")
        self.assertEqual(g["creatures"][0]["line"], 5)

    def test_json_and_code_fences(self):
        text = '```json\n{"fights": [{"name": "Gate", "notes": "Night", "creatures": [{"name": "Orc", "count": 2, "side": "ally"}, "3 Goblin"]}]}\n```'
        (f,) = F.parse(text)
        self.assertEqual((f["name"], f["notes"]), ("Gate", "Night"))
        self.assertEqual([(c["name"], c["count"], c["kind"]) for c in f["creatures"]], [("Orc", 2, "ally"), ("Goblin", 3, "foe")])

    def test_odd_input_never_raises(self):
        for text in ("", "   ", "{not json", "[]", "Notes:", "# \n#", "x" * 5000, "999999 Goblin"):
            F.parse(text)
        self.assertEqual(F.parse_creature("999 Goblin")["count"], F.MAX_COUNT)


class Match(unittest.TestCase):
    SRD = {"goblin warrior": {"idx": "goblin-warrior", "name": "Goblin Warrior", "data": monster("Goblin Warrior", 10, 15, 50, 2)},
           "wolf": {"idx": "wolf", "name": "Wolf", "data": monster("Wolf", 11, 12, 50, 2)},
           "troll": {"idx": "troll", "name": "Troll", "data": monster("Troll", 94, 15, 1800, 1)}}
    HB = {"troll": {"idx": "hb-troll", "name": "Troll", "data": monster("Troll", 120, 16, 2300, 1)}}

    def test_plurals_homebrew_first_custom_and_missing(self):
        (f,) = F.resolve(F.parse("3 Goblin Warriors\n2 Wolves\n1 Troll\nBoss (HP 40, AC 14)\n2 Goblin"), self.HB, self.SRD)
        self.assertEqual([(r["status"], r["match"]) for r in f["rows"]], [
            ("srd", "Goblin Warrior"), ("srd", "Wolf"), ("homebrew", "Troll"), ("custom", None), ("missing", None)])
        self.assertEqual(f["rows"][4]["suggest"], ["Goblin Warrior"])
        self.assertEqual(f["missing"], 1)
        self.assertEqual(len(f["creatures"]), 3 + 2 + 1 + 1)        # the missing goblins are left out
        self.assertEqual(f["creatures"][0], {"ref": "monster:goblin-warrior", "name": "Goblin Warrior", "kind": "foe",
                                             "max": 10, "ac": 15, "mod": 2, "xp": 50})
        self.assertEqual(f["creatures"][5]["ref"], "monster:hb-troll")
        self.assertEqual(f["creatures"][6], {"name": "Boss", "kind": "foe", "max": 40, "ac": 14, "mod": 0, "xp": 0})

    def test_export_reads_back_the_same(self):
        saved = {"name": "Ambush", "notes": "Reeds.\nNight.", "creatures": [
            {"ref": "monster:goblin-warrior", "name": "Goblin Warrior", "kind": "foe", "max": 10, "ac": 15, "mod": 2, "xp": 50},
            {"ref": "monster:goblin-warrior", "name": "Goblin Warrior 2", "kind": "foe", "max": 10, "ac": 15, "mod": 2, "xp": 50},
            {"ref": "monster:wolf", "name": "Wolf", "kind": "ally", "max": 11, "ac": 12, "mod": 2, "xp": 50},
            {"name": "Boss", "kind": "foe", "max": 40, "ac": 14, "mod": -1, "xp": 200}]}
        (back,) = F.resolve(F.parse(F.to_text(saved)), {}, self.SRD)
        self.assertEqual((back["name"], back["notes"], back["missing"]), ("Ambush", "Reeds.\nNight.", 0))
        self.assertEqual([(c["name"], c["kind"]) for c in back["creatures"]],
                         [("Goblin Warrior", "foe"), ("Goblin Warrior", "foe"), ("Wolf", "ally"), ("Boss", "foe")])
        self.assertEqual(back["creatures"][3], {"name": "Boss", "kind": "foe", "max": 40, "ac": 14, "mod": -1, "xp": 200})


class ImportThroughTheServer(TempData):
    def setUp(self):
        super().setUp()
        with db.srd_session() as conn:
            conn.execute("INSERT INTO entries(kind, idx, name, meta, sort_key, data) VALUES ('monster', 'goblin-warrior', "
                         "'Goblin Warrior', '', 0.25, ?)", (monster("Goblin Warrior", 10, 15, 50, 2),))

    def test_preview_saves_nothing_and_save_picks_free_names(self):
        server.create_saved(_Body({"name": "Ambush", "creatures": []}), {})
        text = "# Ambush\n3 Goblin Warrior\n2 Gnoll\nNotes: Reeds"
        out = server.import_saved(_Body({"text": text}), {})
        self.assertEqual(out["created"], [])
        self.assertEqual((out["fights"][0]["total"], out["fights"][0]["missing"]), (3, 1))
        self.assertEqual(len(server.list_saved(None, {})), 1)
        out = server.import_saved(_Body({"text": text, "save": True}), {})
        self.assertEqual([f["name"] for f in out["created"]], ["Ambush 2"])
        made = [f for f in server.list_saved(None, {}) if f["name"] == "Ambush 2"][0]
        self.assertEqual((len(made["creatures"]), made["notes"]), (3, "Reeds"))
        self.assertIn("3 Goblin Warrior", server.saved_text(None, {}, str(made["id"]))["text"])

    def test_nothing_to_import(self):
        with self.assertRaises(server.ApiError):
            server.import_saved(_Body({"text": "   "}), {})


if __name__ == "__main__":
    unittest.main()
