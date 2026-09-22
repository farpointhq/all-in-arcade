#!/usr/bin/env python3
"""Nano Cure playtest rigs (protocol-owned per level; Playwright headless Chromium).

Modes (default all):
  live   — boots the REAL app at ?level=amir-kermany-nano-cure-2&bot=1&flavor=good
           &debug=1&beats=1, polls window.__NANO, saves shot-<phase>.png,
           console-clean proof (R1) — booth masthead noise filtered by URL/BOOTH_FILTER;
           all other 4xx/5xx fail via the URL-attributed badnet list.
  sims   — fixed-dt determinism: good / partial / clumsy with fresh ?v= import,
           fake api recording complete/fail, threshold asserts (R5-R9).
  thumbs — thumbnail-pipeline equivalent: stub api + 70 neutral steps + draw + toDataURL.
Exit 0 iff PASS. Writes sim-results.json + shot-*.png here.
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8181"
LID = "amir-kermany-nano-cure-2"
HERE = os.path.dirname(os.path.abspath(__file__))
BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")
MODULE = f"{BASE}/src/genres/nano-cure.js"
results = {"live": None, "sims": {}, "thumbs": None, "shots": [], "fails": []}

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
  const dt = 1 / 60, frames = Math.ceil(a.maxT * 60);
  for (let i = 0; i < frames; i++) {
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


def run_live():
    out = {"console_errors": [], "badnet": [], "page_error": None, "won": False, "state": None, "trace": []}
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-gpu"])
        page = b.new_page()
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
                out["state"], out["trace"] = s, s.get("trace", [])
                for tag in set(s.get("trace", [])) - seen:
                    seen.add(tag)
                    fn = os.path.join(HERE, "shot-%s.png" % tag.split("@")[0].replace("/", ""))
                    try:
                        page.screenshot(path=fn)
                        results["shots"].append(os.path.basename(fn))
                    except Exception:
                        pass
                if s.get("status") != "playing":
                    break
            page.wait_for_timeout(800)
        b.close()
    out["won"] = (out["state"] or {}).get("status") == "won"
    out["clean"] = bool(out["won"]) and not out["page_error"] and not out["console_errors"] \
        and not out["badnet"]
    results["live"] = out
    try:  # final-state tile even on failure
        if not out["won"]:
            pass
    finally:
        pass
    print("[live] won=%s page_error=%s console_errors=%s trace=%s" % (out["won"], out["page_error"], out["console_errors"], json.dumps(out["trace"])))
    if not out["won"]:
        print("[live] final state: %s" % json.dumps(out["state"]))
    return out["clean"]


def run_sims():
    ok = True
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-gpu"])
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
    if not c.get("error") and c.get("state", {}).get("status") == "lost" and c.get("recs", {}).get("fail"):
        print("[sim clumsy] fail path proven: %r t=%s" % (c["recs"]["fail"], c["state"]["t"]))
    else:
        print("[sim clumsy] FAILED %s" % json.dumps(c)[:500])
        ok = False
    return ok


def run_thumbs():
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-gpu"])
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
    if which in ("all", "thumbs"):
        ok = run_thumbs() and ok
    with open(os.path.join(HERE, "sim-results.json"), "w") as f:
        json.dump({k: results[k] for k in ("live", "sims", "thumbs", "shots")}, f, indent=2, default=str)
    print("OVERALL: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
