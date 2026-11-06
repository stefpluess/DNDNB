"""The campaign wiki: pages in categories, linked with [[Page title]] or [[Page title|shown text]].

Pages live in campaign.db (wiki_pages). Every page's outgoing links are kept in wiki_links as normalized
titles, so "Linked from" is one query and a link to a page that doesn't exist yet is still remembered
(it lights up when that page is created). Renaming a page rewrites the links to it in every other page.
Deleting a page moves it to the trash (deleted is set); nothing is erased.

All functions take an open campaign connection; the server wraps them in a session.
"""
import re

CATEGORIES = [
    ("unsorted", "Unsorted"), ("npc", "NPCs"), ("location", "Locations"), ("faction", "Factions"),
    ("quest", "Quests"), ("item", "Items"), ("lore", "Lore"), ("session", "Session log"),
]
CATEGORY_KEYS = {k for k, _ in CATEGORIES}
TITLE_MAX = 120

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


# ---------- reading ----------

def _row(r):
    return {"id": r["id"], "title": r["title"], "category": r["category"], "created": r["created"], "updated": r["updated"]}


def list_pages(conn):
    """Every page outside the trash (no bodies), plus how many are in the trash."""
    rows = conn.execute("SELECT id, title, category, created, updated FROM wiki_pages WHERE deleted IS NULL "
                        "ORDER BY title COLLATE NOCASE").fetchall()
    trash = conn.execute("SELECT COUNT(*) FROM wiki_pages WHERE deleted IS NOT NULL").fetchone()[0]
    return {"categories": [{"key": k, "name": n} for k, n in CATEGORIES], "pages": [_row(r) for r in rows], "trash": trash}


def _find_by_title(conn, title, exclude=None):
    for r in conn.execute("SELECT id, title FROM wiki_pages WHERE deleted IS NULL"):
        if norm(r["title"]) == norm(title) and r["id"] != exclude:
            return r["id"]
    return None


def get_page(conn, pid):
    """A page with its body, its outgoing links (each with the page id, or None if it doesn't exist yet)
    and the pages that link to it."""
    r = conn.execute("SELECT * FROM wiki_pages WHERE id=?", (pid,)).fetchone()
    if not r:
        raise WikiError("That page doesn't exist.", 404)
    live = {norm(x["title"]): (x["id"], x["title"]) for x in
            conn.execute("SELECT id, title FROM wiki_pages WHERE deleted IS NULL")}
    typed = {}                                  # each target as first written, for showing missing pages
    for m in LINK.finditer(r["body"] or ""):
        typed.setdefault(norm(m.group(1)), " ".join(m.group(1).split()))
    links = []
    for t in parse_links(r["body"]):
        hit = live.get(t)
        links.append({"target": t, "text": typed.get(t, t), "id": hit[0] if hit else None, "title": hit[1] if hit else None})
    back = conn.execute(
        "SELECT DISTINCT p.id, p.title, p.category FROM wiki_links l JOIN wiki_pages p ON p.id = l.src "
        "WHERE l.target = ? AND p.deleted IS NULL AND p.id != ? ORDER BY p.title COLLATE NOCASE",
        (norm(r["title"]), pid)).fetchall()
    return {**_row(r), "body": r["body"], "deleted": r["deleted"], "links": links,
            "backlinks": [{"id": b["id"], "title": b["title"], "category": b["category"]} for b in back]}


def search(conn, q, limit=50):
    """Pages whose title or text contains every word of q; title matches first, with a short snippet."""
    words = [w for w in str(q or "").casefold().split() if w]
    if not words:
        return []
    out = []
    for r in conn.execute("SELECT id, title, category, body, updated FROM wiki_pages WHERE deleted IS NULL"):
        title, body = r["title"].casefold(), (r["body"] or "").casefold()
        if not all(w in title or w in body for w in words):
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

def _set_links(conn, pid, body):
    conn.execute("DELETE FROM wiki_links WHERE src=?", (pid,))
    conn.executemany("INSERT INTO wiki_links(src, target) VALUES (?, ?)", [(pid, t) for t in parse_links(body)])


def _free_title(conn, title):
    """`title`, or "title 2", "title 3"... if it's taken."""
    base, n, t = title, 1, title
    while _find_by_title(conn, t):
        n += 1
        t = f"{base[:TITLE_MAX - 4]} {n}"
    return t


def create_page(conn, title="New page", category="unsorted", body=""):
    """A new page. A title that's taken gets a number ("New page 2"), so quick notes never fail."""
    title = _free_title(conn, clean_title(title))
    category = category if category in CATEGORY_KEYS else "unsorted"
    cur = conn.execute("INSERT INTO wiki_pages(title, category, body) VALUES (?, ?, ?)", (title, category, str(body or "")))
    _set_links(conn, cur.lastrowid, body)
    return get_page(conn, cur.lastrowid)


def update_page(conn, pid, title=None, category=None, body=None):
    """Change a page. A new title rewrites the links to the old one in every other page.
    Returns the page plus "relinked": how many other pages were changed."""
    r = conn.execute("SELECT * FROM wiki_pages WHERE id=? AND deleted IS NULL", (pid,)).fetchone()
    if not r:
        raise WikiError("That page doesn't exist any more.", 404)
    new_title = r["title"] if title is None else clean_title(title)
    if norm(new_title) != norm(r["title"]) and _find_by_title(conn, new_title, exclude=pid):
        raise WikiError(f'There is already a page called "{new_title}".', 409)
    new_cat = r["category"] if category is None else (category if category in CATEGORY_KEYS else "unsorted")
    new_body = r["body"] if body is None else str(body)
    relinked = 0
    if new_title != r["title"]:
        for o in conn.execute("SELECT DISTINCT p.id, p.body FROM wiki_links l JOIN wiki_pages p ON p.id = l.src "
                              "WHERE l.target = ? AND p.id != ?", (norm(r["title"]), pid)).fetchall():
            text, n = rewrite_links(o["body"], r["title"], new_title)
            if n:
                conn.execute("UPDATE wiki_pages SET body=?, updated=CURRENT_TIMESTAMP WHERE id=?", (text, o["id"]))
                _set_links(conn, o["id"], text)
                relinked += 1
        new_body, _ = rewrite_links(new_body, r["title"], new_title)          # links to itself
    conn.execute("UPDATE wiki_pages SET title=?, category=?, body=?, updated=CURRENT_TIMESTAMP WHERE id=?",
                 (new_title, new_cat, new_body, pid))
    _set_links(conn, pid, new_body)
    return {**get_page(conn, pid), "relinked": relinked}


def trash_page(conn, pid):
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
