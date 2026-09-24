#!/usr/bin/env python3
"""MDA v3 Phase 1 bot sims (issue #1 M6) — deterministic fixed-dt, headless Chromium.

Drives levels/matt-mayer-mda-space-mission/sim.html over all profiles via Playwright,
prints the EXCELLENT.md tune table, and exits non-zero if any run fails its contract.

Usage: python3 levels/matt-mayer-mda-space-mission/sim.py [base_url]
"""
import json
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8261"
RIG = "levels/matt-mayer-mda-space-mission/sim.html"

# contract: (mode, flavor) with the expectations the build promises
PROFILES = [
    ("legacy", "good", {"tMax": 40, "misses": 0, "drops": 0}),
    ("v3", "good", {"stars": 4, "kg": 705, "drops": 0}),
    ("v3", "partial", {"misses": 3, "stars": 1, "drops": 0}),
    ("v3", "clumsy", {"drops": 1, "stars": 3, "misses": 0}),
]


def check(tag, row):
    problems = []
    if row.get("done") != "won":
        problems.append(f"status={row.get('done')}")
    fin = row.get("final") or {}
    v = fin.get("v3") or {}
    if row.get("error"):
        problems.append("rig error: " + row["error"])
    return fin, v, problems


def run_case(port, tag, flavor, v3, expect):
    url = f"{BASE}/{RIG}?bot=1&flavor={flavor}&v={int(time.time() * 1000)}{'&v3=0' if not v3 else '&v3=1'}"  # explicit path — never rely on the current default
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=["--mute-audio"])  # booth rule: the game never makes sound
        pg = b.new_page()
        pg.on("pageerror", lambda e: None)
        pg.goto(url, wait_until="domcontentloaded")
        pg.wait_for_function("document.getElementById('done').dataset.t && document.getElementById('done').dataset.t !== 'booting'", timeout=60000)
        row = json.loads(pg.text_content("#done"))
        b.close()
    fin, v, problems = check(tag, row)
    t, anom, drops = fin.get("t", -1), fin.get("anomalies", -1), fin.get("drops", -1)
    ok = True
    if expect.get("stars") is not None and v.get("stars") != expect["stars"]:
        problems.append(f"stars={v.get('stars')} != {expect['stars']}")
    if expect.get("drops") is not None and drops != expect["drops"]:
        problems.append(f"drops={drops} != {expect['drops']}")
    if expect.get("misses") is not None and anom != expect["misses"]:
        problems.append(f"anomalies={anom} != {expect['misses']}")
    if expect.get("kg") is not None and v.get("kg") != expect["kg"]:
        problems.append(f"kg={v.get('kg')} != {expect['kg']}")
    if expect.get("tMax") is not None and (t < 0 or t > expect["tMax"]):
        problems.append(f"t={t} above ceiling {expect['tMax']}")
    if problems:
        ok = False
    line = {
        "ok": ok and not problems,
        "scenario": tag,
        "flavor": flavor,
        "v3": bool(v3 or fin.get("v3")),
        "t": t,
        "anomalies": anom,
        "drops": drops,
        "kg": v.get("kg", "-"),
        "twr": v.get("twr", "-"),
        "dv": v.get("dvKms", "-"),
        "kwNet": v.get("kwNet", "-"),
        "mbps": v.get("mbps", "-"),
        "stars": v.get("stars", "-"),
        "cart": v.get("cart", []),
        "trace": row.get("trace", ""),
        "problems": problems,
    }
    return line


def main():
    stamp = int(time.time() * 1000)
    out = []
    for mode, flavor, expect in PROFILES:
        v3 = mode == "v3"
        tag = f"{mode}/{flavor}"
        line = run_case(8261, tag, flavor, v3, expect or {})
        flag = "OK " if line["ok"] else "FAIL"
        out.append(f"{flag} {tag:14s} t={line['t']:>5} anom={line['anomalies']} drops={line['drops']} kg={line['kg']} twr={line['twr']} dv={line['dv']} stars={line['stars']}")
        print(out[-1], flush=True)
        if not line["ok"]:
            print("   ", line["trace"] and (line["trace"][-90:]), line["problems"], flush=True)
    failures = [l for l in out if l.startswith("FAIL")]
    print(f"\n{len(out) - len(failures)}/{len(out)} green")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
