"""The campaign wiki: pages in categories, linked with [[Page title]] or [[Page title|shown text]].

Pages live in campaign.db (wiki_pages). Every page's outgoing links are kept in wiki_links as normalized
titles, so "Linked from" is one query and a link to a page that doesn't exist yet is still remembered
(it lights up when that page is created). Renaming a page rewrites the links to it in every other page.
Deleting a page moves it to the trash (deleted is set); nothing is erased.

Each category has an info box (FIELDS): text, choices, dates, and "page" fields that name another page and
count as links (an NPC's Location shows up in that location's "Linked from", and follows its renames).
Values are kept per category ({"npc": {...}, "quest": {...}}), so switching a page's category and back loses
nothing. Pages carry tags (normalized: "Act 2" -> "act-2") and can sit inside another page (parent_id).

Images are files in data/wiki_images/, named by their content ("<16 hex of SHA-256>.png"), so the same
picture uploaded twice is stored once. Pages show them with ![Caption|size](file) and can have one as their
portrait. Only PNG, JPEG, GIF and WebP are accepted, recognized by their bytes (never SVG: it can hold scripts).

All functions take an open campaign connection; the server wraps them in a session.
"""
import hashlib
import json
import os
import re

CATEGORIES = [
    ("unsorted", "Unsorted"), ("npc", "NPCs"), ("location", "Locations"), ("faction", "Factions"),
    ("quest", "Quests"), ("item", "Items"), ("lore", "Lore"), ("session", "Session log"),
]
CATEGORY_KEYS = {k for k, _ in CATEGORIES}
TITLE_MAX = 120
FIELD_MAX = 200

# The info box of each category: (key, label, type[, choices]). Types: text, page (another page's title:
# a link), choice (one of the choices; "" = not set), date (YYYY-MM-DD). Attitudes are the 2024 DMG's.
ATTITUDES = ["", "Friendly", "Indifferent", "Hostile"]
FIELDS = {
    "npc": [("species", "Species", "text"), ("role", "Role", "text"), ("location", "Location", "page"),
            ("faction", "Faction", "page"), ("attitude", "Attitude", "choice", ATTITUDES),
            ("status", "Status", "choice", ["", "Alive", "Dead", "Missing", "Unknown"])],
    "location": [("kind", "Type", "text"), ("ruler", "Ruled by", "page"), ("population", "Population", "text"),
                 ("danger", "Danger", "choice", ["", "Safe", "Risky", "Dangerous", "Deadly"])],
    "faction": [("leader", "Leader", "page"), ("base", "Based in", "page"), ("goal", "Goal", "text"),
                ("attitude", "Attitude", "choice", ATTITUDES)],
    "quest": [("status", "Status", "choice", ["", "Not started", "Active", "Completed", "Failed"]),
              ("giver", "Given by", "page"), ("location", "Location", "page"), ("reward", "Reward", "text")],
    "item": [("kind", "Type", "text"), ("rarity", "Rarity", "choice", ["", "Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"]),
             ("attunement", "Attunement", "choice", ["", "No", "Yes"]), ("owner", "Held by", "page")],
    "lore": [("era", "Era", "text"), ("source", "Source", "text")],
    "session": [("played", "Played on", "date"), ("ingame", "In-game date", "text")],
}
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")

IMAGE_FILE = re.compile(r"[0-9a-f]{16}\.(?:png|jpg|gif|webp)")
IMAGE_TYPES = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}
MAX_IMAGE_BYTES = 20 * 1024 * 1024

# [[Target]] or [[Target|label]]: the target can't contain brackets or a bar
LINK = re.compile(r"\[\[([^\[\]|\n]+?)(\|[^\[\]\n]*)?\]\]")


class WikiError(ValueError):
    """A request the wiki can't do (bad title, title taken, page gone). The message is for the DM."""

    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


def norm(title):
    """The form titles are compared in: case and extra spaces don't matter."""
    return " ".join(str(title or "").split()).casefold()


def clean_title(title):
    t = " ".join(str(title or "").split())
    if not t:
        raise WikiError("A page needs a title.")
    if any(c in t for c in "[]|"):
        raise WikiError("Titles can't contain [ ] or |, because links use them.")
    return t[:TITLE_MAX]


def parse_links(body):
    """The normalized titles a page links to, in order, without repeats."""
    seen = []
    for m in LINK.finditer(body or ""):
        t = norm(m.group(1))
        if t and t not in seen:
            seen.append(t)
    return seen


