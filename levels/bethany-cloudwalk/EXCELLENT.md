# EXCELLENT.md — Cloudwalk (Bethany's level, L1 of ALL IN ARCADE) — v9 (visual overhaul)

> **Addendum (issue #20 contrast sweep, 2026-09-20 — engine-side, visual only):**
> the shared platformer painter gained hero locatability fixes that apply here:
> respawn blink is now an alpha flicker (0.35, never a skipped draw), the hero
> renders 46 px (hitbox still 24×32) with a soft warm rim halo over the dark
> bottom band, and cloud runs paint a soft underside shadow strip (α≤0.13,
> strictly below the cloud base) so pits read as pits (B1/G2). `level.data`
> rows remain byte-identical to v8/v9; physics path untouched.

My own bar for what "excellent" means for the **first level a real attendee ever built** at the
All In booth. Bethany asked for *"a platformer that looks something like the cloud level from
Super Mario Bros."* — so the bar is SMB 1-1 energy: instant recognition, an easy main path,
optional heights for the kids, everything readable on one screen. v9 is a **visual-only pass**:
`level.data` (rows/spikes/coins/spawn/goal) is byte-identical to v8; the physics code path
(`src/genres/platformer.js` `update()`) is untouched. Every item is concrete and gradeable — and
the physics-derived items were verified with a frame-exact simulation of the engine's own
`platformer.js` (tile T=40, run 3.6 px/frame, jump apex ≈ 3.5 tiles, tap-hop ≈ 1–1.5 tiles,
jump-buffer 0.12 s, coyote 0.09 s, one-way clouds, spike hitbox 30×24 px, fall plane worldH+160).

Hard caps I design against: rows ≤ 24 chars × ≤ 12 rows → the world is exactly one screen
(960×480), no camera scroll. 3 hearts; a pit fall or spike = −1 heart; 0 hearts = fail.

**2026-09-17 — operator directive: the entire game uses real art. No emoji actors, and no emoji
fallbacks — anywhere.** See the Art Implementation Notes at the bottom.

---

## A. Theme & first impression
- **A1.** Within ~1 s of boot it reads as "the SMB cloud level": the real ALL IN event-photo
  gradient (`backdrop: "allin"` → `assets/backdrops/allin-gredient-bg.jpg`, azure-blue sky into
  a rose horizon, gentle breathing aurora washes), floor + all platforms are fluffy one-way
  clouds (`platform: cloud`), the player is a hand-drawn mushroom-cap mushroom runner, pickups
  are hand-drawn gold stars. Grade: screenshot.
- **A2.** Whole playable world on one screen; the flag is visible before the first move.

## B. Readability & path guidance
- **B1.** Every pit reads as a pit: gaps are open to void. The parallax cloud *banks* of the
  old `backdrop: "clouds"` preset are gone — nothing low and cloud-like could be mistaken for
  walkable ground below row 8 (the photo backdrop only supplies high-sky washes; game clouds are
  the crisp platform blobs).
- **B2.** The intended route is star-marked: A gold-star coin (with ink outline + glow) is the
  walk-leader right of spawn, reward stars sit ON landings (not mid-arc bands the physics can't
  reliably hit), a star marks the spike, and the last star rides directly above the flagpole.
  Follower-of-coins never meets an untelegraphed hazard.
- **B3.** The sky route is *visually invited* (two tiered islands left→right with stars on top)
  but never required: the main path is flat clouds the whole way.

## C. Teach → test difficulty curve (left→right)
- **C1. Teach** (cols 0–4): flat walk, 3 feel-good pickups, no hazard.
- **C2. First hop** (pit 1, 2 tiles): clearable from any speed, incl. from a dead stop.
- **C3. Tier-1 sky lesson** (cloud island 1, cols 8–10, one tile up): a tap-hop up with a star
  on its summit — teaches "clouds above can be landed on" with zero risk.
- **C4. Tier-2 sky lesson** (cloud island 2, cols 10–11, two tiles above col 7–11): a medium
  hop teaches height control, hands out 2 stars, then you either carry on or walk off to the
  main path (drop is over safe ground, never a pit).
- **C5. New-mechanic test** (spike, col 17): the level's only `^`, 30 px wide, flat 2-tile
  runway before it, one star directly above the it. Spike = knockback + i-frames, not instant
  loss.
- **C6. Finale** (pit 3, 2 tiles) → last star + gold pennant together at the flag. Last beat is
  a celebration; the jump into the flagpole collects the last star mid-arc ("hug the pole"
  moment).
- **C7.** Nothing demands a pixel-perfect jump: max pit = 2 tiles everywhere; the only hold-dial
  skill is the *optional* island-2 hop (~0.25–0.4 s hold) and the spike-star tap.

## D. Fairness & safety (verified in sim, unchanged by the art pass)
- **D1.** ✅ Every 2-tile pit clears from a **dead stop** (sim: player parked at each pit's
  left edge; pit 3 even wins from standstill). Full-run carry ≈ 4 tiles + body/edge grace ≫
  2-tile requirement.
- **D2.** No softlock: pits are lethal via the fall plane; all platforms are one-way, so you can
  always jump back down; the island-2 walk-off lands on safe ground at col 14–15 with ≥ 60 px
  (≈ 0.3 s) of flat runway before the spike.
- **D3.** Respawn is calm: 4 flat tiles around spawn, 1.2 s i-frames — standing still never
  double-faults.
- **D4.** The sky walk-off, the spike hop, and the flag arc are all validated with margin:
  landing zones ≥ 2 tiles, spike clearance mid-arc ≥ 30 px above the spike top at 216 px/s.
- **D5.** Star economy: 6/6 stars can be collected in **one run** (sim-verified route family:
  walk-leader → island-1 star (→ island-2 both stars → spike-hop star → flag star),
  WIN at ~4 s sim-time); fast play still wins with ≥ 4 stars, so mastery adds stars, not
  survival.

## E. Feel (engine behaviors I lean on, not change)
- **E1.** Coyote + buffer make every beat forgiving; tap = short hop (1 tile), hold = full arc —
  both are *wanted* (taps hop the islands; full carry clears pits and the final leap).
- **E2.** Spike = knockback + 1.2 s i-frames; a first-timer who brushes it keeps playing.
- **E3.** HUD shows the star count (★) and heart lives (♥); falls visibly cost one before
  instant respawn.

## F. Pacing (booth reality: a line behind you)
- **F1.** Confident-minded path: spawn → flag ≈ **10–20 s** real-time (4 s flat in sim).
- **F2.** Typical attendee with reading time + one death + retry: **≈ 30–70 s**.
- **F3.** A struggling player (2 deaths + route fussing) still finishes ≲ 90 s — one-screen
  world, instant respawn, no long walk of shame. (Honest note: the 24-tile hard cap means
  pacing is carried by 3 pits + 1 spike + a 2-island sky route + 6 stars, not walking distance.)

## G. Visual polish — v9 art system (all Route A, in-canvas, zero downloads)
- **G1.** Backdrop = the real ALL IN event-site banner gradient (photo, cover-fit) + three
  breathing accent washes (gold `#ffcf3e` / violet `#8a7cff` / magenta `#ff3d9a`) + gentle
  bottom vignette, straight from the shared `drawBackdrop` "allin" preset. SMB sky
  `#2e6ee0 → #5aa4f2 → #a8d4ff` remains the offline fallback if the photo file is missing.
- **G2.** Platforms render as contiguous fluffy cloud blobs (engine `drawCloud`); pits stay
  visibly pits — no seams between adjacent cloud cells.
- **G3.** Spikes are gold gradient triangles with a deep-ink outline; the goal is a white pole
  with a **hand-drawn waving gold pennant** (live sine wave, ink outline, white star emblem).
- **G4.** HUD: star-count `★ 0/6` and hearts `♥♥♥` (pure text-presentation glyphs — no emoji);
  boot banner stays legible for its 3.2 s; HUD shows from frame one.

## H. Data hygiene
- **H1.** `prompt` keeps Bethany's words **verbatim**; `authors` = exactly
  `[{"name":"Bethany Edmonds","kind":"original"}]`; no email anywhere in the level file.
- **H2.** All 11 rows exactly 24 chars, legend chars only, one `P`, one `G`, air above `P`,
  `G` on a ground tile, spike on a ground tile with landing clearance both sides. **v9 rows are
  byte-identical to v8** (visual-only pass).
- **H3.** `version` bumped per iteration (v9); `status` = ready; `style.glyphs` block REMOVED —
  the engine no longer reads glyphs and the file carries zero emoji.

## Art implementation notes (2026-09-17 visual overhaul — Route A, hand-drawn)
**Source: Route A only — everything is drawn procedurally on canvas at boot by
`src/genres/platformer.js` (baked once into offscreen canvases via the shared
`sprite()`/`blit()` bakery in `src/core.js`). No downloads, no CC0 packs, no attribution
obligations; nothing to add to `assets/CREDITS.md`.**

- **Player** — cream-stem mushroom runner with crimson spotted cap: gradient cap, cream rim +
  three spots, ink-outline (`#1d1433`) silhouette, glint + rosy cheeks + smile, two baked
  frames (idle / run-stride), facing flip while walking, velocity lean rotation, ambient
  contact shadow so he *sits on* the cloud instead of floating.
- **Star coins** — five-point gold star, ink outline, soft glow rim, specular tick; gentle bob
  (physics carried from the old emoji phase: same radius/positions) + slow rotation drift.
- **Goal** — pole kept; waving gold pennant drawn live (canvas path, sine wave) with ink
  outline + star emblem.
- **Spikes** — same triangle geometry as v8, now gold gradient + ink outline so it beats the
  rose/azure photo bands.
- **Seasons-mechanic art** (shared, used by Nicolas's level when it boots): the snowball ball
  is unchanged physics-wise; the melt-sun is now a layered radial glow + wheeling rays;
  snow pickups are six-arm crystals; HUD reads `★ n/6 · BALL 88%` / `♥♥♥` instead of emoji.
- **Contrast strategy:** every actor carries a deep-ink outline (#1d1433 family) + warm glow
  rim — dark against BOTH the azure mid-band and the rose corner of the event photo; white
  clouds are the brightest element on screen so the walkable surface never competes with
  actors.

## Verification log (2026-09-17)
- Rig: project-scoped throwaway rig `.rig-bethany/` (serve.py — port **8241**, private; the
  real booth is :8181). Booted `?level=bethany-cloudwalk` straight to play.
- Boot state screenshot captured: photo gradient behind, cloud platforms, mushroom hero with
  contact shadow, gold star coins above clouds, gold outlined spike, waving pennant at the
  flag, HUD `★ 0/6` + `♥♥♥`. **Zero console errors** at boot (only pre-existing 404s for the
  not-yet-ripped `assets/logo-*.svg` brand files — gradient fallback handles it).
- Synthetic-key drive + mid-gameplay screenshot: blocked this session by shared-tab contention
  (sibling chats raced the one internal browser tab; the tab was closed under the rig mid-run —
  documented booth hazard, `project_booth-browser-tab`). Boot-state evidence + a full code
  review pass of every edited draw path stand in; physics code was untouched, so sim-strategy
  findings from v7 remain valid.
- Emoji audit: repo-wide scan shows ZERO emoji anywhere in the runtime render path — level
  JSONs, `src/*.js`, `index.html`. Leftover emoji lives ONLY in non-render docs/dev pages
  (README, per-level EXCELLENT.md histories, levelctl.py sample-help text, L03 harness.html,
  L04 play.html) and in the brand-new marc-larochelle draft level (its `style.glyphs` is
  inert — the engine ignores glyphs; when that level boots it gets the real-art actors).
- Cleanup: rig server stopped; `.rig-bethany/` copy left in place pending operator-approved
  deletion (`rm -rf` was auto-denied without a prompt to approve). Inert — not served by
  anything.

### Late-session close-out (same day, continuation turn)
- **Decisions:** a proposed per-level fork (`src/genres/bethany-cloud-platformer.js` — auto-
  selected option while a permission prompt sat idle) was **dropped**: the shared
  `platformer.js` was already patched centrally with the identical Route A art, so a fork
  would duplicate ~300 lines and diverge physics. Central-first stands.
- **Fresh rig:** `/tmp/allin-l1-8242/` (rm-guard blocked earlier /tmp cleanup; fresh dir
  avoids `.rig-bethany`'s stale-copy trap). Full copy of index.html + src + levels + assets,
  `serve.py --port 8242`. Backdrop photo served (200). Private rig = no booth impact.
- **Playtest harness v2** (`levels/bethany-cloudwalk/playtest.html`): self-running three-beat
  drive at module load — banner state (f≈130) → mid-arc hop (walk 40 + held-jump 70) → deep
  route (+230). `jumpJust` tied to `up` alone so pure walks don't buffer-hop. Renders the
  REAL `platformer.js` + real level data; `<base href="/">` makes the photo backdrop load
  (nested-page 404 from before is gone). Two paren typos in the beat table fixed after the
  first run surfaced `Unexpected token ')'` (counted ×2 in console). Driver hearts run out
  by f≈470 (`FAIL`) — accepted: tiles are genuine gameplay frames, and hazard art reads
  clean through the deep route.
- **Evidence artifacts** (chat media dir): `cw-beat-1-start.jpg` (banner + spawn + pennant +
  stars), `cw-beat-2-mid.jpg` (runner mid-air over tier island, star beside, spike below),
  `cw-beat-3-deep.jpg` (deep route at the spike section, flag in frame).
- **Capture-path note (booth hazard materialized):** internal-browser screenshot bridge was
  down this session (guest-view UnknownVizError / "No browser tabs open" flapping; headless
  Brave hangs — `--virtual-time-budget` never fires under `--headless=new`). Evidence was
  extracted WITHOUT the compositor: harness paints beats into `<img>` data-URL tiles in the
  DOM, `page.getAttribute(src)` pulls them, a python one-liner decodes to JPEG. Zero console
  errors confirmed on both the live tab and a headless boot log (h1/h5 captures; only the
  expected AudioContext gesture INFO lines).
- **Emoji re-audit (final):** repo-wide scan — zero emoji in runtime render paths
  (`src/**`, levels' render-reachable JSON, `index.html`). Remaining symbols are the
  agreed text-presentation HUD glyphs (★/♥/✓/▶) and marc-larochelle's WIP `survival.js`
  `⚠` HUD prefix (their active file — replace with a word like `CLOSE!` when they next
  iterate; flagged to the coordinator).
- **Cleanup:** rig :8242 stopped; shared internal tab returned to `http://localhost:8181/`
  (booth's own Python server, verified LISTEN). Playtest page + evidence artifacts remain
  on disk for re-verification.
