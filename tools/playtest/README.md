# playtest — generic cross-level playtest rig

One rig that boots **any manifest level id** headlessly, drives it, records
video, and writes evidence. Built for the issue #4 full-game hardening
cascade; structure mirrors the house rig `levels/ian-spence-rewind-loop/sim.py`.

## Usage

```bash
python3 tools/playtest/playtest.py --level <id> [--port P] [--seconds N]
                                   [--flavor good|partial|clumsy]
                                   [--mode boot|live|bot|all] [--strict-win]
python3 tools/playtest/playtest.py --smoke-manifest          # boot-smoke all 15 ids
```

| flag | meaning |
|------|---------|
| `--level <id>` | manifest level id (required unless `--smoke-manifest`) |
| `--port P` | private `serve.py` port — **unique per agent/chat** (Fabric caches browser memory per URL; sharing a port replays another chat's cached keystrokes = phantom input) |
| `--seconds N` | play budget (default 240; smoke caps at 60) |
| `--flavor` | passed to in-module bots that support good / partial / clumsy |
| `--mode boot` | boot smoke only: canvas + clean console, no driving |
| `--mode live` | full playthrough with the genre's best play mechanism |
| `--mode bot` | force the scripted keyboard driver even on bot genres (edge-input / driver comparison; win never gated here) |
| `--mode all` | boot + live (default) |
| `--strict-win` | also gate keyboard-driven genres on reaching the win path |

**Exit 0 iff:** canvas reached · zero unfiltered console errors · zero
`pageerror` · and, for bot/autopilot genres in live/all, the win path
(`#screen-result.active` or a completed/won state flag) within budget.
Keyboard-driven genres (no in-module bot) record `win` honestly but do not
hard-fail — blind scripted input is not guaranteed to beat every level
(conservative unattended choice, documented in the playthrough report).
Override with `--strict-win`.

## Play mechanisms per genre

In-module bots / autopilots play for the rig; the rig polls, records and
asserts. Genres without one get a scripted keyboard driver (holds + taps +
edge phase: button-mashing, pause toggle, blur/refocus).

| genre | mechanism | debug global (keyed by **genre**, not name) | win gated |
|-------|-----------|---------------------------------------------|-----------|
| rewind | in-module bot `?bot=1&flavor=` | `window.__REW` | yes |
| world-tour | in-module bot `?bot=1&flavor=` | `window.__WT` | yes |
| space-mission | in-module bot `?bot=1&flavor=` | `window.__MDA` | yes |
| nano-cure | in-module bot `?bot=1&flavor=` | `window.__NANO` | yes |
| maze / maze-studyhall | `?ap=1` autopilot | `window.__TEST_API__` + `__MAZE_RUNS__`/`__MAZE_DEATHS__` | yes |
| shooter | scripted keys | `window.__shooter` | honest, not gated |
| survival | scripted keys | `window.__SR` | honest, not gated |
| star-racer | scripted keys | `window.__SR` (same name as survival — safe: one module per page) | honest, not gated |
| slingshot | scripted pointer drags | `window.__DUCK` | honest, not gated |
| platformer / puzzle / racer | scripted keys | none | honest, not gated |

Boot URL: `/?level=<id>&bot=1&flavor=<flavor>&debug=1&beats=1` (`&ap=1` for
mazes). Beats tiles (`#beats img`, `?beats=1`) are expected for platformer,
nano-cure, shooter, space-mission, rewind, world-tour.

## Port allocation (issue #4 cascade)

`8600 + (issue number % 200)`; playtest agents use 8604–8609 during phases 1–3:

| agent | port | scope |
|-------|------|-------|
| implement tab (orchestrator) | 8604 | rig build, dedupe, report, PR |
| PT-A | 8605 | platformer ×3: L01, bethany-cloudwalk, nicolas-snowball-seasons |
| PT-B | 8606 | mazes + puzzle: kristopher…, louis-philippe…, L03 |
| PT-C | 8607 | racers + slingshot + shooter: L02, simone-death-star-run, mark-abdallah…, L04 |
| PT-D | 8608 | rigged/heavy: miray-kavruk-world-tour, matt-mayer-mda-space-mission, amir-kermany-nano-cure-2, ian-spence-rewind-loop, marc-larochelle-course-apocalypse |
| SR-E | 8609 | static hardening review (port only if it boots the app) |

Anomaly protocol: if a tab behaves as if keys are pressed with none logged,
`BrowserClearMemory` on the port substring and switch to a fresh port.

## Evidence layout

```
docs/playtest/evidence/<level>/
  sim-results.json   # boot/trace/verdict/gates + console + evidence lists
  sheet-NN.png       # ffmpeg contact sheets (fps=3, scale=400, tile=5x6 ≈10 s/sheet)
  still-boot.png     # first frame after canvas
  still-win.png      # win-path moment (when reached)
  still-error.png    # first unfiltered console error / pageerror
  still-final.png    # final frame when win not reached
docs/playtest/findings/<level>.json   # per-level findings (written by playtest agents)
```

Raw `.webm` recordings land in `/tmp/playtest-raw/` (never committed — the
repo only carries curated sheets ≤8/level + finding stills).

## Verdict agreement (acceptance)

The rig's verdict on `ian-spence-rewind-loop` must agree with that level's own
deterministic rig (`levels/ian-spence-rewind-loop/sim.py`) — the known-good
reference used to accept the generic rig into the cascade.

## exit() teardown contract (issue #19)

`python3 tools/playtest/exit-teardown-sim.py [--port P]` drives the REAL scene
layer — boot → pause → level select → re-enter, level→level, plus a title
thumbnail sweep — and pins the teardown contract: every level change runs the
outgoing genre instance's `exit()` (`playScene.exit()`, drained before the next
`create()`), rewind's boot `setTimeout` dies with the session (no stray
"boot-view" beat after a sub-350 ms exit), and the `window.__REW` debug seam is
deleted on exit (never resurrects across genre switches). The per-level
`sim.py` rigs can't catch this class of bug — they call `mod.create()` directly
and never exercise the scene layer. Exit 0 only if all requested modes
(`live`, `thumbs`, default `all`) pass; writes
`exit-teardown-sim-results.json` + evidence shots in this folder.