def rewrite_links(body, old, new):
    """Point every [[old]] / [[old|label]] in body at the title `new` (labels are kept). Returns (body, count)."""
    old_n, count = norm(old), 0

    def sub(m):
        nonlocal count
        if norm(m.group(1)) != old_n:
            return m.group(0)
        count += 1
        return f"[[{new}{m.group(2) or ''}]]"

    return LINK.sub(sub, body or ""), count


# ---------- info boxes and tags ----------

def field_defs():
    """FIELDS for the browser: {category: [{key, label, type, choices?}]}."""
    return {cat: [{"key": f[0], "label": f[1], "type": f[2], **({"choices": f[3]} if len(f) > 3 else {})} for f in defs]
            for cat, defs in FIELDS.items()}


def clean_fields(fields):
    """Keep only known fields with valid values; empty values are dropped."""
    out = {}
    for cat, values in (fields or {}).items() if isinstance(fields, dict) else []:
        if cat not in FIELDS or not isinstance(values, dict):
            continue
        kept = {}
        for key, _label, kind, *rest in FIELDS[cat]:
            v = " ".join(str(values.get(key) or "").split())[:FIELD_MAX]
            if kind == "page":
                v = " ".join(re.sub(r"[\[\]|]", " ", v).split())     # a title, even if typed as [[Title]]
            elif kind == "choice" and v not in rest[0]:
                v = ""
            elif kind == "date" and not DATE.fullmatch(v):
                v = ""
            if v:
                kept[key] = v
        if kept:
            out[cat] = kept
    return out


def _canonical(conn, fields):
    """Page fields that name an existing page take its exact title ("stonehill inn" -> "Stonehill Inn")."""
    titles = {norm(r["title"]): r["title"] for r in conn.execute("SELECT title FROM wiki_pages WHERE deleted IS NULL")}
    for cat, values in fields.items():
        for key, _label, kind, *_ in FIELDS.get(cat, []):
            if kind == "page" and norm(values.get(key)) in titles:
                values[key] = titles[norm(values[key])]
    return fields


def page_fields(category, fields):
    """[(key, title)] of the filled-in page fields of the page's category: they count as links."""
    values = (fields or {}).get(category) or {}
    return [(f[0], values[f[0]]) for f in FIELDS.get(category, []) if f[2] == "page" and values.get(f[0])]


def clean_tags(tags):
    """'Act 2, #dungeon' or ['Act 2'] -> ['act-2', 'dungeon']: lowercase, dashes for spaces, sorted, once each."""
    items = tags.split(",") if isinstance(tags, str) else list(tags or [])
    out = set()
    for t in items:
        t = re.sub(r"[^\w-]", "", "-".join(str(t).strip().lstrip("#").casefold().split()))[:40].strip("-")
        if t:
            out.add(t)
    return sorted(out)


def _json(text, default):
    try:
        v = json.loads(text) if text else default
    except ValueError:
        return default
    return v if isinstance(v, type(default)) else default


# ---------- reading ----------

def _row(r):
    keys = r.keys()
    return {"id": r["id"], "title": r["title"], "category": r["category"], "created": r["created"], "updated": r["updated"],
            "portrait": r["portrait"] if "portrait" in keys else None,
            "tags": _json(r["tags"], []) if "tags" in keys else [],
            "parent_id": r["parent_id"] if "parent_id" in keys else None}


def _live(conn):
    """{id: (title, parent_id)} of every page outside the trash."""
    return {r["id"]: (r["title"], r["parent_id"]) for r in
            conn.execute("SELECT id, title, parent_id FROM wiki_pages WHERE deleted IS NULL")}


def list_pages(conn):
    """Every page outside the trash (no bodies), the categories with their info box fields, the tags in use
    and how many pages are in the trash. A page whose parent is in the trash is listed at the top level."""
    rows = conn.execute("SELECT id, title, category, created, updated, portrait, tags, parent_id FROM wiki_pages "
                        "WHERE deleted IS NULL ORDER BY title COLLATE NOCASE").fetchall()
    live = {r["id"] for r in rows}
    pages = []
    for r in rows:
        p = _row(r)
        if p["parent_id"] not in live:
            p["parent_id"] = None
        pages.append(p)
    counts = {}
    for p in pages:
        for t in p["tags"]:
            counts[t] = counts.get(t, 0) + 1
    trash = conn.execute("SELECT COUNT(*) FROM wiki_pages WHERE deleted IS NOT NULL").fetchone()[0]
    defs = field_defs()
    return {"categories": [{"key": k, "name": n, "fields": defs.get(k, [])} for k, n in CATEGORIES], "pages": pages,
            "tags": [{"tag": t, "n": n} for t, n in sorted(counts.items())], "trash": trash}


