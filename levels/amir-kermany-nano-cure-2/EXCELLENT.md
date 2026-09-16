# EXCELLENT — "Nano Cure" · amir-kermany-nano-cure-2 (Amir Kermany, Clinytic)

Self-rubric (booth protocol). Genre owner: `src/genres/nano-cure.js` (this chat's lane).
One slot, 3 phases: INJECTION → CAPILLARIES → ARTÈRE → PURGE FINALE (final boss).

## The pitch (from Amir's booth relay, final form)
Vertical shoot-'em-up inside the bloodstream: you are a nanobot injected by a syringe; you
have to literally move into the germs to absorb them — but you can only kill-absorb what you
are bigger than; absorption takes time; the absorbed biological material upgrades you
(cadence, rayon, mitraille); bigger germs hurt you; bomb power-up; lives; evolve over phases.
A "vertical Katamari × Strikers-1942" hybrid, healthcare theme (Clinitic / Clinytic).

## Rubric — final verification 2026-09-16 (all via sim.py, Playwright headless Chromium)
- [x] R1 BOOT — live boot `?level=amir-kermany-nano-cure-2&bot=1&flavor=good&debug=1&beats=1`:
      page_error none, console_errors none (booth-wide logo-404 filtered), bot WON
      trace `capillaries@0.1 → artery@22.0 → boss@46.0 → won@67.1`.
- [x] R2 NO EMOJI/GLYPHS — level.json has no style.glyphs; painters only; HUD text glyphs
      ★ ♥ ✓ + plain words; no emoji anywhere in the render path.
- [x] R3 REAL ART (Route A): syringe, nanobot (2 frames), dart, virion, bacille (+live
      flagellum wiggle), coque cluster, bacmaj carrier, spore, boss membrane w/ lobes +
      shield shimmer + open nucleus, bomb pickup capsule, erythrocyte backdrop discs,
      vessel walls w/ bulge curve, heartbeat pulse — all baked via local bake(), zero
      fetches, zero asset files.
- [x] R4 CONTROLS — arrows/ZQSD steer, SPACE bomb, auto-fire + auto-absorb; absorb ring +
      dashed tether; channel slows you to 45% (vulnerable, per the pitch).
- [x] R5 3 PHASES ONE SLOT — trace above proves all 4 beats; shot-capillaries/artery/boss/won.png.
- [x] R6 ABSORB CORE — husks + live-smaller germs absorbable (channel ring, progress
      persists per germ); bigger live germs chip −♥; biomass evolves:
      CADENCE + (60) → RAYON + (140) → MITRAILLE (250, reached mid-boss in good run).
- [x] R7 BOMB — Space clears globs, husks small germs, +2 nucleus damage, 1.1 s invuln,
      shake/flash; pickups ARTÈRE ×2, cap 3.
- [x] R8 FORGIVING — 3 hearts, 1.2 s i-frames, knockback; ONE api.fail after hearts empty
      ("L'infection prend le dessus — retente ta chance !"); no insta-death; no life
      double-spend (shell spends on fail).
- [x] R9 GATES — win ⇒ api.complete({t, biomass, absorbed, husked, bombsUsed, season})
      after 3rd nucleus pop + SANG PROPRE ✓ banner (good sim payload t=77).
- [x] R10 SEASON-SAFE — no melt dependence; seasonNow() only flavors the wash + payload;
      sims ran season=autumn with zero seasonal gates.
- [x] R11 PACE — good bot 67–77 s (live/sim); booth humans ≈ 60–90 s; phases 2.8/22/24/
      ~20–26 boss.
- [x] R12 THUMB-SAFE — stub-api create + 70 neutral steps + draw + toDataURL OK
      (15,003-byte jpeg; window.__THUMBS__ compatible).
- [x] R13 HYGIENE — `levelctl validate` OK; `status ready`; manifest last slot; authors
      verbatim "Amir Kermany" (spelled K-E-R-M-A-N-Y at the booth) + company Clinytic
      (C-L-I-N-Y-T-I-C); prompt verbatim; no email anywhere.
- [x] R14 NO SHARED-FILE EDITS — only `levels/amir-kermany-nano-cure-2/` +
      `src/genres/nano-cure.js` were written. NOTE: the `-2` id is from my own
      rubric-first Write creating the folder before `levelctl new` claimed it; the
      stray folder was merged (mv rubric) + rmdir'd — no other agent ever claimed
      amir-* lanes (verified 2026-09-16).

## Rigs (this folder)
- `sim.py` — modes live | sims | thumbs | all; URL-gated to this LID; writes
  sim-results.json + shot-*.png. Latest run: OVERALL PASS.
- `shot-*.png` — live-run phase captures (capillaries / artery / boss / won).

## Tuning ledger (final, version 2)
- good bot: won 67.1 s live / 77.0 s fixed-dt · 0 fumbles · hearts 1–2 left · biomass 286 →
  MITRAILLE mid-boss · husked 88.
- partial bot: won 69.0 s · exactly 2 deliberate fumbles (fumble1@7.7, fumble2@10.7).
- clumsy bot: lost @35.2 s in ARTÈRE (fail payload above) — fail path proven.
- evolutions: CADENCE ≈ 6–8 s · RAYON ≈ 14–18 s (capillaries) · MITRAILLE ≈ mid-boss.
- boss: 3 opens × 5 nucleus hits, spores 3 per open (window 4.2 s), sprays 5 per 1.3→0.85 s,
  aimed 3-way 1.0 s while open. Thresholds 60/140/250; bio: virion 8, bacille 13, coque 22,
  spore 11, bacmaj 26; contact absorb radius pl.r + germ.r ×0.9; husks shrink 4 %/s (TTL 6.5).
