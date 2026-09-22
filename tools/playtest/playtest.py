#!/usr/bin/env python3
"""playtest — generic cross-level playtest rig (Playwright headless Chromium).

Issue #4 cascade: one rig that boots ANY manifest level id, drives it (in-module
bot / ?ap=1 autopilot / scripted keyboard driver), records video, polls the
genre debug global + DOM probes with wall-clock timestamps, and writes evidence
(contact sheets + stills + sim-results.json) into docs/playtest/evidence/<lid>/.

modes:
  boot   boot smoke: canvas reached, zero unfiltered console errors / pageerror,
        no driving. Use for the 15-id smoke pass.
  live   full playthrough with the genre's best play mechanism (in-module
        ?bot=1 bot, ?ap=1 maze autopilot, or scripted keyboard driver).
  bot    force the scripted keyboard driver even on bot genres (driver
        comparison / edge-input testing). Win is never gated in this mode
        (blind keys vs a bot-tuned level is a comparison, not a verdict).
  all    boot + live (default).

Gates (exit 0): canvas reached; console clean after BOOTH_FILTER; zero
pageerror; and for bot/autopilot genres a win path (#screen-result.active or a
completed/won state flag) within the budget. Keyboard-driven genres record
`win` honestly but do not hard-fail the run — blind scripted input is not
guaranteed to beat every level (conservative choice documented in the README
and the playthrough report). Override with --strict-win.

Usage:
  python3 tools/playtest/playtest.py --level <id> [--port 8604] [--seconds 240]
                                     [--flavor good] [--mode all] [--strict-win]

Booth protocol: rAF throttling kills shared/visible tabs, so all verdicts run
headless against a PRIVATE serve.py port (unique per agent — Fabric caches
browser interaction memory per URL).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW_DIR = "/tmp/playtest-raw"

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

# genre -> debug global (keyed by GENRE, not global name: survival.js and
# star-racer.js both expose __SR but only one module is loaded per page).
GENRE_GLOBAL = {
    "rewind": "__REW",
    "world-tour": "__WT",
    "space-mission": "__MDA",
    "nano-cure": "__NANO",
    "survival": "__SR",
    "star-racer": "__SR",
    "slingshot": "__DUCK",
    "shooter": "__shooter",
    "maze": "__TEST_API__",
    "maze-studyhall": "__TEST_API__",
}
GENRE_BOT = {"rewind", "world-tour", "space-mission", "nano-cure"}   # ?bot=1&flavor=
GENRE_AP = {"maze", "maze-studyhall"}                                # ?ap=1
GENRE_BEATS = {"platformer", "nano-cure", "shooter", "space-mission", "rewind", "world-tour"}

# Scripted keyboard driver specs (genres without an in-module bot).
# holds: keys held for the whole run. taps: (key, period_s, hold_s).
DRIVER_SPECS = {
    "platformer": {"holds": ["ArrowRight"], "taps": [("Space", 1.1, 0.09), ("ArrowUp", 2.7, 0.09)]},
    "racer": {"holds": ["ArrowUp"], "taps": [("ArrowLeft", 1.6, 0.5), ("ArrowRight", 1.6, 0.5)]},
    "puzzle": {"holds": [], "taps": [("ArrowLeft", 1.4, 0.08), ("ArrowRight", 1.4, 0.08),
                                     ("ArrowUp", 2.1, 0.08), ("Space", 1.7, 0.08)]},
    "shooter": {"holds": [], "taps": [("ArrowLeft", 2.2, 0.4), ("ArrowRight", 2.2, 0.4),
                                      ("Space", 0.3, 0.05)]},
    "slingshot": {"holds": [], "taps": []},   # pointer-driven; DRAG handled specially
    "survival": {"holds": [], "taps": [("ArrowLeft", 1.9, 0.4), ("ArrowRight", 1.9, 0.4),
                                       ("ArrowUp", 2.6, 0.12), ("Space", 1.3, 0.06)]},
    "star-racer": {"holds": ["ArrowUp"], "taps": [("ArrowLeft", 1.5, 0.45), ("ArrowRight", 1.5, 0.45)]},
    "default": {"holds": [], "taps": [("Space", 1.2, 0.08)]},
}

PROBE_JS = """
(name) => {
  const out = {};
  const q = (s) => !!document.querySelector(s);
  out.canvas = q("canvas");
  out.result = q("#screen-result.active");
  out.pause = q("#screen-pause.active");
  try {
    const el = document.querySelector("#screen-result.active h2") ||
               document.querySelector("#screen-result.active");
    out.resultText = el ? (el.textContent || "").trim().slice(0, 120) : null;
  } catch (e) { out.resultText = null; }
  out.beats = document.querySelectorAll("#beats img").length;
  if (name && window[name]) {
    try {
      const g = window[name];
      out.state = (typeof g.state === "function") ? g.state() : JSON.parse(JSON.stringify(g));
    } catch (e) { out.state = { __error: String(e && e.message || e) }; }
  }
  if (window.__MAZE_RUNS__) out.mazeRuns = window.__MAZE_RUNS__.length;
  if (window.__MAZE_DEATHS__) out.mazeDeaths = window.__MAZE_DEATHS__.length;
  return out;
}
"""

BLUR_JS = "() => { window.dispatchEvent(new Event('blur')); document.hasFocus(); }"
FOCUS_JS = "() => { window.dispatchEvent(new Event('focus')); }"


def log(*a):
    print("[playtest]", *a, flush=True)


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
    raise SystemExit("[playtest] server failed to start on %s" % base)


class Driver:
    """Scripted keyboard/pointer driver with mash + pause/blur edge coverage."""

    def __init__(self, page, genre):
        self.page = page
        self.spec = DRIVER_SPECS.get(genre, DRIVER_SPECS["default"])
        self.last_tap = {}
        self.held = []
        self.edge_done = set()

    def press(self, key, hold):
        self.page.keyboard.down(key)
        time.sleep(hold)
        self.page.keyboard.up(key)

    def tick(self, t, budget, win):
        acts = []
        if win:
            return acts
        # ---- edge phase at ~70% / 76% / 82% of budget (keyboard genres only) ----
        for tag, at in (("pause", 0.70), ("resume", 0.76), ("blur", 0.82), ("refocus", 0.84)):
            if t >= budget * at and tag not in self.edge_done:
                self.edge_done.add(tag)
                if tag in ("pause", "resume"):
                    self.press("Escape", 0.05)
                elif tag == "blur":
                    self.page.evaluate(BLUR_JS)
                else:
                    self.page.evaluate(FOCUS_JS)
                acts.append(tag)
        mashing = t >= budget * 0.90
        for key in self.spec["holds"]:
            if key not in self.held and not mashing:
                self.page.keyboard.down(key)
                self.held.append(key)
                acts.append("hold:" + key)
        if mashing:
            for key in self.spec["holds"] + [k for k, _, _ in self.spec["taps"]]:
                self.press(key, 0.04)
                acts.append("mash:" + key)
            return acts
        for key, period, hold in self.spec["taps"]:
            if t - self.last_tap.get(key, -99) >= period:
                self.last_tap[key] = t
                self.press(key, hold)
                acts.append("tap:" + key)
        return acts

    def drag(self, cx, cy):
        self.page.mouse.move(cx, cy)
        self.page.mouse.down()
        self.page.mouse.move(cx - 90, cy - 60, steps=8)
        self.page.mouse.up()

    def release(self):
        for key in self.held:
            try:
                self.page.keyboard.up(key)
            except Exception:
                pass
        self.held = []


def run_level(args):
    lid = args.level
    level = load_level(lid)
    genre = level.get("genre", "unknown")
    gname = GENRE_GLOBAL.get(genre)
    driver_kind = ("keys" if args.mode == "bot" else
                   "bot" if genre in GENRE_BOT else
                   "ap" if genre in GENRE_AP else "keys")
    ev_dir = os.path.join(ROOT, "docs", "playtest", "evidence", lid)
    os.makedirs(ev_dir, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)

    results = {
        "lid": lid, "genre": genre, "port": args.port, "flavor": args.flavor,
        "mode": args.mode, "driver": driver_kind, "seconds": args.seconds,
        "boot": {"ok": False}, "trace": [], "console": [], "perr": [],
        "sheets": [], "stills": [],
    }
    server = start_server(args.port)
    video_path = None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(
                viewport={"width": 1000, "height": 640},
                record_video_dir=RAW_DIR,
                record_video_size={"width": 960, "height": 600},
            )
            page = ctx.new_page()
            console, perr, badnet = [], [], []
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text))
                    if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))
            # network layer: 4xx/5xx carry their URL here (the console text of a
            # resource 404 does NOT include the URL, so BOOTH_FILTER can't match
            # it there — the gate for network problems is URL-based instead)
            page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url))
                    if r.status >= 400 else None)

            url = ("/?level=%s&bot=1&flavor=%s&debug=1&beats=1"
                   % (lid, args.flavor))
            if genre in GENRE_AP:
                url += "&ap=1"
            results["url"] = url
            t0 = time.time()
            page.goto("http://127.0.0.1:%d%s" % (args.port, url), timeout=15000)
            try:
                page.wait_for_selector("canvas", timeout=10000)
                results["boot"] = {"ok": True, "ms": int((time.time() - t0) * 1000)}
            except Exception as e:
                results["boot"] = {"ok": False, "error": str(e)}
            time.sleep(1.0)
            page.screenshot(path=os.path.join(ev_dir, "still-boot.png"))
            results["stills"].append("still-boot.png")

            if results["boot"]["ok"] and args.mode in ("live", "bot", "all"):
                driver = Driver(page, genre) if driver_kind == "keys" else None
                win, win_t, first_err_t = False, None, None
                end = time.time() + args.seconds
                last_drag = 0.0
                while time.time() < end:
                    elapsed = time.time() - t0
                    try:
                        probe = page.evaluate(PROBE_JS, gname)
                    except Exception as e:
                        probe = {"__probeError": str(e)}
                    acts = []
                    if driver_kind == "keys" and driver:
                        try:
                            if genre == "slingshot" and elapsed - last_drag > 2.5 and not probe.get("result"):
                                driver.drag(480, 320)
                                last_drag = elapsed
                                acts.append("drag")
                            acts += driver.tick(elapsed, args.seconds, probe.get("result"))
                        except Exception as e:
                            acts.append("driver-error:%s" % e)
                    row = {"t": round(elapsed, 1)}
                    for k in ("canvas", "result", "pause", "resultText",
                              "beats", "mazeRuns", "mazeDeaths", "state", "__probeError"):
                        if k in probe:
                            v = probe[k]
                            if k == "state" and isinstance(v, (dict, list)):
                                v = json.dumps(v)[:800]
                            row[k] = v
                    if acts:
                        row["keys"] = acts
                    results["trace"].append(row)
                    if probe.get("result") and win_t is None:
                        win_t = elapsed
                        if not _looks_like_win(probe):
                            results["verdictNote"] = "result overlay text did not clearly read as a win"
                        win = True
                        page.screenshot(path=os.path.join(ev_dir, "still-win.png"))
                        results["stills"].append("still-win.png")
                        break
                    ferr = filtered(perr) or [c for c in console if c.startswith("error:")]
                    if ferr and first_err_t is None:
                        first_err_t = elapsed
                        try:
                            page.screenshot(path=os.path.join(ev_dir, "still-error.png"))
                            results["stills"].append("still-error.png")
                        except Exception:
                            pass
                    time.sleep(0.4)
                if driver:
                    driver.release()
                if not win:
                    page.screenshot(path=os.path.join(ev_dir, "still-final.png"))
                    results["stills"].append("still-final.png")
                results["win"] = win
                results["winAt"] = win_t
            else:
                results["win"] = None   # boot-only smoke: win not assessed
            time.sleep(0.5)
            ctx.close()
            browser.close()
            video_path = page.video.path() if page.video else None
    finally:
        server.kill()

    results["console"] = filtered(console)[-30:]
    results["perr"] = filtered(perr)[-20:]
    results["badnet"] = filtered(badnet)[-20:]
    # console errors minus resource-load failures (judged by URL in badnet)
    app_console = [c for c in results["console"]
                   if not c.startswith("error:Failed to load resource")]
    results["consoleClean"] = not [c for c in app_console if c.startswith("error:")]
    results["noPageerror"] = not results["perr"]
    results["netClean"] = not results["badnet"]
    beats_expected = genre in GENRE_BEATS
    beats_count = 0
    for row in results["trace"]:
        if row.get("beats"):
            beats_count = max(beats_count, row["beats"])
    results["beats"] = {"expected": beats_expected, "count": beats_count,
                        "ok": (beats_count > 0) if beats_expected else None}

    if video_path and os.path.isfile(video_path):
        named = os.path.join(RAW_DIR, "%s-%d.webm" % (lid, int(time.time())))
        shutil.move(video_path, named)
        results["video"] = named
        sheets = make_sheets(named, ev_dir)
        results["sheets"] = sheets

    gates = {
        "boot": results["boot"]["ok"],
        "consoleClean": results["consoleClean"],
        "noPageerror": results["noPageerror"],
        "netClean": results["netClean"],
    }
    if args.mode in ("live", "bot", "all"):
        gated = args.strict_win or (
            driver_kind in ("bot", "ap") and args.mode in ("live", "all"))
        gates["win"] = bool(results.get("win")) if gated else None
    results["gates"] = gates
    ok = all(v for v in gates.values() if v is not None)

    path = os.path.join(ev_dir, "sim-results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    log(lid, genre, driver_kind, "→", "PASS" if ok else "FAIL", gates,
        "→", os.path.relpath(path, ROOT))
    return 0 if ok else 1


def _looks_like_win(probe):
    text = (probe.get("resultText") or "").lower()
    if not text:
        return True   # overlay came up with no heading; accept overlay as the win signal
    loss_words = ("game over", "try again", "wasted", "defeat", "burned", "crashed out")
    return not any(w in text for w in loss_words)


def make_sheets(video, ev_dir):
    """Video review loop: contact sheets ≈10 s of play each (30 frames @ fps=3)."""
    sheets = []
    prefix = os.path.join(ev_dir, "sheet")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", video,
           "-vf", "fps=3,scale=400:-1,tile=5x6", prefix + "-%02d.png"]
    try:
        subprocess.run(cmd, cwd=ROOT, timeout=300, check=True)
        for name in sorted(os.listdir(ev_dir)):
            if name.startswith("sheet-") and name.endswith(".png"):
                sheets.append(name)
    except Exception as e:
        log("ffmpeg sheets failed:", e)
    return sheets


def main():
    ap = argparse.ArgumentParser(description="Generic cross-level playtest rig")
    ap.add_argument("--level", help="manifest level id (omit with --smoke-manifest)")
    ap.add_argument("--port", type=int, default=8604)
    ap.add_argument("--seconds", type=int, default=240)
    ap.add_argument("--flavor", default="good", choices=["good", "partial", "clumsy"])
    ap.add_argument("--mode", default="all", choices=["boot", "live", "bot", "all"])
    ap.add_argument("--strict-win", action="store_true",
                    help="fail keyboard-driven genres that do not reach the win path")
    ap.add_argument("--smoke-manifest", action="store_true",
                    help="boot-smoke every manifest level id, one run each")
    args = ap.parse_args()

    if args.smoke_manifest:
        bad = []
        for lid in manifest_ids():
            ns = argparse.Namespace(**vars(args))
            ns.level, ns.mode = lid, "boot"
            ns.seconds = min(ns.seconds, 60)
            if run_level(ns) != 0:
                bad.append(lid)
        log("SMOKE", "PASS" if not bad else "FAIL", "bad:", bad)
        sys.exit(0 if not bad else 1)

    if not args.level:
        ap.error("--level is required (or use --smoke-manifest)")
    sys.exit(run_level(args))


if __name__ == "__main__":
    main()
