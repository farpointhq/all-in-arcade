# EXCELLENT — "Nano Cure" · amir-kermany-nano-cure-2 (Amir Kermany, Clinytic)

Self-rubric (booth protocol). Genre owner: `src/genres/nano-cure.js` (this chat's lane).
One slot, 3 phases: INJECTION → CAPILLARIES → ARTÈRE → PURGE FINALE (final boss).

## The pitch (from Amir's booth relay, final form)
Vertical shoot-'em-up inside the bloodstream: you are a nanobot injected by a syringe; you
have to literally move into the germs to absorb them — but you can only kill-absorb what you
are bigger than; absorption takes time; the absorbed biological material upgrades you
(cadence, rayon, mitraille); bigger germs hurt you; bomb power-up; lives; evolve over phases.
A "vertical Katamari × Strikers-1942" hybrid, healthcare theme (Clinitic / Clinytic).

## Rubric — every line must be ✅ in the final report
- [ ] R1 BOOT — `http://localhost:8181/?level=amir-kermany-nano-cure-2` boots straight into
      INJECTION with ZERO console errors (headless Chromium page-error collector proof).
- [ ] R2 NO EMOJI/GLYPHS — level.json has no `style.glyphs`; nothing emoji in the render
      path; HUD uses text glyphs from the approved set only (★ ♥ ✓ ▶ + plain words).
- [ ] R3 REAL ART (Route A procedural): syringe, nanobot (2 frames), virion, bacille,
      coque, spore, infection core (pulsing membrane), bomb pickup, erythrocyte backdrop —
      all baked painters via sprite()/blit(), zero asset files, zero runtime fetches.
- [ ] R4 CONTROLS — arrows/ZQSD steer, SPACE bomb; auto-fire + absorb channel are automatic;
      channel ring shows progress; absorb slows you (vulnerable) per the pitch.
- [ ] R5 3 PHASES ONE SLOT — trace: inject@0 → capillaries@~3 → artery → boss → won; one
      beat per phase via ?beats=1 tiles saved as shot-*.png.
- [ ] R6 ABSORB CORE — husks (shot-down germs) and live germs smaller than your radius are
      absorbable on contact (channel takes time, progress persists on the germ); bigger live
      germs damage you on contact; biomass evolves: CADENCE + → RAYON + → MITRAILLE (banners).
- [ ] R7 BOMB — Space (when ∩>0) clears enemy bullets, husks/shrinks germs, 1.1 s invuln,
      shake + boom; pickups in ARTÈRE and PURGE (cap 3).
- [ ] R8 FORGIVING BOOTH — 3 local hearts, i-frames 1.2 s, knockback; hearts empty ⇒ ONE
      api.fail (shell spends bank life, Retry screen); no insta-death anywhere; biomass
      kept across phases.
- [ ] R9 WIN/LOSS GATES — win ⇒ api.complete({t, biomass, absorbed, bombs, season}) after
      3rd nucleus pop + SANG PROPRE ✓ banner; lose only by heart drain.
- [ ] R10 SEASON-SAFE — no melt dependence; seasonNow() only flavors the plasma tint;
      beatable in spring/summer/autumn/winter (nothing seasonal gates progress).
- [ ] R11 HUMAN PACE — good-bot full run ≈ 40–60 s sim; booth humans ≈ 60–90 s target.
- [ ] R12 THUMB-SAFE — module runs under thumbnail stub api (no AudioContext, neutral
      input) without throwing; title carousel thumb renders ok (window.__THUMBS__).
- [ ] R13 HYGIENE — `python3 levelctl.py validate amir-kermany-nano-cure-2` OK; authors[]
      verbatim ("Amir Kermany", spelled K-E-R-M-A-N-Y, company Clinytic spelled
      C-L-I-N-Y-T-I-C); prompt verbatim from the booth relay; NO email anywhere;
      status ready via levelctl (manifest never hand-edited).
- [ ] R14 NO SHARED-FILE EDITS — only `levels/amir-kermany-nano-cure-2/` +
      `src/genres/nano-cure.js` were written. NOTE: the `-2` id is from my own
      rubric-first Write creating the folder before `levelctl new` claimed it; the
      stray folder was merged (mv rubric) + rmdir'd — no other agent ever claimed
      amir-* lanes (verified 2026-09-16).

## Verification rigs (this folder)
- `sim.py` — Python Playwright (Chromium headless): (A) console-clean live-boot E2E with
  the in-module bot (polls window.__NANO), (B) fixed-dt determinism sims for flavors
  good / partial / clumsy + winproof, (C) phase screenshots (shot-*.png).
- Rigs drive ONLY my URLs (each script URL-gates on `?level=amir-kermany-nano-cure-2`).

## Tuning ledger (update with final sim numbers)
- good bot: — s / 0 hits (target ≤ 60)
- partial bot: — s / exactly 2 fumbled absorbs
- clumsy bot: heart drain path provable (or dedicated fail-sim)
- evolves: T2 ≈ — s, T3 ≈ — s, T4 ≈ — s during a good run
- boss cycles: 3 opens × 8 nucleus hits, spore quota 4 per open (window — s)
