# EXCELLENT — simone-death-star-run

## Post-playtest verdicts (2026-09-16, simone tab)

1. THRILL — ✅ pseudo-3D trench (floor + two curved walls + fog), station looms continuously, beacon pods tear past.
2. ITEM FLOW — ✅ 12 stars, 5 to arm torpedo; winning pilots banked 6–7; star-hungry runs survive to the hull when they don't bank enough and get the deficit message.
3. FAIRNESS — ✅ swept collisions (any-dt); fighters home only while far and go ballistic near; all hits landed at the designed danger spots (S-curve debris apex, wave 3); zero deaths in competent-run tests; heart loss = organic slip, never scripted.
4. BOSS-FEEL — ✅ 13% of track = station approach; port sweeps over ~5s windows; misses are free, 1s torpedo streak → boom + flash + shake; win overlay fires from complete(); too-few-stars hull-fail names the deficit.
5. READABILITY — ✅ procedurally-drawn shuttle / interceptor / rocks / star pickups vs emoji-lite HUD/props; port is the highest-contrast element during the approach; steering window ≥⅓ corridor.
6. PACING — ✅ real-time hull-reach measured at ~59s + ~14s boss approach ≈ 70-78s runs; countdown/brief beats at start.

Self-generated bar for "A galactic Star Wars theme, space shuttle racing game. The goal is to
defeat the Death Star by collecting items, or something?". Simone gave a vibe + one open question
("or something?") — excellence here means answering that question with a *structure*: items aren't
loot, they're the ammo that lets you finish the level. Every ⭐ collected is progress toward the port
shot; that's the "or something?" made concrete.

The level wins when a random attendee steers, grabs stars, and feels the trench close around them
before one big aimed shot beats the boss.

## Graded criteria (each ✅ / ⚠ / ❌ after playtest)

1. **THRILL — the trench feels fast and galactic.**
   - Corridor walls visibly tear past; curves bend into view with 2+ seconds of read.
   - Below-the-trench rock, glowing edge strips, and a star-crowded sky make it feel *not-2D-flat*.
   - The Death Star 🌑 is visible from >½ track out and grows continuously — arrival feels earned.
   - Grade: after 3 runs, does speed read as “rebel-pilot” fast without being motion-sick?

2. **ITEM FLOW — stars are ammo, not clutter.**
   - ≥12 ⭐ over the run; 5 required to charge the torpedo → generous but not all-gettable-by-accident.
   - Items are readable 2+ seconds before arrival; clusters form short arcs ("collect-bursts") you
     steer *into*, not collectibles so scattered they feel like wallpaper.
   - Item pickup gives audible+visible feedback (sfx + pop) every time.
   - Grade: while holding the corridor naturally (not optimizing), do I bank 5+ stars before the boss?

3. **FAIRNESS — every hit was avoidable, every death understood.**
   - All debris/fighter shots telegraph ≥1.5s ahead (visible far in fog before they matter).
   - 3 hearts + 1.4s invulnerability after a hit; nobody dies to the same hit twice.
   - Walls are forgiving: brushing the wall scrapes speed but doesn't kill.
   - A first-timer should finish 60–90s without reading a manual; a second-timer should *never* die.
   - Grade: can I narrate each hit I take during playtest ("I drifted into the debris") and can a
     forgive-everything straight-line run survive to the boss with ≥1 heart?

4. **BOSS-FEEL MOMENT — the finale is a shot, not a wall.**
   - Station stops being background and becomes the only objects on screen: Corridor slows to a
     dramatic approach pace, port sweep becomes the whole game for the last stretch.
   - Torpedo locked (⭐≥5) is announced clearly; port alignment has clear slack (not pixel-hunting).
   - The successful shot = torpedo streak + flash + boom + station eruption. Misses are cheap
     (no damage, immediate re-fire), so the endgame is confident, not punishing.
   - Too few stars = clear fail line naming the deficit ("came up 2 stars short"), retry feels
     obviously fixable.
   - Grade: does the last 15 seconds feel like a *climax* on video, and does failure there teach?

5. **READABILITY — one glance = one correct input.**
   - Item / debris / fighter / wall all differ in color+shape at speed; the port is the highest-
     contrast thing on screen during the approach.
   - Steering never needs precision tighter than ~⅓ corridor width for survival (port aim is the
     only precision ask, and its window is ≥ that).
   - Grade: screenshot mid-run — can a stranger tell in 3 seconds what to avoid and where to go?

6. **PACING — 60–90s with a rising-tension shape.**
   - Calm opener → first dodge → first fighter wave → curves+slalom → breath → boss. No more than
     ~8s of nothing; no more than ~10s of chaos.
   - Countdown ≥2s; objective banner readable; finishing naturally lands at 60–80s.
   - Grade: 3 clean runs — duration variance < 10s and never outside 60–90s.

## Solvability statement (what a win must look like)

The level is beatable by steering-only play: picking up ≥5 of the 12 ⭐ by following the corridor
center-ish, surviving fighter waves with hearts to spare, then aligning with the sweeping port and
firing. A player who collects <5 is *told* the deficit at the station and can try again having
understood exactly what to fix. Difficulty ceiling: straight-line + panic-steering survives with
1–2 hearts lost; a competent first-timer gets through the boss the first try with a heart or two
to spare, and clean-runs it after that.

## Non-goals (deliberate edges)

- No dogfighting/shooting mid-trench: shooting is THE boss verb, reserved for the climax.
- No literal Star Wars marks: emoji homage + dark-grey station + green torpedo = vibes only.
- No level.js: pure data + one genre module, per booth rules.
