#!/usr/bin/env python3
"""sim — issue #19 exit() teardown regression rig (Playwright headless Chromium).

The per-level sim.py rigs call mod.create() directly and never exercise the SCENE
layer, so they cannot catch teardown bugs. This rig drives the REAL app flow
(boot → pause → level select → re-enter) and pins the exit() contract end-to-end:

  live    ?level=ian-spence-rewind-loop&debug=1&beats=1 on a private port, then:
            1. boot beat lands exactly once (baseline)
            2. PAUSE → RESTART (same-scene re-entry): drain runs, guard does NOT
               tear down the fresh instance → exactly one more boot beat
            3. RESTART again + quick-exit INSIDE the 350 ms boot-timer window →
               window.__REW must be gone (playScene.exit() wired) and the leaked
               timer must NOT fire (no stray boot-view tile)
            4. re-enter via the level grid → seam back, exactly +1 boot beat
            5. level→level (rewind → platformer card): stale seam must not
               resurrect, new genre HUD live
  thumbs   /?debug=1&beats=1 (title sweep): renderThumb() create()s instances
           OUTSIDE any scene — with the contract each one exits after its
           snapshot: seam deleted, zero "boot-view" beats (rewind's async boot
           timer cleared), sweep still succeeds. Other genres fire SYNCHRONOUS
           beats inside update() during the snapshot steps — by design, out of
           scope here (only rewind owns teardown-worthy state).

Writes exit-teardown-sim-results.json + evidence shots in THIS folder.
Exit 0 only if all requested modes pass. Default port 8619 (cascade scheme).
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LID = "ian-spence-rewind-loop"          # the one genre with teardown-worthy state
PLATFORMER_ID = "bethany-cloudwalk"     # first platformer card (level→level step)
PORT = 8619
BASE = "http://127.0.0.1:%d" % PORT

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")
BOOT_WINDOW_MS = 350   # rewind.js boot setTimeout delay — quick-exit must land inside it

SEAM_TYPE = r"() => typeof window.__REW"
BOOT_TILES = r'''() => Array.from(document.querySelectorAll("#beats img"))
  .filter(i => (i.dataset.label || "") === "boot-view").length'''
ALL_TILES = r'() => document.querySelectorAll("#beats img").length'
REWIND_TILES = BOOT_TILES  # "boot-view" is a rewind-only beat label
HUD_ON = r'() => !!document.querySelector("#hud") && document.querySelector("#hud").classList.contains("on")'

# Timing-critical: the whole exit must land inside the 350 ms boot-timer window.
# One in-page evaluate drives restart → wait-for-create (~2 ms granularity) → exit,
# all through the REAL handlers (button clicks + window keydown → App.key); Python-side
# polling (~50 ms/roundtrip) is too coarse and lets the timer win the race.
# The seam is DELETED before the restart click: the poll must anchor on the FRESH
# create() (startLevel drains the old instance only after its async module import,
# so a pre-existing seam is the OLD one — polling on it exits a session that was
# never created, and the in-flight startLevel then boots an orphaned instance).
QUICK_RESTART_EXIT = r'''async () => {
  const t0 = performance.now();
  delete window.__REW; // anchor: the next "object" sighting is the NEW instance
  document.querySelector('#screen-pause button[data-act="restart"]').click();
  const created = await new Promise((res) => {
    const tick = () => (typeof window.__REW === "object" ? res(performance.now()) : setTimeout(tick, 2));
    tick();
  });
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
  const btn = document.querySelector('#screen-pause button[data-act="pause-levels"]');
  if (!btn) return { error: "no-btn" };
  btn.click();
  return { createdMs: Math.round(created - t0), exitedMs: Math.round(performance.now() - t0),
           seamAfter: typeof window.__REW };
}'''

# Re-enter a level the way a user does: click the Nth .levelCard (N = manifest index).
PICK_CARD = r'''async (lid) => {
  const m = await (await fetch("/levels/manifest.json")).json();
  const i = (m.levels || []).map(l => l.id).indexOf(lid);
  if (i < 0) return "no-level";
  const cards = document.querySelectorAll("#levelGrid .levelCard");
  if (!cards[i]) return "no-card";
  cards[i].click();
  return "ok";
}'''


def start_server(port):
    proc = subprocess.Popen([sys.executable, "serve.py", "--port", str(port)],
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


def poll(page, js, want, timeout=8.0, interval=0.05):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if want(page.evaluate(js)):
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def pick_card(page, lid, timeout=8.0):
    """Click a level card by manifest id; retries until the grid is rendered."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = page.evaluate(PICK_CARD, lid)
            if r == "ok":
                return "ok"
            if r == "no-level":
                return r  # genuine failure — retrying won't help
        except Exception:
            pass
        time.sleep(0.1)
    return "timeout"


