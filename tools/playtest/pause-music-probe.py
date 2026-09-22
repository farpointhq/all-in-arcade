#!/usr/bin/env python3
"""Pause ♪ + bilingual FTUE probe (issue #16) — reusable e2e harness.

Boots a level against a running booth server, then drives the pause overlay's
♪ MUSIC toggle as a user would (ESC → click → assert label/aria/save flag/
toast/audio buses → re-open → quit → re-boot persistence), and captures
bilingual FTUE stills (hint bar EN+FR, two-line objective, intro banner).

Usage: python3 tools/playtest/pause-music-probe.py [port]   (default 8616)
Gates: every check green AND zero console errors (modulo the booth's known
logo-404 resource noise, filtered here like the rig's BOOTH_FILTER).
Stills land in docs/playtest/evidence/issue-16/.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8616
BASE = f"http://localhost:{PORT}"
OUT = os.path.join(ROOT, "docs", "playtest", "evidence", "issue-16")
os.makedirs(OUT, exist_ok=True)

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

errors = []
checks = []


def check(name, cond, detail=""):
    checks.append({"name": name, "ok": bool(cond), "detail": str(detail)[:120]})
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f": {detail}"))


def save_flag(pg):
    return pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('allin-arcade-save-v1') || '{}');
      return (s.settings || {}).musicOn;
    }""")


with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--mute-audio"])  # booth rule: the game never makes sound
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    # --- 1) bilingual FTUE on L02 (racer): hint bar EN+FR -----------------------
    pg.goto(f"{BASE}/?level=L02&debug=1")
    pg.wait_for_selector("#stage", timeout=20000)
    pg.wait_for_timeout(2500)
    hint = pg.inner_text("#hudHint")
    check("L02 hint has EN:", "EN:" in hint, hint[:90])
    check("L02 hint has FR:", "FR:" in hint, hint[:90])
    pg.screenshot(path=f"{OUT}/probe-hint-L02.png")

    # --- 2) ESC → pause overlay with ♪ MUSIC: ON -------------------------------
    pg.keyboard.press("Escape")
    pg.wait_for_selector("#screen-pause.active", timeout=5000)
    btn = pg.locator("#pauseMusicBtn")
    check("pause ♪ label ON", btn.inner_text() == "♪ MUSIC: ON", btn.inner_text())
    check("pause ♪ aria-pressed true", btn.get_attribute("aria-pressed") == "true", btn.get_attribute("aria-pressed"))
    pg.screenshot(path=f"{OUT}/probe-pause-on.png")

    # --- 3) click → OFF: save flips, label repaints, toast fires, audio stops ---
    btn.click()
    pg.wait_for_timeout(400)
    check("pause ♪ label OFF after click", btn.inner_text() == "♪ MUSIC: OFF", btn.inner_text())
    check("pause ♪ aria-pressed false", btn.get_attribute("aria-pressed") == "false", btn.get_attribute("aria-pressed"))
    check("save musicOn=false", save_flag(pg) is False, save_flag(pg))
    check("toast 'Music off'", "Music off" in pg.inner_text("#toast"), pg.inner_text("#toast")[:60])
    playing = pg.evaluate("Array.from(document.querySelectorAll('audio')).filter(a => !a.paused).length")
    check("no playing <audio>", playing == 0, playing)
    pg.screenshot(path=f"{OUT}/probe-pause-off.png")

    # --- 4) click again → ON resumes -------------------------------------------
    btn.click()
    pg.wait_for_timeout(400)
    check("pause ♪ label back ON", btn.inner_text() == "♪ MUSIC: ON", btn.inner_text())
    check("save musicOn=true", save_flag(pg) is True, save_flag(pg))

    # --- 5) resume → re-pause: label repainted from save state ------------------
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    pg.keyboard.press("Escape")
    pg.wait_for_selector("#screen-pause.active", timeout=5000)
    check("reopened pause keeps ON", pg.locator("#pauseMusicBtn").inner_text() == "♪ MUSIC: ON", pg.locator("#pauseMusicBtn").inner_text())
    pg.screenshot(path=f"{OUT}/probe-pause-reopened.png")

    # --- 6) OFF again → quit-to-title → boot L03 → label must not lie -----------
    pg.locator("#pauseMusicBtn").click()
    pg.wait_for_timeout(300)
    check("toggle OFF before quit", save_flag(pg) is False, save_flag(pg))
    pg.locator('[data-act="pause-quit"]').click()
    pg.wait_for_timeout(800)
    pg.goto(f"{BASE}/?level=L03&debug=1")
    pg.wait_for_selector("#stage", timeout=20000)
    pg.wait_for_timeout(1200)
    pg.keyboard.press("Escape")
    pg.wait_for_selector("#screen-pause.active", timeout=5000)
    check("L03 pause label OFF (persisted)", pg.locator("#pauseMusicBtn").inner_text() == "♪ MUSIC: OFF", pg.locator("#pauseMusicBtn").inner_text())
    pg.screenshot(path=f"{OUT}/probe-persist-L03-off.png")
    pg.locator("#pauseMusicBtn").click()  # restore ON for the booth
    pg.wait_for_timeout(200)
    check("restored ON", save_flag(pg) is True, save_flag(pg))

    # --- 7) bilingual objective stills: nicolas (platformer) + marc (survival) --
    pg.goto(f"{BASE}/?level=nicolas-snowball-seasons&debug=1")
    pg.wait_for_selector("#stage", timeout=20000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/probe-objective-nicolas.png")
    pg.goto(f"{BASE}/?level=marc-larochelle-course-apocalypse&debug=1")
    pg.wait_for_selector("#stage", timeout=20000)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{OUT}/probe-banner-marc.png")
    hint_m = pg.inner_text("#hudHint")
    check("marc hint EN+FR", "EN:" in hint_m and "FR:" in hint_m, hint_m[:90])

    b.close()

fatal = [e for e in errors if not any(t in e for t in BOOTH_FILTER)]
failed = [c for c in checks if not c["ok"]]
json.dump({"checks": checks, "console_errors_filtered": errors},
          open(os.path.join(OUT, "probe-results.json"), "w"), indent=1)
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed; console errors (filtered): {len(fatal)}")
sys.exit(1 if failed or fatal else 0)
