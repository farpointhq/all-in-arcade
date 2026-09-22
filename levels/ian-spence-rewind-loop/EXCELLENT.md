# EXCELLENT — ian-spence-rewind-loop · "Rewind Loop" (genre: rewind)

Owner lane: this level + `src/genres/rewind.js` only. Shared files untouched (app.js/core.js/audio.js/serve.py/levelctl.py clean).

**Verified by:** the four-mode sim rig (`levels/ian-spence-rewind-loop/sim.py`, Playwright-headless Chromium, `--mute-audio`): `layout` (structural deck/portal asserts via the `window.__REW.layout()` seam), `sims` (fixed-dt dt=1/60 in-page bot runs, one page per flavor), `live` (real app boot at 4× with the good bot), `thumbs` (stub-api pipeline). Results in `levels/ian-spence-rewind-loop/sim-results.json`.

## Verdict (2026-09-22, issue #6 re-verification) — READY, full paradox trace proven

- **The gate is reachable and the whole loop fires — verified, not rationalized.** Live boot of the real app: gate flip at t≈24 s, phase-2 descent, exit-portal capture (LOOP ×1) at t≈49 s, death-win at t≈72 s; beats boot-view → mid-climb → gate-flip → phase2-descent → loop-1 all fire; the booth result overlay appears. The old verdict's caveat ("the auto-trace rarely shows the full climb → gate-flip → descent → exit-portal loop") is retired: the shipped generator walled the gate off (terrace gaps 110–146 px, a 549 px plateau wall) — the level had shipped red for bots AND humans.
- **Layout (issue #6 fix):** a 23-deck overlap stair — every consecutive deck pair overlaps ≥ 10 px with rise ≤ 90 px (hop apex ~124 px leaves margin, so the whole next deck is the landing window); terraces are contiguous budget-guarded planks (emitted only while the remaining x affords ~140 px per 71 px of climb + a 450 px reserve); a post-loop ladder + flat sky-bridge connect the stair to the gate plateau (rise ≤ 90, overlap ≥ 10); every non-plateau deck keeps y ≥ 296 so only the plateau can satisfy the flip predicate; the launch pad ends ~90 px short of the spawn line so the phase-2 descent drops onto the floor LEFT of the exit core (a pad over the core strands the bot ratchet-locked above the capture disc). All asserted every run by `layout` mode.
- **Bots (deterministic, fixed-dt):** good — full trace, dies after the exit loop (loops 1, portalsHit 1, survived 57.6 s); partial — eats lane portal A on its deck line, rewinds, stands dead still, dies (loops 1, portalsHit 1, 58.0 s); clumsy — walks into the first terraced walker (12.6 s). Every run ends with exactly one `api.complete()`, `cause:"died"`; `api.fail` is never called.
- **Enemy policy notes (no nerfs):** perchers are pool-restricted to decks continuing their right-hand neighbour's level and off lane-portal anchor decks — on a rise deck a guardian clamps to the deck's right edge where every hop from below must land and its chase reversal closes the last ~20 px mid-air (safe-jump window ≈ 1 px — unpassable for any policy). The good bot walks under a wraith hovering above its walk line (a hop rises through the kill sphere), hops wraiths/birds late (180 px, crossing near the apex; head-on closure 332 px/s eats an early 240 px hop), and holds jumps inside a lane portal's landing dead-zone (~30 px wide) where the arc's falling crossing would touch the capture disc.
- **Not consistent yet:** nothing blocks launch. The exit portal still only arms in phase 2 — the "you made it — again?" trap is the joke, and it now actually springs.

## Rubric

- [x] R1 boot: live `?level=ian-spence-rewind-loop&bot=1&flavor=good&debug=1&beats=1` boots at 4× and completes the full trace; zero console errors beyond the booth-wide `logo-all.svg`/`logo-in.svg` 404s (asserted against the network response list — console 404 text carries no URL).
- [x] R2 no emoji/glyphs: `style.glyphs` absent; painters only. ◄ ► markers are plain text.
- [x] R3 real art: hero, tape-walkers (cassette heads), rewind-wraiths, backward birds, portals, gate, decks, trees, VHS FX — all baked painters, no emoji.
- [x] R4 one-way locks: phase 1 ignores `right`, phase 2 ignores `left`; direction padlock HUD text.
- [x] R5 one level, two legs: climb left→up to the Rewind Gate; structure reverts to forced-right descent.
- [x] R6 paradox core: the only `api.complete` call site is the death path (grep-clean, run one); death = win = "Congratulations, you won by dying"; booth advances next level.
- [x] R7 portals: lane portals (phase-1-only, hop-over skill checks, sit on a deck walk line — layout-asserted), phase-2 pocket portal, exit portal at the start line rewriting the run forever — the loop counter is now VERIFIED incrementing in live and fixed-dt runs (loops 1, portalsHit 1).
- [x] R8 enemies run backwards: walkers moonwalk right-toward-you; wraith snatches back to its recorded past; birds fly tail-first; perchers live their rewind loop.
- [x] R9 forgiving: no pits/spikes; the overlap stair makes every deck a landing window (consecutive overlap ≥ 10 px, rise ≤ 90 px); ratchet prevents backtracking; portals slightly pull but release at the rim (48 px pull vs 15 px capture); falls land on decks/floor (the descent ends on the floor left of the exit core).
- [x] R10 gates: `api.complete` fires exactly once, after the 2.35 s VHS-rewind death cinematic; no HUD spam.
- [x] R11 pace: good/partial reach their death-win in ≈58 s of game time (full climb + descent + loop); clumsy ≈13 s; humans are expected to last minutes — that's the joke of the level.
- [x] R12 thumb-safe: stub api, 120 steps + draw + toDataURL (0 spam: no complete before grace; canvas title card renders from the spawn view).
- [x] R13 hygiene: authors: Ian Spence (Leaseweb Canada relay), verbatim-prompt created, no submit-flow, bilingual copy, level order set to 1000 (= last, after amir-kermany-nano-cure-2).
- [x] R14 lane-clean: only `levels/ian-spence-rewind-loop/*` + `src/genres/rewind.js` touched.

## Micronotes for tinkerers

- All gameplay constants live in `levels/ian-spence-rewind-loop/level.json` → `data`; the stair generator and portal pockets live in `src/genres/rewind.js` (deterministic from `data.seed`).
- Walker hesitation: within 170 px of the player, walker speed drops to 35 % — the "you can dodge these" window. Without it, the deterministic bots always trip.
- Debug: `?debug=1` → `window.__REW.timeScale` throttle, `state()` snapshots AND `layout()` (decks/portals/gate/ground/spawn for structural asserts); `?bot=1&flavor=good|partial|clumsy` scripts the bots; `?beats=1` drops DOM data-URL tiles at boot / mid-climb / gate-flip / loop / death for proof pipelines.
- Sim rig: `python3 levels/ian-spence-rewind-loop/sim.py all` runs layout + sims + live + thumbs (each mode runs standalone too). The rig self-hosts `serve.py` on its own port; launch args include `--mute-audio` (booth rule).
- Music: `chase` loop (CodeManu, CC-BY — already in the repo's CREDITS.md audio ledger).
