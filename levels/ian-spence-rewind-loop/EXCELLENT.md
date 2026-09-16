# EXCELLENT — "Rewind Loop" · ian-spence-rewind-loop (Ian Spence, Leaseweb Canada)

Self-rubric (booth protocol). Genre owner: `src/genres/rewind.js` (this chat's lane).
One slot: REWIND CLIMB (forced left/up) → FLIP at the Rewind Gate → RUN IT BACK (forced
right/down) → portais + the "exit" portal that just restarts the loop → the only exit is DYING.

## The pitch (Ian Spence's booth relay, operator-transcribed; interjections trimmed)
2D platformer that moves BACKWARDS: you can never move forward (pressing right does nothing),
you climb up platforms/trees going backwards to the top-left. With portals: "if you enter the
portal, you start going backwards again." Everything is going backwards in time — enemies come
at you walking/flying backwards and can kill you. After the top-left, it "reverse orders" and
you head back right, down to the start. Reaching the start again you jump into a portal and
you're playing forever. "The only way to escape is actually failing... you die." — then the
booth shows the next level. Win-by-dying: "Congratulations, you won by dying. Here's the next
level."

## Rubric — checked as built + verified (sim rig levels/ian-spence-rewind-loop/sim.py)

- [x] R1 BOOT — Playwright-headless live run `?level=<id>&bot=1&flavor=good&debug=1&beats=1`:
      zero page errors / zero console errors (booth-wide logo-404 filtered), bot plays the full
      paradox trace: climb → gate flip → descend → loop via portal (loops ≥ 1) → death.
- [x] R2 NO EMOJI/GLYPH FALLBACKS — no `style.glyphs` in level.json; Route A baked painters
      only; HUD copy = approved text glyphs (◄ ▶ ★ ♥ ✓) + plain words; EN + FR echo lines.
- [x] R3 REAL ART (Route A procedural): hero runner (2 reverse-run frames, flip), tape-walker
      (cassette head, moonwalk), rewind wraith (history snap-back w/ ghost trail), backward
      bird (reversed wing sweep), portal vortex (2 variants + rotating ring), Rewind Gate
      (hourglass + tape reels + "◄◄ REWIND" wall sign), wood/tape ledges, trees, VHS sky
      (static noise, tracking bars, reversed backdrop) — all local bake, zero fetches.
- [x] R4 CONTROLS — phase 1: pressing RIGHT does nothing (plus a "◄ ONLY" lock blink when
      pressed); phase 2: LEFT does nothing ("▶ ONLY"). Jump Space/↑/W (KeyZ W-layout friendly),
      coyote 0.09 s + buffer 0.10 s + variable jump cut. Position ratchet makes the one-way
      rule physical, not just input-blocked.
- [x] R6 PARADOX CORE — the ONLY api.complete() call site is the death path; portals/gate can
      never complete. Verified by grep of the module + sims.
- [x] R7 PORTALS — any portal: gentle pull (radius ~54, escapable at rim), capture → flash,
      "REWOUND — LOOP ×N", teleport to phase-1 spawn, phase resets to 1. The start-line portal
      (`exit:true`, labelled "▶ AGAIN?") is visible only in phase 2 and does exactly the same
      thing — the level is unfinishable by design. Dying on an enemy is the only win.
- [x] R8 BACKWARD ENEMIES — walkers approach with reversed animation (moonwalk), rewinder
      chases 1.15 s then snaps back along its recorded trail, birds fly backward with reversed
      wing sweep; contact = death (win). No stomp kills — the joke must not be escapable.
- [x] R8b NO STOMP, NO PIT, NO SPIKES — forgiving by design: falls always land on a lower
      deck or the floor; the ratchet means no wrong-way traps.
- [x] R9 WIN = DEATH — lethal contact: slow-mo pixel burst in reverse + tracking bars +
      banner "YOU WON BY DYING." then api.complete({cause:"died", ...}) at +2.35 s.
- [x] R10 GATES/HYGIENE — result dialog fires once (resultShown), HUD via api.hud mid/right,
      music = real "chase" loop (style.music), sfx try/catch-guarded.
- [x] R11 PACE — grace 6 s, climb ≈ 60-80 s good bot, typical booth session 35-95 s.
- [x] R12 THUMB-SAFE — stub-api create + up to 120 neutral steps + draw + toDataURL OK
      (verified in thumbs sim; no window/Audio assumptions outside DBG guards).
- [x] R13 DATA — validate OK; authors verbatim "Ian Spence" (Leaseweb Canada relay);
      prompt verbatim; no email anywhere.
- [x] R14 NO SHARED-FILE EDITS — only `levels/ian-spence-rewind-loop/` + `src/genres/rewind.js`.
- [x] R15 BILINGUAL — EN primary + FR echo on banner/flip/loop beats (booth EN+FR mix).

## Rigs (this folder)
- `sim.py` — modes live | sims | thumbs | all; URL-gated to this LID; writes sim-results.json
  (+ phase shots). Playwright headless Chromium (compositor-alive — rAF runs, unlike the
  shared Fabric tab where it throttles to 0).

## Tuning ledger (v1 — level.json is source of truth)
- spawn ground y=500; climb decks ≈ 26 (zigzag left+up 44-90 px, gap ≤ ~150 px, width 120-210);
  rewind gate plateau x≈80-330 y≈150; "200 ft" = travel_px / 21; phase 2 counts feet back DOWN.
- portals: A x=2004 y=430 (mid-climb lure), B x=1330 y=352, C x=2900 y=396 (mid-descent),
  D exit x=4340 y=452 (phase-2 only). Pull 54 px, capture 14 px.
- enemies: grace 6 s; walker every 3.4→1.7 s (phase 2 ×1.35 denser), speed 56→96;
  rewinder from 18 s every 7→4.6 s, chase 150 px/s, snap-back every 2.6 s off a 6-tick
  history ring; birds from 34 s every 8→5.2 s, speed 112→164, sine amp 44.
- jump: v0 -622, g 1560, jump cut 0.42 (apex ≈ 120 px); move 212 px/s ground, 0.78 air.
- death FX 2.35 s then complete; flip FX 1.0 s; rewound FX 0.9 s + teleport reset.
