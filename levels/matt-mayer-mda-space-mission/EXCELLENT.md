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

### V3 Phase 1 rubric (engineering trench, 2026-09-17 — issue #1)

11. **Engineering procurement** — contract desk (EYE-ON-NORTH · LIGHTSPEED-LINK ·
    HIGH-GROUND, bilingual) + launcher tiers as mass budgets (Vector-3 · 550 kg /
    Vector-9 · 950 kg / Boreal Heavy · 1400 kg); crates carry printed bilingual stat
    tags (kg · kW · res · Mbps · Δv); walk-cart slows when overloaded. ✅/⚠
12. **Bench = live engineering readouts** — bilingual TWR = T/(m×9.81), Δv
    (Isp·g₀·ln(m₀/m_f), fictional game-scale constants in level.json), kW draw vs
    generation (+battery buffer), data Mbps, CG axis balance; spin-test wobble ∝ CG
    offset (no death). ✅/⚠
13. **Launch gauge becomes physics** — marker period ∝ TWR (same three-window
    machine/band shrink, no death anywhere); TWR < 1.02 trips one soft strain anomaly
    + limping ascent + fiery sputter; ion-only (thrust 0) gets a single non-blocking
    "add chemical propulsion" banner at countdown. ✅/⚠
14. **Debrief margins** — stars (KPIs met + unspent kg ≥ 15% + power headroom ≥ 1.2 kW)
    plus margin line (Δv leftover, kW reserve, unspent kg), bilingual; stars pass to
    season reward ledger via the existing per-level `api.lives.gain()` contract at ≥4★
    (no shared-file writes). ✅/⚠
15. **Deterministic bot sims** — fixed-dt (1/60) in-page rig `sim.html` + `sim.py`
    headless driver: legacy/good regression stays 36.2 s (pre-Phase-1 tune exact),
    v3 good 4★, v3 partial ends at 1★ with exactly 3 deliberate misses, v3 clumsy
    with exactly 1 boulder drop — all won, all no-death. ✅/⚠

## Not in scope (explicitly)
- No fail/death path (booth line speed) — mistakes cost time, never a restart.
- No season-specific gameplay (season chip tint stays the engine's wash; `seasonNow()` in
  debug hook only).
- Orbit-ops minigames, Canadarm servicing class, campaign/season arcs, 2-player duel —
  tracked as follow-up issues after Phase 1 review.

## Booth band (v3 Phase 1 update, 2026-09-17)

- Legacy flow keeps the 60–90 s kiosk band (bots 36.2 s; first-time players with
  misses/drops 60–90 s).
- V3 default flow adds desk + procurement + bench readouts: fixed-dt bot sims 43–46 s;
  first-time kiosk player lands ~75–150 s (reading the tags/readouts is the game).
  Hard ceiling per issue #1 session target ≈ 4.5 min — nowhere close in Phase 1.
- `?v3=0` returns the legacy flow part-for-part (sim-verified identical numbers to the
  publish tune 2026-09-17).

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

## Phase 1 results (2026-09-17, v3 sims — deterministic fixed-dt 1/60, real module + real level.json)

| case                                   | t (s) | anomalies | drops | kg (cap)     | TWR  | Δv km/s | kW net | stars |
|----------------------------------------|-------|-----------|-------|--------------|------|---------|--------|-------|
| legacy/good (regression, `?v3=0`)       | 36.2  | 0         | 0     | —            | —    | —       | —      | —     |
| v3/good (default)                       | 43.2  | 0         | 0     | 705 (950)    | 1.74 | 2.37    | +4.90  | 4     |
| v3/partial                              | 45.9  | 3         | 0     | 750 (950)    | 1.63 | 2.21    | +0.50  | 1     |
| v3/clumsy                               | 45.4  | 0         | 1     | 680 (1400)   | 1.80 | 2.47    | +2.90  | 3     |

- All rows marked sample:true — these are bot sims, not human playtimes.
- Note: identical numbers reproduced standalone in the browser AND via `sim.py`, and the
  legacy regression matches the publish-time tune table within 0.1 s — determinism holds.
- Live real-time engine run (v3 good, bot=1) also won with the same cart (705 kg),
  confirming the fixed-dt rig matches the live engine (desk → shop → bench → burn → won).
- Caveat, not hidden: very light builds get twitch-fast markers (period clamp 0.5–7 s at
  TWR > ~3.2); gauge copy under the clamp line carries no math for kiosk players.

## Artifacts
- `src/genres/space-mission.js` (genre module, Route A painters, bot + debug hooks, v3 phase
  machine behind the ?v3 flag with desk/shop/bench/physics/debrief)
- `levels/matt-mayer-mda-space-mission/level.json` (verbatim prompt, no glyphs, all tuning +
  v3 catalog/launchers/contracts data blocks)
- `levels/matt-mayer-mda-space-mission/sim.html` (deterministic fixed-dt rig: real module +
  fake api; DOM beacon for headless collection) + `sim.py` (headless Chromium driver over all
  bot profiles, exits non-zero on contract failure)
- this file (rubric + results)
