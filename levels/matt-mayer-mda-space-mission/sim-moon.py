#!/usr/bin/env python3
"""MDA Moonshot Inc. program sims (issue #1 moon pivot) — deterministic fixed-dt, headless Chromium.

Drives levels/matt-mayer-mda-space-mission/sim-moon.html over the full incremental program
(shop → pump → flight → debrief → … → MOON) and exits non-zero on any contract break:

- economy/good: junk rocket grinds to MOON WIN within the launch budget; junk apex pinned
- economy/partial: two deliberate pump misses — grind still pays, budget holds
- economy/clumsy: never gimbals + one botched landing (salvage floor) — no dead end, budget holds
- grind/pacing: seeded mid-save (t2+eng2 owned) reaches SPACE-tier kit (titan+2 SRB) by launch 8

Usage: python3 levels/matt-mayer-mda-space-mission/sim-moon.py [base_url]
"""
import json
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8261"
RIG = "levels/matt-mayer-mda-space-mission/sim-moon.html"

SEED_MID = json.dumps({"tokens": 1300, "owned": {"t2": True, "eng2": True}, "stamps": {"realm25": 1}, "best": 6.2, "orbit": False, "moon": False, "junkApex": 1.2, "launchN": 0, "pumpMisses": 0, "crashes": 0})

# contract: (tag, flavor, url-extras, expectations)
PROFILES = [
    ("economy/good", "good", "", {
        "win": True, "launchMax": 24, "junkApex": (0.9, 2.4), "orbit": True, "tokensNonNeg": True,
    }),
    ("economy/partial", "partial", "", {
        "win": True, "launchMax": 26, "pumpMisses": 2, "tokensNonNeg": True,
    }),
    ("economy/clumsy", "clumsy", "", {
        "win": True, "launchMax": 28, "crashesMin": 1, "tokensNonNeg": True,
    }),
    ("grind/pacing", "good", "&seed=" + urllib.parse.quote(SEED_MID), {
        "byLaunch8": ["t3", "eng3"], "srbMin": 2, "tokensNonNeg": True,
    }),
]


def run_case(tag, flavor, extra, expect):
    url = f"{BASE}/{RIG}?bot=1&flavor={flavor}&v={int(time.time() * 1000)}{extra}"
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page()
        pg.on("pageerror", lambda e: None)
        pg.goto(url, wait_until="domcontentloaded")
        pg.wait_for_function(
            "var e = document.getElementById('done'); e && e.dataset.t && e.dataset.t !== 'booting'",
            timeout=240000,
        )
        row = json.loads(pg.text_content("#done"))
        b.close()
    problems = []
    if row.get("error"):
        problems.append("rig error: " + row["error"])
    fin = row.get("final") or {}
    m = (fin.get("moon") or {}) if isinstance(fin.get("moon"), dict) else {}
    won = row.get("done") == "won"
    if expect.get("win") and not won:
        problems.append(f"status={row.get('done')}")
    ln = m.get("launchN", -1)
    if expect.get("launchMax") is not None and (ln < 0 or ln > expect["launchMax"]):
        problems.append(f"launches={ln} > budget {expect['launchMax']}")
    if expect.get("junkApex") and not (expect["junkApex"][0] <= (m.get("junkApex") or 0) <= expect["junkApex"][1]):
        problems.append(f"junkApex={m.get('junkApex')} outside {expect['junkApex']}")
    if expect.get("orbit") and not m.get("orbit"):
        problems.append("orbit not achieved")
    if expect.get("pumpMisses") is not None and m.get("pumpMisses") != expect["pumpMisses"]:
        problems.append(f"pumpMisses={m.get('pumpMisses')} != {expect['pumpMisses']}")
    if expect.get("crashesMin") is not None and (m.get("crashes") or 0) < expect["crashesMin"]:
        problems.append(f"crashes={m.get('crashes')} < {expect['crashesMin']}")
    if expect.get("tokensNonNeg") and (m.get("tokens") or 0) < 0:
        problems.append(f"tokens={m.get('tokens')} < 0")
    if expect.get("byLaunch8"):
        owned = set(m.get("owned") or [])
        for pid in expect["byLaunch8"]:
            if pid not in owned:
                problems.append(f"missing {pid} by launch {ln}")
    if expect.get("srbMin") is not None and (m.get("srbs") or 0) < expect["srbMin"]:
        problems.append(f"srbs={m.get('srbs')} < {expect['srbMin']}")
    line = {
        "ok": not problems,
        "scenario": tag,
        "flavor": flavor,
        "won": won,
        "launches": ln,
        "tokens": m.get("tokens", "-"),
        "junkApex": m.get("junkApex", "-"),
        "best": m.get("best", "-"),
        "orbit": m.get("orbit", "-"),
        "moon": m.get("moon", "-"),
        "crashes": m.get("crashes", "-"),
        "pumpMisses": m.get("pumpMisses", "-"),
        "owned": m.get("owned", []),
        "srbs": m.get("srbs", "-"),
        "trace": (row.get("trace") or "")[-110:],
        "problems": problems,
    }
    return line


def main():
    out = []
    for tag, flavor, extra, expect in PROFILES:
        line = run_case(tag, flavor, extra, expect)
        flag = "OK " if line["ok"] else "FAIL"
        out.append(line)
        print(f"{flag} {tag:16s} won={line['won']} launches={line['launches']} tokens={line['tokens']} "
              f"junkApex={line['junkApex']} best={line['best']} orbit={line['orbit']} moon={line['moon']} "
              f"crashes={line['crashes']}", flush=True)
        if not line["ok"]:
            print("    ", line["trace"], line["problems"], flush=True)
    failures = [l for l in out if not l["ok"]]
    print(f"\n{len(out) - len(failures)}/{len(out)} green")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
