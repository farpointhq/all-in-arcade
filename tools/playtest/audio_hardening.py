#!/usr/bin/env python3
"""audio_hardening — issue #18 checks for src/audio.js (Playwright headless Chromium).

Pins the two hardening acceptance criteria + the happy path:

  check 1  blocked-audio boot produces ZERO unhandled rejections.
           Boots /?level=<tense-mood level> (synth path → pre-gesture ensure())
           under --autoplay-policy=document-user-activation-required with no
           input, then asserts window.__unhandled is empty and pageerror is
           clean (modulo BOOTH_FILTER). Fails on unfixed code: the un-awaited
           ac.resume() rejects on every pre-gesture ensure().

  check 2  <audio> element count is BOUNDED under failing assets.
           Same blocked context, route-aborts **/assets/audio/** so the
           file-backed mood takes the element error path, boots a level and
           drives it (mash taps) for --seconds, sampling
           document.querySelectorAll("audio").length every --sample-every s.
           Asserts count <= 9 (pool size) at every sample and no growth
           (last <= first). Fails on unfixed code: the error handler recreates
           the element with the same dead URL forever (+1 element per cycle).

  check 3  happy path UNCHANGED (guards against over-hardening).
           Default autoplay policy, no route-abort: boot a file-backed-mood
           level, unlock with one click, then assert exactly 1 <audio> element
           that stays in the DOM (not failed/removed) and actually plays
           (currentTime advances).

  check 4  synth scheduler bound: at most ONE live setInterval(pump, 60).
           Route-aborts all assets, boots the title screen, unlocks and churns
           music OFF/ON ×3. Fails on PR #25 as merged: pendingMood armed by the
           play() rejection + the error-handler's synth fallthrough re-enter
           playMusic via ensure() and leak a second pump interval (created ≥ 2
           in one tick, live permanently ≥ 2).

Usage:
  python3 tools/playtest/audio_hardening.py [--port 8618] [--seconds 180]
                                            [--sample-every 10] [--grace 15]
                                            [--checks 1,2,3]

Booth protocol: runs headless against a PRIVATE serve.py port (unique per
agent/chat — Fabric caches browser interaction memory per URL).
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW_DIR = "/tmp/playtest-raw"

BOOTH_FILTER = ("logo-all.svg", "logo-in.svg", "favicon")

# check 1 level: music "tense" — the only mood with NO file, so boot hits the
# synth path (playMusic → ensure()) pre-gesture. That is where the un-awaited
# ac.resume() rejects; a file-backed boot returns early via _startFile.
CHECK1_LEVEL = "amir-kermany-nano-cure-2"
# checks 2/3 level: platformer with a file-backed mood ("upbeat") + a keys
# driver genre, so check 2 can mash and check 3 can verify real playback.
CHECK23_LEVEL = "bethany-cloudwalk"

MAX_POOL = 9  # file-backed moods = worst-case live element pool
MAX_PUMPS = 1  # synth scheduler: exactly one live setInterval(pump, 60) at any time

# check 4 init: wraps setInterval/clearInterval to track LIVE 60ms timers (pump() is
# the only setInterval(..., 60) in src/), so a leaked scheduler is directly countable.
INTERVAL_INIT = """
window.__pump60 = { created: 0, live: 0 };
window.__evlog = [];
(() => {
  const mark = (ev) => { try { window.__evlog.push([Math.round(performance.now()), ev]); } catch (e) {} };
  const pp = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const p = pp.apply(this, arguments);
    if (p && p.catch) p.catch((e) => mark("playRej:" + String(this.currentSrc || this.src || "").split("/").pop()));
    return p;
  };
  window.addEventListener("error", (e) => {
    if (e.target && e.target.tagName === "AUDIO") mark("audioErr:" + String(e.target.currentSrc || e.target.src || "").split("/").pop());
  }, true);
  const live = new Set();
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setInterval = function () {
    const id = si.apply(null, arguments);
    if (arguments[1] === 60) { window.__pump60.created++; live.add(id); window.__pump60.live = live.size; mark("si60+live=" + live.size); }
    return id;
  };
  window.clearInterval = function (id) { live.delete(id); window.__pump60.live = live.size; return ci(id); };
})();
"""

UNHANDLED_INIT = """
window.__unhandled = [];
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const msg = reason && reason.message ? String(reason.message) : String(reason);
  window.__unhandled.push(msg);
});
// Build-identity guard: stale serve.py leftovers from parallel agents squat ports and
// answer with a DIFFERENT worktree's build (seen 2026-09-22 on ports 18716/18719).
// Every page fetches the served audio.js and records whether the #25 fix is present;
// checks compare against --expect-failed-files and refuse to pass an impostor build.
fetch("/src/audio.js").then((r) => r.text()).then((t) => { window.__buildFailedFiles = t.includes("failedFiles"); });
"""

COUNT_JS = "() => document.querySelectorAll('audio').length"

STATE_JS = """
() => {
  const els = [...document.querySelectorAll('audio')];
  return {
    count: els.length,
    inDom: els.every((el) => el.isConnected),
    paused: els.map((el) => el.paused),
    time: els.map((el) => Math.round(el.currentTime * 100) / 100),
  };
}
"""

def log(*a):
    print("[audio-hardening]", *a, flush=True)


def filtered(msgs):
    return [m for m in msgs if not any(t in m for t in BOOTH_FILTER)]


def start_server(port):
    proc = subprocess.Popen([sys.executable, "serve.py", "--port", str(port)],
                            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    base = "http://127.0.0.1:%d" % port
    for _ in range(60):
        try:
            urllib.request.urlopen(base, timeout=0.6)
            return proc
        except Exception:
            time.sleep(0.25)
    proc.kill()
    raise SystemExit("[audio-hardening] server failed to start on %s" % base)


def new_page(ctx, url, extra_init=None):
    """New page with unhandled-rejection collection + console/pageerror taps.
    Network 4xx/5xx are collected URL-based (a resource 404's console text has
    no URL, so BOOTH_FILTER can't match it there — mirrors playtest.py) and
    reported but never gated: check 2 aborts audio requests on purpose."""
    page = ctx.new_page()
    page.add_init_script(UNHANDLED_INIT)
    if extra_init:
        page.add_init_script(extra_init)
    page.on("console", lambda m: page.__console.append("%s:%s" % (m.type, m.text))
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: page.__perr.append(str(e)))
    page.on("response", lambda r: page.__badnet.append("%s %s" % (r.status, r.url))
            if r.status >= 400 else None)
    page.__console, page.__perr, page.__badnet = [], [], []
    page.goto(url, timeout=15000)
    return page


def build_flag(page):
    """True when the SERVED build contains the #25 fix (impostor guard)."""
    try:
        return page.evaluate("() => window.__buildFailedFiles")
    except Exception:
        return None


def impostor(out, page, args):
    """Record the served-build flag; fail the check when it disagrees with the
    expected era (--expect-failed-files). Guards every check against stale
    serve.py squatters answering for a foreign worktree's build."""
    flag = build_flag(page)
    out["buildFailedFiles"] = flag
    expected = bool(args.expect_failed_files)
    if flag is not expected:
        out["impostor"] = True
        out.setdefault("perr", []).append(
            "IMPOSTOR BUILD: served audio.js failedFiles=%s, expected %s — "
            "a stale serve.py is squatting this port; lsof -iTCP:<port> and kill it" % (flag, expected))
        return True
    return False


def badnet_of(page):
    return [b for b in page.__badnet if not any(t in b for t in BOOTH_FILTER)]


def launch(pw, blocked):
    """blocked=True launches with pre-gesture audio genuinely blocked."""
    args = ["--autoplay-policy=document-user-activation-required"] if blocked else []
    return pw.chromium.launch(headless=True, args=args)


def check1(args, base):
    """Blocked boot, no input → zero unhandled rejections / pageerrors."""
    out = {"check": 1, "level": CHECK1_LEVEL, "ok": False}
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = launch(pw, blocked=True)
        ctx = browser.new_context(viewport={"width": 1000, "height": 640})
        page = new_page(ctx, "%s/?level=%s" % (base, CHECK1_LEVEL))
        time.sleep(args.grace)  # boot + first playMusic + first-sfx window
        try:
            out["unhandled"] = page.evaluate("() => window.__unhandled")
        except Exception as e:
            out["unhandled"] = ["__probeError: %s" % e]
        out["perr"] = filtered(page.__perr)
        out["badnet"] = badnet_of(page)[-10:]
        out["console"] = filtered(page.__console)[-10:]
        impostor(out, page, args)
        ctx.close()
        browser.close()
    out["ok"] = not out["unhandled"] and not out["perr"]
    return out


def check2(args, base):
    """Route-aborted assets + mash drive → element count bounded, no growth."""
    out = {"check": 2, "level": CHECK23_LEVEL, "samples": [], "ok": False}
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = launch(pw, blocked=True)
        ctx = browser.new_context(viewport={"width": 1000, "height": 640})
        page = new_page(ctx, "%s/?level=%s&debug=1" % (base, CHECK23_LEVEL))
        page.route("**/assets/audio/**", lambda route: route.abort())
        try:
            page.wait_for_selector("canvas", timeout=10000)
        except Exception as e:
            out["error"] = "canvas: %s" % e
            ctx.close()
            browser.close()
            return out
        time.sleep(args.grace)  # generous window before the first sample

        end = time.time() + args.seconds
        last_mash = 0.0
        while time.time() < end:
            t = args.seconds - (end - time.time())
            if t - last_mash >= 1.3:  # mash taps: jumps + restart churn
                last_mash = t
                try:
                    page.keyboard.down("Space")
                    time.sleep(0.06)
                    page.keyboard.up("Space")
                    page.keyboard.down("ArrowRight")
                    time.sleep(0.3)
                    page.keyboard.up("ArrowRight")
                except Exception as e:
                    out.setdefault("driveErrors", []).append(str(e))
            try:
                count = page.evaluate(COUNT_JS)
            except Exception as e:
                count = -1
                out.setdefault("probeErrors", []).append(str(e))
            out["samples"].append({"t": round(t, 1), "audioEls": count})
            time.sleep(args.sample_every)
        out["perr"] = filtered(page.__perr)[-5:]
        impostor(out, page, args)
        ctx.close()
        browser.close()

    counts = [s["audioEls"] for s in out["samples"]]
    if counts:
        out["first"], out["last"], out["max"] = counts[0], counts[-1], max(counts)
        out["ok"] = (out["max"] <= MAX_POOL and out["last"] <= out["first"]
                     and not out.get("probeErrors") and not out.get("impostor"))
    return out


def check3(args, base):
    """Default policy, no abort → exactly 1 healthy element that plays."""
    out = {"check": 3, "level": CHECK23_LEVEL, "ok": False}
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = launch(pw, blocked=False)
        ctx = browser.new_context(viewport={"width": 1000, "height": 640})
        page = new_page(ctx, "%s/?level=%s" % (base, CHECK23_LEVEL))
        try:
            page.wait_for_selector("canvas", timeout=10000)
        except Exception as e:
            out["error"] = "canvas: %s" % e
            ctx.close()
            browser.close()
            return out
        time.sleep(1.0)
        page.mouse.click(500, 320)  # first gesture → unlock; level mood starts
        time.sleep(2.0)
        s0 = page.evaluate(STATE_JS)
        time.sleep(3.0)
        s1 = page.evaluate(STATE_JS)
        out["perr"] = filtered(page.__perr)[-5:]
        out["badnet"] = badnet_of(page)[-10:]
        impostor(out, page, args)
        ctx.close()
        browser.close()
    out["first"], out["second"] = s0, s1
    out["ok"] = (
        s0["count"] == 1 and s1["count"] == 1
        and s0["inDom"] and s1["inDom"]
        and s1["time"] and s0["time"] and s1["time"][0] > s0["time"][0]
        and not out["perr"]
    )
    return out


def check4(args, base):
    """Fallback + toggle churn → at most ONE live 60ms pump interval, never nested.

    Fails on PR #25 as merged: a failing file arms pendingMood (el.play() rejects
    before the error event fires), the error handler's playMusic → synth → ensure()
    replays it re-entrantly, and the outer call leaks a second setInterval(pump, 60)
    that survives music-off. Fixed by clearing pendingMood at playMusic entry.
    """
    out = {"check": 4, "samples": [], "ok": False}
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = launch(pw, blocked=False)
        ctx = browser.new_context(viewport={"width": 1000, "height": 640})
        page = ctx.new_page()
        page.add_init_script(INTERVAL_INIT)
        page.add_init_script(UNHANDLED_INIT)
        page.__console, page.__perr, page.__badnet = [], [], []
        page.on("console", lambda m: page.__console.append("%s:%s" % (m.type, m.text))
                if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: page.__perr.append(str(e)))
        page.on("response", lambda r: page.__badnet.append("%s %s" % (r.status, r.url))
                if r.status >= 400 else None)
        page.route("**/assets/audio/**", lambda route: route.abort())
        page.goto("%s/" % base, timeout=15000)  # title screen: title.mp3 fails at boot
        try:
            page.wait_for_selector("canvas", timeout=10000)
        except Exception as e:
            out["error"] = "canvas: %s" % e
            ctx.close()
            browser.close()
            return out
        time.sleep(1.0)
        page.mouse.click(500, 320)  # unlock (may start a level — more mood churn)
        time.sleep(2.0)
        for _ in range(3):  # music OFF/ON churn under all-failed assets
            page.evaluate("document.querySelector('#btnMusic').click()")
            time.sleep(1.0)
            out["samples"].append({"phase": "off", **page.evaluate("() => window.__pump60")})
            page.evaluate("document.querySelector('#btnMusic').click()")
            time.sleep(1.0)
            out["samples"].append({"phase": "on", **page.evaluate("() => window.__pump60")})
        out["unhandled"] = page.evaluate("() => window.__unhandled")
        out["perr"] = filtered(page.__perr)[-5:]
        try:
            out["evlog"] = page.evaluate("() => (window.__evlog || []).slice(-40)")
        except Exception:
            pass
        impostor(out, page, args)
        ctx.close()
        browser.close()
    lives = [s["live"] for s in out["samples"]]
    creates = [s["created"] for s in out["samples"]]
    out["maxLive"], out["created"] = max(lives) if lives else -1, creates[-1] if creates else -1
    nested = any(creates[i] - creates[i - 1] >= 2 for i in range(1, len(creates)))
    out["nestedCreate"] = nested
    out["ok"] = (out["maxLive"] <= MAX_PUMPS and not nested
                 and not out["unhandled"] and not out["perr"] and not out.get("impostor"))
    return out


CHECKS = {1: check1, 2: check2, 3: check3, 4: check4}


def main():
    ap = argparse.ArgumentParser(description="Issue #18 audio hardening checks")
    ap.add_argument("--port", type=int, default=8618)
    ap.add_argument("--seconds", type=int, default=180, help="check 2 drive window")
    ap.add_argument("--sample-every", type=int, default=10, help="check 2 sample period (s)")
    ap.add_argument("--grace", type=int, default=15, help="window before first sample (s)")
    ap.add_argument("--checks", default="1,2,3,4")
    ap.add_argument("--expect-failed-files", type=int, default=1,
                    help="1 when the served tree should contain the #25 fix; "
                         "pass 0 to RED-test the checks against older trees")
    args = ap.parse_args()
    want = [int(c) for c in args.checks.split(",")]

    server = start_server(args.port)
    base = "http://127.0.0.1:%d" % args.port
    results = []
    try:
        for c in want:
            fn = CHECKS.get(c)
            if not fn:
                log("unknown check", c)
                continue
            log("check %d …" % c)
            r = fn(args, base)
            results.append(r)
            log("check %d →" % c, "PASS" if r["ok"] else "FAIL",
                json.dumps({k: v for k, v in r.items() if k not in ("samples",)},
                           ensure_ascii=False)[:400])
    finally:
        server.kill()

    os.makedirs(RAW_DIR, exist_ok=True)
    path = os.path.join(RAW_DIR, "audio-hardening-%d.json" % int(time.time()))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    ok = all(r["ok"] for r in results) if results else False
    log("OVERALL", "PASS" if ok else "FAIL", "→", path)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
