#!/usr/bin/env python3
"""blur_pause_check — issue #10 acceptance check (Playwright headless Chromium).

Issue #10: the booth game kept simulating when the window lost focus or the tab
was hidden (the only blur handling cleared held keys). This check pins the
auto-pause contract end-to-end, DOM-asserted (no production debug seams —
UI.show() toggles .active on #screen-<name>):

  blur_during_play        ?level=<id> boot → synthetic window blur →
                          #screen-pause active within 500 ms. THE failing
                          assertion before the fix.
  hidden_during_play      document.hidden stubbed true + synthetic
                          visibilitychange → pause overlay active (stub
                          restored afterwards).
  noop_on_title           blur on the title screen is a no-op (guard: playing()).
  resume_from_autopause   blur → paused (precondition asserted, so it fails
                          before the fix too) → ESC → overlay closed via the
                          existing resume action.
  double_fire             blur then hidden in quick succession → paused, no
                          errors (guard makes both events idempotent).
  blur_while_paused       ESC pause then blur → overlay unchanged (idempotent;
                          the result-screen case is covered by the same
                          playing() guard by construction).

Usage:
  python3 tools/playtest/blur_pause_check.py [--port 8610] [--level L01]

Exit 0 = every scenario green. JSON verdict on stdout; stills + verdict.json in
/tmp/blur-pause-check/. Reuses start_server()/BOOTH_FILTER from playtest.py —
same private-port booth protocol (unique port per agent: 8600 + issue % 200).
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from playtest import BOOTH_FILTER, start_server  # house rig helpers (same dir)

SHOT_DIR = "/tmp/blur-pause-check"
BOOT_GATE = "✓ ready"
PAUSE_SEL = "#screen-pause.active"
TITLE_SEL = "#screen-title.active"


def log(*a):
    print("[blur-pause]", *a, flush=True)


def filtered(msgs):
    return [m for m in msgs if not any(t in m for t in BOOTH_FILTER)]


def new_page(browser):
    ctx = browser.new_context(viewport={"width": 1000, "height": 640})
    page = ctx.new_page()
    state = {"console": [], "perr": [], "badnet": []}
    page.on("console", lambda m: state["console"].append("%s:%s" % (m.type, m.text)))
    page.on("pageerror", lambda e: state["perr"].append(str(e)))
    # network layer: 4xx/5xx carry their URL here (console resource-404 text has
    # no URL, so BOOTH_FILTER can't match it there — same gate as the rig)
    page.on("response", lambda r: state["badnet"].append("%s %s" % (r.status, r.url))
            if r.status >= 400 else None)
    return ctx, page, state


def boot(page, state, base, level=None):
    url = base + ("/?level=%s" % level if level else "/")
    page.goto(url, timeout=15000)
    page.wait_for_selector("canvas", timeout=10000)
    end = time.time() + 15.0
    while time.time() < end:
        if any(BOOT_GATE in c for c in state["console"]):
            time.sleep(0.3)  # let the play state settle (startLevel is async)
            return True
        time.sleep(0.05)
    return False


def dom(page, sel):
    return bool(page.evaluate("(s) => !!document.querySelector(s)", sel))


def wait_for(page, sel, want=True, timeout=0.5):
    end = time.time() + timeout
    while time.time() < end:
        if dom(page, sel) is want:
            return True
        time.sleep(0.05)
    return dom(page, sel) is want


def hygiene(state):
    tail = filtered(state["console"])[-30:]
    app_console = [c for c in tail if not c.startswith("error:Failed to load resource")]
    return {
        "consoleClean": not [c for c in app_console if c.startswith("error:")],
        "noPageerror": not state["perr"],
        "netClean": not filtered(state["badnet"]),
    }


def finish(out, state, name):
    out.update(hygiene(state))
    out["ok"] = bool(out["ok"]) and out["consoleClean"] and out["noPageerror"] and out["netClean"]
    log(name, "→", "PASS" if out["ok"] else "FAIL",
        {k: v for k, v in out.items() if k != "ok"})
    return out


# ---- scenarios ---------------------------------------------------------------

def scn_blur_during_play(browser, base, level):
    ctx, page, state = new_page(browser)
    out = {"ok": False}
    try:
        out["boot"] = boot(page, state, base, level)
        if not out["boot"]:
            return finish(out, state, "blur_during_play")
        out["pauseBefore"] = dom(page, PAUSE_SEL)
        page.evaluate("() => window.dispatchEvent(new Event('blur'))")
        out["pauseAfter"] = wait_for(page, PAUSE_SEL, True, 0.5)  # THE pinned assertion
        page.screenshot(path=os.path.join(SHOT_DIR, "blur_during_play.png"))
        out["ok"] = (not out["pauseBefore"]) and out["pauseAfter"]
    finally:
        ctx.close()
    return finish(out, state, "blur_during_play")


def scn_hidden_during_play(browser, base, level):
    ctx, page, state = new_page(browser)
    out = {"ok": False}
    try:
        out["boot"] = boot(page, state, base, level)
        if not out["boot"]:
            return finish(out, state, "hidden_during_play")
        page.evaluate("() => Object.defineProperty(document, 'hidden',"
                      " { configurable: true, get: () => true })")
        try:
            out["pauseBefore"] = dom(page, PAUSE_SEL)
            page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
            out["pauseAfter"] = wait_for(page, PAUSE_SEL, True, 0.5)
            page.screenshot(path=os.path.join(SHOT_DIR, "hidden_during_play.png"))
            out["ok"] = (not out["pauseBefore"]) and out["pauseAfter"]
        finally:
            page.evaluate("() => { delete document['hidden']; }")
    finally:
        ctx.close()
    return finish(out, state, "hidden_during_play")


def scn_noop_on_title(browser, base):
    ctx, page, state = new_page(browser)
    out = {"ok": False}
    try:
        out["boot"] = boot(page, state, base, None)
        if not out["boot"]:
            return finish(out, state, "noop_on_title")
        out["titleBefore"] = dom(page, TITLE_SEL)
        page.evaluate("() => window.dispatchEvent(new Event('blur'))")
        time.sleep(0.5)
        out["pauseAfter"] = dom(page, PAUSE_SEL)
        out["titleAfter"] = dom(page, TITLE_SEL)
        page.screenshot(path=os.path.join(SHOT_DIR, "noop_on_title.png"))
        out["ok"] = out["titleBefore"] and (not out["pauseAfter"]) and out["titleAfter"]
    finally:
        ctx.close()
    return finish(out, state, "noop_on_title")


def scn_resume_from_autopause(browser, base, level):
    ctx, page, state = new_page(browser)
    out = {"ok": False}
    try:
        out["boot"] = boot(page, state, base, level)
        if not out["boot"]:
            return finish(out, state, "resume_from_autopause")
        page.evaluate("() => window.dispatchEvent(new Event('blur'))")
        out["autoPaused"] = wait_for(page, PAUSE_SEL, True, 0.5)  # precondition
        if out["autoPaused"]:
            page.keyboard.press("Escape")
            out["resumed"] = wait_for(page, PAUSE_SEL, False, 0.5)
            page.screenshot(path=os.path.join(SHOT_DIR, "resume_from_autopause.png"))
            out["ok"] = out["resumed"]
    finally:
        ctx.close()
    return finish(out, state, "resume_from_autopause")


def scn_double_fire(browser, base, level):
    ctx, page, state = new_page(browser)
    out = {"ok": False}
    try:
        out["boot"] = boot(page, state, base, level)
        if not out["boot"]:
            return finish(out, state, "double_fire")
        page.evaluate("() => window.dispatchEvent(new Event('blur'))")
        out["pausedOnBlur"] = wait_for(page, PAUSE_SEL, True, 0.5)
        page.evaluate("() => Object.defineProperty(document, 'hidden',"
                      " { configurable: true, get: () => true })")
        try:
            page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
            time.sleep(0.3)
            out["stillPaused"] = dom(page, PAUSE_SEL)
            page.screenshot(path=os.path.join(SHOT_DIR, "double_fire.png"))
            out["ok"] = out["pausedOnBlur"] and out["stillPaused"]
        finally:
            page.evaluate("() => { delete document['hidden']; }")
    finally:
        ctx.close()
    return finish(out, state, "double_fire")


def scn_blur_while_paused(browser, base, level):
    ctx, page, state = new_page(browser)
    out = {"ok": False}
    try:
        out["boot"] = boot(page, state, base, level)
        if not out["boot"]:
            return finish(out, state, "blur_while_paused")
        page.keyboard.press("Escape")  # existing ESC pause path
        out["escPaused"] = wait_for(page, PAUSE_SEL, True, 0.5)
        page.evaluate("() => window.dispatchEvent(new Event('blur'))")
        time.sleep(0.3)
        out["stillPaused"] = dom(page, PAUSE_SEL)
        page.screenshot(path=os.path.join(SHOT_DIR, "blur_while_paused.png"))
        out["ok"] = out["escPaused"] and out["stillPaused"]
    finally:
        ctx.close()
    return finish(out, state, "blur_while_paused")


# ---- runner --------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Issue #10 blur/hidden auto-pause acceptance check")
    ap.add_argument("--port", type=int, default=8610)
    ap.add_argument("--level", default="L01")
    args = ap.parse_args()

    os.makedirs(SHOT_DIR, exist_ok=True)
    server = start_server(args.port)
    base = "http://127.0.0.1:%d" % args.port
    verdict = {"port": args.port, "level": args.level, "scenarios": {}}
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                verdict["scenarios"]["blur_during_play"] = scn_blur_during_play(browser, base, args.level)
                verdict["scenarios"]["hidden_during_play"] = scn_hidden_during_play(browser, base, args.level)
                verdict["scenarios"]["noop_on_title"] = scn_noop_on_title(browser, base)
                verdict["scenarios"]["resume_from_autopause"] = scn_resume_from_autopause(browser, base, args.level)
                verdict["scenarios"]["double_fire"] = scn_double_fire(browser, base, args.level)
                verdict["scenarios"]["blur_while_paused"] = scn_blur_while_paused(browser, base, args.level)
            finally:
                browser.close()
    finally:
        server.kill()

    verdict["ok"] = all(s["ok"] for s in verdict["scenarios"].values())
    with open(os.path.join(SHOT_DIR, "verdict.json"), "w", encoding="utf-8") as f:
        json.dump(verdict, f, ensure_ascii=False, indent=2)
        f.write("\n")
    log("→", "PASS" if verdict["ok"] else "FAIL",
        "(%d/%d scenarios)" % (sum(1 for s in verdict["scenarios"].values() if s["ok"]),
                               len(verdict["scenarios"])),
        "→", SHOT_DIR + "/verdict.json")
    print(json.dumps(verdict, ensure_ascii=False, indent=2))
    sys.exit(0 if verdict["ok"] else 1)


if __name__ == "__main__":
    main()
