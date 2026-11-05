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


if __name__ == "__main__":
    unittest.main()
