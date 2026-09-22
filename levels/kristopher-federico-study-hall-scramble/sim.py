#!/usr/bin/env python3
"""sim — Study Hall Scramble verification rig (Playwright headless Chromium).

Issue #8: the ?ap=1 bot judged threat distance with RAW Manhattan distance,
so a staff member 2-5 tiles away THROUGH the wrap tunnel (row 13) read as
~17-20 tiles away — the bot never evaded and died head-on in the tunnel row
(cascade: 4/4 honest losses, deaths clustered in row 13).

This rig pins the fix with deterministic scenario probes on a PRIVATE
serve.py port (8608, the issue #8 slot). modes:

  scenario  wrap-ambush probes: the player is caught munching the tunnel row
            3-5 tiles from the seam and a ghost is teleported just past the
            seam (wrapped 4-5, raw 16-20). The bot must react to the WRAPPED
            distance: flee so the wrapped gap GROWS, never dip under 2, and
            not die. On wrap-blind code the gap shrinks head-on → FAIL.
  guard     tunnel-entry guard: a ghost is kept parked inside the tunnel near
            the player's column while the player prowls tunnel-adjacent rows;
            every ENTRY into row 13 must land >= 4.5 wrapped tiles from the
            parked threat, no deaths, and facts must keep increasing (the
            unguarded fallback stays alive — no facts=98-class freeze).
  soak      live-AP stall sentinel: up to 150 s of autopilot; while playing,
            facts must strictly increase (no >= 10 s plateau), <= 1 death,
            clean console. Early-exits on win or game over.
  boot      boot smoke: canvas reached, zero unfiltered console errors
            (BOOTH_FILTER), zero pageerror, __TEST_API__ mounted.
  all       everything (default)

Writes sim-results.json + shot-*.png in THIS folder (mirrored to
docs/playtest/evidence/<lid>/sim-results.json when present).
Exit 0 only if all modes pass.
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LID = "kristopher-federico-study-hall-scramble"
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = 8608
BASE = "http://127.0.0.1:%d" % PORT
COLS = 21
TUNNEL_ROW = 13

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

# ---------------------------------------------------------------- page-side JS
SNAP_JS = "() => (window.__TEST_API__ && window.__TEST_API__.snapshot ? window.__TEST_API__.snapshot() : null)"
BOTSTART_JS = "() => { const A = window.__TEST_API__; if (!A || !A.botStart) return false; A.botStart(); return true; }"
DEATHS_JS = "() => (window.__MAZE_DEATHS__ || []).length"

# arm: player munching the tunnel row toward a seam, clean board around.
# dir < 0 → heading for col 0 → ghost parked at col 20 (just past the seam);
# dir > 0 → heading for col 20 → ghost parked at col 0.
# Wrapped distance at arm is 4-5; raw is 16-20 (deep in the wrap-blind zone).
ARM_JS = r"""
() => {
  const A = window.__TEST_API__;
  if (!A || !A.snapshot) return null;
  const s = A.snapshot();
  if (!s || s.status !== "playing" || s.fright > 0) return null;
  const p = s.player;
  if (!p) return null;
  const rx = Math.round(p.fx), ry = Math.round(p.fy);
  if (ry !== 13) return null;
  const dir = Math.sign(p.tx - p.fx);
  if (!dir) return null;
  let gc = null;
  if (dir < 0 && rx >= 3 && rx <= 4) gc = 20;
  if (dir > 0 && rx >= 16 && rx <= 17) gc = 0;
  if (gc === null) return null;
  for (const g of s.ghosts) {
    if (g.eaten || g.fright || (g.phase !== "roam" && g.phase !== "exit")) continue;
    const raw = Math.abs(g.fx - p.fx) + Math.abs(g.fy - p.fy);
    if (raw < 8) return null;              // no raw-close confound
  }
  const ok = A.debug().teleportGhost(0, gc, 13);
  return ok ? { rx, dir, gc } : null;
}
"""

# dungeon-only arm (teleportPlayer): not used by this rig (no teleportPlayer
# seam in maze-studyhall) — the organic arm above is its counterpart.

# one poll sample during a watch window
WATCH_JS = r"""
() => {
  const A = window.__TEST_API__;
  if (!A || !A.snapshot) return null;
  const s = A.snapshot();
  return {
    s,
    deaths: (window.__MAZE_DEATHS__ || []).length,
  };
}
"""

# parked-ghost keeper + entry sampler for the guard probe
GUARD_JS = r"""
() => {
  const A = window.__TEST_API__;
  if (!A || !A.snapshot) return null;
  const s = A.snapshot();
  if (!s) return null;
  let parked = false;
  const p = s.player;
  const g0 = s.ghosts[0];
  const nearTunnel = p && Math.round(p.fy) >= 11 && Math.round(p.fy) <= 12;
  if (nearTunnel && s.fright <= 0 && g0 && !g0.eaten) {
    const gc = ((Math.round(p.fx) + 4) % 21 + 21) % 21;
    A.debug().teleportGhost(0, gc, 13);
    parked = true;
  }
  return { s, parked };
}
"""


def start_server():
    proc = subprocess.Popen([sys.executable, "serve.py", "--port", str(PORT)],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE, timeout=0.6)
            return proc
        except Exception:
            time.sleep(0.25)
    proc.kill()
    raise SystemExit("[sim] server failed to start on %s" % BASE)


def filtered(msgs):
    return [m for m in msgs if not any(t in m for t in BOOTH_FILTER)]


def app_errors(console):
    # resource-load failures carry no URL in their console text — they are
    # judged by URL via badnet instead (same policy as tools/playtest/playtest.py)
    return [c for c in console
            if c.startswith("error:") and not c.startswith("error:Failed to load resource")]


def wdist(a, b):
    d = abs(a - b)
    return min(d, COLS - d)


def boot_page(page, with_ap=True):
    url = BASE + "/?level=" + LID + "&debugMaze=1"
    if with_ap:
        url += "&ap=1"
    page.goto(url)
    try:
        page.wait_for_selector("canvas", timeout=8000)
    except Exception:
        pass
    t0 = time.time()
    while time.time() - t0 < 15:
        s = page.evaluate(SNAP_JS)
        if s and s.get("status") == "playing":
            page.evaluate(BOTSTART_JS)
            return s
        time.sleep(0.15)
    return None


def run_scenario(page, console, perr):
    """Wrap-ambush probes: wrapped distance must GROW, no deaths, no deep dip."""
    res = {"arms": [], "ok": True, "notes": []}
    target_arms, max_attempts = 3, 9
    try:
        while len(res["arms"]) < target_arms and max_attempts > 0:
            max_attempts -= 1
            s = boot_page(page, with_ap=True)
            if not s:
                res["notes"].append("arm %d: never reached playing" % (target_arms - max_attempts))
                continue
            deaths0 = page.evaluate(DEATHS_JS)
            armed = None
            t0 = time.time()
            while time.time() - t0 < 120 and not armed:
                if page.evaluate(DEATHS_JS) > deaths0 or not page.evaluate(SNAP_JS):
                    break  # died while waiting — reboot below
                armed = page.evaluate(ARM_JS)
                time.sleep(0.1)
            if not armed:
                res["notes"].append("arm: no ambush geometry found in 120 s")
                continue
            # watch 4 s: sample wrapped distance to ghost 0
            samples, death_during, fright_during, parity_fail = [], False, False, False
            t0 = time.time()
            while time.time() - t0 < 4.0:
                w = page.evaluate(WATCH_JS)
                if not w or not w.get("s"):
                    break
                snap = w["s"]
                if w["deaths"] > deaths0:
                    death_during = True
                    break
                if snap.get("status") != "playing":
                    death_during = w["deaths"] > deaths0
                    break
                if snap.get("fright", 0) > 0:
                    fright_during = True
                    break
                p = snap.get("player")
                if not p:
                    parity_fail = True
                    break
                g0 = snap["ghosts"][0]
                samples.append({
                    "t": round(time.time() - t0, 2),
                    "w": round(wdist(g0["fx"], p["fx"]) + abs(g0["fy"] - p["fy"]), 2),
                    "fy": p["fy"],
                })
                time.sleep(0.12)
            if fright_during:
                res["notes"].append("arm: fright window mid-watch — inconclusive, retry")
                continue
            if parity_fail:
                res["notes"].append("arm: snapshot().player missing (probe parity gap)")
                res["ok"] = False
                continue
            if len(samples) < 10:
                res["notes"].append("arm: too few samples (%d)" % len(samples))
                continue
            ws = [x["w"] for x in samples]
            q = max(1, len(ws) // 4)
            first_q, last_q = sum(ws[:q]) / q, sum(ws[-q:]) / q
            arm = {
                "armed": armed,
                "samples": len(ws),
                "w_first": ws[0], "w_min": min(ws), "w_last": ws[-1],
                "trend": round(last_q - first_q, 2),
                "death": death_during,
            }
            arm["ok"] = (not death_during) and min(ws) >= 2.0 and (last_q - first_q) >= 0.5
            res["arms"].append(arm)
            res["ok"] = res["ok"] and arm["ok"]
            time.sleep(1.5)  # cooldown before next arm
        page.screenshot(path=os.path.join(HERE, "shot-scenario.png"))
    except Exception as e:
        res["ok"] = False
        res["notes"].append("error: %s" % e)
    if len(res["arms"]) < target_arms:
        res["ok"] = False
        res["notes"].append("only %d/%d arms completed" % (len(res["arms"]), target_arms))
    if not res["ok"]:
        res["notes"].append("VERDICT: bot is wrap-blind (gap shrank / death / dip) — see arms")
    return res


def run_guard(page, console, perr):
    """Tunnel-entry guard: row-13 entries stay far from a parked tunnel threat;
    facts keep increasing (fallback liveness)."""
    res = {"ok": True, "notes": [], "entries": [], "violations": []}
    try:
        s = boot_page(page, with_ap=True)
        if not s:
            return {"ok": False, "notes": ["never reached playing"]}
        deaths0 = page.evaluate(DEATHS_JS)
        facts0 = s["facts"]
        observed, violations, entries = 0.0, 0, 0
        t_start, last_facts = time.time(), s["facts"]
        prev_in_tunnel = False
        while observed < 12.0 and time.time() - t_start < 120:
            g = page.evaluate(GUARD_JS)
            if not g or not g.get("s"):
                break
            snap, parked = g["s"], g["parked"]
            if snap.get("status") != "playing":
                res["notes"].append("run ended during guard window")
                break
            if page.evaluate(DEATHS_JS) > deaths0:
                res["ok"] = False
                res["notes"].append("death during guard window")
                break
            p = snap.get("player")
            if not p:
                res["ok"] = False
                res["notes"].append("snapshot().player missing (probe parity gap)")
                break
            g0 = snap["ghosts"][0]
            in_tunnel = round(p["fy"]) == TUNNEL_ROW
            if parked and snap.get("fright", 0) <= 0:
                observed += 0.15
                if in_tunnel and not prev_in_tunnel:
                    entries += 1
                    w = wdist(g0["fx"], p["fx"]) + abs(g0["fy"] - p["fy"])
                    row = {"w": round(w, 2), "fx": p["fx"], "gfx": g0["fx"]}
                    entries_row = row
                    res["entries"].append(row)
                    if w < 4.5:
                        violations += 1
                        res["violations"].append(row)
            prev_in_tunnel = in_tunnel
            if snap["facts"] != last_facts:
                last_facts = snap["facts"]
            time.sleep(0.15)
        facts1 = (page.evaluate(SNAP_JS) or {}).get("facts", facts0)
        res["observed_s"] = round(observed, 1)
        res["entries_n"] = entries
        res["facts_delta"] = facts1 - facts0
        if facts1 <= facts0:
            res["ok"] = False
            res["notes"].append("facts did not increase during guard window (freeze class)")
        if violations:
            res["ok"] = False
            res["notes"].append("%d row-13 entries within 4.5 wrapped of the parked threat" % violations)
        if observed < 4.0:
            res["notes"].append("thin observation (%.1fs) — player rarely tunnel-adjacent" % observed)
        page.screenshot(path=os.path.join(HERE, "shot-guard.png"))
    except Exception as e:
        res["ok"] = False
        res["notes"].append("error: %s" % e)
    return res


def run_soak(page, console, perr, badnet):
    """Stall sentinel: while playing, facts strictly increase; <= 1 death."""
    res = {"ok": True, "notes": [], "plateau": None}
    try:
        s = boot_page(page, with_ap=True)
        if not s:
            return {"ok": False, "notes": ["never reached playing"]}
        deaths0 = page.evaluate(DEATHS_JS)
        t0 = time.time()
        samples, last_move, last_facts = [], time.time(), s["facts"]
        while time.time() - t0 < 150:
            snap = page.evaluate(SNAP_JS)
            if not snap:
                break
            t = time.time() - t0
            deaths = page.evaluate(DEATHS_JS)
            samples.append({"t": round(t, 1), "facts": snap["facts"],
                            "status": snap["status"], "deaths": deaths})
            if snap["status"] != "playing":
                res["ended"] = {"t": round(t, 1), "status": snap["status"],
                                "facts": snap["facts"], "deaths": deaths}
                break
            if snap["facts"] >= snap["totalFacts"]:
                res["ended"] = {"t": round(t, 1), "status": "win", "facts": snap["facts"]}
                break
            if snap["facts"] != last_facts:
                last_facts, last_move = snap["facts"], time.time()
            elif time.time() - last_move >= 10.0:
                res["ok"] = False
                res["plateau"] = {"t": round(t, 1), "facts": snap["facts"]}
                res["notes"].append("facts plateaued at %d for >= 10 s (98-freeze class)" % snap["facts"])
                break
            time.sleep(0.5)
        deaths1 = page.evaluate(DEATHS_JS)
        res["deaths"] = deaths1 - deaths0
        res["samples"] = len(samples)
        if res["deaths"] > 1:
            res["ok"] = False
            res["notes"].append("%d deaths (gate: <= 1)" % res["deaths"])
        if filtered(perr):
            res["ok"] = False
            res["notes"].append("pageerror: %s" % filtered(perr)[:1])
        errs = app_errors(console)
        if filtered(errs):
            res["ok"] = False
            res["notes"].append("console errors: %s" % filtered(errs)[:2])
        if filtered(badnet):
            res["ok"] = False
            res["notes"].append("bad responses: %s" % filtered(badnet)[:2])
        page.screenshot(path=os.path.join(HERE, "shot-soak.png"))
    except Exception as e:
        res["ok"] = False
        res["notes"].append("error: %s" % e)
    return res


def run_boot(page, console, perr, badnet):
    res = {"ok": True, "notes": []}
    try:
        console.clear()
        perr.clear()
        badnet.clear()
        page.goto(BASE + "/?level=" + LID + "&debugMaze=1")
        try:
            page.wait_for_selector("canvas", timeout=8000)
        except Exception:
            res["ok"] = False
            res["notes"].append("canvas never appeared")
        time.sleep(4.0)
        errs = app_errors(console)
        if filtered(errs):
            res["ok"] = False
            res["notes"].append("console: %s" % filtered(errs)[:3])
        if filtered(perr):
            res["ok"] = False
            res["notes"].append("pageerror: %s" % filtered(perr)[:2])
        if filtered(badnet):
            res["ok"] = False
            res["notes"].append("bad responses: %s" % filtered(badnet)[:2])
        api = page.evaluate("() => !!(window.__TEST_API__ && window.__TEST_API__.snapshot)")
        res["test_api"] = api
        if not api:
            res["ok"] = False
            res["notes"].append("__TEST_API__.snapshot missing under debugMaze=1")
    except Exception as e:
        res["ok"] = False
        res["notes"].append("error: %s" % e)
    return res


def run():
    modes = sys.argv[1:] or ["all"]
    results = {"lid": LID, "port": PORT, "modes": modes, "issue": 8}

    server = start_server()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1000, "height": 640})
            console, perr, badnet = [], [], []
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))
            # 4xx/5xx carry their URL here (resource-404 console text has none)
            page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url))
                    if r.status >= 400 else None)

            if "all" in modes or "scenario" in modes:
                results["scenario"] = run_scenario(page, console, perr)
                print("[scenario]", "PASS" if results["scenario"]["ok"] else "FAIL",
                      results["scenario"]["notes"])

            if "all" in modes or "guard" in modes:
                results["guard"] = run_guard(page, console, perr)
                print("[guard]", "PASS" if results["guard"]["ok"] else "FAIL",
                      results["guard"]["notes"])

            if "all" in modes or "soak" in modes:
                results["soak"] = run_soak(page, console, perr, badnet)
                print("[soak]", "PASS" if results["soak"]["ok"] else "FAIL",
                      results["soak"]["notes"])

            if "all" in modes or "boot" in modes:
                results["boot"] = run_boot(page, console, perr, badnet)
                print("[boot]", "PASS" if results["boot"]["ok"] else "FAIL",
                      results["boot"]["notes"])

            browser.close()
    finally:
        server.kill()

    path = os.path.join(HERE, "sim-results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    ev_dir = os.path.join(ROOT, "docs", "playtest", "evidence", LID)
    if os.path.isdir(ev_dir):
        try:
            shutil.copyfile(path, os.path.join(ev_dir, "sim-results.json"))
            print("[evidence] mirrored to", os.path.relpath(ev_dir, ROOT))
        except Exception as e:
            print("[evidence] mirror failed:", e)
    all_ok = all(v.get("ok") for v in results.values() if isinstance(v, dict) and "ok" in v)
    print("OVERALL", "PASS" if all_ok else "FAIL", "→", os.path.relpath(path, ROOT))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    run()
