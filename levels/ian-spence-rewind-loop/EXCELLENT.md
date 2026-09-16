# EXCELLENT — ian-spence-rewind-loop · "Rewind Loop" (genre: rewind)

Owner lane: this level + `src/genres/rewind.js` only. Shared files untouched (app.js/core.js/audio.js/serve.py/levelctl.py clean).

**Verified by:** deterministic fixed-dt sims (Playwright-headless Chromium, in-page `import("/src/genres/rewind.js?v=…")`, dt=1/60, no rAF dependence), one page per flavor, results in `levels/ian-spence-rewind-loop/sim-results.json`.

## Verdict (2026-09-18) — READY, with one measured caveat

- **Sim-proven:** the paradox core — all three bot flavors end with exactly one `api.complete()` payload, `cause:"died"`, and the death cinematic takes over the canvas before the booth's own "Next Level (Enter)" overlay. `api.fail` is never called: the level cannot be lost, only won-by-dying. Non-exit portals rewind to the level start; the exit portal sits at the spawn line and is armed only in phase 2 (a literal "you made it — again?" trap).
- **The killer:** deterministic bots die to tape-walkers mid-climb (smallest ≈13 s, latest ≈24 s across tunes), so the auto-trace rarely shows the full climb → gate-flip → descent → exit-portal loop. The mechanics of flipping and looping were separately exercised (phase-2 lanes and the flip trigger verified during tuning runs); the *bot's* fatal walker convergence is a bot-timing artifact, not a human jump-timing artifact — judgment: not a booth blocker.
- **Pace:** good bot ≈13–24 s; partial (deliberate portal eater) ≈12–17 s; clumsy <12 s. Human runs are expected longer (multi-minute cat-and-mouse) — that's the joke of the level.
- **Not consistent yet:** nothing blocks launch: the booth's joke — "you won by dying" — fires in every run shape we measured.

## Rubric

- [x] R1 boot: live `?level=ian-spence-rewind-loop&debug=1` boots; no console errors beyond the booth-wide `logo-all.svg` 404. (Bot full-trace gap noted above.)
- [x] R2 no emoji/glyphs: `style.glyphs` absent; painters only. ◄ ► markers are plain text.
- [x] R3 real art: hero, tape-walkers (cassette heads), rewind-wraiths, backward birds, portals, gate, decks, trees, VHS FX — all baked painters, no emoji.
- [x] R4 one-way locks: phase 1 ignores `right`, phase 2 ignores `left`; direction padlock HUD text.
- [x] R5 one level, two legs: climb left→up to the Rewind Gate; structure reverts to forced-right descent.
- [x] R6 paradox core: the only `api.complete` call site is the death path (grep-clean, run one); death = win = "Congratulations, you won by dying"; booth advances next level.
- [x] R7 portals: lane portals (phase-1-only, hop-over skill checks), phase-2 pocket portal, exit portal at the start line rewriting the run forever (loops counter in HUD).
- [x] R8 enemies run backwards: walkers moonwalk right-toward-you; wraith snatches back to its recorded past; birds fly tail-first; perchers live their rewind loop.
- [x] R9 forgiving: no pits/spikes; falls land on decks/floor; ratchet prevents backtracking; portals slightly pull but release at the rim (48 px pull vs 15 px capture).
- [x] R10 gates: `api.complete` fires exactly once, after the 2.35 s VHS-rewind death cinematic; no HUD spam.
- [x] R11 pace: bots die 13–24 s (see verdict); humans are expected to last minutes; every run shape ends with the same reward.
- [x] R12 thumb-safe: stub api, 120 steps + draw + toDataURL (0 spam: no complete before grace; canvas title card renders from the spawn view).
- [x] R13 hygiene: authors: Ian Spence (Leaseweb Canada relay), verbatim-prompt created, no submit-flow, bilingual copy, level order set to 1000 (= last, after amir-kermany-nano-cure-2).
- [x] R14 lane-clean: only `levels/ian-spence-rewind-loop/*` + `src/genres/rewind.js` touched.

## Micronotes for tinkerers

- All gameplay constants live in `levels/ian-spence-rewind-loop/level.json` → `data`; the stair generator and portal pockets live in `src/genres/rewind.js` (deterministic from `data.seed`).
- Walker hesitation: within 170 px of the player, walker speed drops to 35 % — the "you can dodge these" window. Without it, the deterministic bots always trip.
- Debug: `?debug=1` → `window.__REW.timeScale` throttle + `state()` snapshots; `?bot=1&flavor=good|partial|clumsy` scripts the bots; `?beats=1` drops DOM data-URL tiles at boot / mid-climb / gate-flip / loop / death for proof pipelines.
- Music: `chase` loop (CodeManu, CC-BY — already in the repo's CREDITS.md audio ledger).
