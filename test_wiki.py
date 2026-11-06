"""Run with:  python -m unittest test_wiki

The campaign wiki: titles, [[links]], "Linked from", renaming, search and the trash.
Uses a temporary database, never your real data/ folder.
"""
import io
import json
import os
import sqlite3
import tempfile
import unittest
import zipfile

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


class TempWiki(unittest.TestCase):
    """A fresh campaign database for each test."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (db.DATA_DIR, db.SRD_DB, db.CAMPAIGN_DB)
        db.DATA_DIR = self.tmp.name
        db.CAMPAIGN_DB = os.path.join(self.tmp.name, "campaign.db")
        db.SRD_DB = os.path.join(self.tmp.name, "srd.db")
        self.conn = db.campaign()

    def tearDown(self):
        self.conn.close()
        db.DATA_DIR, db.SRD_DB, db.CAMPAIGN_DB = self.saved
        self.tmp.cleanup()

    def page(self, title, body="", category="npc"):
        return wiki.create_page(self.conn, title, category, body)


class Pages(TempWiki):
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


class InfoTagsNesting(TempWiki):
    def test_fields_are_cleaned_and_kept_per_category(self):
        page = self.page("Durnan")
        out = wiki.update_page(self.conn, page["id"], fields={
            "npc": {"species": "  Human ", "location": "[[The Yawning Portal]]", "attitude": "Smitten", "status": "Alive", "bogus": "x"},
            "quest": {"status": "Active"}, "nonsense": {"a": "b"}})
        self.assertEqual(out["fields"], {"npc": {"species": "Human", "location": "The Yawning Portal", "status": "Alive"},
                                         "quest": {"status": "Active"}})
        # switching category keeps the NPC values for when it switches back
        self.assertEqual(wiki.update_page(self.conn, page["id"], category="location")["fields"]["npc"]["species"], "Human")
        self.assertEqual(wiki.clean_fields({"session": {"played": "2026-11-06"}}), {"session": {"played": "2026-11-06"}})
        self.assertEqual(wiki.clean_fields({"session": {"played": "last friday"}}), {})

    def test_page_fields_are_links_and_follow_renames(self):
        portal = self.page("The Yawning Portal", "", "location")
        durnan = wiki.create_page(self.conn, "Durnan", "npc", "", fields={"npc": {"location": "the yawning portal", "faction": "Zhentarim"}})
        self.assertEqual(durnan["fields"]["npc"]["location"], "The Yawning Portal")       # the page's exact title
        self.assertEqual([(l["text"], l["id"]) for l in durnan["links"]], [("The Yawning Portal", portal["id"]), ("Zhentarim", None)])
        self.assertEqual([b["title"] for b in wiki.get_page(self.conn, portal["id"])["backlinks"]], ["Durnan"])
        out = wiki.update_page(self.conn, portal["id"], title="Yawning Portal Inn")
        self.assertEqual(out["relinked"], 1)
        self.assertEqual(wiki.get_page(self.conn, durnan["id"])["fields"]["npc"]["location"], "Yawning Portal Inn")
        # a page field of another category isn't a link
        wiki.update_page(self.conn, durnan["id"], category="lore")
        self.assertEqual(wiki.get_page(self.conn, portal["id"])["backlinks"], [])

    def test_tags_are_normalized_counted_and_searchable(self):
        self.assertEqual(wiki.clean_tags("Act 2, #Dungeon, dungeon, , weird!tag"), ["act-2", "dungeon", "weirdtag"])
        a = wiki.create_page(self.conn, "Cragmaw Hideout", "location", "Goblin cave.", tags="Act 1, dungeon")
        wiki.create_page(self.conn, "Wave Echo Cave", "location", "", tags=["dungeon"])
        self.assertEqual(a["tags"], ["act-1", "dungeon"])
        self.assertEqual(wiki.list_pages(self.conn)["tags"], [{"tag": "act-1", "n": 1}, {"tag": "dungeon", "n": 2}])
        self.assertEqual([h["title"] for h in wiki.search(self.conn, "#dungeon")], ["Cragmaw Hideout", "Wave Echo Cave"])
        self.assertEqual([h["title"] for h in wiki.search(self.conn, "#act-1 goblin")], ["Cragmaw Hideout"])
        self.assertEqual(wiki.search(self.conn, "#act"), [])                 # a #tag must match whole

    def test_pages_inside_pages(self):
        coast = self.page("Sword Coast", "", "location")
        town = wiki.create_page(self.conn, "Phandalin", "location", parent_id=coast["id"])
        inn = wiki.create_page(self.conn, "Stonehill Inn", "location", parent_id=town["id"])
        self.assertEqual([b["title"] for b in wiki.get_page(self.conn, inn["id"])["breadcrumbs"]], ["Sword Coast", "Phandalin"])
        self.assertEqual([c["title"] for c in wiki.get_page(self.conn, town["id"])["children"]], ["Stonehill Inn"])
        with self.assertRaises(wiki.WikiError):                               # a loop
            wiki.update_page(self.conn, coast["id"], parent_id=inn["id"])
        with self.assertRaises(wiki.WikiError):                               # inside itself
            wiki.update_page(self.conn, town["id"], parent_id=town["id"])
        self.assertEqual(wiki.update_page(self.conn, inn["id"], body="x")["parent_id"], town["id"])   # kept
        # its parent in the trash: listed at the top level, back in place once restored
        wiki.trash_page(self.conn, town["id"])
        listed = {p["title"]: p["parent_id"] for p in wiki.list_pages(self.conn)["pages"]}
        self.assertIsNone(listed["Stonehill Inn"])
        self.assertEqual(wiki.get_page(self.conn, inn["id"])["breadcrumbs"], [])
        wiki.restore_page(self.conn, town["id"])
        self.assertEqual(wiki.get_page(self.conn, inn["id"])["parent_id"], town["id"])
        self.assertIsNone(wiki.update_page(self.conn, inn["id"], parent_id=None)["parent_id"])


PNG = b"\x89PNG\r\n\x1a\n" + b"pretend pixels"
JPG = b"\xff\xd8\xff\xe0" + b"pretend pixels"


class Images(TempWiki):
    def folder(self):
        return db.wiki_images_dir()

    def test_types_are_recognized_by_their_bytes(self):
        self.assertEqual([wiki.image_type(x) for x in (PNG, JPG, b"GIF89a...", b"RIFF\0\0\0\0WEBPVP8 ")], ["png", "jpg", "gif", "webp"])
        for bad in (b"<svg onload=alert(1)>", b"%PDF-1.7", b"", b"RIFF\0\0\0\0WAVE"):
            self.assertIsNone(wiki.image_type(bad))

    def test_saved_once_by_content_and_refused_otherwise(self):
        a = wiki.save_image(self.conn, PNG, "Tavern map.png", self.folder())
        b = wiki.save_image(self.conn, PNG, "copy.png", self.folder())
        self.assertRegex(a["file"], r"^[0-9a-f]{16}\.png$")
        self.assertEqual((b["file"], b["name"]), (a["file"], "Tavern map.png"))       # same picture, stored once
        self.assertEqual(os.listdir(self.folder()), [a["file"]])
        with self.assertRaises(wiki.WikiError) as cm:
            wiki.save_image(self.conn, b"<svg/>", "x.svg", self.folder())
        self.assertEqual(cm.exception.status, 415)
        with self.assertRaises(wiki.WikiError) as cm:
            wiki.save_image(self.conn, PNG + b"0" * wiki.MAX_IMAGE_BYTES, "huge.png", self.folder())
        self.assertEqual(cm.exception.status, 413)

    def test_only_our_files_are_served(self):
        a = wiki.save_image(self.conn, JPG, "face.jpg", self.folder())
        path, mime = wiki.image_path(self.folder(), a["file"])
        with open(path, "rb") as f:
            self.assertEqual((f.read(), mime), (JPG, "image/jpeg"))
        for bad in ("../campaign.db", "campaign.db", "0123456789abcdef.svg", "0123456789abcdef.png"):
            with self.assertRaises(wiki.WikiError):
                wiki.image_path(self.folder(), bad)

    def test_portrait_must_be_an_uploaded_image(self):
        page = self.page("Durnan")
        a = wiki.save_image(self.conn, PNG, "durnan.png", self.folder())
        self.assertEqual(wiki.update_page(self.conn, page["id"], portrait=a["file"])["portrait"], a["file"])
        self.assertEqual(wiki.list_pages(self.conn)["pages"][0]["portrait"], a["file"])
        self.assertEqual(wiki.update_page(self.conn, page["id"], body="x")["portrait"], a["file"])   # kept
        with self.assertRaises(wiki.WikiError):
            wiki.update_page(self.conn, page["id"], portrait="0123456789abcdef.png")
        self.assertIsNone(wiki.update_page(self.conn, page["id"], portrait="")["portrait"])

    def test_upload_and_fetch_through_the_api(self):
        class Upload:
            headers = {"Content-Length": str(len(PNG))}
            rfile = io.BytesIO(PNG)
            close_connection = False
            raw_body = server.Handler.raw_body
        made = server.upload_image(Upload(), {"name": ["map.png"]})
        raw = server.get_image(None, {}, made["file"])
        self.assertEqual((raw.data, raw.mime), (PNG, "image/png"))
        with self.assertRaises(server.ApiError) as cm:
            server.get_image(None, {}, "../../server.py")
        self.assertEqual(cm.exception.status, 404)

    def test_too_big_is_refused_before_reading(self):
        class Upload:
            headers = {"Content-Length": str(wiki.MAX_IMAGE_BYTES + 1)}
            rfile = None                       # reading would fail
            close_connection = False
            raw_body = server.Handler.raw_body
        with self.assertRaises(server.ApiError) as cm:
            server.upload_image(Upload(), {})
        self.assertEqual(cm.exception.status, 413)


class GameLinks(TempWiki):
    """Links from pages to characters, creatures and saved fights, and back."""

    def setUp(self):
        super().setUp()
        self.conn.execute("INSERT INTO characters(name, data) VALUES ('Mira', '{}')")
        self.conn.execute("INSERT INTO saved_encounters(name, data) VALUES ('Goblin ambush', ?)", (json.dumps({"creatures": [{}, {}]}),))
        self.conn.execute("INSERT INTO homebrew(idx, name, meta, data) VALUES ('hb-grik-1', 'Grik', 'Homebrew', '{}')")
        srd = db.srd()
        srd.execute("INSERT INTO entries(kind, idx, name, meta, data) VALUES ('monster', 'goblin-warrior', 'Goblin Warrior', 'CR 1/4', '{}')")
        srd.commit()
        self.conn.commit()                  # the API below uses its own connection
        self.srd = srd

    def tearDown(self):
        self.srd.close()
        super().tearDown()

    def test_game_links_are_not_page_links(self):
        body = "[[char:Mira]] met [[monster: goblin warrior|the goblins]] before the [[Fight:Goblin Ambush]] at [[Phandalin]]."
        self.assertEqual(wiki.parse_links(body), ["phandalin"])
        self.assertEqual(wiki.parse_refs(body), [("char", "Mira"), ("monster", "goblin warrior"), ("fight", "Goblin Ambush")])
        with self.assertRaises(wiki.WikiError):
            wiki.clean_title("monster: Owlbear")
        self.assertEqual(wiki.clean_title("Charlotte: a story"), "Charlotte: a story")     # only exact prefixes

    def test_names_resolve_against_the_app(self):
        page = wiki.create_page(self.conn, "Session 1", "session",
                                "[[char:mira]], [[monster:Goblin Warrior]], [[monster:grik]], [[fight:goblin ambush]], [[char:Nobody]]")
        refs = {(r["kind"], r["name"]): r for r in wiki.resolve_refs(self.conn, self.srd, page["refs"])}
        self.assertEqual((refs[("char", "mira")]["id"], refs[("char", "mira")]["title"]), (1, "Mira"))
        self.assertEqual(refs[("monster", "Goblin Warrior")]["idx"], "goblin-warrior")
        self.assertEqual(refs[("monster", "grik")]["idx"], "hb-grik-1")                       # homebrew too
        self.assertEqual(refs[("fight", "goblin ambush")]["meta"], "2 creatures")
        self.assertFalse(refs[("char", "Nobody")]["found"])

    def test_info_box_game_fields_and_mentions(self):
        npc = wiki.create_page(self.conn, "Grik the Bold", "npc", "", fields={"npc": {"statblock": "[[monster:grik]]"}})
        self.assertEqual(npc["fields"]["npc"]["statblock"], "Grik")
        self.assertEqual(npc["refs"], [{"kind": "monster", "name": "Grik"}])
        pc = wiki.create_page(self.conn, "Mira's story", "pc", "Mentions [[char:Mira]] too.", fields={"pc": {"sheet": "MIRA"}})
        self.assertEqual(pc["fields"]["pc"]["sheet"], "Mira")                                    # its exact name
        self.assertEqual(len(pc["refs"]), 1)                                                      # once, not twice
        self.assertEqual([m["title"] for m in wiki.mentions(self.conn, "monster", "GRIK")], ["Grik the Bold"])
        self.assertEqual([m["title"] for m in wiki.mentions(self.conn, "char", "mira")], ["Mira's story"])
        wiki.trash_page(self.conn, pc["id"])
        self.assertEqual(wiki.mentions(self.conn, "char", "Mira"), [])
        with self.assertRaises(wiki.WikiError):
            wiki.mentions(self.conn, "spell", "Fireball")

    def test_through_the_api(self):
        class Body:
            def __init__(self, b):
                self.b = b

            def json_body(self):
                return self.b
        made = server.create_wiki(Body({"title": "Ambush", "body": "[[fight:Goblin ambush]] with [[char:Mira]]"}), {})
        self.assertEqual([(r["kind"], r["found"]) for r in made["refs"]], [("fight", True), ("char", True)])
        self.assertEqual([m["title"] for m in server.wiki_mentions(None, {"kind": ["char"], "name": ["Mira"]})], ["Ambush"])


class GalleryAndExport(TempWiki):
    def folder(self):
        return db.wiki_images_dir()

    def test_gallery_lists_users_and_only_unused_images_can_be_deleted(self):
        a = wiki.save_image(self.conn, PNG, "map.png", self.folder())["file"]
        b = wiki.save_image(self.conn, JPG, "face.jpg", self.folder())["file"]
        c = wiki.save_image(self.conn, b"GIF89a" + b"spare", "spare.gif", self.folder())["file"]
        town = self.page("Phandalin", f"![Map]({a})", "location")
        npc = self.page("Toblen")
        wiki.update_page(self.conn, npc["id"], portrait=b)
        wiki.trash_page(self.conn, npc["id"])
        use = {i["file"]: (i["pages"], i["trashed"]) for i in wiki.list_images(self.conn)}
        self.assertEqual(use[a], ([{"id": town["id"], "title": "Phandalin"}], 0))
        self.assertEqual(use[b], ([], 1))                                   # only a page in the trash uses it
        self.assertEqual(use[c], ([], 0))
        for busy in (a, b):
            with self.assertRaises(wiki.WikiError) as cm:
                wiki.delete_image(self.conn, self.folder(), busy)
            self.assertEqual(cm.exception.status, 409)
        wiki.delete_image(self.conn, self.folder(), c)
        self.assertEqual(sorted(os.listdir(self.folder())), sorted([a, b]))
        with self.assertRaises(wiki.WikiError):
            wiki.delete_image(self.conn, self.folder(), "../campaign.db")

    def test_export_writes_markdown_with_front_matter_and_images(self):
        a = wiki.save_image(self.conn, PNG, "map.png", self.folder())["file"]
        coast = self.page("Sword Coast", "", "location")
        wiki.create_page(self.conn, "Phandalin", "location", f"A town.\n\n![Map|medium]({a})\n\nSee [[Toblen]].",
                         parent_id=coast["id"], fields={"location": {"danger": "Risky"}}, tags="act 1")
        wiki.create_page(self.conn, 'What? A "quote"/slash', "lore")
        gone = self.page("Old notes")
        wiki.trash_page(self.conn, gone["id"])
        z = zipfile.ZipFile(io.BytesIO(wiki.export_zip(self.conn, self.folder())))
        names = sorted(z.namelist())
        self.assertEqual(names, ["Locations/Phandalin.md", "Locations/Sword Coast.md", "Lore/What- A -quote--slash.md",
                                 f"images/{a}", "index.md"])
        text = z.read("Locations/Phandalin.md").decode()
        self.assertIn('"inside": "[[Sword Coast]]"', text)
        self.assertIn('"Danger": "Risky"', text)
        self.assertIn('tags: ["act-1"]', text)
        self.assertIn(f"![Map|medium](../images/{a})", text)
        self.assertIn("See [[Toblen]].", text)
        self.assertEqual(z.read(f"images/{a}"), PNG)
        self.assertIn("- [[Phandalin]]", z.read("index.md").decode())
        self.assertNotIn("Old notes", " ".join(names))

    def test_safe_file_names(self):
        self.assertEqual(wiki.safe_filename("CON"), "CON_")
        self.assertEqual(wiki.safe_filename("  ...  "), "page")
        self.assertEqual(wiki.safe_filename("a\\b:c"), "a-b-c")

    def test_export_through_the_api(self):
        self.page("Mirt")
        self.conn.commit()                  # the API uses its own connection
        raw = server.export_wiki(None, {})
        self.assertEqual(raw.mime, "application/zip")
        self.assertRegex(raw.filename, r"^campaign-wiki-\d{4}-\d{2}-\d{2}\.zip$")
        self.assertIn("NPCs/Mirt.md", zipfile.ZipFile(io.BytesIO(raw.data)).namelist())


class OlderDatabase(unittest.TestCase):
    def test_the_portrait_column_is_added_to_an_existing_wiki(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = (db.DATA_DIR, db.CAMPAIGN_DB)
            db.DATA_DIR, db.CAMPAIGN_DB = tmp, os.path.join(tmp, "campaign.db")
            try:
                old = sqlite3.connect(db.CAMPAIGN_DB)
                old.execute("CREATE TABLE wiki_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, "
                            "category TEXT NOT NULL DEFAULT 'unsorted', body TEXT NOT NULL DEFAULT '', created TEXT, updated TEXT, deleted TEXT)")
                old.execute("INSERT INTO wiki_pages(title, body) VALUES ('Kept', 'text')")
                old.commit(); old.close()
                conn = db.campaign()
                page = wiki.get_page(conn, 1)
                self.assertEqual((page["title"], page["body"], page["portrait"]), ("Kept", "text", None))
                conn.close()
            finally:
                db.DATA_DIR, db.CAMPAIGN_DB = saved


if __name__ == "__main__":
    unittest.main()
