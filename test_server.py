"""Run with:  python -m unittest test_server

Covers the server's search, static files and homebrew round trip, and the importer's safety rules.
Uses temporary databases, never your real data/ folder.
"""
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout

import db
import import_srd
import rules
import server

DOC = {"key": "srd-2024"}


def weapon_item(key, name):
    return {"key": f"srd-2024_{key}", "name": name, "document": DOC, "category": {"name": "Weapon"}, "armor": None,
            "weapon": {"key": f"srd-2024_{key}", "damage_dice": "1d8", "damage_type": {"name": "Slashing"},
                       "is_simple": False, "range": 0, "long_range": 0,
                       "properties": [{"property": {"name": "Sap", "type": "Mastery"}, "detail": None}]}}


class TempData(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (db.DATA_DIR, db.SRD_DB, db.CAMPAIGN_DB)
        db.DATA_DIR = self.tmp.name
        db.SRD_DB = os.path.join(self.tmp.name, "srd.db")
        db.CAMPAIGN_DB = os.path.join(self.tmp.name, "campaign.db")

    def tearDown(self):
        db.DATA_DIR, db.SRD_DB, db.CAMPAIGN_DB = self.saved
        self.tmp.cleanup()


class Importer(TempData):
    def test_empty_result_keeps_existing_data(self):
        conn = db.srd()
        self.assertEqual(import_srd.store(conn, "equipment", [weapon_item("longsword", "Longsword")]), 1)
        self.assertEqual(import_srd.store(conn, "equipment", []), 0)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM entries WHERE kind='equipment'").fetchone()[0], 1)

    def test_from_dir_import_and_sanity_check(self):
        src = os.path.join(self.tmp.name, "saved")
        os.makedirs(src)
        items = [weapon_item("longsword", "Longsword"),
                 {"key": "srd-2024_shield", "name": "Shield", "document": DOC, "weapon": None,
                  "armor": {"name": "Shield", "key": "srd-2024_shield", "category": "heavy", "ac_base": 2}},
                 {"key": "a5e_other", "name": "Not SRD", "document": {"key": "a5e"}}]
        with open(os.path.join(src, "items.json"), "w") as f:
            json.dump(items, f)
        out = io.StringIO()
        with redirect_stdout(out):
            import_srd.main(["--from-dir", src, "--only", "items"])
        text = out.getvalue()
        self.assertIn("stored 2 items", text)
        self.assertIn("✓ Longsword", text)
        self.assertIn("✓ Shield: shield, +2 AC", text)

    def test_filtered_to_nothing_reports_and_keeps(self):
        conn = db.srd()
        import_srd.store(conn, "equipment", [weapon_item("longsword", "Longsword")])
        conn.close()
        src = os.path.join(self.tmp.name, "saved")
        os.makedirs(src)
        with open(os.path.join(src, "items.json"), "w") as f:
            json.dump([{"key": "x_y", "name": "Other book", "document": {"key": "other"}}], f)
        out = io.StringIO()
        with redirect_stdout(out):
            import_srd.main(["--from-dir", src, "--only", "items"])
        self.assertIn("kept the existing data", out.getvalue())
        self.assertEqual(server.search(None, {"kind": ["equipment"], "q": [""]})[0]["name"], "Longsword")


class ShieldDetection(unittest.TestCase):
    def test_shield_variants(self):
        self.assertTrue(rules.is_shield({"category": "shield"}))
        self.assertTrue(rules.is_shield({"category": "Shields", "name": "Shield"}))
        self.assertTrue(rules.is_shield({"category": None}, "Shield, +1"))
        self.assertTrue(rules.is_shield({"category": "heavy", "name": "Shield", "ac_base": 2}))   # Open5e's real data
        self.assertFalse(rules.is_shield({"category": "heavy", "name": "Plate", "ac_base": 18}))
        self.assertFalse(rules.is_shield({"category": "heavy", "name": "Shield Guardian Plate", "ac_base": 18}))
        self.assertFalse(rules.is_shield({"category": "medium"}, "Shield-shaped breastplate"))


class Search(TempData):
    def setUp(self):
        super().setUp()
        conn = db.srd()
        import_srd.store(conn, "equipment", [weapon_item("longsword", "Longsword"),
                                             weapon_item("odd", "100% Pure_Steel")])
        conn.close()

    def q(self, **kw):
        return server.search(None, {k: [v] for k, v in kw.items()})

    def test_bad_limit_is_a_clean_error(self):
        with self.assertRaises(server.ApiError):
            self.q(kind="equipment", q="", limit="lots")

    def test_wildcards_match_literally(self):
        self.assertEqual([r["name"] for r in self.q(kind="equipment", q="%")], ["100% Pure_Steel"])
        self.assertEqual([r["name"] for r in self.q(kind="equipment", q="e_S")], ["100% Pure_Steel"])
        self.assertEqual(len(self.q(kind="equipment", q="")), 2)

    def test_homebrew_round_trip_and_search(self):
        made = server.create_homebrew(_Body({"name": "Grik"}), {})
        self.assertTrue(made["idx"].startswith("hb-grik-"))
        hits = self.q(kind="monster", q="gri")
        self.assertEqual([h["name"] for h in hits], ["Grik"])
        self.assertEqual(server.entry(None, {}, "monster", made["idx"])["name"], "Grik")


class SavedEncounters(TempData):
    def test_round_trip_keeps_only_setup_fields(self):
        made = server.create_saved(_Body({"name": " Goblin ambush ", "creatures": [
            {"ref": "monster:goblin-warrior", "name": "Goblin Warrior", "kind": "foe", "xp": 50, "hp": 0, "conds": [{"n": "Prone"}]},
            {"name": "", "kind": "foe"}]}), {})
        self.assertEqual(made["name"], "Goblin ambush")
        self.assertEqual(made["creatures"], [{"ref": "monster:goblin-warrior", "name": "Goblin Warrior", "kind": "foe", "xp": 50, "hp": 0}])
        self.assertEqual(made["notes"], "")
        server.update_saved(_Body({"name": "Ambush", "creatures": made["creatures"] * 2}), {}, str(made["id"]))
        listed = server.list_saved(None, {})
        self.assertEqual([(e["name"], len(e["creatures"])) for e in listed], [("Ambush", 2)])
        server.delete_saved(None, {}, str(made["id"]))
        self.assertEqual(server.list_saved(None, {}), [])

    def test_a_prepared_fight_can_start_empty_and_keeps_notes(self):
        made = server.create_saved(_Body({"name": "Bridge", "creatures": [], "notes": "Trolls under the bridge"}), {})
        self.assertEqual((made["creatures"], made["notes"]), ([], "Trolls under the bridge"))
        listed = server.list_saved(None, {})
        self.assertEqual([(e["name"], e["notes"]) for e in listed], [("Bridge", "Trolls under the bridge")])

    def test_name_is_required(self):
        with self.assertRaises(server.ApiError):
            server.create_saved(_Body({"name": "", "creatures": [{"name": "Orc"}]}), {})
        with self.assertRaises(server.ApiError):
            server.update_saved(_Body({"name": "Gone", "creatures": [{"name": "Orc"}]}), {}, "99")


class Rests(TempData):
    def test_short_rest_through_the_api(self):
        made = server.create_character(_Body({"sheet": {"name": "Vex", "class_name": "Fighter", "level": 3, "max_hp": 28, "hp": 5}}), {})
        sheet = made["sheet"]
        out = server.update_character(_Body({"sheet": sheet, "rest": "short", "hit_dice": 2}), {}, made["id"])
        self.assertEqual(out["rest"]["rest"], "short")
        self.assertEqual(len(out["rest"]["rolls"]), 2)
        self.assertEqual(out["sheet"]["hit_dice_used"], 2)
        self.assertGreater(out["sheet"]["hp"], 5)
        out = server.update_character(_Body({"sheet": out["sheet"], "rest": "long"}), {}, made["id"])
        self.assertEqual((out["sheet"]["hp"], out["sheet"]["hit_dice_used"]), (28, 0))


class Summons(TempData):
    def test_wildfire_spirit_spends_a_wild_shape(self):
        made = server.create_character(_Body({"sheet": {"name": "Ash", "class_name": "Druid", "level": 6, "subclass": "wildfire-tce",
                                                        "abilities": {"wis": 16}}}), {})
        out = server.summon(_Body({"key": "wildfire_spirit"}), {}, made["id"])
        spirit = out["creature"]
        self.assertEqual((spirit["hit_points"], spirit["armor_class"]), (5 + 5 * 6, 13))
        seed = spirit["actions"][0]["attacks"][0]
        self.assertEqual((seed["to_hit_mod"], seed["damage_bonus"]), (3 + 3, 3))     # spell attack +6, PB 3
        self.assertEqual(out["character"]["sheet"]["resources_used"]["wild_shape"], 1)
        with self.assertRaises(server.ApiError):
            server.summon(_Body({"key": "steel_defender"}), {}, made["id"])

    def test_cannon_forms_and_companion(self):
        art = server.create_character(_Body({"sheet": {"name": "Bolt", "class_name": "Artificer", "level": 9, "subclass": "artillerist-tce",
                                                       "abilities": {"int": 18}}}), {})
        cannon = server.summon(_Body({"key": "eldritch_cannon", "form": "ballista"}), {}, art["id"])["creature"]
        self.assertEqual((cannon["hit_points"], cannon["actions"][0]["attacks"][0]["damage_die_count"]), (45, 3))   # Explosive Cannon at 9
        ranger = server.create_character(_Body({"sheet": {"name": "Rook", "class_name": "Ranger", "level": 5, "subclass": "beast-master-2024",
                                                          "abilities": {"wis": 14}}}), {})
        beast = server.summon(_Body({"key": "primal_companion", "form": "sky"}), {}, ranger["id"])["creature"]
        self.assertEqual((beast["armor_class"], beast["hit_points"]), (15, 24))


class _Body:
    """Stands in for the request handler: only json_body() is used by handlers."""

    def __init__(self, body):
        self.body = body

    def json_body(self):
        return self.body


class Static(unittest.TestCase):
    def test_paths_outside_static_are_refused(self):
        sent = {}

        class Fake(server.Handler):
            def __init__(self):
                pass

            def send_json(self, obj, code=200):
                sent["code"] = code

        for path in ("/../server.py", "/..%2fserver.py", "/../static_evil/x.js"):
            sent.clear()
            Fake().send_static(path)
            self.assertEqual(sent.get("code"), 404, path)


class Caller(unittest.TestCase):
    """Only the app's own page (or a local tool) may use the API: no other website, no DNS rebinding."""

    def ok(self, headers, api=True):
        server.check_caller(headers, 8765, api)

    def refused(self, headers, api=True):
        with self.assertRaises(server.ApiError) as cm:
            server.check_caller(headers, 8765, api)
        self.assertEqual(cm.exception.status, 403)

    def test_the_app_and_local_tools_are_allowed(self):
        self.ok({"Host": "127.0.0.1:8765", "Origin": "http://127.0.0.1:8765", "Sec-Fetch-Site": "same-origin"})
        self.ok({"Host": "localhost:8765", "Origin": "http://localhost:8765"})
        self.ok({"Host": "127.0.0.1:8765"})                     # curl, a plain GET
        self.ok({})                                             # HTTP/1.0 without a Host header

    def test_other_websites_are_refused(self):
        self.refused({"Host": "127.0.0.1:8765", "Origin": "https://evil.example"})
        self.refused({"Host": "127.0.0.1:8765", "Origin": "http://localhost:3000"})        # another local app
        self.refused({"Host": "127.0.0.1:8765", "Origin": "null"})                         # sandboxed frame, file://
        self.refused({"Host": "127.0.0.1:8765", "Sec-Fetch-Site": "cross-site"})

    def test_dns_rebinding_is_refused(self):
        self.refused({"Host": "evil.example:8765"})
        self.refused({"Host": "127.0.0.1:9999"})
        self.refused({"Host": "evil.example:8765"}, api=False)

    def test_a_link_from_another_site_still_opens_the_page(self):
        self.ok({"Host": "127.0.0.1:8765", "Sec-Fetch-Site": "cross-site"}, api=False)


class Bodies(unittest.TestCase):
    def body(self, raw, length=None):
        class Fake(server.Handler):
            def __init__(self):
                self.headers = {"Content-Length": str(len(raw)) if length is None else length}
                self.rfile = io.BytesIO(raw)
        return Fake().json_body()

    def test_objects_pass_and_anything_else_is_a_clean_error(self):
        self.assertEqual(self.body(b'{"a": 1}'), {"a": 1})
        self.assertIsNone(self.body(b""))
        for raw, length in ((b"[1, 2]", None), (b"{oops", None), (b"\xff\xfe", None), (b"{}", "lots")):
            with self.assertRaises(server.ApiError, msg=raw):
                self.body(raw, length)


class RestInput(TempData):
    def test_bad_hit_dice_count_is_a_clean_error(self):
        made = server.create_character(_Body({"sheet": {"name": "Vex", "class_name": "Fighter", "level": 3}}), {})
        with self.assertRaises(server.ApiError):
            server.update_character(_Body({"sheet": made["sheet"], "rest": "short", "hit_dice": "two"}), {}, made["id"])


if __name__ == "__main__":
    unittest.main()
