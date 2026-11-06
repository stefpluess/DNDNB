"""Run with:  python -m unittest test_wiki

The campaign wiki: titles, [[links]], "Linked from", renaming, search and the trash.
Uses a temporary database, never your real data/ folder.
"""
import os
import tempfile
import unittest

import db
import server
import wiki


class Links(unittest.TestCase):
    def test_titles_compare_without_case_or_extra_spaces(self):
        self.assertEqual(wiki.norm("  The   Yawning Portal "), "the yawning portal")

    def test_parse_links_with_labels_once_each(self):
        body = "Met [[Durnan]] at the [[The Yawning Portal|Portal]]. [[durnan]] again. [[ ]] [[a|b|c]] [not] [[x\ny]]"
        self.assertEqual(wiki.parse_links(body), ["durnan", "the yawning portal", "a"])   # [[a|b|c]]: label "b|c"

    def test_rewrite_keeps_labels_and_other_links(self):
        body = "[[Durnan]], [[durnan|the owner]] and [[Mirt]]"
        text, n = wiki.rewrite_links(body, "Durnan", "Durnan the Wanderer")
        self.assertEqual(text, "[[Durnan the Wanderer]], [[Durnan the Wanderer|the owner]] and [[Mirt]]")
        self.assertEqual(n, 2)

    def test_bad_titles(self):
        for t in ("", "   ", "A [b]", "x|y"):
            with self.assertRaises(wiki.WikiError):
                wiki.clean_title(t)
        self.assertEqual(wiki.clean_title("  Old   Mill "), "Old Mill")


class Pages(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (db.DATA_DIR, db.SRD_DB, db.CAMPAIGN_DB)
        db.DATA_DIR = self.tmp.name
        db.CAMPAIGN_DB = os.path.join(self.tmp.name, "campaign.db")
        self.conn = db.campaign()

    def tearDown(self):
        self.conn.close()
        db.DATA_DIR, db.SRD_DB, db.CAMPAIGN_DB = self.saved
        self.tmp.cleanup()

    def page(self, title, body="", category="npc"):
        return wiki.create_page(self.conn, title, category, body)

    def test_new_pages_get_free_titles_and_unknown_categories_are_unsorted(self):
        a = wiki.create_page(self.conn)
        b = wiki.create_page(self.conn, category="nonsense")
        self.assertEqual((a["title"], b["title"], b["category"]), ("New page", "New page 2", "unsorted"))

    def test_links_and_backlinks(self):
        portal = self.page("The Yawning Portal", "Run by [[Durnan]]. See [[Undermountain]].", "location")
        durnan = self.page("Durnan", "Owns [[the yawning portal|the Portal]].")
        p = wiki.get_page(self.conn, portal["id"])
        self.assertEqual([(l["target"], l["id"]) for l in p["links"]], [("durnan", durnan["id"]), ("undermountain", None)])
        self.assertEqual(p["links"][1]["text"], "Undermountain")          # shown as written, not normalized
        self.assertEqual([b["title"] for b in p["backlinks"]], ["Durnan"])
        # a link to a page that doesn't exist yet lights up once it's created
        under = self.page("Undermountain", "", "location")
        self.assertEqual([b["title"] for b in wiki.get_page(self.conn, under["id"])["backlinks"]], ["The Yawning Portal"])

    def test_rename_rewrites_links_everywhere(self):
        durnan = self.page("Durnan", "I am [[Durnan]].")
        portal = self.page("Portal", "Ask [[durnan|the barkeep]] or [[Durnan]].", "location")
        out = wiki.update_page(self.conn, durnan["id"], title="Durnan the Wanderer")
        self.assertEqual(out["relinked"], 1)
        self.assertEqual(out["body"], "I am [[Durnan the Wanderer]].")
        self.assertEqual(wiki.get_page(self.conn, portal["id"])["body"],
                         "Ask [[Durnan the Wanderer|the barkeep]] or [[Durnan the Wanderer]].")
        self.assertEqual([b["title"] for b in out["backlinks"]], ["Portal"])

    def test_titles_are_unique_but_case_changes_are_fine(self):
        self.page("Mirt")
        other = self.page("Other")
        with self.assertRaises(wiki.WikiError) as cm:
            wiki.update_page(self.conn, other["id"], title="  mirt ")
        self.assertEqual(cm.exception.status, 409)
        mirt = wiki.search(self.conn, "mirt")[0]
        self.assertEqual(wiki.update_page(self.conn, mirt["id"], title="MIRT")["title"], "MIRT")

    def test_search_title_first_with_snippet(self):
        self.page("Laeral", "The Open Lord of Waterdeep.")
        self.page("Waterdeep", "A big city on the coast.", "location")
        hits = wiki.search(self.conn, "waterdeep")
        self.assertEqual([h["title"] for h in hits], ["Waterdeep", "Laeral"])
        self.assertIn("Open Lord of Waterdeep", hits[1]["snippet"])
        self.assertEqual(wiki.search(self.conn, "open city"), [])        # every word must match
        self.assertEqual(wiki.search(self.conn, ""), [])

    def test_trash_and_restore_never_erase(self):
        mirt = self.page("Mirt", "Old Wolf.")
        ref = self.page("Notes", "Ask [[Mirt]].")
        wiki.trash_page(self.conn, mirt["id"])
        listed = wiki.list_pages(self.conn)
        self.assertEqual(([p["title"] for p in listed["pages"]], listed["trash"]), (["Notes"], 1))
        self.assertIsNone(wiki.get_page(self.conn, ref["id"])["links"][0]["id"])     # now a missing link
        self.page("Mirt", "A different Mirt.")
        back = wiki.restore_page(self.conn, mirt["id"])
        self.assertEqual((back["title"], back["body"]), ("Mirt 2", "Old Wolf."))      # title was reused meanwhile
        with self.assertRaises(wiki.WikiError):
            wiki.update_page(self.conn, 999, body="x")

    def test_through_the_api(self):
        class Body:
            def __init__(self, b):
                self.b = b

            def json_body(self):
                return self.b
        made = server.create_wiki(Body({"title": "Session 1", "category": "session", "body": "Met [[Durnan]]."}), {})
        self.assertEqual(server.get_wiki(None, {}, str(made["id"]))["links"][0]["target"], "durnan")
        with self.assertRaises(server.ApiError) as cm:
            server.update_wiki(Body({"title": "[bad]"}), {}, str(made["id"]))
        self.assertEqual(cm.exception.status, 400)
        with self.assertRaises(server.ApiError) as cm:
            server.get_wiki(None, {}, "404")
        self.assertEqual(cm.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
