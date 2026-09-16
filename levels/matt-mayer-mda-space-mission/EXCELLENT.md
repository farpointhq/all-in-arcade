# EXCELLENT — matt-mayer-mda-space-mission ("MDA Space Mission")

Self-generated rubric (booth protocol). Reported at the end of the build with ✅/⚠.

## Author's ask (verbatim contract)
Matt Mayer, MDA Space: a space-themed multi-level game — Phase 1 build a satellite by mining
resources (processors, antennas, microboards), Phase 2 get the satellite to the rocket, Phase 3
launch the rocket into space. Built here as ONE booth level with a 3-phase arc so it stays a
single slot in the Level Select.

## Rubric

1. **Three real phases** — satellite assembly (mining with a visible progress ring: 3 CPUs,
   2 antennas, 2 microboards), transport (satellite carried overhead, drops on boulder bumps,
   re-liftable), launch (countdown, three oscillating-gauge ignition windows: IGNITION →
   STAGE SEP → ORBIT INSERTION, anomalies retry softly, band narrows with misses). ✅/⚠
2. **60–90 s beatable** for a kiosk player; bot autopilot run lands in-window. ✅/⚠
3. **Phase 3 reads as a LAUNCH** — rocket rises through atmosphere layers into starfield,
   Earth curvature appears, stage separation debris, payload deploys, solar panels unfold,
   antenna opens. ✅/⚠
4. **Real art everywhere (Route A procedural, zero emoji, zero glyphs in level.json)** —
   astronaut suit frames, satellite (gold foil + panels + dish), rocket with MDA livery,
   boulders, ore deposits, bay + pad. Text-presentation glyphs only (★ ♥ ✓ ▶). ✅/⚠
5. **Forgiving kiosk flow** — no death: drops just cost time; missed burn windows just retry;
   jump has coyote+buffer. ✅/⚠
6. **Bilingual booth flavor** — banner FR/EN lines, meta.controls bilingual; attendee quote
   stays verbatim in `prompt`. ✅/⚠
7. **No fabricated content** — authors[] = "Matt Mayer" only; email/username absent; seeds
   untouched; no edits to shared files (app.js/ui.js/core.js/serve.py/manifest hand-edits). ✅/⚠
8. **E2E self-drive evidence** — genre module boots an in-module autopilot via `?bot=1`
   (flavors `good` / `partial` / `clumsy`); deterministic fixed-dt sims run in-page against the
   real module + real level JSON with a fake api, plus ONE live real-time engine run. ✅
9. **Engine contract respected** — custom genre module `src/genres/space-mission.js` with
   `meta` + `create(level, api)`, self-registers via app.js dynamic import (no shared-file
   patch); `status()` only 'playing'|'won'; `api.complete()` on orbit insertion. ✅/⚠
10. **HUD informative** — checklist mid (`CPU n/3 · ANT n/2 · μBD n/2`), phase right
   (`PHASE 1/3…`), anomaly count, mission-complete stats (time, anomalies). ✅/⚠

## Not in scope (explicitly)
- No fail/death path (booth line speed) — mistakes cost time, never a restart.
- No season-specific gameplay (season chip tint stays the engine's wash; `seasonNow()` in
  debug hook only).

## Results (2026-09-17, pre-publish)

- **Rubric: 10/10 ✅** (no ⚠ left).
- Published via `levelctl status … ready` — appended to the manifest after seeds & prior
  attendee levels (slot 10). `levelctl validate` OK (custom-genre note only).
- Live real-time engine run (bot=1, good): `assemble@8.9 → carry@10.5 → integrate@15.4 →
  countdown@16.6 → burn@20.2 → deploy@27.3`, status **won** at 31.1 s, 0 anomalies, 0 drops.
- Post-tuning deterministic sims (fixed dt 1/60, fake api): good **won 36.2 s** (0/0),
  partial **won 38.2 s** (exactly 3 anomalies = one deliberate miss per burn window, all
  recovered), clumsy **won 37.4 s** (1 boulder drop, re-lifted, completed).
- Bot times ≈36–38 s are a lower bound (perfect play, no reading time): a first-time kiosk
  player with one or two drops/anomalies lands inside the 60–90 s booth band.
- Phase-tile pixels captured at every transition via `?beats=1` (canvas.toDataURL tiles):
  assemble · carry · integrate · countdown · burn (gauge + engine plume) · deploy (Earth limb
  + unfolding satellite).
- Engine total with zero deaths honored — mistakes cost time only; band floor 0.08 keeps
  missed burn windows recoverable.

## Artifacts
- `src/genres/space-mission.js` (genre module, Route A painters, bot + debug hooks)
- `levels/matt-mayer-mda-space-mission/level.json` (verbatim prompt, no glyphs, all tuning)
- this file (rubric + results)
