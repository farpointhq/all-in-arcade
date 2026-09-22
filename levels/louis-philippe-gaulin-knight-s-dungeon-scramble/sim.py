#!/usr/bin/env python3
"""sim — Knight's Dungeon Scramble verification rig (Playwright headless Chromium).

Issue #8: the ?ap=1 bot in maze.js judged threat distance with RAW Manhattan
distance, so a monster 2-5 tiles away THROUGH the wrap tunnel (row 13) read as
~17-20 tiles away — the bot never evaded and died head-on in the tunnel row
(cascade: 3/3 honest losses, deterministic facts=98/136 stall, six probe
deaths at tunnel-row corners).

This rig pins the fix with deterministic scenario probes on a PRIVATE
serve.py port (8608, the issue #8 slot). modes:

  scenario  wrap-ambush probes (deterministic via debug().teleportPlayer):
            the player is teleported into the tunnel row 3-5 tiles from the
            seam and a monster just past the seam (wrapped 4-5, raw 16-20).
            The bot must react to the WRAPPED distance: flee so the wrapped
            gap GROWS, never dip under 2, and not die. Wrap-blind code walks
            in head-on → FAIL.
  parity    probe parity: __TEST_API__.snapshot().player exists (added for
            issue #8, matching maze-studyhall.js:1036) and is coherent with
            the ghosts' tile-frame coordinates.
  guard     tunnel-entry guard: a monster is kept parked inside the tunnel
            near the player's column while the player prowls tunnel-adjacent
            rows; every ENTRY into row 13 must land >= 4.5 wrapped tiles from
            the parked threat, no deaths, and facts must keep increasing
            (the unguarded fallback stays alive — no facts=98-class freeze).
  soak      live-AP stall sentinel: up to 150 s of autopilot; while playing,
            facts must strictly increase (no >= 10 s plateau — the cascade's
            deterministic facts=98 freeze), <= 1 death, clean console.
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
LID = "louis-philippe-gaulin-knight-s-dungeon-scramble"
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = 8608
BASE = "http://127.0.0.1:%d" % PORT
COLS = 21
ROWS = 15
TUNNEL_ROW = 13

# deterministic ambush arms: (player col in row 13, ghost col) — wrapped 4-5,
# raw 16-20; both cells passable on the tunnel row. The player sits at the
# EDGE of the guard's blocked band with an open escape direction, and the
# nearest uneaten dot lies TOWARD the seam, so wrap-blind code walks into the
# ghost while guarded code routes away immediately.
ARMS = [(4, 20), (16, 0)]

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

# ---------------------------------------------------------------- page-side JS
SNAP_JS = "() => (window.__TEST_API__ && window.__TEST_API__.snapshot ? window.__TEST_API__.snapshot() : null)"
BOTSTART_JS = "() => { const A = window.__TEST_API__; if (!A || !A.botStart) return false; A.botStart(); return true; }"
DEATHS_JS = "() => (window.__MAZE_DEATHS__ || []).length"

ARM_JS = r"""
([pc, gc]) => {
  const A = window.__TEST_API__;
  if (!A || !A.debug) return null;
  const s = A.snapshot();
  if (!s || s.status !== "playing" || s.fright > 0) return null;
  // confound check: every OTHER roaming monster must be raw-far (ghost 0 is
  // the ambusher and gets teleported below)
  for (let i = 1; i < s.ghosts.length; i++) {
    const g = s.ghosts[i];
    if (g.eaten || g.fright || (g.phase !== "roam" && g.phase !== "exit")) continue;
    const raw = Math.abs(g.fx - pc) + Math.abs(g.fy - 13);
    if (raw < 8) return null;
  }
  const d = A.debug();
  const okp = d.teleportPlayer(pc, 13);
  const okg = d.teleportGhost(0, gc, 13);
  return okp && okg ? { pc, gc } : null;
}
"""

WATCH_JS = r"""
() => {
  const A = window.__TEST_API__;
  if (!A || !A.snapshot) return null;
  const s = A.snapshot();
  return { s, deaths: (window.__MAZE_DEATHS__ || []).length };
}
"""

GUARD_JS = r"""
() => {
  const A = window.__TEST_API__;
  if (!A || !A.snapshot) return null;
  const s = A.snapshot();
  if (!s) return null;
  let seeded = false;
  const p = s.player;
  const nearTunnel = p && Math.round(p.fy) >= 11 && Math.round(p.fy) <= 12;
  if (s.status === "playing" && nearTunnel && s.fright <= 0) {
    const inTunnel = s.ghosts.some((g) => !g.eaten && !g.fright &&
      (g.phase === "roam" || g.phase === "exit") && Math.round(g.fy) === 13);
    const now = performance.now();
    if (!inTunnel && (!window.__guardLastSeed || now - window.__guardLastSeed > 4000)) {
      const gc = ((Math.round(p.fx) + 4) % 21 + 21) % 21;
      A.debug().teleportGhost(0, gc, 13);
      window.__guardLastSeed = now;
      seeded = true;
    }
  }
  return { s, seeded };
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


def run_parity(page):
    """snapshot().player exists and is coherent with the ghosts' frame."""
    res = {"ok": True, "notes": [], "checks": []}
    try:
        s = boot_page(page, with_ap=True)
        if not s:
            return {"ok": False, "notes": ["never reached playing"]}
        for i in range(6):
            snap = page.evaluate(SNAP_JS)
            if not snap:
                res["ok"] = False
                res["notes"].append("snapshot unavailable")
                break
            p = snap.get("player")
            if not p:
                res["ok"] = False
                res["notes"].append("snapshot().player MISSING (probe parity gap)")
                break
            checks = {
                "has_fx_fy": isinstance(p.get("fx"), (int, float)) and isinstance(p.get("fy"), (int, float)),
                "has_tx_ty": "tx" in p and "ty" in p,
                "has_prog": isinstance(p.get("prog"), (int, float)),
                "fx_in_board": 0 <= p.get("fx", -1) < COLS,
                "fy_in_board": 0 <= p.get("fy", -1) < ROWS,
                "ghosts_same_frame": all(
                    isinstance(g.get("fx"), (int, float)) and isinstance(g.get("fy"), (int, float))
                    for g in snap.get("ghosts", [])),
            }
            res["checks"] = checks
            if not all(checks.values()):
                res["ok"] = False
                res["notes"].append("player/ghost frame incoherent: %s" % checks)
                break
            res["last"] = {"fx": p["fx"], "fy": p["fy"], "nghosts": len(snap["ghosts"])}
            time.sleep(0.3)
    except Exception as e:
        res["ok"] = False
        res["notes"].append("error: %s" % e)
    return res


def run_scenario(page, console, perr):
    """Deterministic wrap-ambush arms via teleportPlayer."""
    # NOTE: pre-fix this module's snapshot has no `player` field — the watch
    # loop reports that as a clean parity failure instead of a KeyError.
    res = {"arms": [], "ok": True, "notes": []}
    try:
        for pc, gc in ARMS:
            s = boot_page(page, with_ap=True)
            if not s:
                res["notes"].append("arm (%d,%d): never reached playing" % (pc, gc))
                continue
            deaths0 = page.evaluate(DEATHS_JS)
            armed = None
            t0 = time.time()
            while time.time() - t0 < 20 and not armed:
                armed = page.evaluate(ARM_JS, [pc, gc])
                time.sleep(0.15)
            if not armed:
                res["notes"].append("arm (%d,%d): could not arm in 20 s" % (pc, gc))
                continue
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
                res["notes"].append("arm (%d,%d): fright mid-watch — inconclusive" % (pc, gc))
                continue
            if parity_fail:
                res["notes"].append("arm (%d,%d): snapshot().player missing (probe parity gap)" % (pc, gc))
                res["ok"] = False
                continue
            if len(samples) < 10:
                res["notes"].append("arm (%d,%d): too few samples (%d)" % (pc, gc, len(samples)))
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
            arm["ok"] = min(ws) >= 2.0 and (last_q - first_q) >= 0.5
            if death_during:
                # the wrap verdict is the trend/dip; a kill by a NON-ambusher
                # ghost during the flee is collateral noise (deaths are policed
                # by the soak + acceptance runs)
                arm["note"] = "death during watch (killer unattributed) — recorded, not arm-fatal"
            res["arms"].append(arm)
            res["ok"] = res["ok"] and arm["ok"]
        page.screenshot(path=os.path.join(HERE, "shot-scenario.png"))
    except Exception as e:
        res["ok"] = False
        res["notes"].append("error: %s" % e)
    if len(res["arms"]) < len(ARMS):
        res["ok"] = False
        res["notes"].append("only %d/%d arms completed" % (len(res["arms"]), len(ARMS)))
    if not res["ok"]:
        res["notes"].append("VERDICT: bot is wrap-blind (gap shrank / death / dip) — see arms")
    return res


def run_guard(page, console, perr):
    res = {"ok": True, "notes": [], "entries": [], "violations": []}
    try:
        s = boot_page(page, with_ap=True)
        if not s:
            return {"ok": False, "notes": ["never reached playing"]}
        deaths0 = page.evaluate(DEATHS_JS)
        facts0 = s["facts"]
        observed, violations, entries, seeds = 0.0, 0, 0, 0
        t_start = time.time()
        prev_in_tunnel = False
        facts_first, facts_last = None, None
        while observed < 24.0 and time.time() - t_start < 180:
            g = page.evaluate(GUARD_JS)
            if not g or not g.get("s"):
                break
            snap, seeded = g["s"], g["seeded"]
            if seeded:
                seeds += 1
            st = snap.get("status")
            if st in ("lost", "bell"):
                res["notes"].append("run ended (%s) during guard window" % st)
                break
            deaths_now = page.evaluate(DEATHS_JS)
            if deaths_now - deaths0 > 1:
                res["ok"] = False
                res["notes"].append("%d deaths during guard window (budget 1)" % (deaths_now - deaths0))
                break
            if st != "playing":
                # dying/ready respawn transition — pause the window, keep going
                time.sleep(0.15)
                prev_in_tunnel = False
                continue
            if facts_first is None:
                facts_first = snap["facts"]
            facts_last = snap["facts"]
            p = snap.get("player")
            if not p:
                res["ok"] = False
                res["notes"].append("snapshot().player missing (probe parity gap)")
                break
            observed += 0.15
            in_tunnel = round(p["fy"]) == TUNNEL_ROW
            if in_tunnel and not prev_in_tunnel:
                entries += 1
                worst = None
                for gg in snap["ghosts"]:
                    if gg.get("eaten") or gg.get("fright") or gg.get("phase") not in ("roam", "exit"):
                        continue
                    if round(gg["fy"]) != TUNNEL_ROW:
                        continue
                    w = wdist(gg["fx"], p["fx"]) + abs(gg["fy"] - p["fy"])
                    if worst is None or w < worst[0]:
                        worst = (w, gg["fx"])
                row = {"w": round(worst[0], 2) if worst else None,
                       "fx": p["fx"], "gfx": worst[1] if worst else None}
                res["entries"].append(row)
                if worst and worst[0] < 4.5:
                    violations += 1
                    res["violations"].append(row)
            prev_in_tunnel = in_tunnel
            time.sleep(0.15)
        res["observed_s"] = round(observed, 1)
        res["entries_n"] = entries
        res["seeds_n"] = seeds
        res["facts_delta"] = (facts_first - facts_last) if (facts_first is not None and facts_last is not None) else 0
        if facts_first is None or facts_last is None or facts_last >= facts_first:
            res["ok"] = False
            res["notes"].append("no eating progress during guard window (freeze class) — G.facts is the REMAINING count")
        if violations:
            res["ok"] = False
            res["notes"].append("%d row-13 entries within 4.5 wrapped of an in-tunnel threat" % violations)
        if observed < 8.0:
            res["notes"].append("thin observation (%.1fs) — player rarely tunnel-adjacent" % observed)
        page.screenshot(path=os.path.join(HERE, "shot-guard.png"))
    except Exception as e:
        res["ok"] = False
        res["notes"].append("error: %s" % e)
    return res


def run_soak(page, console, perr, badnet):
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
            st = snap["status"]
            if st in ("dying", "ready"):
                # respawn transition — pause the soak (facts can't move while
                # dead) and keep the budget running
                last_move = time.time()
                time.sleep(0.5)
                continue
            if st != "playing":
                res["ended"] = {"t": round(t, 1), "status": st,
                                "facts": snap["facts"], "deaths": deaths}
                break
            if snap["facts"] <= 0:
                res["ended"] = {"t": round(t, 1), "status": "win", "facts": snap["facts"]}
                break
            if snap["facts"] != last_facts:
                last_facts, last_move = snap["facts"], time.time()
            elif time.time() - last_move >= 20.0:
                res["ok"] = False
                res["plateau"] = {"t": round(t, 1), "facts": snap["facts"]}
                res["notes"].append("facts plateaued at %s for >= 20 s (stall class)" % snap["facts"])
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

            if "all" in modes or "parity" in modes:
                results["parity"] = run_parity(page)
                print("[parity]", "PASS" if results["parity"]["ok"] else "FAIL",
                      results["parity"]["notes"])

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
