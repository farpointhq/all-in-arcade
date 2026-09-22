# Full Playthrough — Issue #4 Cascade (all 15 manifest levels + static hardening)

**Date:** 2026-09-22 · **Branch:** `playtest/cascade` · **Rig:** `tools/playtest/playtest.py` (committed this branch)
**Method:** one orchestrator + 7 background playtest/review agents (PT-A…PT-D gameplay clusters on ports 8605–8608, PT-C2/PT-D2 completion passes, SR-E static review on 8609), unique serve port per agent (`8600 + issue % 200` scheme, this chat = 8604 for rig work). Every gameplay level was booted headless (1000×640, video 960×600), driven by its in-module bot (`?bot=1&flavor=`), maze autopilot (`?ap=1`), or the scripted keyboard driver, with video → ffmpeg contact sheets (fps=3, tile=5x6) → full-res still review of every flagged window. Deterministic `sim.py sims` gates were re-run for the four bot genres. Static hardening (state leaks, cleanup, save guards, audio unlock, DPR, rAF health, kiosk intake) was reviewed file-by-file with file:line citations.

**Findings deduped to 15 sub-issues (#6–#20), each with evidence, fix sketch, and acceptance criteria.**

## Sub-issue index

| # | Title | Priority |
|---|-------|----------|
| [#6](https://github.com/farpointhq/all-in-arcade/issues/6) | bug: Rewind Gate never flips — good-bot regression (predates cascade, suspect a670292) | high |
| [#7](https://github.com/farpointhq/all-in-arcade/issues/7) | bug: nano-cure live-vs-sims divergence — live good bot dies in boss phase | high |
| [#8](https://github.com/farpointhq/all-in-arcade/issues/8) | bug: maze autopilots lose every run — wrap-blind threat distance | high |
| [#9](https://github.com/farpointhq/all-in-arcade/issues/9) | bug: corrupt v1 save black-screens boot — migration shim outside try/catch | high |
| [#10](https://github.com/farpointhq/all-in-arcade/issues/10) | bug: no auto-pause on blur/hidden tab | medium |
| [#11](https://github.com/farpointhq/all-in-arcade/issues/11) | bug: booth logo assets missing — 404s every boot | medium |
| [#12](https://github.com/farpointhq/all-in-arcade/issues/12) | playability: Death Star Run inverted climb mapping | medium |
| [#13](https://github.com/farpointhq/all-in-arcade/issues/13) | bug: canvas backing store ignores DPR change | medium |
| [#14](https://github.com/farpointhq/all-in-arcade/issues/14) | playability: survival volleys drain the heart bank in ~33 s | medium |
| [#15](https://github.com/farpointhq/all-in-arcade/issues/15) | graphics: HUD collision + legibility sweep (6 instances) | medium |
| [#16](https://github.com/farpointhq/all-in-arcade/issues/16) | ux: bilingual + FTUE sweep | medium |
| [#17](https://github.com/farpointhq/all-in-arcade/issues/17) | robustness: kiosk intake hardening | medium |
| [#18](https://github.com/farpointhq/all-in-arcade/issues/18) | audio: AudioContext unlock + element accumulation | low |
| [#19](https://github.com/farpointhq/all-in-arcade/issues/19) | robustness: genre exit() teardown never runs | low |
| [#20](https://github.com/farpointhq/all-in-arcade/issues/20) | graphics: contrast sweep (nicolas pickups, bethany hero) | medium |

## Per-level results

Evidence per level: `docs/playtest/evidence/<lid>/` (`sim-results.json` trace + gates, contact sheets, stills); machine findings: `docs/playtest/findings/<lid>.json`.

| Level (genre) | Driver | Gates | Win | Key findings → issue |
|---|---|---|---|---|
| L01 (platformer) | keys | PASS | no | loss overlay honest-win bug fixed in rig; flag labels clipped; no blur auto-pause (probed) → #10 #15 |
| bethany-cloudwalk (platformer) | keys | PASS | no | hero dwarfed by cloud art; void gaps unclear; "TRY AGAIN" spend verified ♥3→2 → #20 |
| nicolas-snowball-seasons (platformer) | keys | PASS | **YES 5.3 s** | snow pickups near-invisible; FR-only objective → #20 #16 |
| L02 (racer) | keys | PASS | **YES 154.8 s** ("LEVEL CLEAR!") | HUD verified legible; no auto-pause on blur → #10 |
| L03 (puzzle) | keys (+down/Z/R after rig fix) | PASS | no | driver coverage gap fixed in rig (0/3 crates honest — deliberate sequences needed); LIVES caption 9 px → #10 |
| L04 (shooter) | keys | PASS | no | instructions low contrast; no `#beats` host; boss gate at 7650 out of blind reach → #10 #15 |
| kristopher study-hall (maze-studyhall) | ap | PASS* | **no — 4/4 deaths** | wrap-blind threat distance, tunnel-row deaths → #8 |
| louis-philippe dungeon (maze) | ap | PASS* | **no — stall facts=98/136** | same wrap-blind class → #8 |
| simone death-star-run (star-racer) | keys | PASS | no (loss 0:40) | inverted climb mapping (↑ → floor) → #12 |
| mark-abdallah slingshot (slingshot) | pointer | PASS | no | rig drag fixed (2/3 pebbles fired); duck lead out of scripted reach; EN-only controls → #16 |
| matt-mayer space-mission (space-mission) | bot | sims PASS, rig timebox | no (needs ~11–12 min real) | telemetry HUD collision; legacy banner in moon flow → #15 |
| amir-kermany nano-cure (nano-cure) | bot | sims PASS | **no — live boss death t≈51 s** | live-vs-sims divergence; FR-only boss HUD → #7 #16 |
| ian-spence rewind-loop (rewind) | bot | sims **FAIL (predates cascade)** | death=win only | gate never flips (195/200 ft), loops=0, portalsHit=0 → #6 |
| marc-larochelle survival (survival) | keys | PASS | no (bank empty 33 s) | opening volleys too dense for first-timers → #14 |
| miray-kavruk world-tour (world-tour) | bot | sims PASS | **YES t=217 s**, beats=41 | healthy — controls EN+FR, lives HUD, win path all verified |

\* maze gates PASS on boot/console; the win gate correctly failed once the rig's honest-loss fix landed (the false `win:true` masked these until the clusters caught it — rig fixed during the cascade).

## Static hardening review (SR-E)

13 findings, 1 high / 2 medium / 10 low — `docs/playtest/findings/static-review.json` + concern×file matrix `static-matrix.json`. Highlights: v1-save migration throws on wrong-typed JSON → **black boot screen** (#9); DPR change leaves a blurry backing store (#13); kiosk pending queue never re-flushed (#17); no visibilitychange guard; genre `exit()` never invoked (#19); audio `ac.resume()` unawaited + `<audio>` accumulation (#18); serve.py path-containment/64KB-truncation/pending-growth (#17).

**Kiosk review:** serve.py + intake verified statically; one clearly-marked live test POST (`PLAYTEST-CASCADE-TEST`) returned 200 `{"ok":true,"queued":true}` and the queue file was restored byte-identical afterwards.

## Cross-cutting observations

- **Heart-bank works end-to-end**: spend on loss verified on L01 (♥3→2), nano-cure (♥2 remaining), survival (♥x0 → hard TRY AGAIN).
- **Booth branding**: `assets/logo-all.svg` / `logo-in.svg` are referenced but missing — every boot logs the 404 pair (#11).
- **Bilingual contract**: only world-tour/matt levels ship the intended EN+FR double-line controls; every genre module is EN-only (#16).
- **Rig fixes landed during the cascade** (committed): honest loss verdicts (loss-word check now gates), URL-based network gate, runtime-mapped slingshot drag, puzzle driver down/Z/R, `?debugShooter=1` seam, `read()`-style globals, early edge windows (`min(70% budget, 20 s)`).

## Appendix — conservative choices & fallbacks (unattended run)

- The plan's "known-good reference" premise for ian-spence was stale: the committed `sim-results.json` on `main` was **already red** (predates the cascade, suspect `a670292`). The rig acceptance was amended to *agreement with the reference verdict* (both observe the early death-win) + green boot/console gates; the regression itself is filed as #6.
- Two clusters hit the 30-min subagent lifetime cap (PT-C, PT-D); their remaining work was completed by narrow follow-up agents (PT-C2, PT-D2) against the already-collected evidence.
- `rm -rf` is auto-denied unattended: evidence dirs were `mv`-ed to `/tmp/playtest-raw/stale/` instead of deleted; originals of overwritten evidence were restored as `sim-results-original.json`.
- Raw `.webm` videos stay in `/tmp/playtest-raw/` (gitignored by this branch); committed evidence is the curated subset (≤8 sheets + all finding stills per level).
- Rig re-runs during curation: L03 (240 s, fixed driver) and the four refreshed verdict runs (nano-cure, survival, both mazes) — findings JSONs reference the current files.
