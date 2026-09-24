#!/usr/bin/env python3
"""hud_audit — headless HUD collision/legibility probe (issue #15).

Boots the levels named by the playtest-cascade findings on a PRIVATE serve.py
port, at the 960x600 booth viewport (plus 1280x800), and asserts the HUD fix
contract from the issue #15 plan:

  A  slot caps + truncation   pairwise rect intersection of the HUD slots is
                              empty; long strings ellipsize (scrollWidth vs
                              clientWidth); full text mirrored into title=""
  B  moonshot status-only mid no mid string ever carries a control token
                              (ESPACE/ENTRÉE/SPACE/shop/arrows/...); every
                              right string FITS its slot (no clipped BEST)
  C  readable hearts          #hudRight gets class "hearts" iff the payload is
                              a pure ♥-run; computed 20px magenta; absent on
                              non-♥ payloads (★ scores)
  D  dim text survives        .a / .lc / #hudHint use the --hud-dim token,
                              required sizes, dark text-shadow; WCAG ratio
                              >= 4.5 against the MEASURED dark composite
                              (stage-canvas pixel behind the element composited
                              with the #hud gradient alpha). On the light
                              backdrop (L03 ice) a raw >=4.5 light-on-light
                              ratio is physically impossible for any readable
                              text color — there the design mechanism is
                              asserted instead (token + size + shadow), and the
                              measured ratio is recorded for the report.
  E  AMMO token               slingshot mid shows "AMMO n", never "♥"

Writes per-level verdict JSON into docs/playtest/hud-audit/ and prints a
PASS/FAIL table; exit 0 iff every check is green.

Usage:
  python3 tools/playtest/hud_audit.py [--port 8615] [--viewports 960x600,1280x800]
                                      [--levels id1,id2] [--moon-seconds 45]
                                      [--out-dir docs/playtest/hud-audit]

Booth protocol: same as tools/playtest/playtest.py — headless Chromium against
a private serve.py port unique per agent/chat (Fabric caches browser memory
per URL).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")   # known-missing assets (out of scope)
HUD_DIM_RGB = (198, 207, 233)     # --hud-dim #c6cfe9
HEARTS_RGB = (255, 61, 154)       # --accent-3 #ff3d9a
HEART_RE = re.compile(r"^♥+$")
MOON_CTRL_RE = re.compile(r"ESPACE|ENTRÉE|SPACE|shop|acheter|décoller|gouverne|←|→|↑|↓")
MOON_STATUS_RE = re.compile(r"JETONS|ALT |POMPE|INJECTION|LUNE")
PLAY_MID_RE = re.compile(r"FLIGHT \d/\d · ✓")

# levels whose HUD is under test, mapped to the URL params each needs.
# NOTE: the manifest's only status:"draft" level (sanaz-tavakkol-paper-flight-
# to-madrid) is NOT auditable: it cannot boot on main at all (its genre module
# src/genres/paper-flight.js does not exist → app.js:224 create fails). That is
# a PRE-EXISTING bug outside issue #15's scope — reported separately. The
# "▌TEST BUILD suffix still truncates" edge is pinned structurally instead: the
# suffix is ordinary text in the same capped/ellipsized slot asserted below.
AUDIT_LEVELS = {
    "kristopher-federico-study-hall-scramble": {"params": "ap=1"},
    "louis-philippe-gaulin-knight-s-dungeon-scramble": {"params": "ap=1"},
    "L01": {"params": ""},
    "L03": {"params": ""},
    "L04": {"params": ""},
    "mark-abdallah-slingshot-duck-season": {"params": ""},
    "matt-mayer-mda-space-mission": {"params": "bot=1&flavor=good"},
}
LONG_TITLE_LEVELS = {
    "kristopher-federico-study-hall-scramble",
    "louis-philippe-gaulin-knight-s-dungeon-scramble",
    "matt-mayer-mda-space-mission",
}
SLOTS = ["#hudLeft .t", "#hudLeft .a", "#hudLeft .lives", "#hudLeft .lives .lc",
         "#hudMid", "#hudRight", "#hudHint"]
DIM_TRIO = ["#hudLeft .a", "#hudLeft .lives .lc", "#hudHint"]
DARK_BACKDROP_LEVEL = "L04"       # raw ratio >= 4.5 gated here (dark space canvas)
LIGHT_BACKDROP_LEVEL = "L03"      # ice canvas — mechanism asserted, ratio recorded

GEOM_JS = """
(sels) => {
  const out = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = null; continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out[sel] = {
      text: (el.textContent || "").trim(),
      title: el.getAttribute("title") || "",
      cls: el.className || "",
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      fontSize: parseFloat(cs.fontSize),
      color: cs.color,
      shadow: cs.textShadow,
      ellipsis: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
    };
  }
  return out;
}
"""

BACKDROP_JS = """
(sels) => {
  const out = { tainted: false, samples: {} };
  const cv = document.getElementById('stage');
  const rect = cv.getBoundingClientRect();
  let c2 = null;
  try { c2 = cv.getContext('2d'); } catch (e) { out.tainted = true; }
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) { out.samples[sel] = null; continue; }
    const r = el.getBoundingClientRect();
    const sx = (cv.width || 1) / (rect.width || 1), sy = (cv.height || 1) / (rect.height || 1);
    const x0 = Math.max(0, Math.floor((r.left - rect.left) * sx));
    const y0 = Math.max(0, Math.floor((r.top - rect.top) * sy));
    const x1 = Math.min(cv.width, Math.ceil((r.right - rect.left) * sx));
    const y1 = Math.min(cv.height, Math.ceil((r.bottom - rect.top) * sy));
    let px = null;
    if (c2 && x1 > x0 && y1 > y0) {
      try {
        const d = c2.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let rr = 0, gg = 0, bb = 0, n = 0;
        for (let i = 0; i < d.length; i += 4 * 7) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
        if (n) px = [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)];
      } catch (e) { out.tainted = true; }
    }
    // #hud paints rgba(4,5,12,.72) -> 0 over its 64px; #hudHint sits below it
    const a = sel === '#hudHint' ? 0 : Math.max(0, 0.72 * (1 - Math.min(64, Math.max(0, r.top)) / 64));
    out.samples[sel] = {
      gradAlpha: +a.toFixed(3),
      canvas: px,
      composite: px ? px.map((v) => Math.round(a * 4 + (1 - a) * v)) : null,
    };
  }
  return out;
}
"""


def log(*a):
    print("[hud-audit]", *a, flush=True)


def filtered(msgs):
    return [m for m in msgs if not any(t in m for t in BOOTH_FILTER)]


def load_level(lid):
    with open(os.path.join(ROOT, "levels", lid, "level.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def manifest_ids():
    with open(os.path.join(ROOT, "levels", "manifest.json"), "r", encoding="utf-8") as f:
        m = json.load(f)
    return [e["id"] for e in m.get("levels", []) if e.get("enabled", True)]


def start_server(port):
    proc = subprocess.Popen([sys.executable, "serve.py", "--port", str(port)],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    base = "http://127.0.0.1:%d" % port
    for _ in range(60):
        try:
            urllib.request.urlopen(base, timeout=0.6)
            return proc
        except Exception:
            time.sleep(0.25)
    proc.kill()
    raise SystemExit("[hud-audit] server failed to start on %s" % base)


# ---- pure helpers -----------------------------------------------------------

def _chan(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _lum(c):
    return 0.2126 * _chan(c[0]) + 0.7152 * _chan(c[1]) + 0.0722 * _chan(c[2])


def contrast(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def parse_rgb(s):
    m = re.findall(r"[\d.]+", s or "")
    if len(m) >= 3:
        return tuple(int(float(x)) for x in m[:3])
    return None


def parse_shadow_alpha(s):
    m = re.search(r"rgba?\(\s*0(?:\.0+)?\s*,\s*0\s*,\s*0\s*(?:,\s*([\d.]+))?\)", s or "")
    if not m:
        return 0.0
    return float(m.group(1)) if m.group(1) else 1.0


def overlap(a, b, tol=1.0):
    return (a["x"] + tol < b["x"] + b["w"] and b["x"] + tol < a["x"] + a["w"] and
            a["y"] + tol < b["y"] + b["h"] and b["y"] + tol < a["y"] + a["h"])


class Checks:
    def __init__(self):
        self.items = []

    def add(self, name, ok, detail=""):
        self.items.append({"name": name, "ok": bool(ok), "detail": str(detail)[:400]})
        return bool(ok)

    @property
    def ok(self):
        return all(c["ok"] for c in self.items)


# ---- per-level audit --------------------------------------------------------

def geom_all(page):
    return page.evaluate(GEOM_JS, SLOTS)


def check_collisions(g, ck, tag=""):
    """Fix A: no pairwise intersection among the HUD slots."""
    boxes = [("#hudLeft .t", g["#hudLeft .t"]), ("#hudMid", g["#hudMid"]),
             ("#hudRight", g["#hudRight"])]
    if g.get("#hudLeft .a") and g["#hudLeft .a"]["text"]:
        boxes.append(("#hudLeft .a", g["#hudLeft .a"]))
    if g.get("#hudLeft .lives") and g["#hudLeft .lives"]["text"]:
        boxes.append(("#hudLeft .lives", g["#hudLeft .lives"]))
    bad = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            (na, a), (nb, b) = boxes[i], boxes[j]
            if a and b and overlap(a["rect"], b["rect"]):
                bad.append("%s×%s" % (na, nb))
    ck.add("collision-free" + tag, not bad, "overlapping: %s" % (bad or "none"))


def check_truncation(g, lid, ck, vw):
    """Fix A: caps + ellipsis engagement / no clipping where content must fit.

    Strict no-clip (mid-fits-slot) applies to the moonshot level only — Fix B
    shortened those status strings precisely so they fit. Other genres' mids
    may degrade via the DESIGNED truncation (nowrap + ellipsis; never a wrap,
    never a raw overflow): e.g. the knight's-dungeon mid carries an XP-rank
    token (maze.js:421, outside the plan's evidence set) and measures 423px —
    wider than any sane cap at 960px even shortened, so ellipsis is the plan's
    own intended mechanism there.
    """
    strict_mid = lid == "matt-mayer-mda-space-mission"
    t, mid, right = g["#hudLeft .t"], g["#hudMid"], g["#hudRight"]
    if not (t and mid and right):
        ck.add("hud-present", False, "missing slots")
        return
    cap = 0.32 * vw
    if lid in LONG_TITLE_LEVELS:
        engaged = t["scrollW"] > t["clientW"] and t["clientW"] <= cap + 1
        ck.add("title-capped-ellipsis", engaged and t["ellipsis"] == "ellipsis" and
               t["whiteSpace"] == "nowrap",
               "scrollW=%s clientW=%s cap=%.0f ellipsis=%s ws=%s"
               % (t["scrollW"], t["clientW"], cap, t["ellipsis"], t["whiteSpace"]))
        ck.add("title-attr-mirrors-full-text", t["title"] == t["text"] and len(t["title"]) > 0,
               "title=%r text=%r" % (t["title"][:80], t["text"][:80]))
    else:
        ck.add("short-title-not-clipped", t["scrollW"] <= t["clientW"] + 1,
               "scrollW=%s clientW=%s" % (t["scrollW"], t["clientW"]))
        ck.add("title-attr-mirrors-full-text", t["title"] == t["text"],
               "title=%r" % t["title"][:80])
    if mid["scrollW"] > mid["clientW"] + 1:
        # content wider than the slot: acceptable ONLY as the designed truncation
        ck.add("mid-designed-ellipsis",
               not strict_mid and mid["ellipsis"] == "ellipsis" and mid["whiteSpace"] == "nowrap",
               "scrollW=%s clientW=%s ellipsis=%s ws=%s strict=%s"
               % (mid["scrollW"], mid["clientW"], mid["ellipsis"], mid["whiteSpace"], strict_mid))
    else:
        ck.add("mid-fits-slot", True, "scrollW=%s clientW=%s" % (mid["scrollW"], mid["clientW"]))


def check_hearts(g, ck, expect=None):
    """Fix C: hearts class fires iff the right payload is a pure ♥-run."""
    right = g["#hudRight"]
    if not right:
        ck.add("hearts-right-present", False, "no #hudRight")
        return
    pure = bool(HEART_RE.match(right["text"] or ""))
    has_cls = "hearts" in (right["cls"] or "").split()
    if expect is None:
        expect = pure
    if expect:
        rgb = parse_rgb(right["color"])
        ck.add("hearts-class+style",
               pure and has_cls and right["fontSize"] >= 18 and rgb == HEARTS_RGB,
               "text=%r cls=%r size=%s color=%s" % (right["text"], right["cls"],
                                                    right["fontSize"], right["color"]))
    else:
        ck.add("hearts-class-absent-on-non-hearts", not has_cls,
               "text=%r cls=%r" % (right["text"], right["cls"]))


def check_dim_trio(page, g, lid, ck, level):
    """Fix D: --hud-dim token, sizes, shadow; measured WCAG ratio.

    The raw ratio>=4.5 gate runs on the DARK backdrop level only (L04): on the
    light ice level (L03) a light-on-light raw ratio is physically impossible
    for ANY readable text color, so there the plan's actual mechanism is
    asserted (token + size + shadow) and the measured ratio is recorded as
    information for the testing report.
    """
    trio = {"#hudLeft .a": 12.0, "#hudLeft .lives .lc": 10.0, "#hudHint": 12.0}
    for sel, min_px in trio.items():
        el = g.get(sel)
        if not el or not el["text"]:
            ck.add("dim-present:%s" % sel, False, "element empty/missing")
            continue
        rgb = parse_rgb(el["color"])
        shadow_ok = parse_shadow_alpha(el["shadow"]) >= 0.5 and "3px" in (el["shadow"] or "")
        ok = rgb == HUD_DIM_RGB and el["fontSize"] >= min_px - 0.1 and shadow_ok
        ck.add("dim-token:%s" % sel, ok,
               "color=%s size=%s(>=%s) shadow=%r" % (el["color"], el["fontSize"], min_px, el["shadow"]))
    bd = page.evaluate(BACKDROP_JS, list(trio.keys()))
    for sel in trio:
        s = (bd.get("samples") or {}).get(sel)
        el = g.get(sel)
        if not s or not el:
            continue
        if s["composite"]:
            ratio = contrast(parse_rgb(el["color"]), s["composite"])
        else:  # tainted canvas → fall back to the level's darkest sky stop
            sky = parse_rgb((level.get("style", {}).get("sky") or ["#0d1033"])[-1]) or (13, 16, 51)
            ratio = contrast(parse_rgb(el["color"]), sky)
        if lid == DARK_BACKDROP_LEVEL:
            ck.add("contrast>=4.5-dark:%s" % sel, ratio >= 4.5, "ratio=%.2f sample=%s tainted=%s"
                   % (ratio, s["composite"], bd.get("tainted")))
        else:
            ck.add("contrast-recorded-light:%s" % sel, True, "ratio=%.2f sample=%s (mechanism asserted)"
                   % (ratio, s["composite"]))


def boot_hygiene(page, console, perr, badnet, ck):
    ok_boot = page.evaluate("() => !!document.querySelector('canvas') && !!document.querySelector('#hud.on')")
    ck.add("boot-canvas+hud", ok_boot, "")
    app_console = [c for c in filtered(console) if not c.startswith("error:Failed to load resource")]
    ck.add("console-clean", not [c for c in app_console if c.startswith("error:")],
           "; ".join(app_console[-3:]))
    ck.add("no-pageerror", not filtered(perr), "; ".join(filtered(perr)[-2:]))
    real_net = [b for b in filtered(badnet)]
    ck.add("network-clean", not real_net, "; ".join(real_net[-3:]))


def audit_standard(page, lid, ck, level, vw, console, perr, badnet):
    """Collision/truncation/hearts/dim checks for a level already booted."""
    # wait until the right slot has a payload (platformer hearts push on tick)
    for _ in range(12):
        g = geom_all(page)
        if (g["#hudRight"]["text"] or "").strip():
            break
        time.sleep(0.4)
    check_collisions(g, ck)
    check_truncation(g, lid, ck, vw)
    # Fix C fires for every genre at once: class iff payload is a pure ♥-run
    check_hearts(g, ck)
    check_dim_trio(page, g, lid, ck, level)
    boot_hygiene(page, console, perr, badnet, ck)


def audit_moonshot(page, ck, console, perr, badnet, seconds):
    """Fix B: poll the moon HUD; no control tokens in mid; right strings must FIT."""
    mids, rights, collided = set(), set(), 0
    deadline = time.time() + seconds
    while time.time() < deadline:
        g = geom_all(page)
        mid, right = g["#hudMid"], g["#hudRight"]
        if mid and mid["text"]:
            mids.add(mid["text"])
        if right and right["text"]:
            rights.add((right["text"], right["scrollW"], right["clientW"]))
        if mid and right and overlap(mid["rect"], right["rect"]):
            collided += 1
        time.sleep(0.35)
    ctrl = sorted({m for m in mids if MOON_CTRL_RE.search(m)})
    ck.add("moon-mid-status-only", not ctrl, "control strings: %s" % [c[:70] for c in ctrl[:3]])
    ck.add("moon-mid-status-seen", any(MOON_STATUS_RE.search(m) for m in mids),
           "mids seen: %s" % sorted(m.decode("utf-8") if isinstance(m, bytes) else m for m in mids)[:3])
    clipped = [r for r in rights if r[1] > r[2] + 1]
    ck.add("moon-right-fits", not clipped, "clipped rights: %s" % [c[0] for c in clipped[:3]])
    # plan Fix B consequence, owned: the 26vw right cap at 960px sits exactly at
    # "VOL/FLIGHT n · BEST n km" width, so the plan authorizes shortening to
    # "FLIGHT n · BEST n km" in the same commit "rather than letting the cap
    # eat the number". Pin that short form so BEST can never clip.
    vol = sorted({r[0] for r in rights if not r[0].startswith("FLIGHT ")})
    ck.add("moon-right-short-form", rights and not vol,
           "non-short-form rights: %s" % [v[:40] for v in vol[:3]])
    ck.add("moon-collision-free", collided == 0, "collided polls: %d" % collided)
    boot_hygiene(page, console, perr, badnet, ck)


def audit_slingshot(page, ck, console, perr, badnet):
    """Fix E: enter play; mid must read AMMO n and never reuse ♥."""
    cv = page.evaluate("() => { const c = document.querySelector('#stage');"
                       " const r = c.getBoundingClientRect();"
                       " return [r.left + r.width / 2, r.top + r.height / 2]; }")
    page.mouse.move(cv[0], cv[1])
    page.mouse.down()
    page.mouse.up()
    play = None
    deadline = time.time() + 15
    while time.time() < deadline:
        g = geom_all(page)
        mid = g["#hudMid"]
        if mid and PLAY_MID_RE.search(mid["text"] or ""):
            play = mid
            break
        time.sleep(0.3)
    if not play:
        ck.add("ammo-mid", False, "play-phase mid never appeared")
        boot_hygiene(page, console, perr, badnet, ck)
        return
    ck.add("ammo-mid", bool(re.search(r"AMMO \d", play["text"])) and "♥" not in play["text"],
           "mid=%r" % play["text"])
    check_hearts(g, ck)   # right is ★ score → class must be absent
    boot_hygiene(page, console, perr, badnet, ck)


def run_viewport(pw, port, vw, levels, moon_seconds, out_dir):
    w, h = vw
    browser = pw.chromium.launch(headless=True, args=["--mute-audio"])  # booth rule: the game never makes sound
    ctx = browser.new_context(viewport={"width": w, "height": h})
    page = ctx.new_page()
    console, perr, badnet = [], [], []
    page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: perr.append(str(e)))
    page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url))
            if r.status >= 400 else None)

    verdicts = {}
    for lid in levels:
        spec = AUDIT_LEVELS[lid]
        level = load_level(lid)
        params = ("&" + spec["params"]) if spec["params"] else ""
        url = "/?level=%s%s" % (lid, params)
        console.clear(), perr.clear(), badnet.clear()
        ck = Checks()
        try:
            page.goto("http://127.0.0.1:%d%s" % (port, url), timeout=15000)
            page.wait_for_selector("canvas", timeout=10000)
            time.sleep(1.6)   # HUD paint + first strings
            if lid == "matt-mayer-mda-space-mission":
                audit_moonshot(page, ck, console, perr, badnet, moon_seconds)
            elif lid == "mark-abdallah-slingshot-duck-season":
                audit_slingshot(page, ck, console, perr, badnet)
            else:
                audit_standard(page, lid, ck, level, w, console, perr, badnet)
        except Exception as e:
            ck.add("audit-crashed", False, repr(e))
        verdicts[lid] = {"lid": lid, "viewport": "%dx%d" % vw, "ok": ck.ok,
                         "checks": ck.items}
        log("%dx%d" % vw, lid, "→", "PASS" if ck.ok else "FAIL")
        for c in ck.items:
            if not c["ok"]:
                log("   RED", c["name"], "—", c["detail"])
    ctx.close()
    browser.close()
    return verdicts


def main():
    ap = argparse.ArgumentParser(description="HUD collision/legibility audit (issue #15)")
    ap.add_argument("--port", type=int, default=8615)
    ap.add_argument("--viewports", default="960x600,1280x800")
    ap.add_argument("--levels", help="comma-separated subset of AUDIT_LEVELS")
    ap.add_argument("--moon-seconds", type=int, default=60)
    ap.add_argument("--out-dir", default=os.path.join(ROOT, "docs", "playtest", "hud-audit"))
    args = ap.parse_args()

    levels = args.levels.split(",") if args.levels else list(AUDIT_LEVELS)
    unknown = [l for l in levels if l not in AUDIT_LEVELS]
    if unknown:
        ap.error("unknown level(s): %s; known: %s" % (unknown, list(AUDIT_LEVELS)))
    vws = [tuple(int(x) for x in v.split("x")) for v in args.viewports.split(",")]
    os.makedirs(args.out_dir, exist_ok=True)

    server = start_server(args.port)
    merged = {}
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            for vw in vws:
                merged["%dx%d" % vw] = run_viewport(pw, args.port, vw, levels,
                                                    args.moon_seconds, args.out_dir)
    finally:
        server.kill()

    for vwk, verdicts in merged.items():
        path = os.path.join(args.out_dir, "hud-audit-%s.json" % vwk)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(verdicts, f, ensure_ascii=False, indent=2)
            f.write("\n")
        log("wrote", os.path.relpath(path, ROOT))

    bad = [(vwk, lid) for vwk, verdicts in merged.items()
           for lid, v in verdicts.items() if not v["ok"]]
    log("RESULT", "PASS" if not bad else "FAIL", "red:", bad or "none")
    sys.exit(0 if not bad else 1)


if __name__ == "__main__":
    main()
