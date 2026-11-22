"""Prepared fights as plain text: import (from notes, another Claude chat, an adventure) and export.

The text format, forgiving on purpose (English or German keywords, Markdown bullets and bold are fine):

    # Goblin ambush                     a fight starts with a heading, or "Fight:" / "Kampf:"
    3 Goblin Warrior                    a count, then the creature's name ("3x", "3×", "x3" work too)
    1 Bugbear Warrior
    Ally: 2 Wolf                        "Ally:" / "Verbündeter:" or "(ally)" puts it on the party's side
    Bandit Boss (HP 65, AC 15, XP 450, Init +2)   stats in brackets: a creature the library doesn't know
    Notes:                              "Notes:" / "Notizen:" — every line after it is the fight's notes
    They wait in the reeds.

Names are matched to homebrew creatures first, then SRD monsters (ignoring case and simple plurals).
Names that match nothing become custom creatures if HP is given, otherwise they are reported as missing,
with suggestions. JSON works too: {"name", "notes", "creatures": [{"name", "count", "side", "hp", "ac", "xp", "init"}]},
a list of those, or {"fights": [...]}.
"""
import json
import re

DEFAULT_NAME = "Imported fight"
MAX_FIGHTS = 50
MAX_COUNT = 50

_HEADING = re.compile(r"^(?:#{1,6}\s*|(?:fight|kampf|encounter|begegnung)\s*\d*\s*[:–—-]\s*)(.+)$", re.I)
_NOTES = re.compile(r"^(?:notes?|notizen?|beschreibung|description|tactics|taktik)\s*:\s*(.*)$", re.I)
_FOES = re.compile(r"^(?:creatures|kreaturen|monsters?|gegner|foes?|feinde?|enemies)\s*:\s*(.*)$", re.I)
_ALLIES = re.compile(r"^(?:all(?:y|ies)|verbündete[rn]?|verbuendete[rn]?)\s*:\s*(.*)$", re.I)
_BULLET = re.compile(r"^(?:[-*•+]|\d+[.)])\s+")
_COUNT_FIRST = re.compile(r"^(\d{1,3})\s*(?:[x×]\s*)?(?=\D)(.+)$", re.I)
_COUNT_LAST = re.compile(r"^(.+?)\s*(?:[x×]\s*(\d{1,3})|\((\d{1,3})\s*[x×]?\))$", re.I)
_PARENS = re.compile(r"\(([^()]*)\)")
_ALLY_WORD = re.compile(r"^(?:ally|allies|verbündete[rn]?|verbuendete[rn]?|friendly|freundlich)$", re.I)
_STAT = re.compile(r"\b(hp|tp|ac|rk|xp|ep|init(?:iative)?)\s*[:=]?\s*([+\-−]?\d+)", re.I)
_STAT_KEY = {"hp": "hp", "tp": "hp", "ac": "ac", "rk": "ac", "xp": "xp", "ep": "xp"}


def _clean(line):
    line = line.strip().replace("**", "").replace("__", "")
    return re.sub(r"\s+", " ", line)


def _int(v):
    try:
        return int(str(v).replace("−", "-").strip())
    except (TypeError, ValueError):
        return None


def parse_creature(text, side="foe"):
    """'3x Goblin Warrior (ally)' -> {name, count, kind, hp?, ac?, xp?, mod?}, or None if no name is left."""
    t = _clean(_BULLET.sub("", _clean(text)))
    m = _ALLIES.match(t)
    if m:
        side, t = "ally", m.group(1).strip()
    stats = {}
    for p in _PARENS.findall(t):
        found = _STAT.findall(p)
        for key, val in found:
            stats["mod" if key.lower().startswith("init") else _STAT_KEY[key.lower()]] = _int(val)
        if any(_ALLY_WORD.match(w.strip()) for w in re.split(r"[,;]", p)):
            side = "ally"
    t = _PARENS.sub(lambda mm: mm.group(0) if re.fullmatch(r"\s*\d{1,3}\s*[x×]?\s*", mm.group(1)) else "", t).strip()
    count = 1
    m = _COUNT_FIRST.match(t)
    if m:
        count, t = int(m.group(1)), m.group(2).strip()
    else:
        m = _COUNT_LAST.match(t)
        if m:
            count, t = int(m.group(2) or m.group(3)), m.group(1).strip()
    name = t.strip(" .,;:-–—")
    if not name:
        return None
    return {"name": name[:120], "count": max(1, min(MAX_COUNT, count)), "kind": side,
            **{k: v for k, v in stats.items() if v is not None}}


def _looks_like_creature(line):
    """Outside a "Creatures:" section, a line is a creature if it has a count, a bullet or stats in brackets."""
    t = _clean(line)
    return bool(_BULLET.match(t) or _COUNT_FIRST.match(t) or _COUNT_LAST.match(t) or _ALLIES.match(t)
                or any(_STAT.search(p) for p in _PARENS.findall(t)))


