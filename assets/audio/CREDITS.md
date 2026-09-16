# assets/audio — music credits

Every file in this directory was downloaded from OpenGameArt.org (date of
download: 2026-09-17). License and author strings are quoted verbatim from each
item's page at download time. `src/audio.js` maps mood keys to these files
(any mood without a file falls back to the built-in synthesized loop, so the
game still plays if `assets/` goes missing).

| File              | Mood key    | Track                                     | Author     | License             | Source page                                                                        |
| ----------------- | ----------- | ----------------------------------------- | ---------- | ------------------- | ---------------------------------------------------------------------------------- |
| title.mp3         | `title`     | Worldmap Theme (Platformer Game Music Pack) | CodeManu   | CC-BY 3.0           | https://opengameart.org/content/platformer-game-music-pack                          |
| upbeat.mp3        | `upbeat`    | Grasslands Theme (same pack)              | CodeManu   | CC-BY 3.0           | https://opengameart.org/content/platformer-game-music-pack                          |
| drive.mp3         | `drive`     | Desert Theme (same pack)                  | CodeManu   | CC-BY 3.0           | https://opengameart.org/content/platformer-game-music-pack                          |
| chase.mp3         | `chase`     | Mushroom Theme (same pack)                | CodeManu   | CC-BY 3.0           | https://opengameart.org/content/platformer-game-music-pack                          |
| dungeon.mp3       | `dungeon`   | Dungeon Theme (same pack)                 | CodeManu   | CC-BY 3.0           | https://opengameart.org/content/platformer-game-music-pack                          |
| boss.mp3          | `boss`      | 8-bit Epic Space Shooter Music            | HydroGene  | CC0 / Public Domain | https://opengameart.org/content/8-bit-epic-space-shooter-music                      |
| apocalypse.mp3    | `apocalypse`| Oldschool Horror Theme (`Horror_1.mp3`)  | EmoPreben  | CC0 (public domain) | https://opengameart.org/content/oldschool-horror-theme (also in the "CC0 - Dark Music" collection) |
| chill.mp3         | `chill`     | Music loop, strong, downtempo, seamless   | Nostromo   | CC0 (public domain) | https://opengameart.org/content/music-loop-strong-downtempo-seamless                |
| space.ogg         | `space`     | Space Music: Out There                    | yd         | CC0 (Uploader: yd)  | https://opengameart.org/content/space-music-out-there                               |

Notes
- All content sound effects and the `tense` mood are synthesized at runtime by
  `src/audio.js` (WebAudio) — no external assets, no license.
- CC-BY 3.0 tracks (the CodeManu pack) require attribution: keep this file or
  equivalent credit text with any redistribution.
- The `tense` mood deliberately has no file and stays synthesized.
