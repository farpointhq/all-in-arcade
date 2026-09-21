# EXCELLENT — Miray's World Tour (`miray-kavruk-world-tour`)

A round-the-world journey for **Miray Kavruk**: six countries, one per inhabited
continent, each with a place-tied puzzle and quiz — and five ocean crossings between
them where you grow by eating, plankton → minnow → tuna → shark → orca, then surface,
find a boat and hitch a ride to the next continent. Exactly the shape she pitched.

## Verdict — EXCELLENT

- 11/11 stages complete in order; **215.8 sim-seconds** full tour (~3.6 min) — a real
  journey, not a tech demo.
- Zero `api.fail`, zero dead ends, zero console errors in the live 4× run.
- Every UX defect found in the video-review loop was fixed and re-verified on film.

## The tour

| # | Stage | Continent | Play | Gate |
|---|-------|-----------|------|------|
| 1 | Canada — maple sugar bush | North America | tap 5 sap pails | Sugar Shack · sugaring season quiz |
| 2 | **PLANKTON CROSSING** | NA → SA | eat 12 algae, dodge jellies | boat |
| 3 | Brazil — cane plantation | South America | cut 12 cane, dodge tractor | Sugar Mill · language quiz |
| 4 | **MINNOW CROSSING** | SA → AF | eat 14 fry, dodge perch | boat |
| 5 | Egypt — pyramids | Africa | dig 6 scarab mounds | Sphinx · riddle of ages |
| 6 | **TUNA CROSSING** | AF → EU | eat 16 sardines, dodge barracuda | boat |
| 7 | Türkiye — Grand Bazaar | Europe | 5 tiles, dodge shoppers | Bazaar · Bosphorus quiz |
| 8 | **SHARK CROSSING** | EU → AS | eat 18 reef fish, dodge bull shark + nets | boat |
| 9 | Japan — koi ponds | Asia | feed 7 koi (timing windows) | Torii · former capital quiz |
| 10 | **ORCA CROSSING** | AS → OC | eat 20 tuna, dodge squid + nets | boat |
| 11 | Australia — reef coast | Oceania | dive for 6 shells, dodge seagull | Reef Station · marsupial quiz |

The Türkiye stop is a love letter: Miray's own name is Turkish, and Istanbul is the one
place where walking between two continents is literal — the Bosphorus run is crossing 4.

## Rubric

- **R1 ask-fidelity** — PASS. Both halves of her pitch are first-class: themed country
  puzzles/quizzes AND scaling ocean crossings. Crossing 1 is plankton, 5 is orca.
- **R2 art-rule (Route A)** — PASS. All art procedural; actors baked to offscreen
  canvases; no emoji, no glyphs in level.json, no fetches. HUD copy uses approved
  glyphs (♥ ▲ ▼ ✓) + plain words.
- **R3 booth API** — PASS. `api.complete` fires exactly once (sim-asserted), payload
  carries tour order, 6 stamps, 5 crossings, quiz stats, hits, eats, season.
- **R4 no-fail journey** — PASS. Hazards cost one of 3 stage bubbles; zero bubbles
  soft-resets to your last checkpoint *with progress kept*. Quizzes retry forever.
  `api.fail` is never called (sim-asserted for all three bot flavors).
- **R5 keyboard-only** — PASS. Arrows/WASD + Space/Enter + 1·2·3 for quizzes;
  bilingual control line in `meta.controls`, echoed by the booth hint bar.
- **R6 determinism / testability** — PASS. Per-stage mulberry32; fixed-dt sims;
  `?debug=1` → `window.__WT.state()`; `?bot=1&flavor=good|partial|clumsy`;
  `?beats=1`; `?stage=N` boots mid-tour.
- **R7 sim evidence** — PASS. `sim.py` (`live`/`sims`/`thumbs`) exits 0: good completes
  with 6 stamps + 5 crossings + 6/6 quizzes right first try; partial flubs Brazil once
  and still finishes; clumsy (never interacts) never completes. `sim-results.json` in-folder.
