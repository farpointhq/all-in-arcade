#!/usr/bin/env python3
"""Nano Cure playtest rigs (protocol-owned per level; Playwright headless Chromium).

Modes (default all):
  live    — boots the REAL app at ?level=amir-kermany-nano-cure-2&bot=1&flavor=good
            &debug=1&beats=1 THREE consecutive runs (fresh browser context each —
            independent of localStorage bank state); each must win with zero console/page
            errors; hearts + trace recorded per run; saves shot-<phase>.png per phase and,
            on a loss, a full-res shot-loss-run<N>.png + final state as triage evidence.
            Console-clean proof (R1): booth masthead noise filtered by the named
            URL/BOOTH_FILTER only; all other 4xx/5xx fail via the URL-attributed badnet
            list (the stronger PR #26 gate).
  sims    — fixed-dt determinism: good / partial / clumsy with fresh ?v= import,
            fake api recording complete/fail, threshold asserts (R5-R9).
  jank    — the SAME deterministic good-bot harness stepped at dt = 0.05 (the live rAF
            cap, core.js). Reproduces the live-vs-sims divergence headlessly: per-frame
            lerps/timers degrade at 20 Hz exactly like the booth's real loop under jank.
            The good bot must WIN — this is the pin for the dt-normalized physics fix.
  strings — static check that the six player-facing FR-only strings carry their EN echo
            (booth is EN-first; banners pair FR·EN, HUD is EN-first).
  thumbs  — thumbnail-pipeline equivalent: stub api + 70 neutral steps + draw + toDataURL.
Exit 0 iff PASS. Writes sim-results.json + shot-*.png here.

Server override: SIM_BASE env (e.g. SIM_BASE=http://localhost:8607 — cascade port
scheme); default stays http://localhost:8181.
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SIM_BASE", "http://localhost:8181")
LID = "amir-kermany-nano-cure-2"
HERE = os.path.dirname(os.path.abspath(__file__))
BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")
MODULE = f"{BASE}/src/genres/nano-cure.js"
results = {"live": None, "sims": {}, "jank": None, "strings": None, "thumbs": None, "shots": [], "fails": []}

# Landed bilingual strings — pin the canonical EN-first sweep wording (PR #31, gate-
# tightened by #47's tools/playtest/bilingual-check.py: "13 genre modules … bilingual-clean"),
# superseding the F4 draft wording this list was originally written against (the merge
# resolution kept the canonical sweep strings). Verified verbatim against the served module.
STRINGS_REQUIRED = [
    "ARTERY / ARTÈRE",
    "Gros dangers : tirez d'abord, absorbez ensuite",
    "FINAL PURGE / PURGE FINALE",
    "Absorb the spores to open the membrane FR: Absorbez les spores pour ouvrir la membrane",
    "The infection takes over — try again! FR: L'infection prend le dessus — retente ta chance !",
    "The bacterial upsurge! / La poussée bactérienne !",
    "FINAL PURGE — CYCLE",
    "FINAL PURGE — CLEANUP / NETTOYAGE",
]

NEUTRAL = ("{ down: () => false, just: () => false, left: () => false, right: () => false,"
           " up: () => false, downKey: () => false, jumpJust: () => false, anyJust: () => false,"
           " endFrame: () => {} }")

SIM_BODY = """async (a) => {
  const mod = await import(a.url);
  const lvl = await (await fetch('/levels/__LID__/level.json')).json();
  const recs = { complete: null, fail: null };
  const api = {
    eng: { shake() {}, flash: 0 },
    audio: { unlocked: false, sfx() {}, playMusic() {}, stopMusic() {}, duckMusic() {}, stinger() {} },
    hud() {},
    complete: (p) => { recs.complete = p; },
    fail: (m) => { recs.fail = m; },
    lives: { get: () => 9, spend: () => true, gain: () => true, enabled: false },
  };
  const neutral = __NEUTRAL__;
  const inst = mod.create(lvl, api);
  if (!window.__NANO) return { error: 'no __NANO hook (bot URL flag required)' };
  const st = window.__NANO.state; // bind to MY instance — thumbs can clobber window.__NANO
  // Frame-timing model: a.dt = uniform step; a.jank = deterministic spike pattern
  // (booth reality: ~60fps rAF with intermittent 50ms jank — core.js caps dt at 0.05).
  const PAT = { spike3: [1 / 60, 1 / 60, 0.05], spike2: [1 / 60, 0.05] };
  const seq = PAT[a.jank] || null;
  const avg = seq ? seq.reduce((s, v) => s + v, 0) / seq.length : (a.dt || 1 / 60);
  const frames = Math.ceil(a.maxT / avg);
  for (let i = 0; i < frames; i++) {
    const dt = seq ? seq[i % seq.length] : avg;
    inst.update(dt, neutral);
    if (st().status !== 'playing') break;
  }
  return { state: st(), recs };
}""".replace("__LID__", LID).replace("__NEUTRAL__", NEUTRAL)

THUMB_BODY = """async (a) => {
  const mod = await import(a.url);
  const lvl = await (await fetch('/levels/__LID__/level.json')).json();
  const stub = __NEUTRAL__;
  const api = {
    eng: { shake() {}, flash: 0 },
    audio: { unlocked: false, sfx() {}, playMusic() {}, stopMusic() {}, duckMusic() {}, stinger() {} },
    hud() {}, complete() {}, fail() {},
    lives: { get: () => 3, spend: () => true, gain: () => true, enabled: true },
  };
  const plat = mod.create(lvl, api);
  for (let i = 0; i < 70; i++) if (plat.update) plat.update(1 / 60, stub);
  const grab = document.createElement('canvas');
  grab.width = 960; grab.height = 540;
  plat.draw(grab.getContext('2d'));
  return { ok: true, bytes: grab.toDataURL('image/jpeg', 0.55).length };
}""".replace("__LID__", LID).replace("__NEUTRAL__", NEUTRAL)


def run_live_once(idx):
    """One headless live boot to a terminal state; full-res evidence on a loss."""
    out = {"run": idx, "console_errors": [], "badnet": [], "page_error": None, "won": False,
           "hearts": None, "state": None, "trace": []}
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-gpu", "--mute-audio"])
        page = b.new_page()  # fresh browser context per run — localStorage bank state isolated
        page.on("pageerror", lambda e: out.__setitem__("page_error", str(e)))

        def on_console(m):
            if m.type != "error":
                return
            t = m.text or ""
            if any(f in t for f in BOOTH_FILTER):
                return  # booth masthead assets, named — narrow filter only
            out["console_errors"].append(t)
        page.on("console", on_console)
        # network layer: 4xx/5xx carry their URL here (a resource 404's console
        # text does NOT), so genuine asset failures stay visible with attribution
        page.on("response", lambda r: out["badnet"].append("%s %s" % (r.status, r.url))
                if r.status >= 400 else None)

        bust = int(time.time() * 1000)
        url = f"{BASE}/?level={LID}&bot=1&flavor=good&debug=1&beats=1&bust={bust}"
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_function("window.__NANO && window.__NANO.state().phase !== 'inject'", timeout=25000)
        seen = set()
        deadline = time.time() + 200
        while time.time() < deadline:
            s = page.evaluate("(() => { try { return window.__NANO.state(); } catch (e) { return { error: String(e) }; } })()")
            if s and not s.get("error"):
                out["state"], out["trace"], out["hearts"] = s, s.get("trace", []), s.get("hearts")
                for tag in set(s.get("trace", [])) - seen:
                    seen.add(tag)
                    fn = os.path.join(HERE, "shot-%s.png" % tag.split("@")[0].replace("/", ""))
                    try:
                        page.screenshot(path=fn)
                        results["shots"].append(os.path.basename(fn))
                    except Exception:
                        pass
                if s.get("status") != "playing":
                    if s.get("status") == "lost":
                        fn = os.path.join(HERE, "shot-loss-run%d.png" % idx)
                        try:  # full-res loss evidence for triage
                            page.screenshot(path=fn)
                            results["shots"].append(os.path.basename(fn))
                        except Exception:
                            pass
                        print("[live run %d] LOST — evidence: %s" % (idx, os.path.basename(fn)))
                    break
            page.wait_for_timeout(800)
        b.close()
    out["won"] = (out["state"] or {}).get("status") == "won"
    out["clean"] = bool(out["won"]) and not out["page_error"] and not out["console_errors"] \
        and not out["badnet"]
    print("[live run %d] won=%s hearts=%s page_error=%s console_errors=%s badnet=%s trace=%s" % (
        idx, out["won"], out["hearts"], out["page_error"], out["console_errors"],
        out["badnet"], json.dumps(out["trace"])))
    if not out["won"]:
        print("[live run %d] final state: %s" % (idx, json.dumps(out["state"])))
    return out


def run_live():
    """Three consecutive clean wins — the final arbiter for the live-vs-sims divergence."""
    runs = [run_live_once(i) for i in range(3)]
    ok = all(r["clean"] for r in runs)
    results["live"] = {"runs": runs, "clean": ok}
    if not ok:
        results["fails"] = results.get("fails", []) + ["live: at least one run lost or console-dirty"]
    return ok


def run_jank():
    """Deterministic good bot under booth frame timing — the live rAF cap (core.js).
    spike3 = ~60fps rAF with a 50ms jank spike every 3rd frame (~27.8ms avg, the
    documented live mechanism: "variable, spiking up to 50 ms under load").
    Reproduces the live-vs-sims divergence headlessly; must win once fixes land."""
    ok = True
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-gpu", "--mute-audio"])
        page = b.new_page()
        bust = int(time.time() * 1000)
        try:
            page.goto(f"{BASE}/?bot=1&flavor=good&bust={bust}", wait_until="domcontentloaded")
            r = page.evaluate(SIM_BODY, {"url": f"{MODULE}?v={bust + 1}", "maxT": 175, "jank": "spike3"})
        except Exception as e:
            r = {"error": str(e)}
        b.close()
    results["jank"] = r
    st = r.get("state", {})
    if r.get("error"):
        print("[jank spike3] ERROR %s" % r["error"])
        ok = False
    elif st.get("status") == "won" and r.get("recs", {}).get("complete"):
        print("[jank spike3] WON t=%s biomass=%s tier=%s absorbed=%s" % (st["t"], st["biomass"], st["tier"], st["absorbed"]))
        print("[jank spike3] trace=%s" % json.dumps(st.get("trace")))
    else:
        print("[jank spike3] FAILED — good bot must win under booth frame timing %s" % json.dumps(r)[:800])
        results["fails"] = results.get("fails", []) + ["jank spike3: good bot lost — frame-rate-dependent physics/behavior"]
        ok = False
    return ok


def run_strings():
    """Static check: the six F4 player-facing strings carry their EN echo."""
    import urllib.request
    try:
        src = urllib.request.urlopen(f"{MODULE}?v={int(time.time())}", timeout=10).read().decode("utf-8")
    except Exception as e:
        print("[strings] fetch ERROR %s" % e)
        results["strings"] = {"ok": False, "error": str(e)}
        return False
    missing = [s for s in STRINGS_REQUIRED if s not in src]
    results["strings"] = {"ok": not missing, "checked": len(STRINGS_REQUIRED), "missing": missing}
    if missing:
        print("[strings] MISSING EN echo: %s" % json.dumps(missing, ensure_ascii=False))
        results["fails"] = results.get("fails", []) + ["strings: FR-only copy without EN echo"]
        return False
    print("[strings] OK — all %d EN echoes present" % len(STRINGS_REQUIRED))
    return True


def run_sims():
    ok = True
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-gpu", "--mute-audio"])
        ctx = b.new_context()
        for flavor, maxT in [("good", 175), ("partial", 175), ("clumsy", 120)]:
            page = ctx.new_page()
            bust = int(time.time() * 1000)
            js = SIM_BODY.replace("__SCRIPT__", "")  # template already carries LID/NEUTRAL
            try:
                page.goto(f"{BASE}/?bot=1&flavor={flavor}&bust={bust}", wait_until="domcontentloaded")
                r = page.evaluate(js, {"url": f"{MODULE}?v={bust + 1}", "maxT": maxT})
            except Exception as e:
                r = {"error": str(e)}
            results["sims"][flavor] = r
            page.close()
        b.close()

    g = results["sims"].get("good", {})
    if g.get("error"):
        print("[sim good] ERROR %s" % g["error"]); ok = False
    elif g.get("state", {}).get("status") == "won" and g.get("recs", {}).get("complete"):
        s = g["state"]
        print("[sim good] WON t=%s biomass=%s tier=%s absorbed=%s payload=%s" % (s["t"], s["biomass"], s["tier"], s["absorbed"], json.dumps(g["recs"]["complete"])))
        print("[sim good] trace=%s" % json.dumps(s.get("trace")))
        if s.get("tier", 0) < 3 or s.get("absorbed", 0) < 15:
            ok = False
            results["fails"] = results.get("fails", []) + ["good-bot tier/absorbed under thresholds"]
    else:
        print("[sim good] FAILED %s" % json.dumps(g)[:1000])
        ok = False

    p = results["sims"].get("partial", {})
    if not p.get("error") and p.get("state", {}).get("status") == "won" and p.get("state", {}).get("fumbles") == 2:
        print("[sim partial] WON with exactly 2 fumbles t=%s trace=%s" % (p["state"]["t"], json.dumps(p["state"].get("trace"))))
    else:
        print("[sim partial] FAILED %s" % json.dumps(p)[:500])
        ok = False

    c = results["sims"].get("clumsy", {})
    fail_msg = c.get("recs", {}).get("fail") or ""
    if not c.get("error") and c.get("state", {}).get("status") == "lost" and fail_msg and "The infection takes over" in fail_msg:
        print("[sim clumsy] fail path proven (bilingual line): %r t=%s" % (fail_msg, c["state"]["t"]))
    else:
        print("[sim clumsy] FAILED %s" % json.dumps(c)[:500])
        ok = False
    return ok


def run_thumbs():
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-gpu", "--mute-audio"])
        page = b.new_page()
        bust = int(time.time() * 1000)
        page.goto(f"{BASE}/?level={LID}&bust={bust}", wait_until="domcontentloaded")
        try:
            r = page.evaluate(THUMB_BODY, {"url": f"{MODULE}?v={bust + 1}"})
        except Exception as e:
            r = {"ok": False, "error": str(e)}
        b.close()
    results["thumbs"] = r
    print("[thumbs-safety] %s" % ("OK bytes=%s" % r.get("bytes") if r.get("ok") else "FAIL %s" % json.dumps(r)[:300]))
    return bool(r.get("ok"))


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    ok = True
    if which in ("all", "live"):
        ok = run_live() and ok
    if which in ("all", "sims"):
        ok = run_sims() and ok
    if which in ("all", "jank"):
        ok = run_jank() and ok
    if which in ("all", "strings"):
        ok = run_strings() and ok
    if which in ("all", "thumbs"):
        ok = run_thumbs() and ok
    with open(os.path.join(HERE, "sim-results.json"), "w") as f:
        json.dump({k: results[k] for k in ("live", "sims", "jank", "strings", "thumbs", "shots")}, f, indent=2, default=str)
    print("OVERALL: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
