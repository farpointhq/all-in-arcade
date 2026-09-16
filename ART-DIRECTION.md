# ART DIRECTION — sprites & textures (booth rule)

Emoji glyphs were the prototype shortcut. Levels now ship with **real art**. Pick one route (or
mix) for every actor: player, enemies, crates, ships, goal. Emoji remain fine for tiny HUD
marks/counts — never for actors on screen.

## Route A — draw your own art (preferred: zero risk, zero downloads)

- **Canvas art at runtime** in your genre module / sprite loader: gradients, paths, chunky pixel
  blocks. Crisp at any scale, works offline, zero licensing questions.
- Palette discipline: pull accents from the shell tokens — cyan `#3ddcff`, violet `#8a7cff`,
  magenta `#ff3d9a` — plus your level's own two accents. One cohesive look per level.
- Pixel-art style rules: integer scaling, `imageSmoothingEnabled = false`, 16–24px grid,
  2–3 frames is plenty (idle / move / act). Or smooth vector silhouettes if that fits the vibe.
- Procedural textures are encouraged: noise/wave patterns for snow, sand, brick, water, starfields
  — generated in code, not downloaded.

## Route B — download free packs (license-clean only)

- **Allowed sources only:** [kenney.nl](https://kenney.nl/assets) packs (**CC0** — preferred) and
  [opengameart.org](https://opengameart.org) items explicitly marked **CC0** or **CC-BY**.
- Download at *build time* into `assets/sprites/<level-id-or-genre>/…`. **No runtime fetches,
  no CDNs, nothing outside the repo** — conference Wi-Fi is flaky and the game must boot offline.
- Log every pack in `assets/sprites/CREDITS.md`: `pack — author — license — source URL — used in
  <level-id>` (one line per pack). CC-BY requires that attribution; CC0 still gets a courtesy line.
- **Never:** ripped game assets, trademarked characters/logos, random image-search files,
  watermarked previews, AI-upscaled junk.
- If a network fetch is permission-denied twice, fall back to Route A — don't stall the build.

## Ownership (parallel-safe)

- `assets/sprites/<your-level-id>/` (or `<your-genre>/`) — **yours alone**, same as your level
  folder. `assets/sprites/shared/` for genuinely common props; check it exists before adding,
  never overwrite another agent's file.
- Load sprites with `new Image()` + `drawImage`; keep `drawBackdrop`/HUD untouched so the season
  tint and the cyber shell keep working over your art.
- **Shared genre modules** (`src/genres/platformer.js`) are out of your hands — request engine
  art/request changes in your final report; the coordinator patches centrally.

## Do-before-publish checklist (add to your rubric)

- [ ] Player, enemies/obstacles, goal use real art (Route A or B) — emoji actors are a fail.
- [ ] Frames animate at least idle/move (2 frames is fine) for characters.
- [ ] Attribution lines present in `assets/sprites/CREDITS.md` if Route B.
- [ ] Still 60–90s playable; art did not break readability or the season chip/tint.
