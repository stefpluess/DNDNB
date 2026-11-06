"""Initiative Ledger local server. Only uses the Python standard library.

    python server.py            # then open http://127.0.0.1:8765
    python server.py --open     # also opens your browser
"""
import argparse
import datetime
import json
import mimetypes
import os
import re
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import common
import db
import homebrew
import rules
import summons
import wiki

STATIC_DIR = os.path.join(db.ROOT, "static")
KINDS = {"monster", "spell", "equipment", "magic-item", "condition"}


class ApiError(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


class Raw:
    """A handler's reply that isn't JSON (an image, a download). filename: offered as a download."""

    def __init__(self, data, mime, cache="no-store", filename=None):
        self.data, self.mime, self.cache, self.filename = data, mime, cache, filename


# ---------- who may call the server ----------
#
# The server only listens on 127.0.0.1, but a web page open in the same browser could still send it
# requests (a form posting to http://127.0.0.1:8765), or reach it under its own domain name through
# DNS rebinding. So every request must name this server in its Host header, and a request that says
# where it comes from (Origin, which browsers send on cross-site and non-GET requests) must come from
# the app itself.

LOCAL_NAMES = ("127.0.0.1", "localhost", "[::1]")


def local_hosts(port):
    return {f"{n}:{port}" for n in LOCAL_NAMES} | ({*LOCAL_NAMES} if port == 80 else set())


def check_caller(headers, port, api=True):
    """Raise ApiError(403) unless the request comes from the app's own page (or a local tool like curl).
    api=False (static files): following a link to the app from another site still opens it."""
    hosts = local_hosts(port)
    host = (headers.get("Host") or "").strip().lower()
    if host and host not in hosts:
        raise ApiError("This server only answers requests addressed to 127.0.0.1 or localhost.", 403)
    origin = (headers.get("Origin") or "").strip().lower()
    if origin and origin not in {f"http://{h}" for h in hosts}:
        raise ApiError("Requests from other websites are not allowed.", 403)
    if api and (headers.get("Sec-Fetch-Site") or "").lower() in ("cross-site", "same-site"):
        raise ApiError("Requests from other websites are not allowed.", 403)


# ---------- handlers: reference data ----------

def status(_req, _q):
    with db.srd_session() as conn:
        counts = {r["kind"]: r["n"] for r in conn.execute("SELECT kind, COUNT(*) n FROM entries GROUP BY kind")}
        info = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM info")}
    return {"counts": counts, "info": info}


def like_escape(text):
    """Make % and _ in user input match literally in a LIKE ... ESCAPE '\\' pattern."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def meta(_req, _q):
    return common.meta()


def search(_req, q):
    kinds = [k for k in (q.get("kind", ["monster"])[0]).split(",") if k in KINDS] or ["monster"]
    text = (q.get("q", [""])[0]).strip()
    try:
        limit = max(1, min(200, int(q.get("limit", ["60"])[0])))
    except ValueError:
        raise ApiError("limit must be a whole number.")
    pat = like_escape(text)
    marks = ",".join("?" * len(kinds))
    sql = (f"SELECT kind, idx, name, meta, sort_key FROM entries WHERE kind IN ({marks}) AND name LIKE ? ESCAPE '\\' "
           f"ORDER BY (name LIKE ? ESCAPE '\\') DESC, sort_key, name LIMIT ?")
    with db.srd_session() as conn:
        rows = [dict(r) for r in conn.execute(sql, (*kinds, f"%{pat}%", f"{pat}%", limit)).fetchall()]
    if "monster" in kinds:
        # merge homebrew in: names starting with the search text first, then homebrew before SRD, then CR
        with db.campaign_session() as conn:
            hb = [dict(r, kind="monster", homebrew=True) for r in conn.execute(
                "SELECT idx, name, meta, sort_key FROM homebrew WHERE name LIKE ? ESCAPE '\\'", (f"%{pat}%",))]
        rows = sorted(hb + rows, key=lambda r: (not r["name"].lower().startswith(text.lower()),
                                               not r.get("homebrew"), r["sort_key"] or 0, r["name"]))[:limit]
    return rows


def entry(_req, _q, kind, idx):
    if kind == "monster" and idx.startswith("hb-"):
        return get_homebrew(_req, _q, idx)["data"]
    with db.srd_session() as conn:
        row = conn.execute("SELECT data FROM entries WHERE kind=? AND idx=?", (kind, idx)).fetchone()
    if not row:
        raise ApiError(f"No {kind} called '{idx}' in the database.", 404)
    return json.loads(row["data"])


def item_template(req, q, kind, idx):
    if kind == "spell":
        return rules.spell_from_srd(entry(req, q, kind, idx))
    return rules.item_from_srd(kind, entry(req, q, kind, idx))


# ---------- handlers: characters ----------

def _char_out(row):
    sheet = rules.normalize(json.loads(row["data"]))
    return {"id": row["id"], "sheet": sheet, "derived": rules.derive(sheet)}


def list_characters(_req, _q):
    with db.campaign_session() as conn:
        rows = conn.execute("SELECT id, data FROM characters ORDER BY name").fetchall()
    return [_char_out(r) for r in rows]


def get_character(_req, _q, cid):
    with db.campaign_session() as conn:
        row = conn.execute("SELECT id, data FROM characters WHERE id=?", (cid,)).fetchone()
    if not row:
        raise ApiError("Character not found.", 404)
    return _char_out(row)


def create_character(req, _q):
    body = req.json_body() or {}
    sheet = rules.normalize({**rules.blank_sheet(), **body.get("sheet", {})})
    with db.campaign_session() as conn:
        cur = conn.execute("INSERT INTO characters(name, data) VALUES (?, ?)", (sheet["name"], db.dumps(sheet)))
        cid = cur.lastrowid
    return get_character(req, {}, cid)


def update_character(req, _q, cid):
    body = req.json_body() or {}
    sheet = rules.normalize(body.get("sheet") or {})
    if body.get("apply_class_defaults"):
        rules.apply_class_defaults(sheet)
    if body.get("apply_slots"):
        for slot, n in zip(sheet["slots"], rules.derive(sheet)["suggested_slots"]):
            slot["max"], slot["used"] = n, min(slot["used"], n)
    report = None
    if body.get("rest") == "long":
        report = rules.long_rest(sheet)
    elif body.get("rest") == "short":
        try:
            spend = int(body.get("hit_dice") or 0)
        except (TypeError, ValueError):
            raise ApiError("hit_dice must be a whole number.")
        report = rules.short_rest(sheet, spend)
    with db.campaign_session() as conn:
        cur = conn.execute("UPDATE characters SET name=?, data=?, updated=CURRENT_TIMESTAMP WHERE id=?",
                           (sheet.get("name") or "Unnamed", db.dumps(sheet), cid))
        if cur.rowcount == 0:
            raise ApiError("Character not found.", 404)
    out = get_character(req, {}, cid)
    if report:
        out["rest"] = report
    return out


def summon(req, _q, cid):
    """Summon a subclass creature: returns it as a monster-shaped stat block, and spends the use it costs."""
    body = req.json_body() or {}
    key = body.get("key")
    char = get_character(req, {}, cid)
    sheet, derived = char["sheet"], char["derived"]
    if key not in ((derived.get("subclass") or {}).get("summons") or []):
        raise ApiError("This character can't summon that.")
    info = summons.SUMMONS[key]
    note, spent = "", False
    cost = info["cost"]
    if cost:
        res = next((r for r in derived["resources"] if r["key"] == cost), None)
        if res and res["used"] < res["max"]:
            sheet["resources_used"][cost] = res["used"] + 1
            spent = True
            note = f"Spent one {res['name']}."
        else:
            note = "No free use left: spend a spell slot (or the use) by hand."
    creature = summons.build(key, sheet, derived, body.get("form"))
    creature["proficiency_bonus"] = derived["prof_bonus"]
    if spent:
        with db.campaign_session() as conn:
            conn.execute("UPDATE characters SET data=?, updated=CURRENT_TIMESTAMP WHERE id=?", (db.dumps(sheet), cid))
    return {"creature": creature, "note": note, "character": get_character(req, {}, cid)}


def delete_character(_req, _q, cid):
    with db.campaign_session() as conn:
        conn.execute("DELETE FROM characters WHERE id=?", (cid,))
    return {"ok": True}


# ---------- handlers: homebrew creatures ----------

def list_homebrew(_req, _q):
    with db.campaign_session() as conn:
        return [dict(r) for r in conn.execute("SELECT idx, name, meta FROM homebrew ORDER BY name")]


def get_homebrew(_req, _q, idx):
    with db.campaign_session() as conn:
        row = conn.execute("SELECT data FROM homebrew WHERE idx=?", (idx,)).fetchone()
    if not row:
        raise ApiError("That homebrew creature no longer exists.", 404)
    return {"idx": idx, "data": json.loads(row["data"])}


def _save_homebrew(idx, data, insert=False):
    data = homebrew.normalize(data, idx)
    row = (data["name"] or "Unnamed", homebrew.meta(data), data["challenge_rating"], db.dumps(data))
    with db.campaign_session() as conn:
        if insert:
            conn.execute("INSERT INTO homebrew(name, meta, sort_key, data, idx) VALUES (?,?,?,?,?)", (*row, idx))
        else:
            cur = conn.execute("UPDATE homebrew SET name=?, meta=?, sort_key=?, data=?, updated=CURRENT_TIMESTAMP WHERE idx=?", (*row, idx))
            if cur.rowcount == 0:
                raise ApiError("That homebrew creature no longer exists.", 404)
    return {"idx": idx, "data": data, "meta": row[1]}


def create_homebrew(req, _q):
    body = req.json_body() or {}
    if body.get("copy_of"):
        src = entry(req, {}, "monster", body["copy_of"])
        data = homebrew.copy_from_srd(src)
    else:
        data = homebrew.blank_creature(body.get("name") or "New creature")
    return _save_homebrew(homebrew.new_idx(data["name"]), data, insert=True)


def update_homebrew(req, _q, idx):
    body = req.json_body() or {}
    return _save_homebrew(idx, body.get("data") or {})


def delete_homebrew(_req, _q, idx):
    with db.campaign_session() as conn:
        conn.execute("DELETE FROM homebrew WHERE idx=?", (idx,))
    return {"ok": True}


# ---------- handlers: encounter state ----------

def get_encounter(_req, _q):
    with db.campaign_session() as conn:
        row = conn.execute("SELECT value FROM kv WHERE key='encounter'").fetchone()
    return json.loads(row["value"]) if row else None


def put_encounter(req, _q):
    body = req.json_body()
    with db.campaign_session() as conn:
        conn.execute("INSERT OR REPLACE INTO kv(key, value) VALUES ('encounter', ?)", (db.dumps(body),))
    return {"ok": True}


# ---------- handlers: saved encounters (prepared fights) ----------

SAVED_FIELDS = ("ref", "name", "kind", "hp", "max", "ac", "mod", "xp", "notes")


def _clean_saved(body):
    name = str(body.get("name") or "").strip()
    if not name:
        raise ApiError("Give the encounter a name.")
    creatures = []
    for c in body.get("creatures") or []:
        if not isinstance(c, dict) or not str(c.get("name") or "").strip():
            continue
        creatures.append({k: c[k] for k in SAVED_FIELDS if k in c})
    if not creatures:
        raise ApiError("There are no foes or allies to save.")
    return name[:120], {"creatures": creatures}


def list_saved(_req, _q):
    with db.campaign_session() as conn:
        rows = conn.execute("SELECT id, name, data, updated FROM saved_encounters ORDER BY name COLLATE NOCASE").fetchall()
    return [{"id": r["id"], "name": r["name"], "updated": r["updated"], **json.loads(r["data"])} for r in rows]


def create_saved(req, _q):
    name, data = _clean_saved(req.json_body() or {})
    with db.campaign_session() as conn:
        cur = conn.execute("INSERT INTO saved_encounters(name, data) VALUES (?, ?)", (name, db.dumps(data)))
    return {"id": cur.lastrowid, "name": name, **data}


def update_saved(req, _q, sid):
    name, data = _clean_saved(req.json_body() or {})
    with db.campaign_session() as conn:
        cur = conn.execute("UPDATE saved_encounters SET name=?, data=?, updated=CURRENT_TIMESTAMP WHERE id=?", (name, db.dumps(data), int(sid)))
        if cur.rowcount == 0:
            raise ApiError("That saved encounter no longer exists.", 404)
    return {"id": int(sid), "name": name, **data}


def delete_saved(_req, _q, sid):
    with db.campaign_session() as conn:
        conn.execute("DELETE FROM saved_encounters WHERE id=?", (int(sid),))
    return {"ok": True}


# ---------- handlers: campaign wiki ----------

def _wiki(fn, *args, **kw):
    """Run a wiki function in a campaign session; its errors become API errors."""
    try:
        with db.campaign_session() as conn:
            return fn(conn, *args, **kw)
    except wiki.WikiError as e:
        raise ApiError(str(e), e.status)


def _page(fn, *args, **kw):
    """Like _wiki for functions that return a page: its links to characters, creatures and fights are resolved."""
    try:
        with db.campaign_session() as conn, db.srd_session() as srd:
            page = fn(conn, *args, **kw)
            page["refs"] = wiki.resolve_refs(conn, srd, page.get("refs") or [])
            return page
    except wiki.WikiError as e:
        raise ApiError(str(e), e.status)


def _page_fields(body):
    return {k: body[k] for k in ("title", "category", "body", "portrait", "fields", "tags", "parent_id") if k in body}


def list_wiki(_req, _q):
    return _wiki(wiki.list_pages)


def search_wiki(_req, q):
    return _wiki(wiki.search, q.get("q", [""])[0])


def get_wiki(_req, _q, pid):
    return _page(wiki.get_page, int(pid))


def create_wiki(req, _q):
    return _page(wiki.create_page, **_page_fields(req.json_body() or {}))


def update_wiki(req, _q, pid):
    return _page(wiki.update_page, int(pid), **_page_fields(req.json_body() or {}))


def delete_wiki(_req, _q, pid):
    return _wiki(wiki.trash_page, int(pid))


def wiki_trash(_req, _q):
    return _wiki(wiki.list_trash)


def restore_wiki(_req, _q, pid):
    return _page(wiki.restore_page, int(pid))


def wiki_mentions(_req, q):
    """?kind=char|monster|fight&name=...: the pages that link to that character, creature or fight."""
    return _wiki(wiki.mentions, q.get("kind", [""])[0], q.get("name", [""])[0])


def wiki_gallery(_req, _q):
    return _wiki(wiki.list_images)


def delete_image(_req, _q, file):
    return _wiki(wiki.delete_image, db.wiki_images_dir(), file)


def export_wiki(_req, _q):
    data = _wiki(wiki.export_zip, db.wiki_images_dir())
    return Raw(data, "application/zip", filename=f"campaign-wiki-{datetime.date.today().isoformat()}.zip")


def upload_image(req, q):
    """POST the image's bytes as the body (any Content-Type); ?name= is the file name it came with."""
    data = req.raw_body(wiki.MAX_IMAGE_BYTES)
    if not data:
        raise ApiError("No image was sent.")
    return _wiki(wiki.save_image, data, q.get("name", [""])[0], db.wiki_images_dir())


def get_image(_req, _q, file):
    try:
        path, mime = wiki.image_path(db.wiki_images_dir(), file)
    except wiki.WikiError as e:
        raise ApiError(str(e), e.status)
    with open(path, "rb") as f:
        # named by their content, so a file never changes: browsers may keep it
        return Raw(f.read(), mime, "public, max-age=31536000, immutable")


ROUTES = [
    ("GET", r"/api/status", status),
    ("GET", r"/api/meta", meta),
    ("GET", r"/api/search", search),
    ("GET", r"/api/entry/([a-z-]+)/([\w-]+)", entry),
    ("GET", r"/api/item-template/([a-z-]+)/([\w-]+)", item_template),
    ("GET", r"/api/characters", list_characters),
    ("POST", r"/api/characters", create_character),
    ("GET", r"/api/characters/(\d+)", get_character),
    ("PUT", r"/api/characters/(\d+)", update_character),
    ("DELETE", r"/api/characters/(\d+)", delete_character),
    ("POST", r"/api/characters/(\d+)/summon", summon),
    ("GET", r"/api/homebrew", list_homebrew),
    ("POST", r"/api/homebrew", create_homebrew),
    ("GET", r"/api/homebrew/(hb-[\w-]+)", get_homebrew),
    ("PUT", r"/api/homebrew/(hb-[\w-]+)", update_homebrew),
    ("DELETE", r"/api/homebrew/(hb-[\w-]+)", delete_homebrew),
    ("GET", r"/api/saved-encounters", list_saved),
    ("POST", r"/api/saved-encounters", create_saved),
    ("PUT", r"/api/saved-encounters/(\d+)", update_saved),
    ("DELETE", r"/api/saved-encounters/(\d+)", delete_saved),
    ("GET", r"/api/encounter", get_encounter),
    ("PUT", r"/api/encounter", put_encounter),
    ("GET", r"/api/wiki", list_wiki),
    ("POST", r"/api/wiki", create_wiki),
    ("GET", r"/api/wiki/search", search_wiki),
    ("GET", r"/api/wiki/trash", wiki_trash),
    ("GET", r"/api/wiki/(\d+)", get_wiki),
    ("PUT", r"/api/wiki/(\d+)", update_wiki),
    ("DELETE", r"/api/wiki/(\d+)", delete_wiki),
    ("POST", r"/api/wiki/(\d+)/restore", restore_wiki),
    ("POST", r"/api/wiki/images", upload_image),
    ("GET", r"/api/wiki/images/([\w.]+)", get_image),
    ("DELETE", r"/api/wiki/images/([\w.]+)", delete_image),
    ("GET", r"/api/wiki/gallery", wiki_gallery),
    ("GET", r"/api/wiki/mentions", wiki_mentions),
    ("GET", r"/api/wiki/export", export_wiki),
]


class Handler(BaseHTTPRequestHandler):
    server_version = "InitiativeLedger/1.0"

    def log_message(self, fmt, *args):  # keep the console quiet except for errors
        pass

    def json_body(self):
        """The request's JSON object, or None without a body. Every route takes an object."""
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError("Bad Content-Length header.")
        if n <= 0:
            return None
        try:
            body = json.loads(self.rfile.read(n))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ApiError("Request body is not valid JSON.")
        if body is not None and not isinstance(body, dict):
            raise ApiError("Request body must be a JSON object.")
        return body

    def raw_body(self, limit):
        """The request body as bytes, refused before reading when it's over `limit`."""
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError("Bad Content-Length header.")
        if n > limit:
            self.close_connection = True          # the unread body can't be left on the connection
            raise ApiError(f"That file is larger than {limit // (1024 * 1024)} MB.", 413)
        return self.rfile.read(n) if n > 0 else b""

    def send_raw(self, raw):
        self.send_response(200)
        self.send_header("Content-Type", raw.mime)
        self.send_header("Content-Length", str(len(raw.data)))
        self.send_header("Cache-Control", raw.cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        if raw.filename:
            self.send_header("Content-Disposition", f'attachment; filename="{raw.filename}"')
        self.end_headers()
        self.wfile.write(raw.data)

    def send_json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_static(self, path):
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        full = os.path.realpath(os.path.join(STATIC_DIR, rel))
        if os.path.commonpath([full, os.path.realpath(STATIC_DIR)]) != os.path.realpath(STATIC_DIR) or not os.path.isfile(full):
            return self.send_json({"error": "Not found"}, 404)
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(full)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def dispatch(self, method):
        url = urlparse(self.path)
        try:
            check_caller(self.headers, self.server.server_address[1], api=url.path.startswith("/api/"))
            for m, pattern, fn in ROUTES:
                if m == method:
                    match = re.fullmatch(pattern, url.path)
                    if match:
                        out = fn(self, parse_qs(url.query), *match.groups())
                        return self.send_raw(out) if isinstance(out, Raw) else self.send_json(out)
            if method == "GET" and not url.path.startswith("/api/"):
                return self.send_static(url.path)
            self.send_json({"error": "Not found"}, 404)
        except ApiError as e:
            self.send_json({"error": str(e)}, e.status)
        except Exception as e:
            traceback.print_exc()
            self.send_json({"error": f"Server error: {e}"}, 500)

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--open", action="store_true", help="open the app in your browser")
    args = ap.parse_args()
    db.srd().close()
    db.campaign().close()
    url = f"http://127.0.0.1:{args.port}"
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    counts = status(None, None)["counts"]
    print(f"Initiative Ledger running at {url}  (Ctrl+C to stop)")
    if not counts:
        print("No SRD data yet. Run:  python import_srd.py")
    if args.open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