_SECTION = re.compile(r"^(notes?|notizen?|beschreibung|description|tactics|taktik|creatures|kreaturen|monsters?|gegner"
                      r"|foes?|feinde?|enemies|all(?:y|ies)|verbündete[rn]?|verbuendete[rn]?)\s*:?\s*$", re.I)


def _section(word):
    """'Notes' -> 'notes', 'Allies' -> 'ally', 'Monsters' -> 'foe'."""
    w = word.lower()
    if _NOTES.match(w + ":"):
        return "notes"
    return "ally" if _ALLIES.match(w + ":") else "foe"


def parse_text(text, first_line=0):
    """Text -> [{name, notes, creatures: [parsed creature]}]. Never raises on odd input; unknown lines become notes.
    Each creature keeps the number of its line ("line", counted from 0, plus first_line) so a fix can find it."""
    fights, cur = [], None
    mode, side = "auto", "foe"        # mode: auto (creature-looking lines are creatures) | creatures | notes

    def start(name):
        nonlocal cur, mode, side
        inner = _HEADING.match(name.strip())             # "## Fight 1: Ambush" -> "Ambush"
        if inner and not name.strip().startswith("#"):
            name = inner.group(1)
        cur = {"name": (name.strip(" #:") or DEFAULT_NAME)[:120], "notes": [], "creatures": []}
        fights.append(cur)
        mode, side = "auto", "foe"

    for i, raw in enumerate(str(text).replace("\r\n", "\n").split("\n")):
        line = _clean(raw)
        h = _HEADING.match(line)
        sec = _SECTION.match(h.group(1).strip(" #:") if h and line.startswith("#") else line)
        if sec:                                          # "Notes:", "## Allies", "Monsters:" on a line of its own
            if cur is None:
                start(DEFAULT_NAME)
            what = _section(sec.group(1))
            mode, side = ("notes", side) if what == "notes" else ("creatures", what)
            continue
        if h and (line.startswith("#") or mode != "notes"):
            start(h.group(1))
            continue
        if cur is None:
            if not line:
                continue
            # no heading: a first line that isn't a creature names the fight
            if not _looks_like_creature(line) and not _NOTES.match(line):
                start(line)
                continue
            start(DEFAULT_NAME)
        m = _NOTES.match(line)
        if m and mode != "notes":                        # "Notes: they wait in the reeds"
            mode = "notes"
            if m.group(1):
                cur["notes"].append(m.group(1))
            continue
        if mode == "notes":
            cur["notes"].append(raw.rstrip())
            continue
        if not line:
            continue
        m = _FOES.match(line)
        if m:                                            # "Monsters: 3 Goblin Warrior"
            line = m.group(1)
        if mode == "creatures" or m or _looks_like_creature(line):
            c = parse_creature(line, side)
            if c:
                c["line"] = first_line + i
                cur["creatures"].append(c)
        else:
            cur["notes"].append(raw.rstrip())
    out = []
    for f in fights[:MAX_FIGHTS]:
        notes = "\n".join(f["notes"]).strip("\n")
        if f["creatures"] or notes:                      # an intro line ("Here are your fights:") names nothing
            out.append({"name": f["name"], "notes": notes, "creatures": f["creatures"]})
    return out


def _from_json(data):
    """Our JSON shape (or a saved fight as the app stores it) -> the same as parse_text."""
    if isinstance(data, dict) and isinstance(data.get("fights"), list):
        data = data["fights"]
    if isinstance(data, dict):
        data = [data]
    out = []
    for f in data[:MAX_FIGHTS] if isinstance(data, list) else []:
        if not isinstance(f, dict):
            continue
        creatures = []
        for c in f.get("creatures") or []:
            if isinstance(c, str):
                p = parse_creature(c)
            elif isinstance(c, dict) and str(c.get("name") or "").strip():
                side = str(c.get("side") or c.get("kind") or "foe").lower()
                p = {"name": str(c["name"]).strip()[:120], "count": max(1, min(MAX_COUNT, _int(c.get("count")) or 1)),
                     "kind": "ally" if side in ("ally", "allies", "verbündeter") else "foe"}
                for key, src in (("hp", ("hp", "max", "hit_points")), ("ac", ("ac", "armor_class")),
                                 ("xp", ("xp", "experience_points")), ("mod", ("init", "initiative", "mod"))):
                    val = next((_int(c[s]) for s in src if c.get(s) not in (None, "")), None)
                    if val is not None:
                        p[key] = val
                if c.get("ref"):
                    p["ref"] = str(c["ref"])
            else:
                p = None
            if p:
                creatures.append(p)
        out.append({"name": (str(f.get("name") or "").strip() or DEFAULT_NAME)[:120],
                    "notes": str(f.get("notes") or "").strip(), "creatures": creatures})
    return out