def run():
    args = sys.argv[1:]
    port = PORT
    if "--port" in args:
        port = int(args[args.index("--port") + 1])
        args = args[:args.index("--port")] + args[args.index("--port") + 2:]
    modes = args or ["all"]
    results = {"lid": LID, "modes": modes, "port": port}

    server = start_server(port)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1000, "height": 640})
            console, perr, bad_resp = [], [], []
            page.on("console", lambda m: console.append("%s:%s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: perr.append(str(e)))
            # resource errors: the console text of a 404 is a generic string WITHOUT
            # the url, so track responses directly and filter the known logo 404s
            page.on("response", lambda r: bad_resp.append("%s %s" % (r.status, r.url)) if r.status >= 400 else None)

            # ---------------- live: the real level-change flow ----------------
            if "all" in modes or "live" in modes:
                ok, notes = True, []
                page.goto(BASE + "/?level=" + LID + "&debug=1&beats=1")
                page.wait_for_selector("canvas", timeout=8000)

                # -- 1. boot: seam exists, boot beat lands once (baseline) --
                if not poll(page, SEAM_TYPE, lambda t: t == "object"):
                    ok = False; notes.append("boot: window.__REW never appeared")
                time.sleep(0.9)  # boot timer (350 ms) + slack
                base_tiles = page.evaluate(BOOT_TILES)
                if base_tiles != 1:
                    ok = False; notes.append("boot: boot-view tiles=%d (want 1)" % base_tiles)
                page.screenshot(path=os.path.join(HERE, "shot-live-boot.png"))

                # -- 2. same-scene re-entry (PAUSE → RESTART): drain + guard --
                page.keyboard.press("Escape")
                page.wait_for_selector("#screen-pause.active", timeout=4000)
                page.click('#screen-pause button[data-act="restart"]')
                if not poll(page, SEAM_TYPE, lambda t: t == "object"):
                    ok = False; notes.append("restart: seam never returned (double-exit tore down the fresh instance?)")
                time.sleep(0.7)
                tiles_after_restart = page.evaluate(BOOT_TILES)
                if tiles_after_restart != base_tiles + 1:
                    ok = False; notes.append("restart: boot-view tiles=%d (want %d — exactly one new boot beat, no double-exit)"
                                             % (tiles_after_restart, base_tiles + 1))

                # -- 3. the leak: quick-exit INSIDE the 350 ms boot window --
                page.keyboard.press("Escape")
                page.wait_for_selector("#screen-pause.active", timeout=4000)
                how = page.evaluate(QUICK_RESTART_EXIT)
                if not isinstance(how, dict) or how.get("error"):
                    ok = False; notes.append("quick-exit: in-page dispatch failed (%r)" % (how,))
                else:
                    if how.get("seamAfter") != "undefined":
                        ok = False; notes.append("quick-exit: window.__REW still set after leaving — playScene.exit() not wired")
                    if how.get("exitedMs", 9999) - how.get("createdMs", 0) > BOOT_WINDOW_MS:
                        ok = False; notes.append("quick-exit: exit landed %d ms after create (must be inside the %d ms boot window)"
                                                 % (how.get("exitedMs", 0) - how.get("createdMs", 0), BOOT_WINDOW_MS))
                time.sleep(0.7)  # > BOOT_WINDOW_MS: a leaked timer would have fired here
                tiles_after_quick_exit = page.evaluate(BOOT_TILES)
                if tiles_after_quick_exit != tiles_after_restart:
                    ok = False; notes.append("quick-exit: boot-view tiles=%d (want %d — stray beat from a torn-down session)"
                                             % (tiles_after_quick_exit, tiles_after_restart))
                if not page.evaluate('() => document.querySelector("#screen-levels").classList.contains("active")'):
                    ok = False; notes.append("quick-exit: levels screen never became active")
                page.screenshot(path=os.path.join(HERE, "shot-live-quick-exit.png"))

                # -- 4. re-enter via the grid: seam back, exactly one boot beat --
                picked = pick_card(page, LID)
                if picked != "ok":
                    ok = False; notes.append("re-enter: card pick failed (%r)" % picked)
                if not poll(page, SEAM_TYPE, lambda t: t == "object", timeout=10):
                    ok = False; notes.append("re-enter: seam never came back")
                time.sleep(0.7)
                tiles_reenter = page.evaluate(BOOT_TILES)
                if tiles_reenter != tiles_after_quick_exit + 1:
                    ok = False; notes.append("re-enter: boot-view tiles=%d (want %d — exactly one new boot beat, no stacked duplicates)"
                                             % (tiles_reenter, tiles_after_quick_exit + 1))
                page.screenshot(path=os.path.join(HERE, "shot-live-reenter.png"))

                # -- 5. level→level: stale seam must not resurrect, HUD live --
                page.keyboard.press("Escape")
                page.wait_for_selector("#screen-pause.active", timeout=4000)
                page.click('#screen-pause button[data-act="pause-levels"]')
                page.wait_for_selector("#screen-levels.active", timeout=8000)
                if page.evaluate(SEAM_TYPE) != "undefined":
                    ok = False; notes.append("level→level: seam still set on the levels grid")
                picked = pick_card(page, PLATFORMER_ID)
                if picked != "ok":
                    ok = False; notes.append("level→level: platformer card pick failed (%r)" % picked)
                if not poll(page, HUD_ON, lambda on: on, timeout=8):
                    ok = False; notes.append("level→level: platformer HUD never came on")
                time.sleep(0.7)
                if page.evaluate(SEAM_TYPE) != "undefined":
                    ok = False; notes.append("level→level: stale window.__REW resurrected after switching genres")
                page.screenshot(path=os.path.join(HERE, "shot-live-level2.png"))

                # generic "Failed to load resource" console lines carry no url — those are
                # the response listener's job now (logo 404s filtered there)
                errs = [c for c in console if c.startswith("error:") and "Failed to load resource" not in c]
                resp_errs = [u for u in bad_resp if not any(t in u for t in BOOTH_FILTER)]
                if filtered(perr) or filtered(errs) or resp_errs:
                    ok = False; notes.append("console: %s / perr: %s / resp: %s" % (filtered(errs)[:3], filtered(perr)[:3], resp_errs[:3]))
                results["live"] = {"ok": ok, "notes": notes, "tiles": {
                    "boot": base_tiles, "restart": tiles_after_restart,
                    "quick_exit": tiles_after_quick_exit, "reenter": tiles_reenter},
                    "quickExitTiming": how,
                    "console": filtered(console)[-10:], "perr": filtered(perr)}
                print("[live]", "PASS" if ok else "FAIL", notes)

            # ---------------- thumbs: instances created OUTSIDE any scene ----------------
            if "all" in modes or "thumbs" in modes:
                page.goto(BASE + "/?debug=1&beats=1")
                page.wait_for_selector("canvas", timeout=8000)
                swept = poll(page, r"() => window.__THUMBS__ && window.__THUMBS__.total > 0 && window.__THUMBS__.done >= window.__THUMBS__.total",
                             lambda d: d, timeout=120, interval=0.25)
                ok, notes = True, []
                if not swept:
                    ok = False; notes.append("thumbs: sweep never finished")
                th = page.evaluate("() => window.__THUMBS__ || {}")
                if swept and th.get("ok") != th.get("total"):
                    ok = False; notes.append("thumbs: ok=%s/%s failed=%s — renderThumb adoption broke the pipeline?"
                                             % (th.get("ok"), th.get("total"), th.get("failed")))
                if page.evaluate(SEAM_TYPE) != "undefined":
                    ok = False; notes.append("thumbs: window.__REW left set by an out-of-scene thumb instance")
                tiles = page.evaluate(ALL_TILES)
                rewind_tiles = page.evaluate(REWIND_TILES)
                if rewind_tiles != 0:
                    ok = False; notes.append("thumbs: %d 'boot-view' tile(s) from rewind thumb sessions (want 0 — boot timer must die with the instance)" % rewind_tiles)
                resp_errs = [u for u in bad_resp if not any(t in u for t in BOOTH_FILTER)]
                if filtered(perr) or resp_errs:
                    ok = False; notes.append("thumbs: perr: %s / resp: %s" % (filtered(perr)[:3], resp_errs[:3]))
                page.screenshot(path=os.path.join(HERE, "shot-thumbs-end.png"))
                results["thumbs"] = {"ok": ok, "notes": notes, "thumbs": th, "tiles": tiles, "rewindTiles": rewind_tiles,
                                     "console": filtered(console)[-10:], "perr": filtered(perr)}
                print("[thumbs]", "PASS" if ok else "FAIL", notes)

            browser.close()
    finally:
        server.kill()

    path = os.path.join(HERE, "exit-teardown-sim-results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    all_ok = all(v.get("ok") for v in results.values() if isinstance(v, dict) and "ok" in v)
    print("OVERALL", "PASS" if all_ok else "FAIL", "→", os.path.relpath(path, ROOT))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    run()
