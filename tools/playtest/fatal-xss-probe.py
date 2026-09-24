#!/usr/bin/env python3
"""fatal-xss-probe — issue #32 regression check (Playwright headless Chromium).

Issue #32: showFatal() in src/app.js built #fatal with innerHTML and concatenated
the raw error message, so markup in an error message EXECUTED as HTML in the
overlay (measured repro: a rejected Error carrying `<img src=x onerror=...>`
set window.__xss = 1). The fix appends the message as a text node.

This rig drives the real booth app against a private serve.py and asserts:

  1. hostile  — a rejection whose message is `<img src=x onerror=...>` must NOT
                execute: window.__xss stays undefined, #fatal holds zero live
                <img>, and the message text (markup and all) is VISIBLE in #fatal
  2. benign   — a long benign message still renders verbatim and readable, with
                the same dim styling (span opacity .6) and the static copy intact
  3. repeat   — a second fatal does not accumulate stale detail spans (the old
                innerHTML assignment reset children; the DOM build must too)

The served build is content-asserted first (fetches /src/app.js in-page) against
--expect-build pre|post, so an impostor server squatting the port fails loudly
instead of producing a silent wrong verdict (see
memory project_browser-memory-collision.md).

Usage: python3 tools/playtest/fatal-xss-probe.py --port 8632 --expect-build post
       [--json OUT.json] [--shots DIR]
"""
import argparse
import json
import os
import sys
import time
import urllib.request

# markers that identify the two builds of showFatal()
MARK_POST = "createTextNode(msg)"
MARK_PRE = "opacity:.6'>\" + msg + \"</span>"

HOSTILE = '<img src=x onerror="window.__xss=1">'
BENIGN = "Kiosk fatal surface check — " + ("a long readable error message " * 8).strip()


def log(*a):
    print("[fatal-xss-probe]", *a, flush=True)


