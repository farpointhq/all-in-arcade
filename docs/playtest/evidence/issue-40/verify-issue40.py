#!/usr/bin/env python3
"""issue #40 targeted verification checks (Playwright headless Chromium, always
--mute-audio so the game never makes sound during a rig run).

Modes:
  gate-old  boot a level with its level.json route-aborted, attaching ONLY the
            origin/main response-listener network gate -> reproduces the pre-#40
            blind spot (requestfailed invisible, gate stays clean).
  gate-new  identical fault, but with the #40 gate: the response listener PLUS a
            requestfailed listener (net::ERR_ABORTED excluded as an intentional
            nav cancel) -> the gate now catches the pre-response failure.
  logo      boot the title with ONLY logo-in.svg route-aborted -> reports the
            masthead fallback state (body.no-logo / #brandFallback display /
            remaining img.brandLogo count).

The gate listener bodies in `collect()` are byte-for-byte the ones in
tools/playtest/playtest.py (response >=400 -> badnet; requestfailed minus
net::ERR_ABORTED -> requestfailed), so this check exercises the shipped gate.

Usage:
  verify-issue40.py <gate-old|gate-new|logo> [--base http://127.0.0.1:8640] [--out FILE]
"""
import argparse
import json
import sys
import time

from playwright.sync_api import sync_playwright

LID = "ian-spence-rewind-loop"          # rigged genre, fast boot
BOOTH = ("logo-all.svg", "logo-in.svg", "favicon")


def attach_gate(page, badnet, requestfailed):
    """Mirror tools/playtest/playtest.py's network gate listeners verbatim.

    The response listener (>=400 -> badnet) is the origin/main gate; the
    requestfailed listener (minus net::ERR_ABORTED) is the issue #40 addition.
    Both are always attached so an 'old' run still OBSERVES the pre-response
    failure -- it just keeps it out of the gate verdict (see run_gate).
    """
    def on_response(r):
        if r.status >= 400:
            badnet.append("%s %s" % (r.status, r.url))
    page.on("response", on_response)

    def on_requestfailed(r):
        f = r.failure or ""
        if "net::ERR_ABORTED" in f:
            return  # intentional navigation cancels are not backend failures
        requestfailed.append("%s %s" % (f, r.url))
    page.on("requestfailed", on_requestfailed)


def run_gate(args):
    out = {"mode": args.mode, "base": args.base, "lid": LID,
           "badnet": [], "requestfailed": []}
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=["--mute-audio"])
        ctx = b.new_context(viewport={"width": 1000, "height": 640})
        ctx.route("**/levels/%s/level.json" % LID, lambda r: r.abort())
        page = ctx.new_page()
        attach_gate(page, out["badnet"], out["requestfailed"])
        url = "%s/?level=%s&bot=1&debug=1&bust=%d" % (args.base, LID, int(time.time() * 1000))
        try:
            page.goto(url, timeout=15000)
        except Exception as e:
            out["goto_error"] = str(e)
        try:
            page.wait_for_selector("canvas", timeout=6000)
            out["canvas"] = True
        except Exception:
            out["canvas"] = False
        page.wait_for_timeout(3000)
        b.close()
    # origin/main gate = not badnet; the #40 gate also folds in requestfailed.
    out["netClean"] = not out["badnet"] and (not out["requestfailed"] if args.gate == "new" else True)
    out["gate_catches_failure"] = not out["netClean"]
    return out


def run_logo(args):
    out = {"mode": args.mode, "base": args.base, "aborted": "logo-in.svg"}
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=["--mute-audio"])
        ctx = b.new_context(viewport={"width": 1000, "height": 640})
        ctx.route("**/logo-in.svg", lambda r: r.abort())
        page = ctx.new_page()
        page.goto("%s/?bust=%d" % (args.base, int(time.time() * 1000)), timeout=15000)
        try:
            page.wait_for_selector("canvas", timeout=8000)
        except Exception:
            pass
        page.wait_for_timeout(2500)
        out.update(page.evaluate("""() => {
          const imgs = [...document.querySelectorAll('img.brandLogo')].map(im => im.getAttribute('src'));
          const fb = document.getElementById('brandFallback');
          const wrap = document.getElementById('logoWrap');
          return { imgs, noLogo: document.body.classList.contains('no-logo'),
                   fallbackDisplay: fb ? getComputedStyle(fb).display : 'MISSING',
                   logoWrapDisplay: wrap ? getComputedStyle(wrap).display : 'MISSING',
                   h1Text: fb ? fb.textContent : null };
        }"""))
        b.close()
    # issue #40 item 3: if ANY logo fails the masthead must degrade to the full
    # fallback (body.no-logo -> #brandFallback "ALL IN") rather than render a
    # lopsided single letterform.
    out["lopsided_masthead"] = (not out["noLogo"]) and len(out["imgs"]) == 1
    out["fallback_ok"] = bool(out["noLogo"]) and out["fallbackDisplay"] != "none"
    return out


def run_mute(args):
    """Runtime proof that the sims' launch context is muted: launch the exact
    context the level sims use (headless=True, args=["--mute-audio"]) and confirm
    --mute-audio lands on the LIVE browser process command line.

    This launch's browser process is isolated by diffing `ps` before/after the
    launch (the per-run playwright_chromiumdev_profile dir is unique), so a
    stale sibling process can never be mistaken for this one -- the earlier
    matcher re-read every chrome-headless-shell process in the table and so kept
    matching a leftover process (both rows showed the same cmdline).

    A no-arg control launch is recorded alongside, because Playwright's own
    default chromium switches already include --mute-audio: the explicit flag is
    defense-in-depth, so a with/without differential cannot distinguish the two.
    """
    import subprocess

    def snap():
        return subprocess.run(["ps", "-Ao", "pid,command"], capture_output=True, text=True).stdout.splitlines()

    def this_launch_browser_procs(before):
        # only processes that appeared since `before`, and only the main browser
        # process (no --type= renderer/gpu children)
        return [ln for ln in snap() if ln not in before
                and "playwright_chromiumdev_profile" in ln and "--type=" not in ln]

    out = {"mode": "mute", "launches": {}, "playwright_default_mutes": None}
    with sync_playwright() as pw:
        for label, extra in (("sim_launch_with_flag", ["--mute-audio"]), ("no_args_control", [])):
            before = set(snap())
            b = pw.chromium.launch(headless=True, args=extra)
            page = b.new_page()
            page.wait_for_timeout(400)  # let the browser process settle before sampling ps
            procs = this_launch_browser_procs(before)
            out["launches"][label] = {
                "passed_args": extra,
                "mute_applied": any("--mute-audio" in ln for ln in procs),
                "proc_count": len(procs),
                "cmdline_tail": (procs[0][-200:] if procs else None),
            }
            b.close()
    out["playwright_default_mutes"] = out["launches"]["no_args_control"]["mute_applied"]
    # item 2 proof: the sims' launch context (headless=True, --mute-audio) is muted
    # on the live browser command line; Playwright's default already mutes too.
    out["sim_context_muted"] = out["launches"]["sim_launch_with_flag"]["mute_applied"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("check", choices=["gate-old", "gate-new", "logo", "mute"])
    ap.add_argument("--base", default="http://127.0.0.1:8640")
    ap.add_argument("--out")
    args = ap.parse_args()
    args.gate = "new" if args.check == "gate-new" else "old"
    args.mode = args.check
    if args.check == "logo":
        res = run_logo(args)
    elif args.check == "mute":
        res = run_mute(args)
    else:
        res = run_gate(args)
    txt = json.dumps(res, indent=2)
    print(txt)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(txt + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