def parse(text):
    """Text or JSON -> [{name, notes, creatures}]."""
    original = str(text or "").replace("\r\n", "\n")
    s = original.strip()
    if s[:1] in "[{":
        try:
            return _from_json(json.loads(s))
        except ValueError:
            pass
    # a chat answer: "Here they are:", a code block, "Let me know…". Only what's inside code blocks counts.
    blocks = list(re.finditer(r"^```[\w-]*[ \t]*\n(.*?)^```[ \t]*$", original, re.S | re.M))
    if not blocks:
        return parse_text(original)
    out = []
    for b in blocks:
        inner = b.group(1)
        if inner.strip()[:1] in "[{":
            try:
                out += _from_json(json.loads(inner))
                continue
            except ValueError:
                pass
        out += parse_text(inner, original[:b.start(1)].count("\n"))
    return out[:MAX_FIGHTS]


# ---------- matching names to creatures ----------

def _variants(name):
    """The name and its singular forms: 'Wolves' -> wolves, wolve, wolf."""
    n = re.sub(r"^(?:a|an|the)\s+", "", " ".join(name.lower().split()))
    out = [n]
    for suffix, repl in (("ies", "y"), ("ves", "f"), ("es", ""), ("s", "")):
        if n.endswith(suffix) and len(n) > len(suffix) + 2:
            out.append(n[: -len(suffix)] + repl)
    return out


def match(name, homebrew, srd):
    """(found or None, suggestions). homebrew / srd: {lowercase name: row} with idx, name, data (JSON text)."""
    for v in _variants(name):
        for source, table in (("homebrew", homebrew), ("srd", srd)):
            if v in table:
                return dict(table[v], source=source), []
    words = [w for w in re.findall(r"[a-zäöüß]+", name.lower()) if len(w) > 2]
    singular = {_variants(w)[-1] for w in words} | set(words)
    scored = []
    for table in (homebrew, srd):
        for key, row in table.items():
            score = sum(1 for w in singular if w in key)
            if score:
                scored.append((-score, len(key), row["name"]))
    return None, [n for *_, n in sorted(scored)[:3]]


def _monster_creature(row, kind):
    m = json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]
    init = m.get("initiative_bonus")
    if init is None:
        init = (m.get("modifiers") or {}).get("dexterity", 0)
    return {"ref": f"monster:{row['idx']}", "name": m.get("name") or row["name"], "kind": kind,
            "max": int(m.get("hit_points") or 1), "ac": int(m.get("armor_class") or 10), "mod": int(init or 0),
            "xp": int(m.get("experience_points") or 0)}


def resolve(fights, homebrew, srd):
    """Match every creature. Returns [{name, notes, rows: [{text, name, count, kind, status, match, suggest}],
    creatures: [what the fight stores], missing: n}]. status: homebrew | srd | custom | missing."""
    out = []
    for f in fights:
        rows, creatures = [], []
        for c in f["creatures"]:
            found, suggest = match(c["name"], homebrew, srd)
            row = {"name": c["name"], "count": c["count"], "kind": c["kind"], "suggest": suggest, "line": c.get("line")}
            if found:
                one = _monster_creature(found, c["kind"])
                row.update(status=found["source"], match=one["name"])
            elif c.get("hp"):
                one = {"name": c["name"], "kind": c["kind"], "max": max(1, c["hp"]), "ac": c.get("ac") or 10,
                       "mod": c.get("mod") or 0, "xp": max(0, c.get("xp") or 0)}
                row.update(status="custom", match=None)
            else:
                row.update(status="missing", match=None)
                rows.append(row)
                continue
            rows.append(row)
            creatures.extend(dict(one) for _ in range(c["count"]))
        out.append({"name": f["name"], "notes": f["notes"], "rows": rows, "creatures": creatures,
                    "missing": sum(1 for r in rows if r["status"] == "missing")})
    return out


# ---------- export ----------

def to_text(fight):
    """A saved fight as text that parse() reads back: counts per creature, stats for custom ones, then notes."""
    lines = [f"# {fight['name']}"]
    groups = {}
    for c in fight.get("creatures") or []:
        name = re.sub(r"\s+\d+$", "", c["name"]) if c.get("ref") else c["name"]
        key = (c.get("ref") or name.lower(), c.get("kind") == "ally")
        g = groups.setdefault(key, {"c": c, "name": name, "n": 0})
        g["n"] += 1
    for (ref, ally), g in groups.items():
        c = g["c"]
        stats = "" if c.get("ref") else f" (HP {c.get('max', 1)}, AC {c.get('ac', 10)}, XP {c.get('xp', 0)}, Init {int(c.get('mod') or 0):+d})"
        lines.append(f"{'Ally: ' if ally else ''}{g['n']} {g['name']}{stats}")
    notes = str(fight.get("notes") or "").strip()
    if notes:
        lines += ["Notes:", notes]
    return "\n".join(lines) + "\n"
