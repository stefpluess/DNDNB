"""Import D&D 2024 rules reference data (SRD 5.2) into data/srd.db.

Source: Open5e (https://open5e.com), filtered to the document "srd-2024".

Usage:
    python import_srd.py                       # download (needs internet, about a minute)
    python import_srd.py --save-dir backup     # download and also keep the raw JSON in ./backup
    python import_srd.py --from-dir backup     # offline: load a folder saved earlier with --save-dir
    python import_srd.py --only creatures spells

Re-running is safe: everything is downloaded first and only then written, and a category that
comes back empty keeps its old data. Your characters and homebrew (campaign.db) are never touched.
After importing, a short sanity check prints a few known entries so you can see the data looks right.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

import db
import rules
from common import fmt_cr, ordinal, short_key

API = "https://api.open5e.com/v2"
DOCUMENT = "srd-2024"
GAMESYSTEM = "5e-2024"

# endpoint -> kind stored in the db
SOURCES = {
    "creatures": "monster",
    "spells": "spell",
    "items": "equipment",
    "magicitems": "magic-item",
    "conditions": "condition",
}


def name_of(ref):
    return (ref or {}).get("name", "") if isinstance(ref, dict) else str(ref or "")


def weapon_props(w):
    """[(lowercase name, detail, is_mastery)] for an Open5e weapon object."""
    out = []
    for p in w.get("properties") or []:
        prop = p.get("property") or {}
        out.append(((prop.get("name") or "").lower(), p.get("detail"), (prop.get("type") or "").lower() == "mastery"))
    return out


def weapon_is_ranged(w):
    names = {n for n, _, _ in weapon_props(w)}
    return "ammunition" in names or (w.get("name") or "").lower() == "dart"


# ---------- one-line summaries for search results ----------

def summarize(kind, d):
    """Return (meta, sort_key)."""
    if kind == "monster":
        cr = float(d.get("challenge_rating") or 0)
        return f"{name_of(d.get('size'))} {name_of(d.get('type')).lower()} · CR {fmt_cr(cr)}".strip(), cr
    if kind == "spell":
        lvl = int(d.get("level") or 0)
        school = name_of(d.get("school")).lower()
        head = f"{school.capitalize()} cantrip" if lvl == 0 else f"{ordinal(lvl)}-level {school}"
        return head + (" · Concentration" if d.get("concentration") else ""), lvl
    if kind in ("equipment", "magic-item"):
        parts = []
        if kind == "magic-item":
            parts.append(name_of(d.get("rarity")))
        w, a = d.get("weapon"), d.get("armor")
        if w:
            cat = "Simple" if w.get("is_simple") else "Martial"
            rng = "ranged" if weapon_is_ranged(w) else "melee"
            mastery = next((n.title() for n, _, m in weapon_props(w) if m), "")
            parts.append(f"{cat} {rng} weapon · {w.get('damage_dice', '')} {name_of(w.get('damage_type')).lower()}"
                         + (f" · {mastery}" if mastery else ""))
        elif a:
            if rules.is_shield(a, d.get("name", "")):
                parts.append(f"Shield · +{a.get('ac_base', 2)} AC")
            else:
                parts.append(f"{(a.get('category') or '').title()} armor · AC {a.get('ac_display') or a.get('ac_base')}")
        else:
            parts.append(name_of(d.get("category")) or "Gear")
        return " · ".join(p for p in parts if p), 0
    return "Condition", 0


# ---------- downloading ----------

def fetch_json(url, tries=4):
    req = urllib.request.Request(url, headers={"User-Agent": "initiative-ledger-importer/2.0", "Accept": "application/json"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404) or attempt == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
        time.sleep(2 * (attempt + 1))


def download(endpoint):
    if endpoint == "conditions":
        url = f"{API}/conditions/?format=json&limit=100"
    else:
        url = f"{API}/{endpoint}/?format=json&limit=100&document__key={DOCUMENT}"
    out = []
    while url:
        page = fetch_json(url)
        out.extend(page.get("results") or [])
        print(f"\r  {endpoint}: {len(out)}/{page.get('count', '?')}", end="", flush=True)
        url = page.get("next")
        if url and "format=json" not in url:
            url += "&format=json"
    print()
    return out


def keep(endpoint, d):
    """Only SRD 5.2 content (guards against the API ignoring the document filter)."""
    if endpoint == "conditions":
        return any(x.get("gamesystem") == GAMESYSTEM or x.get("document") == DOCUMENT for x in d.get("descriptions") or [])
    return ((d.get("document") or {}).get("key")) == DOCUMENT


def normalize(endpoint, d):
    """Store a few things in a simpler shape."""
    if endpoint == "conditions":
        desc = next((x.get("desc") for x in d.get("descriptions") or []
                     if x.get("gamesystem") == GAMESYSTEM or x.get("document") == DOCUMENT), "")
        return {"key": d["key"], "name": d["name"], "desc": desc}
    return d


def store(conn, kind, items):
    """Replace one category. Returns the number stored; an empty list leaves the old data alone."""
    if not items:
        return 0
    rows = []
    for d in items:
        meta, sort_key = summarize(kind, d)
        rows.append((kind, short_key(d["key"]), d["name"], meta, sort_key, db.dumps(d)))
    with conn:  # one transaction: delete and insert succeed or fail together
        conn.execute("DELETE FROM entries WHERE kind=?", (kind,))
        conn.executemany("INSERT OR REPLACE INTO entries(kind, idx, name, meta, sort_key, data) VALUES (?,?,?,?,?,?)", rows)
    return len(rows)


SANITY = [
    ("monster", "goblin-warrior", lambda d: f"AC {d.get('armor_class')}, HP {d.get('hit_points')}, "
                                            f"initiative {d.get('initiative_bonus', '?'):+}, {len(d.get('actions') or [])} actions"),
    ("equipment", "longsword", lambda d: (lambda t: f"{t['type']}, {t['weapon']['category']} {t['weapon']['range'].lower()}, "
                                                     f"{t['weapon']['dice']} {t['weapon']['dtype']}, mastery {t['weapon']['mastery']}"
                                          if t.get("weapon") else f"type {t['type']} (expected weapon)")(rules.item_from_srd("equipment", d))),
    ("equipment", "shield", lambda d: (lambda t: f"{t['type']}, +{t['armor']['base']} AC" if t["type"] == "shield"
                                       else f"type {t['type']} (expected shield)")(rules.item_from_srd("equipment", d))),
    ("equipment", "chain-mail", lambda d: (lambda t: f"{t['type']}, AC {t['armor']['base']}, Str {t['armor']['str_min']}"
                                           if t["type"] == "armor" else f"type {t['type']} (expected armor)")(rules.item_from_srd("equipment", d))),
    ("spell", "fireball", lambda d: f"level {d.get('level')}, {(d.get('school') or {}).get('name')}"),
]


def sanity_check(conn):
    """Print a few known entries the way the app will read them."""
    print("Sanity check:")
    problems = 0
    for kind, idx, show in SANITY:
        row = conn.execute("SELECT name, data FROM entries WHERE kind=? AND idx=?", (kind, idx)).fetchone()
        if not row:
            print(f"  ? {kind} '{idx}' not found")
            problems += 1
            continue
        try:
            text = show(json.loads(row["data"]))
        except Exception as e:  # report shape problems instead of crashing the import
            text, problems = f"could not read it ({e})", problems + 1
        flag = "!" if "expected" in text or "could not" in text else "✓"
        problems += flag == "!"
        print(f"  {flag} {row['name']}: {text}")
    if problems:
        print("Something looks off. The data source may have changed format; please report the lines above.")
    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-dir", help="load JSON saved earlier with --save-dir instead of downloading")
    ap.add_argument("--save-dir", help="also save the downloaded JSON here for offline re-imports")
    ap.add_argument("--only", nargs="+", choices=list(SOURCES), help="import only these categories")
    args = ap.parse_args(argv)

    print(f"Importing D&D 2024 SRD 5.2 from {args.from_dir or API}")
    raw_by_endpoint = {}
    for endpoint in args.only or SOURCES:          # 1) read everything first
        if args.from_dir:
            path = os.path.join(args.from_dir, f"{endpoint}.json")
            if not os.path.exists(path):
                print(f"  ! {path} not found, skipping")
                continue
            with open(path, encoding="utf-8") as f:
                raw_by_endpoint[endpoint] = json.load(f)
        else:
            try:
                raw_by_endpoint[endpoint] = download(endpoint)
            except Exception as e:
                raise SystemExit(f"Could not download {endpoint} from Open5e: {e}\n"
                                 "Nothing was changed. Check your internet connection, or use --from-dir with a saved copy.")
    if args.save_dir and not args.from_dir:
        os.makedirs(args.save_dir, exist_ok=True)
        for endpoint, raw in raw_by_endpoint.items():
            with open(os.path.join(args.save_dir, f"{endpoint}.json"), "w", encoding="utf-8") as f:
                json.dump(raw, f)

    conn = db.srd()                                 # 2) then write, one category at a time
    for endpoint, raw in raw_by_endpoint.items():
        items = [normalize(endpoint, d) for d in raw if keep(endpoint, d)]
        n = store(conn, SOURCES[endpoint], items)
        if n:
            print(f"  stored {n} {endpoint}")
        else:
            print(f"  ! {endpoint}: none of the {len(raw)} downloaded entries are SRD 5.2; kept the existing data")
    conn.execute("INSERT OR REPLACE INTO info VALUES ('imported_at', datetime('now'))")
    conn.execute("INSERT OR REPLACE INTO info VALUES ('ruleset', 'SRD 5.2 (2024)')")
    conn.commit()
    sanity_check(conn)
    print(f"Done. Database: {db.SRD_DB}")


if __name__ == "__main__":
    sys.exit(main())
