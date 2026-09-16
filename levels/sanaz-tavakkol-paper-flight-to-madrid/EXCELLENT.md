# EXCELLENT — "Paper Flight to Madrid" · sanaz-tavakkol-paper-flight-to-madrid (Sanaz Tavakkol)

Self-rubric (booth protocol, written BEFORE tuning). Genre owner: `src/genres/paper-flight.js` (my lane only).
Loop: HANGAR (rooftop aim: drag = angle + power) → FLIGHT (tilt the nose: dive gains speed,
pull-up converts speed to lift; thermals lift; birds bonk but never harm) → RESULT (km + ★) →
SHOP (some buys help, some clearly-marked decoys tempt) → throw again. NO death, NO timer, NO
lives — every throw banks money. WIN: one single flight reaches Madrid (536 km), confetti of
tiny paper planes + medal, `api.complete`, back to attract.

## The pitch (Sanaz's booth relay, final assent verbatim in level.json.prompt)
Fly over Spain from Seville to Madrid: countryside, villages, farmers, mountains below; sparse
coins ("every 30 seconds, not every 1 second"); birds to kind-of-dodge; she dreams of ~5 minutes
of play — mapped by the operator to: reach Madrid around throw 6–8, free replay, no grind.

## Rubric (check each at publish time with sim.py live+fixed-dt evidence)
- [ ] R1 BOOT — live boot `?level=<id>&bot=1&flavor=good&debug=1&beats=1` on a private serve
      port: zero page errors, zero console errors (logo-404 booth-wide noise filtered).
- [ ] R2 SHARED FILES — zero edits outside `levels/<id>/` + `src/genres/paper-flight.js` +
      this folder's rigs. No git commits (coordinator owns commits).
- [ ] R3 PROMPT SACRED — level.json prompt byte-identical to the booth relay (diff-proof);
      attendee name exactly "Sanaz Tavakkol"; NO email anywhere (validator enforces).
- [ ] R4 REAL ART — every actor Route A procedural, zero emoji, zero style.glyphs in
      level.json, zero glyph-fallbacks: kid (2 frames idle/aim), paper plane (fold crease +
      flex frames), coins/stars (folded paper shapes), birds (flocking V, wings), thermals
      (riser shimmer), 9 regional ground layers (Guadalquivir river, Écija sunflowers,
      Córdoba mosque arches, Andújar hills, Valdepeñas vineyards, La Mancha wheat,
      Criptana windmills turning, Aranjuez gardens, Madrid skyline + target flag),
      rooftop plaza + tiled roof + chimney pots + throw-aim guide, confetti planes, medal.
      Allowed HUD vocabulary only: ★ ♥ ✓ ▶ ▲ ▼ + plain words (FR/EN).
- [ ] R5 CONTROLS — drag-to-throw (angle + power from drag vector, slingshot-style, kiosk
      hands), flight tilt via ←→/↑↓/ZQSD (nose up/down), shop navigable by mouse AND keyboard
      (arrows + Space buy + Enter close). Space = skip through result.
- [ ] R6 PACING+LOOP — HANGAR→FLIGHT→RESULT→SHOP→HANGAR forever; every throw banks coins
      (money never lost); no fail state anywhere (api.fail never called); free replay.
- [ ] R7 FLIGHT MODEL — deterministic fixed 1/60 dt (accumulator; no wall-clock inside sim),
      mulberry32(seed + throw#) RNG; lift∝v·AOA clamped, drag∝v²+AOA-spend, dive↔soar energy
      loop, thermals with stars + coin trails, glide ↔ fade; land = paper flutter always.
- [ ] R8 SCENERY BY KM — route strip Seville→Madrid with plane marker; alt/speed/★ HUD;
      regions appear in order: Guadalquivir, Écija, Córdoba, Andújar, Valdepeñas,
      La Mancha wheat, Criptana windmills, Aranjuez, Madrid skyline + flag.
- [ ] R9 BIRDS — flocks cross flight height; bump = gentle bonk (vx×0.82, vy jitter, feather
      puff, bird flies off unhurt); wobble decays; sticker-pack decoy wobbles LONGER. NO harm,
      NO fail, birds never kill.
- [ ] R10 ECONOMY — coins/throw bands hit: throw1 ≈ 18–30 · mid ≈ 45–70 · late ≈ 80–120.
      Shop: good line gloves 40/90/180 · fold 60/140/260 · wax 50/110 · nose 30/70 ·
      tail 45/100; decoys stickers 25 / thick 20 / ribbon 30 — HONEST ▲/▼ stats shown;
      decoys VERIFIABLY harmful (same-pilot sims, ≤ −8% km each).
- [ ] R11 WIN — one flight ≥ 536 km lands in Madrid: confetti planes over Plaza Mayor,
      medal, api.complete payload exactly {throws, bestKm, km, coinsEarned, coinsSpent, t,
      season}; competent play wins ~throw 6–8 (sims proven).
- [ ] R12 BOT FLAVORS — ?bot=1&flavor=good|partial|clumsy:
      good = optimal buys + dive-soar + thermal rides → wins ~throw 6–8;
      partial = decent throws, skips thermals, buys ONE decoy mid-way → wins ~throw 9–12;
      clumsy = strong throws, never rides thermals, buys decoys greedily → must NOT win
      within throw 12 (proves shop truth); all three deterministic (fixed-dt sims).
- [ ] R13 KID + ROOFTOP + SHOP SCENES — rooftop of Seville blocks (Giralda silhouette),
      kid 2-frame animation (idle breathe / aim stretch), shop rows with prices + ▲/▼
      truth marks + "buying back" affordances — all canvas-drawn Route A.
- [ ] R14 THUMB-SAFE — stub-api create (eng minimal, audio unlocked:false, neutral input
      60–120 steps) + draw + toDataURL OK; no crash in the title carousel.
- [ ] R15 DEBUG SEAMS — ?debug=1 → window.__PLANE { state(), timeScale } read-only +
      timescale for sims; ?beats=1 → DOM beat tiles at scene transitions.
- [ ] R16 AUDIO — style.music "chill" (assets/audio/chill.mp3), sfx via api.audio.sfx only
      (coin · jump-less glide whooshes via existing lib: select/hit/powerup/1up/win/etc);
      musicOn/sfxOn respected; NEVER edit src/audio.js.
- [ ] R17 API + PUBLISH — `python3 levelctl.py validate <id>` prints OK (custom-genre note
      fine), then `status ready`; sim.py modes live|sims|thumbs in my folder writing
      sim-results.json + shot-*.png; teardown: point tab back at :8181, report throwaway
      port(s) used.

## Tuning ledger (fill from sims BEFORE publish)
- throw curve: raw ≈ __ km · skilled ≈ __ km · throw when winning ≈ throw #__
- coins/throw: t1 __ · mid __ · late __
- good bot: won @ throw __ · partial __ · clumsy still km __ at throw 12
- decoy deltas (fresh same pilot): stickers __% · thick __% · ribbon __%