def _find_by_title(conn, title, exclude=None):
    for r in conn.execute("SELECT id, title FROM wiki_pages WHERE deleted IS NULL"):
        if norm(r["title"]) == norm(title) and r["id"] != exclude:
            return r["id"]
    return None


def _ancestors(live, pid):
    """The pages `pid` sits inside, outermost first (stops at a page in the trash or a loop)."""
    chain, seen, cur = [], {pid}, live.get(pid, (None, None))[1]
    while cur in live and cur not in seen:
        chain.append({"id": cur, "title": live[cur][0]})
        seen.add(cur)
        cur = live[cur][1]
    return chain[::-1]


def get_page(conn, pid):
    """A page with its body, info box values, tags, where it sits (breadcrumbs) and what's inside it, its
    outgoing links (each with the page id, or None if it doesn't exist yet) and the pages that link to it."""
    r = conn.execute("SELECT * FROM wiki_pages WHERE id=?", (pid,)).fetchone()
    if not r:
        raise WikiError("That page doesn't exist.", 404)
    fields = _json(r["fields"], {})
    titles = {norm(x["title"]): (x["id"], x["title"]) for x in
              conn.execute("SELECT id, title FROM wiki_pages WHERE deleted IS NULL")}
    typed = {}                                  # each target as first written, for showing missing pages
    for m in LINK.finditer(r["body"] or ""):
        typed.setdefault(norm(m.group(1)), " ".join(m.group(1).split()))
    for _key, title in page_fields(r["category"], fields):
        typed.setdefault(norm(title), title)
    links = []
    for t in _link_targets(r["body"], r["category"], fields):
        hit = titles.get(t)
        links.append({"target": t, "text": typed.get(t, t), "id": hit[0] if hit else None, "title": hit[1] if hit else None})
    back = conn.execute(
        "SELECT DISTINCT p.id, p.title, p.category FROM wiki_links l JOIN wiki_pages p ON p.id = l.src "
        "WHERE l.target = ? AND p.deleted IS NULL AND p.id != ? ORDER BY p.title COLLATE NOCASE",
        (norm(r["title"]), pid)).fetchall()
    live = _live(conn)
    children = conn.execute("SELECT id, title, category, portrait FROM wiki_pages WHERE parent_id=? AND deleted IS NULL "
                            "ORDER BY title COLLATE NOCASE", (pid,)).fetchall()
    out = {**_row(r), "body": r["body"], "deleted": r["deleted"], "fields": fields, "links": links,
           "backlinks": [{"id": b["id"], "title": b["title"], "category": b["category"]} for b in back],
           "breadcrumbs": _ancestors(live, pid),
           "children": [{"id": c["id"], "title": c["title"], "category": c["category"], "portrait": c["portrait"]} for c in children]}
    if out["parent_id"] not in live:
        out["parent_id"] = None
    return out


def search(conn, q, limit=50):
    """Pages whose title, text, info box or tags contain every word of q (a word starting with # must be a
    tag); title matches first, with a short snippet."""
    words = [w for w in str(q or "").casefold().split() if w]
    if not words:
        return []
    out = []
    for r in conn.execute("SELECT id, title, category, body, updated, fields, tags FROM wiki_pages WHERE deleted IS NULL"):
        tags = _json(r["tags"], [])
        info = " ".join((_json(r["fields"], {}).get(r["category"]) or {}).values())
        title, text = r["title"].casefold(), f"{r['body'] or ''} {info} {' '.join(tags)}".casefold()
        if not all((w[1:] in tags) if w.startswith("#") and len(w) > 1 else (w in title or w in text) for w in words):
            continue
        in_title = sum(w in title for w in words)
        out.append((-in_title, title, {"id": r["id"], "title": r["title"], "category": r["category"],
                                        "updated": r["updated"], "snippet": _snippet(r["body"], words)}))
    out.sort(key=lambda x: x[:2])
    return [x[2] for x in out[:limit]]


