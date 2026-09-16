#!/usr/bin/env python3
"""levelctl — coordination CLI for parallel level-building agents (ALL IN booth).

Layout-as-manifest: each attendee level lives in its own folder
`levels/<id>/level.json`. Building agents NEVER edit shared files or each
other's work — a level is claimed atomically by creating its folder, and
`levels/manifest.json` is a derived cache (regenerated here, never hand-edited).

The loop for one building agent (one chat = one attendee):
  1. python3 levelctl.py claim-next        claim the oldest pending submission
  2. edit levels/<id>/level.json           your level — nobody else touches it
  3. python3 levelctl.py url <id>          private playtest URL for YOUR tab
  4. python3 levelctl.py validate <id>     sanity-check before publishing
  5. python3 levelctl.py status <id> ready publish → appears in the booth game

Commands:
  new        --name ".." --title ".." --genre platformer --prompt "..." [-h]
  claim-next claim the oldest pending submission and scaffold its draft level
  status     <id> ready|draft          switch publish state (rebuilds manifest)
  list       [--all]                   enumerate levels (default: ready only)
  validate   <id>                      schema + genre sanity checks
  url        <id> [--port 8181]        print the playtest URL
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata

ROOT = os.path.dirname(os.path.abspath(__file__))
LEVELS = os.path.join(ROOT, "levels")
PENDING = os.path.join(ROOT, "submissions", "pending")
CLAIMED = os.path.join(ROOT, "submissions", "claimed")
LEGACY = os.path.join(ROOT, "submissions", "pending.jsonl")
MANIFEST = os.path.join(ROOT, "levels", "manifest.json")

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.\-]+")

# ---- generic helpers ---------------------------------------------------------
def slugify(text):
    s = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "level"

def load_level(lid):
    with open(os.path.join(LEVELS, lid, "level.json"), "r", encoding="utf-8") as f:
        return json.load(f)

def write_level(lid, data):
    path = os.path.join(LEVELS, lid, "level.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)  # atomic publish of the level file

def regen_manifest():
    """Rebuild levels/manifest.json from the folders (ready levels only)."""
    entries = []
    for lid in sorted(os.listdir(LEVELS)):
        p = os.path.join(LEVELS, lid, "level.json")
        if not os.path.isfile(p):
            continue
        try:
            d = load_level(lid)
        except Exception:
            continue
        if d.get("status", "ready") != "draft":
            entries.append({"id": lid, "enabled": True, "order": d.get("order")})
    entries.sort(key=lambda e: (e["order"] if isinstance(e["order"], int) else 999, str(e.get("order") is None), e["id"]))
    tmp = MANIFEST + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"schema": 1, "title": "ALL IN ARCADE",
                   "levels": [{"id": e["id"], "enabled": True} for e in entries]}, f, indent=2)
        f.write("\n")
    os.replace(tmp, MANIFEST)

def ensure_dirs():
    os.makedirs(PENDING, exist_ok=True)
    os.makedirs(CLAIMED, exist_ok=True)

# ---- submission queue (one JSON file per attendee = race-free claims) --------
def migrate_legacy():
    """pending.jsonl (old format) → one JSON file per row in submissions/pending/."""
    if not os.path.isfile(LEGACY):
        return
    with open(LEGACY, "r", encoding="utf-8") as f:
        rows = [ln for ln in f.read().splitlines() if ln.strip()]
    for i, row in enumerate(rows):
        try:
            rec = json.loads(row)
        except Exception:
            rec = {"name": "unknown", "email": "", "genre": "auto", "prompt": row[:400]}
        fn = os.path.join(PENDING, "imported-%03d-%s.json" % (i, slugify(rec.get("name", "attendee"))))
        with open(fn, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, indent=2)
    os.replace(LEGACY, LEGACY + ".imported")
    print("[levelctl] migrated pending.jsonl → submissions/pending/*.json", file=sys.stderr)

def next_pending_file():
    ensure_dirs()
    migrate_legacy()
    rows = sorted(f for f in os.listdir(PENDING) if f.endswith(".json"))
    return os.path.join(PENDING, rows[0]) if rows else None

# ---- genre scaffolds ---------------------------------------------------------
DEFAULT_STYLE = {
    "platformer": {
        "backdrop": "clouds", "music": "upbeat",
        "sky": ["#3f8dff", "#7fc4ff", "#e8f7ff"], "platform": "cloud", "accent": "#ffcf3e",
        "glyphs": {"player": "🍄", "coin": "⭐", "goal": "🏁"},
    },
    "racer": {
        "backdrop": "synthwave", "music": "drive",
        "sky": ["#1b0540", "#7a2bbf", "#ff7a2d"], "grid": ["#ff2d95", "#00e5ff"],
        "accent": "#ffe066", "glyphs": {"player": "🏎️", "palm": "🌴", "sign": "🪧", "traffic": "🚙"},
    },
    "puzzle": {
        "backdrop": "ice", "music": "chill", "sky": ["#a8d4ff", "#e8f7ff"],
        "accent": "#8ce0ff", "glyphs": {"player": "🎿", "crate": "📦"},
    },
    "shooter": {
        "backdrop": "space", "music": "tense", "sky": ["#050514", "#0d1033"],
        "accent": "#7dfcff", "glyphs": {"player": "🛸", "enemy": "👾"},
    },
}

def default_data(genre):
    if genre == "platformer":
        return {
            # TODO rows: all the SAME length (≤24 chars, ≤12 rows). chars:
            # air · # solid · = one-way · ^ spike · o coin · P spawn · G goal
            "rows": [
                "....................",
                "....................",
                "....................",
                ".....o.....o........",
                "....................",
                ".P................G.",
                "####################",
            ],
        }
    if genre == "racer":
        return {
            "segments": [
                {"n": 20, "curve": 0, "hill": 0},
                {"n": 14, "curve": 14, "hill": 6},
                {"n": 18, "curve": 0, "hill": 0},
                {"n": 16, "curve": -14, "hill": -6},
                {"n": 20, "curve": 0, "hill": 0},
            ],
            "palmEvery": 8, "signEvery": 33, "trafficCount": 5, "lives": 3,
        }
    if genre == "puzzle":
        # TODO: design + VERIFY a solvable board before status ready.
        return {"_todo": "design this Sokoban board (crates o == targets ., verify solvable)",
                "rows": ["######", "# o..#", "# @  #", "######"]}
    if genre == "shooter":
        return {"enemyRate": 1.2, "targetScore": 500, "hp": 3}
    return {}

def infer_title(rec):
    words = re.findall(r"[A-Za-z0-9']+", rec.get("prompt", ""))[:6]
    words = [w for w in words if w.lower() not in ("a", "an", "the", "like", "make", "want", "and", "or", "with", "of")]
    return " ".join(words[:5]).title() or "Untitled Level"

def normalize_genre(g):
    g = (g or "").strip().lower()
    return g if g in DEFAULT_STYLE else "platformer"

def allocate_level_id(name, title):
    base = slugify((name or "attendee") + "-" + (title or ""))[:48].strip("-") or "level"
    for cand in [base] + ["%s-%d" % (base, n) for n in range(2, 50)]:
        try:
            os.makedirs(os.path.join(LEVELS, cand), exist_ok=False)  # atomic claim
            return cand
        except FileExistsError:
            continue
    sys.exit("could not allocate a unique level id")

def scaffold(name, title, genre, prompt, brief, objective, remix_of=None):
    genre = genre if genre in DEFAULT_STYLE else "platformer"
    lid = allocate_level_id(name, title)
    data = {
        "schema": 1, "id": lid, "title": title, "genre": genre, "version": 1,
        "authors": [{"name": name, "kind": ("remix" if remix_of else "original")}],
        "remixOf": remix_of, "status": "draft", "order": None,
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "prompt": prompt,
        "brief": brief or ((prompt[:90].rstrip() + "…") if len(prompt) > 90 else prompt),
        "objective": objective or "Per the level's own design.",
        "win": {"platformer": {"type": "reach_goal"}, "racer": {"type": "reach_finish"},
                "puzzle": {"type": "crates_on_targets"}, "shooter": {"type": "target_score"}}[genre],
        "style": DEFAULT_STYLE[genre],
        "data": default_data(genre),
    }
    write_level(lid, data)
    regen_manifest()
    out = {"ok": True, "claimed_from": None, "id": lid, "file": "levels/%s/level.json" % lid,
           "playtest_url": "http://localhost:8181/?level=%s" % lid, "status": "draft"}
    if (genre == "platformer") and (name == ""):
        out["genre_note"] = "genre was 'auto' — defaulted to platformer; change 'genre' in the JSON if the idea fits another, then run the SAME validate/ready commands."
    return out

# ---- commands -----------------------------------------------------------------
def cmd_new(args):
    if not args.name or not args.prompt:
        sys.exit("--name and --prompt are required for a new level")
    res = scaffold(args.name.strip(), (args.title or "Untitled Level").strip(),
                   normalize_genre(args.genre), args.prompt.strip(), args.brief, args.objective,
                   remix_of=getattr(args, "remix_of", None))
    res["claimed_from"] = args.from_submission or None
    print(json.dumps(res, ensure_ascii=False))

def normalize_genre(g):
    g = (g or "").strip().lower()
    return g if g in DEFAULT_STYLE else "platformer"

def cmd_claim_next(args):
    f = next_pending_file()
    if not f:
        print(json.dumps({"ok": False, "none_pending": True}))
        return
    with open(f, "r", encoding="utf-8") as fh:
        rec = json.load(fh)
    dst = os.path.join(CLAIMED, os.path.basename(f))
    if os.path.exists(dst):
        dst = os.path.join(CLAIMED, str(int(time.time())) + "-" + os.path.basename(f))
    os.rename(f, dst)  # atomic claim — no other agent can take this row
    title = rec.get("title") or infer_title(rec)
    res = scaffold(rec.get("name", ""), title, normalize_genre(rec.get("genre")),
                   rec.get("prompt", ""), rec.get("brief"), rec.get("objective"))
    res["claimed_from"] = os.path.relpath(dst, ROOT)
    res["attendee_email_private"] = rec.get("email", "")  # never goes into level.json
    print(json.dumps(res, ensure_ascii=False))

def next_pending_file():
    ensure_dirs()
    migrate_legacy()
    rows = sorted(f for f in os.listdir(PENDING) if f.endswith(".json"))
    return os.path.join(PENDING, rows[0]) if rows else None

def cmd_status(args):
    path = os.path.join(LEVELS, args.id, "level.json")
    if not os.path.isfile(path):
        sys.exit("no such level: %s" % args.id)
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    d["status"] = args.value
    write_level(args.id, d)
    regen_manifest()
    print(json.dumps({"ok": True, "id": args.id, "status": args.value}))

def cmd_list(args):
    out = []
    for lid in sorted(os.listdir(LEVELS)):
        p = os.path.join(LEVELS, lid, "level.json")
        if not os.path.isfile(p):
            continue
        try:
            d = load_level(lid)
        except Exception as e:
            out.append({"id": lid, "broken": True, "error": str(e)})
            continue
        if not args.all and d.get("status", "ready") != "draft" if hasattr(args, "all") else False:
            pass
        if (not getattr(args, "all", False)) and d.get("status", "ready") == "draft":
            continue
        out.append({"id": lid, "status": d.get("status", "ready"), "genre": d.get("genre"),
                    "title": d.get("title"), "authors": [a.get("name") for a in d.get("authors", [])]})
    print(json.dumps(out, indent=2))

def cmd_validate(args):
    p = os.path.join(LEVELS, args.id, "level.json")
    if not os.path.isfile(p):
        sys.exit("no such level: %s" % args.id)
    with open(p, "r", encoding="utf-8") as f:
        d = json.load(f)
    problems = []
    if d.get("id") != args.id:
        err("level.json 'id' (%r) must match folder name (%r)" % (d.get("id"), args.id))
    raw = json.dumps(d, ensure_ascii=False)
    if EMAIL_RE.search(raw):
        sys.exit("PRIVACY: an email address was found in the level file — remove it (emails only live in submissions/claimed/*)")
    if "_todo" in d.get("data", {}):
        err("data still contains the scaffold _todo — finish the level data")
    genre = d.get("genre")
    if genre == "platformer":
        rows = (d.get("data") or {}).get("rows") or []
        if not rows:
            sys.exit("platformer needs data.rows")
        if not raw or len(rows) > 12:
            sys.exit("platformer must have 1..12 rows")
        widths = {len(r) for r in rows}
        if len(widths) != 1:
            sys.exit("platformer rows must all be the same length (%d different widths)" % len(widths))
        if max(widths) > 24:
            sys.exit("rows are wider than 24 chars")
        flat = "".join(rows)
        if flat.count("P") != 1:
            sys.exit("exactly one spawn 'P' required (found %d)" % flat.count("P"))
        if flat.count("G") != 1:
            sys.exit("exactly one goal 'G' required (found %d)" % flat.count("G"))
        allowed = set(" .#=^oPG%")
        bad = sorted(set(flat) - allowed)
        if bad:
            sys.exit("unknown tile chars: %r" % bad)
    elif genre == "puzzle":
        rows = (d.get("data") or {}).get("rows") or []
        flat = "".join(rows)
        if flat.count("o") != flat.count("."):
            sys.exit("puzzle: crates 'o' (%d) must equal targets '.' (%d)" % (flat.count("o"), flat.count(".")))
    elif genre == "racer":
        segs = (d.get("data") or {}).get("segments") or []
        if not segs:
            sys.exit("racer needs data.segments")
    elif genre == "shooter":
        dd = d.get("data") or {}
        if not (dd.get("targetScore", 0) > 0) or not (dd.get("hp", 0) > 0):
            sys.exit("shooter needs positive targetScore and hp")
    else:
        note("genre '%s' — ensure a matching src/genres/%s.js module exists" % (genre, genre))
    status = d.get("status", "ready")
    print("OK: %s (%s, status=%s, by %s)" % (args.id, genre, status,
                                             ", ".join(a.get("name", "?") for a in d.get("authors", []))))
    if status != "ready":
        print("note: still a draft — publish with: python3 levelctl.py status %s ready" % args.id)

def cmd_url(args):
    try:
        load_level(args.id)
    except Exception:
        sys.exit("no such level: %s" % args.id)
    print("http://localhost:%d/?level=%s" % (args.port, args.id))

def err(msg):
    print("✗ %s" % msg)
    sys.exit(1)

def note(msg):
    """Informational validator output (not a failure) — e.g. custom genres."""
    print("· %s" % msg)

def main():
    ap = argparse.ArgumentParser(description="booth level coordination for parallel agents")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("new", help="create a draft level directly (atomic claim)")
    s.add_argument("--name", required=True)
    s.add_argument("--title")
    s.add_argument("--genre", default="platformer")
    s.add_argument("--prompt", required=True)
    s.add_argument("--brief")
    s.add_argument("--objective")
    s.add_argument("--from-submission", default=None)
    s.add_argument("--remix-of", dest="remix_of", default=None)
    s.set_defaults(fn=cmd_new)

    s = sub.add_parser("claim-next", help="claim the oldest pending attendee submission")
    s.set_defaults(fn=cmd_claim_next)

    s = sub.add_parser("status", help="ready|draft")
    s.add_argument("id")
    s.add_argument("value", choices=["ready", "draft"])
    s.set_defaults(fn=cmd_status)

    s = sub.add_parser("list", help="enumerate levels")
    s.add_argument("--all", action="store_true")
    s.set_defaults(fn=cmd_list)

    s = sub.add_parser("validate", help="sanity-check a level")
    s.add_argument("id")
    s.set_defaults(fn=cmd_validate)

    s = sub.add_parser("url", help="print the private playtest URL")
    s.add_argument("id")
    s.add_argument("--port", type=int, default=8181)
    s.set_defaults(fn=cmd_url)

    args = ap.parse_args()
    args.fn(args)

if __name__ == "__main__":
    main()
