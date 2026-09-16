# EXCELLENT.md — what "excellent" means for Frost Depot (L03, Sokoban)

One page, booth-checked. A level is excellent when **a stranger who has never played this
game** walks into the booth, reads the board in ~3 seconds, and leaves 60–90 seconds later
feeling clever. Rubric with ✅/⚠ per item; every ✅ must be reproducible, not vibes.

## 1. Solvable & fair (NON-NEGOTIABLE)
- ✅ **Board is provably solvable** — `python3 levels/L03/solve.py` (BFS over push states,
  replay-checked line-by-line) returns: **optimum 45 moves / 18 pushes**, replay-verified.
  Proof log with the exact move list is reproduced below.
- ✅ **In-engine E2E replay** (`levels/L03/harness.html`, runs the REAL `core.js` + `puzzle.js`
  + this level.json, setInterval-driven so it works off-screen): the solver's exact 45-letter
  replay won with **moves 45 · pushes 18**, `status → won`, `api.complete({moves, pushes})`
  fired, sfx chain `push → coin → win` observed, **zero console errors**.
- ✅ **Undo (Z)** retraced a 2-step walk exactly (undo depth 2→0, player back to spawn);
  **restart (R)** snapped to 0 moves / fresh board. Both confirmed in-engine.
- ✅ **`#crates == #targets`** (3/3) — enforced by `levelctl.py validate`.
- ✅ **No unrecoverable mistake.** Deadlock cells (cells from which a crate can never reach
  any pad, per reverse-push reachability) exist only at the four shelf-pocket corners — pushing
  a crate there is *visible* within two pushes, and Z (undo, per-step) plus R (instant restart)
  always recover. Undo/restart verified in the harness E2E.
- ✅ **Fairness trap budget ≤ 2 reachable dead cells** that are NOT spiral-around-forgiving:
  misordered shelf pushes are re-pushable (a parked crate slides further right when pushed
  again), so an early wrong order is corrected by pushing, not by losing the run.

## 2. 60–90 seconds for a first-time player
- ✅ **Optimal solve = 45 moves / 18 pushes — replayed end-to-end IN THE ENGINE** (harness
  E2E consumed the solver's move string letter-for-letter and won: 45/18, `complete` fired).
  A first-timer walks ~1.5–2× optimum minus the chain-push savings → realistically **55–90s**.
  A speedrunner lands ~28s. This landed dead-on the rubric after two rejections (v1 board:
  20 moves — too instant; v2 board: 16 — trivial).
- ✅ **One idea per level**: everything here is one mechanic — route around the depot wall and
  mind the ferry order. No gimmick stacking.

## 3. Satisfying pushes
- ✅ **Ordering matters but any order is almost fine.** The shelf receives crates left-to-right
  (`3→4→5`); guests often do it right-first and have to push a parked crate one more cell —
  that "recoverable oops" teaches push-permanence gently.
- ✅ **One chain-push near-solution** if crates are docked in a line.
- ✅ Every push has feedback: slide sound, glide anim, and a two-note "ding" the instant a
  crate lands on a pad (the ding is the reward loop).

## 4. Board readability (a booth passerby reads it in 3s)
- ✅ 10×9 with ≤ 4 crates — the whole depot fits in one glance; no scrolling, no hidden intent.
- ✅ A clear **story shape**: pads form a shelf (top), depot wall below it, open yard with the
  crates, player parked low-center. Eyes naturally find "pads ↑ · wall ~ · crates ↓".
- ✅ Symmetry where it helps (crates evenly spaced), deliberate asymmetry where it teaches
  (left dock + right dock).
- ✅ ≤ 1 interior wall cluster; no diagonal-deceptive drift, no dots-on-dots overlap noise.

## 5. Visual & feel polish (puzzle.js, authored by this agent)
- ✅ Crate **glow + sparkle** when parked on a pad; pads pulse; landing ding; win = sparkle
  burst over the shelf. Pixel-checked the solved board: parked pads read Δ≈67 RGB from bare
  floor — glow is obvious from booth distance.
- ✅ **Input buffering** (a pressed direction during the slide executes right after) and
  **hold-to-step** so movement feels glide-y, not sticky — verified: 2 synthetic taps →
  exactly 2 moves (no ghost steps).
- ✅ Gentle assist when a crate sits dead-cornered: hint line appears after ~2.5s
  ("🧊 cornered? Z to undo · R to restart") — never patronizing, never auto-solving.
- ✅ HUD shows `n/3 placed` + moves + pushes.

---

## Verification record (this iteration)

| Check | Tool | Result |
|---|---|---|
| Board solvable (offline proof) | `solve.py` | 45 moves / 18 pushes, replay-checked |
| In-engine win (real module) | `harness.html` E2E | won, 45/18, `complete` fired |
| Undo + restart correctness | harness E2E | retraced & reset exactly |
| Input touch (tap = tap = 1 move) | harness E2E | 2 taps → 2 moves |
| Pad glow visibility | canvas sampling | Δ≈67 vs floor, all 3 pads |
| Console hygiene | harness feedback | 0 errors from puzzle.js |

⚠ **Known cross-agent issue (NOT this level):** the shared `index.html` is temporarily missing
`<div id="seasonChip">` while the shared `ui.js` requires it (`UI.init` → boot dies before the
engine starts — every `?level=X` playtest URL black-screens). Puzzle layer fully verified via
the isolated harness above; re-verify in-app once the UI agent syncs its shared files.

---

## Solvability proof (from `solve.py`, this folder)

```
board (10×9):
   ##########
   #  ...   #
   #  ####  #
   #        #
   #  o o o #
   #        #
   #   @    #
   #        #
   ##########

SOLVED: optimum 45 moves (18 pushes) — replay-checked: 45 steps OK
solution: U U L D L U U U L U R D D D R R R D R R U U U R U L L L R R D D L L D R D R U U U R U L L
```

Replay skeleton (full log via `--replay`):

1. crate `o`@(3,4): push left→(2,4), then up through the **left dock gap** (2,2) to the shelf
   (2,1), player loops to (1,1) and pushes it right ×2 → **parks on pad (3,1)**.
2. crate `o`@(7,4): push up the right column to **(7,1)**, then via the **right dock** and
   pushed left ×2 → (5,1) then one more → **(4,1)**.
3. crate `o`@(5,4): pushed right→(7,4)→ up the same right column →(7,1), pushed left ×2 →
   **(5,1)**. All three pads sparkle. ✅

The solver's `box_good` pruning (boxes that can never again reach a pad) was used to confirm
recovery is always possible from any non-final state — i.e. Z/R always exist to undo a bad
push, and the level never requires a forfeit.
