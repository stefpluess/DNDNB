"""SQLite helpers. srd.db holds imported reference data; campaign.db holds your own characters and encounter."""
import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
SRD_DB = os.path.join(DATA_DIR, "srd.db")
CAMPAIGN_DB = os.path.join(DATA_DIR, "campaign.db")

SRD_SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    kind     TEXT NOT NULL,   -- monster | spell | equipment | magic-item | condition
    idx      TEXT NOT NULL,   -- API index, e.g. 'goblin'
    name     TEXT NOT NULL,
    meta     TEXT,            -- one-line summary shown in search results
    sort_key REAL DEFAULT 0,  -- CR for monsters, level for spells
    data     TEXT NOT NULL,   -- full JSON from the source
    PRIMARY KEY (kind, idx)
);
CREATE INDEX IF NOT EXISTS entries_name ON entries(kind, name);
CREATE TABLE IF NOT EXISTS info (key TEXT PRIMARY KEY, value TEXT);
"""

CAMPAIGN_SCHEMA = """
CREATE TABLE IF NOT EXISTS characters (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    data    TEXT NOT NULL,
    updated TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS homebrew (
    idx      TEXT PRIMARY KEY,   -- 'hb-...'
    name     TEXT NOT NULL,
    meta     TEXT,
    sort_key REAL DEFAULT 0,
    data     TEXT NOT NULL,
    updated  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS saved_encounters (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    data    TEXT NOT NULL,   -- {"creatures": [...]}: the foes and allies to add, without fight state
    updated TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wiki_pages (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,              -- unique among pages outside the trash (checked in wiki.py)
    category TEXT NOT NULL DEFAULT 'unsorted',
    body     TEXT NOT NULL DEFAULT '',   -- Markdown with [[Page title]] links
    created  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated  TEXT DEFAULT CURRENT_TIMESTAMP,
    deleted  TEXT,                       -- set when moved to the trash; NULL otherwise
    portrait TEXT,                       -- an image file shown at the top of the page's info box
    fields   TEXT,                       -- info box values per category: {"npc": {"location": "Phandalin"}}
    tags     TEXT,                       -- ["act-2", "dungeon"]
    parent_id INTEGER                    -- the page it sits inside (a tavern inside a town); NULL at the top
);
CREATE TABLE IF NOT EXISTS wiki_images (
    file    TEXT PRIMARY KEY,   -- '<16 hex of the content's SHA-256>.<png|jpg|gif|webp>' in data/wiki_images/
    name    TEXT NOT NULL,      -- the file name it was uploaded with
    bytes   INTEGER NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wiki_links (
    src    INTEGER NOT NULL,   -- the page the link is on
    target TEXT NOT NULL,      -- the linked title, normalized (wiki.norm); the page may not exist yet
    PRIMARY KEY (src, target)
);
CREATE INDEX IF NOT EXISTS wiki_links_target ON wiki_links(target);
"""


def connect(path):
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def srd():
    conn = connect(SRD_DB)
    conn.executescript(SRD_SCHEMA)
    return conn


# Columns added after a table first shipped: CREATE TABLE IF NOT EXISTS won't add them to an existing
# database, so they're added here (never dropped or changed).
CAMPAIGN_COLUMNS = [("wiki_pages", "portrait", "TEXT"), ("wiki_pages", "fields", "TEXT"), ("wiki_pages", "tags", "TEXT"),
                    ("wiki_pages", "parent_id", "INTEGER")]


def add_missing_columns(conn, columns):
    for table, col, decl in columns:
        have = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if col not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def campaign():
    conn = connect(CAMPAIGN_DB)
    conn.executescript(CAMPAIGN_SCHEMA)
    add_missing_columns(conn, CAMPAIGN_COLUMNS)
    return conn


def wiki_images_dir():
    """Where wiki images are stored: data/wiki_images/ (follows DATA_DIR, so tests use their own)."""
    return os.path.join(DATA_DIR, "wiki_images")


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


class _Session:
    """`with db.srd_session() as conn:` commits on success, rolls back on error, always closes."""

    def __init__(self, factory):
        self.conn = factory()

    def __enter__(self):
        return self.conn

    def __exit__(self, exc_type, *_):
        if exc_type is None:
            self.conn.commit()
        else:
            self.conn.rollback()
        self.conn.close()


def srd_session():
    return _Session(srd)


def campaign_session():
    return _Session(campaign)
