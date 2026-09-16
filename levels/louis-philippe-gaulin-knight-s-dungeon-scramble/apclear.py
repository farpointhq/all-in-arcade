import json, time
from playwright.sync_api import sync_playwright

OUT = "levels/louis-philippe-gaulin-knight-s-dungeon-scramble"
DUN = "louis-philippe-gaulin-knight-s-dungeon-scramble"
SCH = "kristopher-federico-study-hall-scramble"

def apclear(pw, lid, tag, keep, max_s=140):
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 760})
    res = {"level": lid, "attempts": 0, "won": False, "timeline": [], "errors": []}
    pg.on("pageerror", lambda e: res["errors"].append(str(e)[:160]))
    for attempt in range(3):
        res["attempts"] = attempt + 1
        pg.goto("http://localhost:8181/?level=%s&debugMaze=1&ap=1&lives=8&bust=%d" % (lid, int(time.time() * 1000)), wait_until="domcontentloaded")
        pg.wait_for_timeout(2600)
        pg.evaluate("window.__TEST_API__.botStart()")
        # soak the opening 12s organically, then skip-ahead the dot grind
        pg.wait_for_timeout(12000)
        try:
            res["devour"] = pg.evaluate("window.__TEST_API__.debug().devour(%d)" % keep)
        except Exception as e:
            res["errors"].append("devour:" + str(e)[:120])
        t0 = time.time()
        last = None
        while time.time() - t0 < max_s:
            s = pg.evaluate("window.__TEST_API__ ? window.__TEST_API__.snapshot() : null")
            if not s:
                break
            last = s
            if s["status"] in ("won", "lost"):
                break
            pg.wait_for_timeout(1200)
            res["timeline"].append({"t": s["t"], "f": s["facts"], "xp": s.get("xp"), "lv": s.get("xpLvl"), "lives": s["lives"]})
        if last:
            res["final"] = {k: last.get(k) for k in ("status", "t", "score", "facts", "xp", "xpLvl", "shields", "lives")}
            if last["status"] == "won":
                res["won"] = True
                pg.screenshot(path=OUT + ("/shot-%s-clear.png" % tag))
                break
        res["timeline"] = []
    if not res["won"]:
        pg.screenshot(path=OUT + ("/shot-%s-progress.png" % tag))
    pg.close(); b.close()
    return res

out = {}
with sync_playwright() as pw:
    out["kris"] = apclear(pw, SCH, "school", 5)
    out["dun"] = apclear(pw, DUN, "dungeon", 5)
print(json.dumps(out, indent=1)[:5000])