def _snippet(body, words, width=110):
    text = " ".join(LINK.sub(lambda m: (m.group(2) or "|" + m.group(1))[1:], body or "").split())
    low = text.casefold()
    at = min((low.find(w) for w in words if w in low), default=-1)
    if at < 0:
        return text[:width] + ("…" if len(text) > width else "")
    start = max(0, at - width // 3)
    return ("…" if start else "") + text[start:start + width] + ("…" if start + width < len(text) else "")


# ---------- writing ----------

def _link_targets(body, category, fields):
    targets = parse_links(body)
    for _key, title in page_fields(category, fields):
        if norm(title) not in targets:
            targets.append(norm(title))
    return targets


def _set_links(conn, pid, body, category="unsorted", fields=None):
    conn.execute("DELETE FROM wiki_links WHERE src=?", (pid,))
    conn.executemany("INSERT INTO wiki_links(src, target) VALUES (?, ?)",
                     [(pid, t) for t in _link_targets(body, category, fields)])


def _free_title(conn, title):
    """`title`, or "title 2", "title 3"... if it's taken."""
    base, n, t = title, 1, title
    while _find_by_title(conn, t):
        n += 1
        t = f"{base[:TITLE_MAX - 4]} {n}"
    return t


def _check_parent(conn, pid, parent_id):
    """A valid parent for page `pid` (None for the top level): a page outside the trash that isn't the page
    itself or inside it."""
    if parent_id in (None, "", 0):
        return None
    try:
        parent_id = int(parent_id)
    except (TypeError, ValueError):
        raise WikiError("Pick the page this one is inside.")
    live = _live(conn)
    if parent_id not in live:
        raise WikiError("The page it's inside doesn't exist any more.", 404)
    if parent_id == pid or any(a["id"] == pid for a in _ancestors(live, parent_id)):
        raise WikiError("A page can't be inside itself or inside a page that's inside it.")
    return parent_id


def create_page(conn, title="New page", category="unsorted", body="", parent_id=None, fields=None, tags=None):
    """A new page. A title that's taken gets a number ("New page 2"), so quick notes never fail."""
    title = _free_title(conn, clean_title(title))
    category = category if category in CATEGORY_KEYS else "unsorted"
    fields, tags = _canonical(conn, clean_fields(fields)), clean_tags(tags)
    parent_id = _check_parent(conn, None, parent_id)
    cur = conn.execute("INSERT INTO wiki_pages(title, category, body, fields, tags, parent_id) VALUES (?, ?, ?, ?, ?, ?)",
                       (title, category, str(body or ""), json.dumps(fields), json.dumps(tags), parent_id))
    _set_links(conn, cur.lastrowid, body, category, fields)
    return get_page(conn, cur.lastrowid)


def _rename_fields(fields, old, new):
    """Page fields naming `old` now name `new` (in every category). Returns (fields, count)."""
    count = 0
    for cat, values in fields.items():
        for key, _label, kind, *_ in FIELDS.get(cat, []):
            if kind == "page" and norm(values.get(key)) == norm(old):
                values[key] = new
                count += 1
    return fields, count


def update_page(conn, pid, title=None, category=None, body=None, portrait=None, fields=None, tags=None, parent_id=-1):
    """Change a page; arguments left out (None, or -1 for parent_id) stay as they are. A new title rewrites the
    links to the old one in every other page (text and info boxes). portrait: an uploaded image's file, or ""
    for none. Returns the page plus "relinked": how many other pages were changed."""
    r = conn.execute("SELECT * FROM wiki_pages WHERE id=? AND deleted IS NULL", (pid,)).fetchone()
    if not r:
        raise WikiError("That page doesn't exist any more.", 404)
    new_title = r["title"] if title is None else clean_title(title)
    if norm(new_title) != norm(r["title"]) and _find_by_title(conn, new_title, exclude=pid):
        raise WikiError(f'There is already a page called "{new_title}".', 409)
    new_cat = r["category"] if category is None else (category if category in CATEGORY_KEYS else "unsorted")
    new_body = r["body"] if body is None else str(body)
    new_portrait = r["portrait"] if portrait is None else (_known_image(conn, portrait) if portrait else None)
    new_fields = _json(r["fields"], {}) if fields is None else _canonical(conn, clean_fields(fields))
    new_tags = _json(r["tags"], []) if tags is None else clean_tags(tags)
    new_parent = r["parent_id"] if parent_id == -1 else _check_parent(conn, pid, parent_id)
    relinked = 0
    if new_title != r["title"]:
        for o in conn.execute("SELECT DISTINCT p.id, p.body, p.category, p.fields FROM wiki_links l JOIN wiki_pages p ON p.id = l.src "
                              "WHERE l.target = ? AND p.id != ?", (norm(r["title"]), pid)).fetchall():
            text, n = rewrite_links(o["body"], r["title"], new_title)
            ofields, m = _rename_fields(_json(o["fields"], {}), r["title"], new_title)
            if n or m:
                conn.execute("UPDATE wiki_pages SET body=?, fields=?, updated=CURRENT_TIMESTAMP WHERE id=?",
                             (text, json.dumps(ofields), o["id"]))
                _set_links(conn, o["id"], text, o["category"], ofields)
                relinked += 1
        new_body, _ = rewrite_links(new_body, r["title"], new_title)          # links to itself
        new_fields, _ = _rename_fields(new_fields, r["title"], new_title)
    conn.execute("UPDATE wiki_pages SET title=?, category=?, body=?, portrait=?, fields=?, tags=?, parent_id=?, "
                 "updated=CURRENT_TIMESTAMP WHERE id=?",
                 (new_title, new_cat, new_body, new_portrait, json.dumps(new_fields), json.dumps(new_tags), new_parent, pid))
    _set_links(conn, pid, new_body, new_cat, new_fields)
    return {**get_page(conn, pid), "relinked": relinked}


def trash_page(conn, pid):
    """Move a page to the trash. Pages inside it stay where they are and show at the top level until it's back."""
    if not conn.execute("UPDATE wiki_pages SET deleted=CURRENT_TIMESTAMP WHERE id=? AND deleted IS NULL", (pid,)).rowcount:
        raise WikiError("That page doesn't exist any more.", 404)
    return {"ok": True}


def list_trash(conn):
    rows = conn.execute("SELECT id, title, category, created, updated, deleted FROM wiki_pages WHERE deleted IS NOT NULL "
                        "ORDER BY deleted DESC").fetchall()
    return [{**_row(r), "deleted": r["deleted"]} for r in rows]


def restore_page(conn, pid):
    r = conn.execute("SELECT title FROM wiki_pages WHERE id=? AND deleted IS NOT NULL", (pid,)).fetchone()
    if not r:
        raise WikiError("That page isn't in the trash.", 404)
    title = _free_title(conn, r["title"])          # its title may have been reused meanwhile
    conn.execute("UPDATE wiki_pages SET deleted=NULL, title=? WHERE id=?", (title, pid))
    return get_page(conn, pid)


# ---------- images ----------

def image_type(data):
    """'png', 'jpg', 'gif' or 'webp' from a file's first bytes, or None for anything else."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def save_image(conn, data, name, folder):
    """Store an uploaded image. Returns {file, name, bytes}; the same picture again gives the same file."""
    if len(data) > MAX_IMAGE_BYTES:
        raise WikiError(f"That image is larger than {MAX_IMAGE_BYTES // (1024 * 1024)} MB.", 413)
    ext = image_type(data)
    if not ext:
        raise WikiError("Only PNG, JPEG, GIF and WebP images can be added.", 415)
    file = f"{hashlib.sha256(data).hexdigest()[:16]}.{ext}"
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, file)
    if not os.path.exists(path):
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)                   # never a half-written image under the real name
    name = " ".join(str(name or "").split())[:200] or file
    conn.execute("INSERT OR IGNORE INTO wiki_images(file, name, bytes) VALUES (?, ?, ?)", (file, name, len(data)))
    row = conn.execute("SELECT file, name, bytes FROM wiki_images WHERE file=?", (file,)).fetchone()
    return {"file": row["file"], "name": row["name"], "bytes": row["bytes"]}


def image_path(folder, file):
    """The stored file for an image name, refusing anything that isn't one of ours."""
    if not IMAGE_FILE.fullmatch(file or ""):
        raise WikiError("No such image.", 404)
    path = os.path.join(folder, file)
    if not os.path.isfile(path):
        raise WikiError("That image is missing from data/wiki_images.", 404)
    return path, IMAGE_TYPES[file.rsplit(".", 1)[1]]


def _known_image(conn, file):
    if not IMAGE_FILE.fullmatch(str(file)) or not conn.execute("SELECT 1 FROM wiki_images WHERE file=?", (file,)).fetchone():
        raise WikiError("Pick an uploaded image for the portrait.")
    return file
