import json, time
from playwright.sync_api import sync_playwright

OUT = "levels/louis-philippe-gaulin-knight-s-dungeon-scramble"
DUN = "louis-philippe-gaulin-knight-s-dungeon-scramble"
SCH = "kristopher-federico-study-hall-scramble"

APPLES = [(1, 3), (19, 3), (1, 11), (19, 11)]

def win_proof(pw, lid, tag):
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 760})
    res = {"level": lid, "steps": [], "errors": []}
    pg.on("pageerror", lambda e: res["errors"].append(str(e)[:200]))
    pg.goto("http://localhost:8181/?level=%s&debugMaze=1&bust=%d" % (lid, int(time.time() * 1000)), wait_until="domcontentloaded")
    pg.wait_for_timeout(2800)
    for _ in range(20):
        s = pg.evaluate("window.__TEST_API__.snapshot()")
        if s["status"] == "playing":
            break
        pg.wait_for_timeout(200)
    res["steps"].append({"playing": pg.evaluate("window.__TEST_API__.snapshot()")["status"]})
    # organic-first: 14s of real run stats before deterministic skip
    ews = pg.evaluate("window.__TEST_API__.snapshot()")
    res["organic14s"] = {"facts": ews["facts"], "t": ews["t"]}
    pg.evaluate("window.__TEST_API__.debug().devour(0)")
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    res["steps"].append({"factsAfterDevour": s["facts"]})
    for (c, r) in APPLES:
        ate = pg.evaluate("window.__TEST_API__.debug().eatApple(%d,%d)" % (c, r))
        res["steps"].append({"apple": [c, r], "ate": ate})
        s = pg.evaluate("window.__TEST_API__.snapshot()")
        if s["status"] != "playing":
            break
    pg.wait_for_timeout(900)
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    res["final"] = {k: s.get(k) for k in ("status", "t", "score", "facts")}
    res["won"] = s["status"] == "won"
    pg.screenshot(path=OUT + ("/shot-%s-winproof.png" % tag))
    pg.close(); b.close()
    return res

out = {}
with sync_playwright() as pw:
    out["kris"] = win_proof(pw, SCH, "school")
    out["dun"] = win_proof(pw, DUN, "dungeon")
print(json.dumps(out, indent=1)[:4000])
