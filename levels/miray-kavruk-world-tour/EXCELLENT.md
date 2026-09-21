# EXCELLENT — "Miray's World Tour" · miray-kavruk-world-tour (Miray Kavruk, Gowling WLG)

Genre owner: `src/genres/world-tour.js` (my lane only) + `levels/miray-kavruk-world-tour/*`.
Shared files untouched (app.js / core.js / audio.js / ui.js / serve.py / levelctl.py clean).

**Verified by:** deterministic fixed-dt sims (Playwright headless Chromium, in-page
`import("/src/genres/world-tour.js?v=…")`, dt = 1/60, update-only, no rAF dependence) for
good / good-repeat / partial / clumsy, plus a LIVE full-tour run in the real app shell at
`__WT.timeScale = 8` with `?beats=1` proof tiles. Results in `sim-results.json`,
screenshots `shot-live-end.png`, `shot-man-canada.png`, `shot-stage-*.png`.

## The pitch (Miray's booth relay, final assent verbatim in level.json.prompt)

Travel the world — one country on each continent, each level themed to its place, with
puzzles and quizzes tied to it (Brazil sugar plantations, Egypt's pyramids). Between
continents you CROSS AN OCEAN as its own level: swim underwater, eat fish to get bigger,
avoid sharks and bigger fish, then surface, find a boat, and hitch a ride onward. Every
crossing is a different creature so it never repeats: plankton → minnow → tuna → shark →
orca — each one bigger, with bigger threats.

## Structure (what "excellence" means for this ask)

The ask is a JOURNEY: 6 country stages + 5 ocean crossings = 11 stages, one route,
six passport stamps. Excellence = each stop feels like ITS PLACE (art + verb + question),
the crossings escalate exactly as Miray described, and the whole tour is finishable by a
booth stranger in a few minutes with zero dead-ends.

| # | stage | verb (puzzle) | quiz tied to place |
|---|-------|---------------|--------------------|
| 1 | Canada · N. America | tap 5 maple pails (SPACE) | sugaring-off season → Spring |
| 2 | Crossing 1 · plankton | eat 10 algae, dodge baby jellies | — |
| 3 | Brazil · S. America | cut 12 cane, mind the tractor | language → Portuguese |
| 4 | Crossing 2 · minnow | eat 11 fry, perch hunt you | — |
| 5 | Egypt · Africa | dig 6 scarab mounds | the Sphinx's riddle → a human |
| 6 | Crossing 3 · tuna | slash sardine schools, barracuda patrol | — |
| 7 | Türkiye · Europe | collect 5 tiles, dodge shoppers | strait → the Bosphorus |
| 8 | Crossing 4 · shark | hunt 14 reef fish, bull shark + nets | — |
| 9 | Japan · Asia | feed 7 koi (SPACE in the surfacing window) | former capital → Kyoto |
| 10 | Crossing 5 · orca | eat 15 tuna, giant squid + last nets | — |
| 11 | Australia · Oceania | gather 6 shells (dive for the ones in the shallows) | hopping marsupial → Kangaroo |

Route Canada → Brazil → Egypt → Türkiye → Japan → Australia (Türkiye is the Europe stop
AND the bridge: you then swim the Bosphorus "crossing" to Asia — geography's best joke).

## Rubric (each verified at publish time with sim/live evidence)

- [x] R1 BOOT — live `?level=miray-kavruk-world-tour&debug=1` boots with zero page errors;
      sim.py live mode PASS (logo-404 booth-wide noise filtered by URL, not text).
- [x] R2 SHARED FILES — zero edits outside `levels/miray-kavruk-world-tour/` +
      `src/genres/world-tour.js` + this folder's rigs/screenshots.
- [x] R3 PROMPT SACRED — level.json prompt byte-identical to the operator relay; author
      exactly "Miray Kavruk"; NO email anywhere (validator enforces).
- [x] R4 REAL ART — every actor Route A procedural, zero emoji, zero style.glyphs, zero
      runtime fetches: Miray the traveler (3 frames), maple pails, canes, scarabs, tiles,
      koi + ponds, shells, tractor / shopper / seagull hazards, six hand-painted backdrops
      (aurora sugar bush, plantation + treeline, pyramids + palms, dusk domes + minarets,
      Fuji + sakura, reef coast), six landmarks (Sugar Shack, rotating Mill, Sphinx,
      Bazaar arch, Torii, Reef Station), five creatures (plankton / minnow / tuna / shark /
      orca, 2 frames each), five foods, four swimmers + squid + nets, the sailboat, the
      world map with route dashes. HUD vocabulary: ★ ♥ ✓ ▶ ▲ ▼ + plain words (EN/FR).
- [x] R5 CONTROLS — keyboard only: ARROWS/WASD move (ZQSD works — physical codes), SPACE /
      ENTER tap-dig-feed-board-answer, quiz 1·2·3 or ↑↓+ENTER. Human-path test (synthetic
      real keydown events, no bot): walked, tapped 5/5, opened the gate, answered with
      Digit1, stamp granted — `shot-man-canada.png`.
- [x] R6 NO DEAD END — api.fail NEVER called (grep-clean, all sims); hazards cost
      stage-local bubbles (3, refilled each stage); at zero you soft-reset the stage only,
      keeping all progress ("caught your breath"). Wrong quiz answers: hint + retry, no cost.
- [x] R7 PROMPT SACRED PART 2 — every country has BOTH a mechanical puzzle (the verb row)
      AND a quiz tied to the place; every crossing is mechanically distinct (creature size,
      food kind, threat set, speed).
- [x] R8 CROSSING ESCALATION — plankton 10px→algae→jellies · minnow 16→fry→perch ·
      tuna 26→sardines→barracuda · shark 40→reef fish→bull shark + nets · orca 56→tuna→
      giant squid + nets. You GROW on screen as you eat (`growScale`), then surface to the
      boat. The boat never chases you (unreachable-at-equal-speed trap — it drifts; you
      swim to it).
- [x] R9 WIN — exactly one api.complete at tour end: payload {tour[11], stamps:6,
      crossings:5, quizzesRightFirst, quizWrongTries, hits, eats, t, season}; booth shows
      "LEVEL CLEAR" over the finale map (shot-live-end.png).
- [x] R10 BOTS (deterministic, fixed-dt) — good: 6 stamps, 6/6 quizzes right first try,
      2 hits, t=213s; good repeat: byte-identical payload (determinism proven); partial:
      flubs one quiz first try (Brazil) + takes hits, still completes; clumsy: never taps,
      never eats, never completes (0 stamps at cap).
- [x] R11 PACING — good bot ≈ 3.5 min full tour; per-stage 15–48s; country stages ~19-21s,
      koi + bull-shark stages carry the tension. Humans: expect ~4-6 min with retries —
      it's a journey level, and every stage re-entry is instant from the map.
- [x] R12 ART READABILITY — HUD text shadowed after the Egypt still showed white-on-sand
      wash-out; grow meter has a dark backing panel; interact hints ("▲ SPACE") float over
      their targets with shadows.
- [x] R13 THUMB-SAFE — stub-api create + 102 neutral steps + draw + toDataURL = 24 KB,
      title-carousel safe (guarded URLSearchParams, no bot/beats side effects).
- [x] R14 DEBUG SEAMS — `?debug=1` → `window.__WT { timeScale, state() }` with stageLog;
      `?bot=1&flavor=good|partial|clumsy`; `?beats=1` → DOM tiles (boot, leg, gate, quiz-ok,
      stamp, surface, board, tour-complete — 41 tiles on the live run); `?stage=<n>` boots
      any stage for targeted playtesting.
- [x] R15 AUDIO — countries play "chill", crossings "space" (both real files in
      assets/audio, credited); SFX via api.audio.sfx only (coin eat, powerup puzzle,
      hit threat, 1up quiz, splash board, alarm surface, bossRoar squid telegraph);
      musicOn/sfxOn respected; src/audio.js untouched.

## Tuning ledger (filled from sims BEFORE publish)

- eat targets: plankton 10 · minnow 11 · tuna 12 · shark 14 · orca 15 (data-driven)
- food cadence: pair-spawn every 0.45–0.85s, cap 20, opening soup of 5 mid-screen morsels
- threats: max 2 alive, every 4.0–6.6s; bull shark homing radius 300, lateral chase 22
- good bot: 213s, 74 eats, 2 hits · partial 207s · clumsy never completes
- history: first build 478s (crossings 38–100s each) → threat/food retune → 384s →
  pair-spawn + braver bot + threatMax 2 → 259s → opening soup → **213s**

## Micronotes for tinkerers

- All gameplay constants live in `levels/miray-kavruk-world-tour/level.json` → `data`
  (walk speed, ocean physics, food/threat cadence, eatK/growK, every stage's sky palette,
  item counts, quiz text). The stage engine + painters live in `src/genres/world-tour.js`.
- Painter tables (FOOD_PAINT / THREAT_PAINT / CREATURE_PAINT) key off the stage data's
  food/threat strings — keep the spellings aligned (a `reefish` vs `reeffish` typo here
  cost one live crash: `bake()` calls its painter on first draw, so a missing key only
  blows up in DRAW, never in update-only sims — see sim.py live mode's reason to exist).
- The bot's koi window is ph<0.6 inside a 0.85 surfacing window — deliberate slack.
- Music: crossings swap to "space" while countries run "chill" — the stage card is the
  transition beat; the booth title music takes over after the win.
