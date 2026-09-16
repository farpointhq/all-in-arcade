import json, time, sys
from playwright.sync_api import sync_playwright

OUT = "levels/louis-philippe-gaulin-knight-s-dungeon-scramble"
DUN = "louis-philippe-gaulin-knight-s-dungeon-scramble"
SCH = "kristopher-federico-study-hall-scramble"

results = {"kris": {"errors": [], "soak": []}, "dun": {"errors": [], "soak": []}, "rpg": {}}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ---------- BOTH levels: console-clean + autopilot soak (facts must drop) ----------
    for tag, lid in (("kris", SCH), ("dun", DUN)):
        pg = b.new_page(viewport={"width": 1280, "height": 760})
        pg.on("pageerror", lambda e: results[tag]["errors"].append(str(e)[:200]))
        pg.on("console", lambda m: results[tag]["errors"].append(m.text[:200]) if m.type == "error" else None)
        pg.goto("http://localhost:8181/?level=%s&debugMaze=1&ap=1&bust=%d" % (lid, int(time.time() * 1000)), wait_until="domcontentloaded")
        pg.wait_for_timeout(2800)
        s = pg.evaluate("window.__TEST_API__ ? window.__TEST_API__.snapshot() : null")
        results[tag]["boot"] = bool(s)
        if s: pg.evaluate("window.__TEST_API__.botStart()")
        for _ in range(6):
            pg.wait_for_timeout(2000)
            s = pg.evaluate("window.__TEST_API__.snapshot()")
            results[tag]["soak"].append({"t": s["t"], "st": s["status"], "f": s["facts"], "xf": s.get("xp", 0), "lv": s.get("xpLvl", 0), "sh": s.get("shields", 0)})
        pg.screenshot(path=OUT + ("/shot-dungeon-apmid.png" if tag == "dun" else "/shot-school-apmid.png"))
        pg.close()

    # ---------- deterministic RPG scenario on the dungeon ----------
    pg = b.new_page(viewport={"width": 1280, "height": 760})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto("http://localhost:8181/?level=%s&debugMaze=1&bust=%d" % (DUN, int(time.time() * 1000)), wait_until="domcontentloaded")
    pg.wait_for_timeout(2800)
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    for _ in range(20):
        if s["status"] == "playing":
            break
        pg.wait_for_timeout(200); s = pg.evaluate("window.__TEST_API__.snapshot()")
    r = results["rpg"]
    r["enterPlaying"] = s["status"]
    r["grant1000"] = pg.evaluate("window.__TEST_API__.debug().grant(1000)")
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    r["after"] = {k: s[k] for k in ("xp", "xpLvl", "shields")}
    pg.screenshot(path=OUT + "/shot-dungeon-levelup.png")
    # rune -> terror + pale ghosts
    r["eatApple"] = pg.evaluate("window.__TEST_API__.debug().eatApple(1,3)")
    pg.wait_for_timeout(300)
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    r["terror"] = {"fright": s["fright"], "pale": sum(1 for g in s["ghosts"] if g["fright"]), "xp": s["xp"]}
    # eat a pale ghost: keep player adjacent-tile frozen, ghost walk-in
    pg.evaluate("window.__TEST_API__.debug().freezePlayer()")
    pg.evaluate("window.__TEST_API__.debug().ghostToPlayer(0)")
    pg.wait_for_timeout(300)
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    r["slay1"] = {"eaten0": s["ghosts"][0]["eaten"], "xp": s["xp"], "lives": s["lives"]}
    pg.wait_for_timeout(2600)  # eyes fly home; terror ends (6.5s from eatApple ~ minus elapsed)
    pg.wait_for_timeout(4600)
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    r["frightOver"] = s["fright"]
    # natural wyrm promotion: second rune + second goblin slay
    r["eatApple2"] = pg.evaluate("window.__TEST_API__.debug().eatApple(19,3)")
    pg.evaluate("window.__TEST_API__.debug().ghostToPlayer(0)")
    pg.wait_for_timeout(300)
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    r["slay2"] = {"xp": s["xp"], "wyrmFlags": [g.get("wyrm") for g in s["ghosts"]]}
    pg.wait_for_timeout(3000)  # eyes home -> goblin re-arms as WYRM
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    r["wyrmNatural"] = [g.get("wyrm") for g in s["ghosts"]]
    pg.wait_for_timeout(4200)  # terror over
    # SHIELD absorb test — now no ghost is pale: land wraith (idx1) on frozen player
    pg.evaluate("window.__TEST_API__.debug().freezePlayer()")
    pg.evaluate("window.__TEST_API__.debug().teleportGhost(1, -1, -1)")
    pg.wait_for_timeout(200)
    on2 = pg.evaluate("window.__TEST_API__.debug().ghostToPlayer(1)")
    pg.wait_for_timeout(350)
    s = pg.evaluate("window.__TEST_API__.snapshot()")
    r["shield"] = {"onto2": on2, "lives": s["lives"], "shields": s["shields"], "invuln": s["invuln"]}
    pg.screenshot(path=OUT + "/shot-dungeon-shield.png")
    r["scenErrors"] = errs[:5]
    pg.close()
    b.close()

print(json.dumps(results, indent=1)[:7000])
