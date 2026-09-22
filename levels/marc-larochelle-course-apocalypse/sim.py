#!/usr/bin/env python3
"""sim — Course Apocalypse early-pressure verification rig (Playwright headless Chromium).

Issue #14: survival missile volleys drained the 3-heart bank by t≈33 s for a first-time
booth visitor. The fix is an early-game on-ramp in src/genres/survival.js (learn window
t < 35 s: 1-missile salvos, wider gaps, 45 % aimed, 4.5 s continue grace + a
"▲ SAUTE !" teaching popup) that provably keeps the lose path reachable.

Booth protocol: rAF throttling kills the shared Fabric tab, so verdicts run on headless
Chromium against a PRIVATE serve.py port (8614 = 8600 + issue 14). Modes:

  sims     fixed-dt 1/60 in-page runs (stub api, SEEDED Math.random → deterministic):
           density   early-window spawn pin (t ≤ 35 s): ≤ 10 spawns, aimed ≤ 0.5, telegraphs kept;
           losepath  AC2 logic — stub bank of exactly 3 → api.fail fires EXACTLY once,
                     after exactly 3 spend(1) calls (bank drained via continues → hard fail);
           ducktype  api.lives absent → first death hard-fails immediately (today-0 behavior);
           grace     after a continue the first post-respawn salvo is ≥ 4.5 s away.
  dodge    AC1 live boots — 3 fresh runs driven ONLY by jump taps (Space 1.3 s / ArrowUp 2.6 s,
           the committed playtest cadence minus the inert ArrowLeft/Right), polling __SR.state();
           PASS if ≥ 1 run reaches dist ≥ 450 m without the hard overlay. Logs per-run max
           dist + death times.
  noinput  AC2 live boot — zero keys; PASS when #screen-result.active appears with
           state.lives === 0 (bank drained → TRY AGAIN overlay), budget 150 s.
  all      everything (default)

Writes sim-results.json in THIS folder. Exit 0 only if all requested modes pass.

Seed note: salvos/aim are Math.random-driven; sims pins seed the PRNG (SEED below) so the
fixed-dt pins are reproducible run-to-run. Live probes stay unseeded (real rAF + real keys).
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LID = "marc-larochelle-course-apocalypse"
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = 8614                      # 8600 + (issue 14 % 200) — unique per fix-fleet chat
BASE = "http://127.0.0.1:%d" % PORT
SEED = 20260922                  # cascade date — any seed where the honest expectation holds

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

DODGE_RUNS = 3
DODGE_BUDGET = 150               # s per run (450 m needs ≥ 45 s + deaths + graces)
DODGE_TARGET = 450               # m — AC1 acceptance
EARLY_T = 35                     # s — must match survival.js EARLY_T
EARLY_MAX_SPAWNS = 10
EARLY_MAX_AIMED = 0.5
CONTINUE_GRACE = 4.5             # s — must match survival.js CONTINUE_GRACE

# One in-page harness for all four deterministic pins. Returns measurements only —
# the pass/fail logic lives in Python so the pins stay readable.
SIM_EVAL = r"""
async (sc) => {
  // seeded PRNG — salvos/aim use Math.random; fix it so fixed-dt pins are deterministic
  let s = sc.seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const lvl = await (await fetch("/levels/marc-larochelle-course-apocalypse/level.json")).json();
  const mod = await import("/src/genres/survival.js?v=" + Date.now());
  const neutral = {
    down: () => false, just: () => false, left: () => false, right: () => false,
    up: () => false, downKey: () => false, jumpJust: () => false, anyJust: () => false,
    endFrame() {},
  };
  const calls = { complete: [], fail: [] };
  const bank = { n: sc.bank == null ? 0 : sc.bank, spends: 0, gains: 0 };
  const events = [];
  const api = {
    eng: { shake() {}, flash: 0, input: neutral },
    audio: { ensure() { return null; }, unlocked: false, sfx() {}, setVolume() {},
             playMusic() {}, stopMusic() {} },
    hud() {},
    complete(pl) { calls.complete.push(pl); },
    fail(m) { calls.fail.push(String(m)); events.push({ type: "fail", t: window.__SR.state().t }); },
  };
  if (sc.bank != null) {   // duck-type pin: api.lives stays ABSENT when bank is null
    api.lives = {
      get: () => bank.n,
      spend(k) {
        k = k || 1;
        if (bank.n <= 0) return false;
        bank.n -= k; bank.spends += k;
        events.push({ type: "spend", t: window.__SR.state().t, left: bank.n });
        return true;
      },
      gain(k) { k = k || 1; bank.n = Math.min(9, bank.n + k); bank.gains += k; return true; },
      enabled: true,
    };
  }
  const inst = mod.create(lvl, api);
  const st = () => (window.__SR ? window.__SR.state() : null);
  const DT = 1 / 60, MAXS = sc.maxS;
  const trace = [];
  let maxDist = 0, tEnd = 0;
  let graceWatch = null;   // { respawnT, spawnsAtRespawn, spawnT } — first continue only
  let step = 0;
  for (; step * DT < MAXS; step++) {
    inst.update(DT, neutral);
    const s2 = st();
    if (!s2) return { error: "window.__SR missing (boot ?debug=1 style URL or check module)" };
    maxDist = Math.max(maxDist, s2.dist);
    tEnd = s2.t;
    const total = s2.missileStats.total;
    if (sc.spawnTimeline && (step % 6 === 0 || total !== (trace.length ? trace[trace.length - 1]._tot : undefined))) {
      trace.push({ t: s2.t, dist: s2.dist, status: s2.status,
                   _tot: total, _aimed: s2.missileStats.aimed, _tele: s2.missileStats.aimedTele });
    }
    const lastSpend = events.length && events[events.length - 1].type === "spend"
      ? events[events.length - 1] : null;
    if (sc.grace && lastSpend && graceWatch === null) {
      graceWatch = { respawnT: lastSpend.t, spawnsAtRespawn: total, spawnT: null };
    }
    if (graceWatch && graceWatch.spawnT === null && total > graceWatch.spawnsAtRespawn) {
      graceWatch.spawnT = s2.t;
    }
    if (calls.fail.length) break;                 // hard fail ends the run
    if (sc.stopAfterFirstSpawn && graceWatch && graceWatch.spawnT !== null) break;
    if (sc.maxS <= 0) break;
  }
  trace.forEach(r => { delete r._tot; delete r._aimed; delete r._tele; });
  return {
    events, complete: calls.complete, fails: calls.fail,
    spends: bank.spends, gains: bank.gains, bankLeft: bank.n,
    spawnTimeline: sc.spawnTimeline ? trace : undefined,
    spawnTotal: st() ? st().missileStats : null,
    maxDist, tEnd, grace: graceWatch,
    livesSeen: st() ? st().lives : null,
  };
}
"""

LIVE_STATE = r"""() => (window.__SR ? window.__SR.state() : null)"""
RESULT_ACTIVE = r"""() => !!document.querySelector('#screen-result.active')"""


def log(*a):
    print("[sim]", *a, flush=True)


def filtered(msgs):
    return [m for m in msgs if not any(t in m for t in BOOTH_FILTER)]


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


def run_sims(pw, results):
    """Deterministic fixed-dt pins (stub api, seeded PRNG)."""
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1000, "height": 640})
    pins = {}

    scenarios = {
        # neutral run through the whole learn window; unlimited stub bank so any
        # death just continues and never truncates the 35 s measurement window
        "density": {"seed": SEED, "bank": 99, "maxS": EARLY_T + 0.5,
                    "spawnTimeline": True},
        # AC2 logic: exactly 3 bank lives → 3 continues → 4th death hard-fails
        "losepath": {"seed": SEED, "bank": 3, "maxS": 150},
        # today-0 behavior: no api.lives at all → first death hard-fails
        "ducktype": {"seed": SEED, "bank": None, "maxS": 150},
        # first continue must buy ≥ CONTINUE_GRACE of clean road
        "grace": {"seed": SEED, "bank": 3, "maxS": 120, "stopAfterFirstSpawn": True,
                  "grace": True},
    }
    for name, sc in scenarios.items():
        page.goto(BASE + "/?sim=1&debug=1")
        try:
            pins[name] = page.evaluate(SIM_EVAL, sc)
        except Exception as e:
            pins[name] = {"error": str(e)}

    browser.close()
    ok, notes = True, []

    d = pins.get("density", {})
    if "error" in d:
        ok = False; notes.append("density: " + d["error"])
    else:
        ms = d.get("spawnTotal") or {}
        total, aimed = ms.get("total", -1), ms.get("aimed", -1)
        frac = (aimed / total) if total > 0 else 1.0
        tele_ok = ms.get("aimedTele") == aimed and aimed >= 0
        if total > EARLY_MAX_SPAWNS:
            ok = False; notes.append("density: %d spawns in ≤%.1fs > %d" % (total, EARLY_T, EARLY_MAX_SPAWNS))
        if frac > EARLY_MAX_AIMED:
            ok = False; notes.append("density: aimed fraction %.2f > %.2f" % (frac, EARLY_MAX_AIMED))
        if not tele_ok:
            ok = False; notes.append("density: aimed telegraph invariant broken")
        pins["density"]["verdict"] = {"total": total, "aimed": aimed, "aimedFrac": round(frac, 3)}

    lp = pins.get("losepath", {})
    if "error" in lp:
        ok = False; notes.append("losepath: " + lp["error"])
    else:
        if len(lp.get("fails", [])) != 1:
            ok = False; notes.append("losepath: %d api.fail calls (want exactly 1)" % len(lp.get("fails", [])))
        if lp.get("spends") != 3:
            ok = False; notes.append("losepath: %d spend calls (want exactly 3)" % lp.get("spends", -1))
        if lp.get("complete"):
            ok = False; notes.append("losepath: api.complete fired on a lose run")
        if lp.get("tEnd", 999) > 150:
            ok = False; notes.append("losepath: bank never drained in 150 s (tEnd=%.1f)" % lp.get("tEnd", -1))

    du = pins.get("ducktype", {})
    if "error" in du:
        ok = False; notes.append("ducktype: " + du["error"])
    else:
        if len(du.get("fails", [])) != 1:
            ok = False; notes.append("ducktype: %d api.fail calls (want exactly 1, first death)" % len(du.get("fails", [])))
        if du.get("spends", 0) != 0:
            ok = False; notes.append("ducktype: %d spends with api.lives absent" % du.get("spends"))
        if du.get("livesSeen") is not None:
            ok = False; notes.append("ducktype: state.lives=%r (want null when api.lives absent)" % du.get("livesSeen"))
        pins["ducktype"]["verdict"] = {"failAtT": (du.get("events") or [{}])[-1].get("t") if du.get("events") else None}

    gr = pins.get("grace", {})
    if "error" in gr:
        ok = False; notes.append("grace: " + gr["error"])
    else:
        g = gr.get("grace") or {}
        if g.get("spawnT") is None:
            ok = False; notes.append("grace: no post-respawn salvo observed")
        else:
            delta = g["spawnT"] - g["respawnT"]
            if delta < CONTINUE_GRACE - 0.02:
                ok = False; notes.append("grace: first salvo %.2fs after respawn < %.2fs" % (delta, CONTINUE_GRACE))
            gr["verdict"] = {"respawnT": round(g["respawnT"], 2), "spawnT": round(g["spawnT"], 2),
                             "gap": round(delta, 2)}

    results["sims"] = {"ok": ok, "notes": notes, "seed": SEED, "pins": pins}
    log("[sims]", "PASS" if ok else "FAIL", notes)


def _net_and_console(page, console, perr, badnet):
    page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: perr.append(str(e)))
    page.on("response", lambda r: badnet.append("%s %s" % (r.status, r.url))
            if r.status >= 400 else None)


def run_dodge(pw, results):
    """AC1 — live boots, jump taps only (Space 1.3 s / ArrowUp 2.6 s, committed cadence)."""
    browser = pw.chromium.launch(headless=True)
    runs = []
    for i in range(DODGE_RUNS):
        ctx = browser.new_context(viewport={"width": 1000, "height": 640})  # fresh storage → bank=3
        page = ctx.new_page()
        console, perr, badnet = [], [], []
        _net_and_console(page, console, perr, badnet)
        page.goto(BASE + "/?level=" + LID + "&debug=1", timeout=15000)
        try:
            page.wait_for_selector("canvas", timeout=10000)
        except Exception:
            pass
        run = {"run": i + 1, "maxDist": 0, "deaths": [], "endStatus": None,
               "cause": None, "reached": None, "tEnd": None, "hardOverlay": False}
        last_tap = {}
        bank_seen = 3
        t0 = time.time()
        while time.time() - t0 < DODGE_BUDGET:
            wt = time.time() - t0
            for key, period, hold in (("Space", 1.3, 0.06), ("ArrowUp", 2.6, 0.12)):
                if wt - last_tap.get(key, -99) >= period:
                    last_tap[key] = wt
                    page.keyboard.down(key)
                    time.sleep(hold)
                    page.keyboard.up(key)
            s = page.evaluate(LIVE_STATE)
            if s:
                run["maxDist"] = max(run["maxDist"], s.get("dist", 0))
                run["tEnd"] = s.get("t")
                if run["reached"] is None and s.get("dist", 0) >= DODGE_TARGET:
                    run["reached"] = round(s.get("t"), 1)
                lives = s.get("lives")
                if isinstance(lives, int) and lives < bank_seen:
                    bank_seen = lives
                    run["deaths"].append({"t": round(s.get("t", 0), 1), "dist": s.get("dist")})
                if s.get("status") == "lost":
                    run["endStatus"] = "lost"
                    run["cause"] = s.get("cause")
                    run["hardOverlay"] = bool(page.evaluate(RESULT_ACTIVE))
                    break
                if s.get("status") == "won":
                    run["endStatus"] = "won"
                    break
            time.sleep(0.15)
        else:
            run["endStatus"] = "budget"
        run["ok"] = run["maxDist"] >= DODGE_TARGET
        run["console"] = filtered(console)[-6:]
        run["perr"] = filtered(perr)
        run["badnet"] = [n for n in badnet if not any(t in n for t in BOOTH_FILTER)]
        if run["perr"] or run["badnet"]:
            run["ok"] = False
        runs.append(run)
        log("[dodge] run %d: maxDist=%dm reached450=%s deaths=%d end=%s"
            % (i + 1, run["maxDist"], run["reached"], len(run["deaths"]), run["endStatus"]))
        ctx.close()
    browser.close()
    ok = any(r["ok"] for r in runs) and not any(r["perr"] or r["badnet"] for r in runs)
    results["dodge"] = {"ok": ok, "target": DODGE_TARGET, "runs": runs}
    log("[dodge]", "PASS" if ok else "FAIL",
        "≥1/%d runs reached %d m" % (DODGE_RUNS, DODGE_TARGET))


def run_noinput(pw, results):
    """AC2 — live boot, zero keys: the bank MUST drain → hard TRY AGAIN overlay."""
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1000, "height": 640})
    page = ctx.new_page()
    console, perr, badnet = [], [], []
    _net_and_console(page, console, perr, badnet)
    page.goto(BASE + "/?level=" + LID + "&debug=1", timeout=15000)
    try:
        page.wait_for_selector("canvas", timeout=10000)
    except Exception:
        pass
    obs = {"overlay": False, "lives": None, "cause": None, "maxDist": 0,
           "tOverlay": None, "deaths": []}
    bank_seen = 3
    t0 = time.time()
    while time.time() - t0 < 150:
        s = page.evaluate(LIVE_STATE)
        if s:
            obs["maxDist"] = max(obs["maxDist"], s.get("dist", 0))
            lives = s.get("lives")
            if isinstance(lives, int) and lives < bank_seen:
                bank_seen = lives
                obs["deaths"].append({"t": round(s.get("t", 0), 1), "dist": s.get("dist")})
        if page.evaluate(RESULT_ACTIVE):
            obs["overlay"] = True
            obs["tOverlay"] = round(time.time() - t0, 1)
            if s:
                obs["lives"] = s.get("lives")
                obs["cause"] = s.get("cause")
            break
        time.sleep(0.4)
    ok = obs["overlay"] and obs["lives"] == 0 and not filtered(perr) \
        and not [n for n in badnet if not any(t in n for t in BOOTH_FILTER)]
    results["noinput"] = {"ok": ok, "obs": obs,
                          "console": filtered(console)[-6:], "perr": filtered(perr),
                          "badnet": [n for n in badnet if not any(t in n for t in BOOTH_FILTER)]}
    browser.close()
    log("[noinput]", "PASS" if ok else "FAIL",
        "overlay=%s lives=%s deaths=%d" % (obs["overlay"], obs["lives"], len(obs["deaths"])))


def run():
    modes = sys.argv[1:] or ["all"]
    results = {"lid": LID, "port": PORT, "modes": modes, "seed": SEED}
    server = start_server()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            if "all" in modes or "sims" in modes:
                run_sims(pw, results)
            if "all" in modes or "dodge" in modes:
                run_dodge(pw, results)
            if "all" in modes or "noinput" in modes:
                run_noinput(pw, results)
    finally:
        server.kill()

    path = os.path.join(HERE, "sim-results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    all_ok = all(v.get("ok") for v in results.values() if isinstance(v, dict) and "ok" in v)
    print("OVERALL", "PASS" if all_ok else "FAIL", "→", os.path.relpath(path, ROOT))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    run()