- **R8 pacing** — PASS. Countries 18–40 s, crossings 24–32 s; full tour ≈ 3.6 min at
  4× verified / ~7 min human. Crossings shortened from 42 s by tripling morsel spawns,
  weakening flee, and sizing the eat radius to the on-screen creature.
- **R9 carousel** — PASS. 120-step neutral draw produces the LEG 1 card over the sugar
  bush (thumbs byte check > 3000).

## UX loop — played on film, fixed, replayed

Recorded real-time Playwright runs (webm → 3 fps contact sheets + full-res stills),
reviewed frame by frame, fixed, re-recorded. What the film caught:

1. **Ocean stages looked empty / unreadable** — the plankton was a 10 px speck and food
   was smaller than the ambience. Fixed: 2.1× creature render scale (physics eat/hit
   radii now track the *visual* size), dark halos + 1.5× on all foods, "you are here"
   pulsing ring on the creature. Water went from vacant to a living food web.
2. **Player was mistaken for food** (minnow = white specks among white fry). Fixed by
   the ring + halos; never ambiguous on replay.
3. **Minnow crossing dragged to 42 s** chasing fleeing fry. Fixed: spawns 0.6–1.05 s,
   3-morsel clusters, flee 90→64 px/s at 90 px range. Now ~30 s.
4. **Boat prompt collided with the grow bar** at the top of the screen. Fixed: prompt
   moved below the waterline, escalates to gold "▲ SWIM UP — BOARD NOW!" when close.
5. **Copy bugs**: HUD said "LEG 1/11" and cards said "OCEAN CROSSING 2" (stage numbers).
   Fixed: "LEG n/6" / "CROSSING n/5"; cards read "LEG 2 OF 6" / "OCEAN CROSSING 1 OF 5".
   The map said "NEXT: Canada" *after* stamping Canada and "cross to South America as a
   plankton" — it now always names the true next destination.
6. **Cane and scarab mounds blended into their scenes.** Fixed: rimmed/brighter paints,
   bigger mounds, and a pulsing gold ▼ beacon with an ink backing over every uncollected
   item (koi ponds flash instead — their ring *is* the cue).
7. **Beacons were invisible even after recolor** — two causes found on film: translucent
   gold washed out on bright skies (→ solid gold + ink shadow), and the landmark drew
   *over* beacons near the gate (→ beacons moved to a topmost pass; the 5th pail behind
   the Sugar Shack now shows its arrow on the shack wall).
8. **Grow bar was a 10 px sliver.** Fixed: 300×14 bar, "PLANKTON — GROW 7/12" labels,
   flips to gold "SURFACE! ▲ FIND THE BOAT" when grown.

## Booth-furniture round (same session)

- Level Select numbered **1..15 by position** (was raw internal order 01…1000/1001).
- Level Select scrolls: themed scrollbar, bottom fade, pulsing "▼ MORE LEVELS — SCROLL ·
  ↑ ↓ KEYS", ArrowUp/Down = one card, PgUp/PgDn = page, Home/End = ends; live level count
  in the header.
- ESC in a game pauses; pause menu now offers **LEVEL SELECT** (and quitting cleanly
  clears the run, fixing a latent stale-pause bug where ESC on menus re-paused the old
  level).

## Numbers (final)

- walk 224 px/s · ocean accel 640, drag 2.1, vmax 320 · visK 2.1 · eatK 1.05 · hitK 1.0
- food spawns 0.6–1.05 s (3-morsel clusters, sardines 4–6) · flee 64 px/s @ 90 px
- bubbles 3/stage · iframes 1.4 s · boat board radius 74 px
- quizzes: 6 questions, all place-tied (sap season, Portuguese, Sphinx riddle, Bosphorus,
  Kyoto, marsupials) · wrong answer = retry with a hint, never a fail

*Played on film at 3 fps + full-res stills until it looked right — then the sims held
the line. Bon voyage, Miray.*