def js_str(value):
    """Embed a Python str as a JS string literal."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def assert_build(page, base, expect):
    """Content-assert the SERVED build (impostor guard): fetch src/app.js from
    the page itself and require the marker for the build we claim to be probing."""
    src = page.evaluate(
        "async () => { const r = await fetch('/src/app.js', {cache:'no-store'}); return await r.text(); }")
    has_post, has_pre = MARK_POST in src, MARK_PRE in src
    ok = has_post if expect == "post" else (has_pre and not has_post)
    return {"expect": expect, "hasTextNodeFix": has_post, "hasInnerHTMLConcat": has_pre,
            "appJsBytes": len(src), "ok": ok, "base": base}


def snapshot(page):
    """Everything we need to judge the fatal overlay in one round trip."""
    return page.evaluate("""() => {
      const f = document.querySelector('#fatal');
      const spans = [...f.querySelectorAll('span')];
      const last = spans[spans.length - 1];
      return {
        xss: (typeof window.__xss === 'undefined') ? null : window.__xss,
        display: getComputedStyle(f).display,
        imgCount: f.querySelectorAll('img').length,
        spanCount: spans.length,
        detailOpacity: last ? getComputedStyle(last).opacity : null,
        innerHTMLHasImg: /<img/i.test(f.innerHTML),
        text: (f.innerText || '').replace(/\\s+/g, ' ').trim(),
      };
    }""")


def poll(page, times=6, gap=0.25):
    """Poll after the fire-and-forget evaluate — the img error is async, so a
    single read can miss a yet-to-fire onerror (rig gotcha: never await the
    trigger, poll for the observable)."""
    seen, worst = [], None
    for _ in range(times):
        time.sleep(gap)
        s = snapshot(page)
        seen.append(s)
        if s["xss"] or s["imgCount"] or s["innerHTMLHasImg"]:
            worst = s
    return seen, (worst or seen[-1])


def fresh_page(browser, base):
    ctx = browser.new_context(viewport={"width": 1000, "height": 640})
    page = ctx.new_page()
    perr = []
    page.on("pageerror", lambda e: perr.append(str(e)))
    page.goto(base + "/", timeout=15000)
    page.wait_for_selector("#screen-title.active", timeout=10000)
    return ctx, page, perr


def fire(page, expr):
    """Fire-and-forget: evaluate returns immediately, the rejection lands later.
    (An awaited promise spanning rAF frames kills the headless context — see
    memory project_playwright-rig-gotchas.md #1.)"""
    page.evaluate("setTimeout(() => { %s }, 0)" % expr)


def probe_hostile(browser, base, shots):
    r = {"case": "hostile message executes as HTML", "ok": False, "error": None}
    ctx, page, perr = fresh_page(browser, base)
    try:
        fire(page, 'Promise.reject(new Error(%s))' % js_str(HOSTILE))
        polls, final = poll(page)
        r["xssFired"] = bool(final["xss"])
        r["imgInFatal"] = final["imgCount"] > 0 or final["innerHTMLHasImg"]
        r["messageVisibleAsText"] = HOSTILE in final["text"]
        r["fatalDisplay"] = final["display"]
        r["detailOpacity"] = final["detailOpacity"]
        r["staticCopyIntact"] = ("Something broke in the booth game." in final["text"]
                                 and "booth game is erroring" in final["text"])
        r["xssSeenPolls"] = sum(1 for s in polls if s["xss"])
        r["imgSeenPolls"] = sum(1 for s in polls if s["imgCount"])
        r["pageErrors"] = list(perr)
        r["snapshot"] = final
        if shots:
            page.screenshot(path=os.path.join(shots, "probe-hostile-escaped.png"))
        # the contract: no execution, no live element, text still readable
        r["ok"] = (not r["xssFired"]) and (not r["imgInFatal"]) \
            and r["messageVisibleAsText"] and r["fatalDisplay"] == "flex" \
            and r["staticCopyIntact"] and r["detailOpacity"] == "0.6"
    except Exception as e:
        r["error"] = str(e)
    finally:
        ctx.close()
    return r


def probe_benign(browser, base, shots):
    r = {"case": "benign long message still readable", "ok": False, "error": None}
    ctx, page, perr = fresh_page(browser, base)
    try:
        fire(page, 'Promise.reject(new Error(%s))' % js_str(BENIGN))
        polls, final = poll(page, times=3)
        r["messageVisibleAsText"] = BENIGN in final["text"]
        r["messageLength"] = len(BENIGN)
        r["fatalDisplay"] = final["display"]
        r["spanCount"] = final["spanCount"]
        r["detailOpacity"] = final["detailOpacity"]
        r["xssFired"] = bool(final["xss"])
        r["imgInFatal"] = final["imgCount"] > 0
        r["staticCopyIntact"] = "booth game is erroring" in final["text"]
        r["pageErrors"] = list(perr)
        r["snapshot"] = final
        if shots:
            page.screenshot(path=os.path.join(shots, "probe-benign-readable.png"))
        r["ok"] = r["messageVisibleAsText"] and r["fatalDisplay"] == "flex" \
            and r["detailOpacity"] == "0.6" and r["staticCopyIntact"] \
            and (not r["xssFired"])
    except Exception as e:
        r["error"] = str(e)
    finally:
        ctx.close()
    return r


def probe_repeat(browser, base, shots):
    """error + unhandledrejection both land on showFatal; the overlay must show
    the LATEST message and hold exactly one detail span (no accumulation)."""
    r = {"case": "repeat fatal does not accumulate spans", "ok": False, "error": None}
    ctx, page, perr = fresh_page(browser, base)
    try:
        fire(page, "throw new Error('fatal-probe-first')")
        poll(page, times=2, gap=0.25)
        fire(page, 'Promise.reject(new Error("fatal-probe-second"))')
        _, final = poll(page, times=3, gap=0.25)
        r["spanCount"] = final["spanCount"]
        r["showsLatest"] = "fatal-probe-second" in final["text"]
        r["staleFirstDropped"] = "fatal-probe-first" not in final["text"]
        r["fatalDisplay"] = final["display"]
        r["detailOpacity"] = final["detailOpacity"]
        r["snapshot"] = final
        r["ok"] = r["spanCount"] == 1 and r["showsLatest"] and r["fatalDisplay"] == "flex" \
            and r["detailOpacity"] == "0.6"
    except Exception as e:
        r["error"] = str(e)
    finally:
        ctx.close()
    return r


def main():
    ap = argparse.ArgumentParser(description="Issue #32 fatal-overlay XSS probe")
    ap.add_argument("--port", type=int, default=8632, help="private serve.py port")
    ap.add_argument("--expect-build", choices=("pre", "post"), default="post",
                    help="pre = innerHTML concat (buggy), post = text-node fix")
    ap.add_argument("--json", default=None, help="write full results JSON here")
    ap.add_argument("--shots", default=None, help="write probe screenshots here")
    args = ap.parse_args()

    base = "http://127.0.0.1:%d" % args.port
    if args.shots:
        os.makedirs(args.shots, exist_ok=True)
    results = {"port": args.port, "base": base, "expectBuild": args.expect_build,
               "tree": os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
               "ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "build": None, "cases": []}

    try:
        urllib.request.urlopen(base + "/api/health", timeout=2)
    except Exception as e:
        raise SystemExit("[fatal-xss-probe] no server on %s (%s)" % (base, e))

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        # --mute-audio: booth rule — the game is never run with sound
        browser = pw.chromium.launch(headless=True, args=["--mute-audio"])
        try:
            ctx = browser.new_context(viewport={"width": 1000, "height": 640})
            page = ctx.new_page()
            page.goto(base + "/", timeout=15000)
            page.wait_for_selector("#screen-title.active", timeout=10000)
            results["build"] = assert_build(page, base, args.expect_build)
            ctx.close()

            if not results["build"]["ok"]:
                log("IMPOSTOR/WRONG BUILD on %s — expected %s build (hasTextNodeFix=%s "
                    "hasInnerHTMLConcat=%s); refusing to drive" % (
                        base, args.expect_build, results["build"]["hasTextNodeFix"],
                        results["build"]["hasInnerHTMLConcat"]))
                if args.json:
                    with open(args.json, "w") as f:
                        json.dump(results, f, indent=2)
                sys.exit(2)

            for fn in (probe_hostile, probe_benign, probe_repeat):
                r = fn(browser, base, args.shots)
                results["cases"].append(r)
                log("%s %s%s" % ("PASS" if r["ok"] else "FAIL", r["case"],
                                 "" if r["ok"] else " — %s" % (r.get("error") or r.get("snapshot"))))
                if fn is probe_hostile:
                    log("     xssFired=%s imgInFatal=%s messageVisibleAsText=%s innerText=%r" % (
                        r.get("xssFired"), r.get("imgInFatal"), r.get("messageVisibleAsText"),
                        (r.get("snapshot") or {}).get("text", "")[:120]))
        finally:
            browser.close()

    results["passed"] = sum(1 for c in results["cases"] if c["ok"])
    results["total"] = len(results["cases"])
    log("=== fatal-xss-probe: %d/%d passed (port %d, build=%s) ===" % (
        results["passed"], results["total"], args.port, args.expect_build))
    if args.json:
        with open(args.json, "w") as f:
            json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))
    sys.exit(0 if results["passed"] == results["total"] else 1)


if __name__ == "__main__":
    main()
