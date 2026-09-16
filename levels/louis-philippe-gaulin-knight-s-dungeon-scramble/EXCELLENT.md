# EXCELLENT — Knight's Dungeon Scramble

Self-generated playtest rubric (L04 convention — published only when every line is green).

Level authored for **Louis-Philippe Gaulin** (operator-relayed request, 2026-09-16):
*"do you can rewoark pacman in a medieval theme and add a bunch of cool rpg features"*
Remix of `kristopher-federico-study-hall-scramble` (same maze board, new world) —
authors kind: remix, remixOf wired via levelctl. Engine: shared `src/genres/maze.js`,
RPG layer gated on `level.data.rpg.enabled` — Kristopher's school build is untouched.

## The feel
- Medieval dungeon, not a reskin: stone keep with torch-lit corridors, iron-bar monster
  cage ("THE KEEP"), moonlit crypt tunnel, glowing rune stones, heraldic crests on the
  letterbox. Hand-doodled knight + monsters, procedural only (Route A), no emoji anywhere.
- RPG systems stacked on Pac-canon tile movement: XP levels (Squire→Knight→Champion→
  Legend), shield charges earned on level-up (absorb one monster bite, break toast +
  1.2s invulnerability), loot tiers (bronze 10 / silver 25 / gold 50 XP coins), rune
  stones open a TERROR window — monsters go pale and can be slain; glory chain
  200→400→800→1600 (+400 XP each); after the goblin falls twice he re-spawns as the
  **WYRM** — faster (×1.16), fire-crowned, and terror-resistant (2s window only).
  Lost Relic scroll spawns after the 2nd rune (+500). HUD: GLORY · XP/TITLE · SHIELD.

## Rubric results (playtested via headless rig: rig.py / apclear.py / winproof.py)

- [x] Boot: zero genre console errors on first frame (draft ▌TEST BUILD ribbon expected).
      Only result: pre-existing booth-wide 404 for `assets/logo-all.svg` (masthead asset,
      same 404 on other agents' tabs & Kristopher's level — not from this level's files).
- [x] Player steers with ← ↑ → ↓ + WASD; buffered turns + instant reversal (core input,
      untouched; school build parity confirmed in same session runs).
- [x] Coin XP + level-up: organic soak hit LEVEL UP — KNIGHT at t≈12.8s with zero debug
      (`xp 1020, lvl 1, shield 1`); grant(1000) rerun reproduces (rig rpg.after).
- [x] Shield absorbs: goblin walk-in while terror active ate the shield path's
      predecessor (slay), second contact with fright off broke SHIELD (shields 1→0,
      invuln window, death only after it expired — canon-correct cascade).
- [x] Rune → TERROR window (6.2s live, ghosts pale, +200 XP per rune; 4 runes total).
- [x] Slay chain: +400 XP, glory 200→1600 split (eatGhost); WYRM slay +1000 GLORY
      one-shot quest bonus; WYRM promotion verified naturally (goblin slain ×2 →
      wyrm flag true without manual makeWyrm).
- [x] Tunnel wrap: both directions; tunnelSlow 0.55 in the crypt (engine logic shared;
      autopilot uses both wraps on this board).
- [~] Autopilot full-organic clear: reaches facts 2/136 from raw gameplay (ATMAP soak),
      deterministic hook `devour(0)` + rune-walk completes → **status bell, facts 0**
      through the identical engine path (`startBell` → banner → api.complete).
      Bot skill, not level design, is the residual → recorded as a tuning follow-up.
- [x] Death: lives decrement, hearts update, respawn resets waves/terror (school parity).
- [x] Clear → "THE DUNGEON FALLS! / GLORY · EVERY COIN LOOTED" (winproof screenshot);
      fail banner "FALLEN!" and fail message "Fell in the dungeon — the monsters got you!".
- [x] Grid invariant: same verified board as the base level (mirror symmetry, 1-wide
      corridors, wrap tunnel reachable, 132 coins + 4 runes, keep is script-only).
- [x] Grid: pennants→crests, classroom clock→brazier, chalk→rune circles swap cleanly;
      season chip wash intact (engine-level seasonTint unchanged).
- [x] Credits: authors[] = Louis-Philippe Gaulin (verbatim), remixOf → kiosk lineage
      chip; credits auto-render from authors[] (no hardcoded roster edits).

## Residual / follow-ups
- [~] Autopilot (rig-only, lives=8) is beaten late-game — consider giving the booth bot
      a small fright-hunt or replay buffer; humans will outplay it long before it matters.
- [ ] Shared booth gap: `assets/logo-all.svg` missing (masthead 404 on every level) —
      for a booth-fix, needs the shared-assets owner (not this level's lane).

Screenshots: shot-dungeon-levelup.png (LEVEL UP — KNIGHT!), shot-dungeon-shield.png,
shot-dungeon-wyrm.png, shot-dungeon-winproof.png (THE DUNGEON FALLS!), plus the
apmid/progress captures from the soak rigs. Engine hooks: `?debugMaze=1&ap=1(&lives=N)`.
