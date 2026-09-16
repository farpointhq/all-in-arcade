# L02 "Neon Coast GP" — what excellent looks like

Graded by actually racing the level end-to-end (booth browser, robot driver first, then
eyeballs). Each line is gradeable with a number or an observable.

## A. Speed feel
- [ ] Floor-to-top accel reads arcade-snappy: 0 → max in ≤ 2.5 s under full throttle.
- [ ] Top speed sustained on straights feels FAST: speed lines + ground scroll rate + car
      bounce all increase visibly when at ≥ 80 % throttle.
- [ ] Coast (no key) decays gently never below ~30 % in the time between pushes; brake
      (↓) drops from max to <35 % within ≈ 1 s.
- [ ] Cornering at top speed through a hard curve REQUIRES steering (centrifugal drift
      beats coast-correction), but is holdable with a single direction key.

## B. Curve rhythm
- [ ] No straight longer than ≈ 8 s without a bend, hill or traffic event.
- [ ] Bends telegraphed: a ⚠ sign (or palms gap) visible for ≥ 1.5 s before curve ≤ −15/≥ +15.
- [ ] Curve difficulty ramps: no curve harder than ±20 in the first third; first hard
      corner (|curve| ≥ 24) starts after ~40 % of track; at least three distinct hard
      corners (|curve| ≥ 24) after the midpoint.
- [ ] Final 10 s is a readable straight/gentle run to the line (no hairpin at the finish).

## C. Traffic fairness
- [ ] All traffic telegraphs: visible on-screen ≥ 2 s before possible contact at top speed
      (spawn-in happens beyond fog, never pops onto the road).
- [ ] No impossible walls: player can always find a lane or off-road gap — traffic AI
      keeps same-lane spacing (no same-lane cars slowing to a crawl-blob), lanes are
      tiered by speed (slow right / fast left) so patterns are predictable.
- [ ] Reaction budget: at closing speed ≤ 70 u/s the collision window is ≥ 0.5 s from the
      moment a car is safely readable on-screen.
- [ ] Density: a good driver meets ≈ 8–14 dodge events on a full run; a bad driver still
      finishes with ≥ 1 heart (traffic is the drama, not the wall of death).

## D. Terrain rhythm
- [ ] Hill sections every ~10–20 s; crests compress the horizon, dips reveal it (visible
      horizon movement, not a flat belt-sander road).
- [ ] Track starts and ends at the same elevation (no height cliff at the loop seam).

## E. Visual readability
- [ ] Road reads instantly at top speed: alternating light/dark bands + rumble strips +
      lane dashes; center dashes visible ≥ 3 s ahead.
- [ ] Fog is deep enough that distant sprites fade with depth (pop-in reads as fade-in).
- [ ] Sprites (palms, signs, traffic) never flash giant as they pass the camera — size
      capped so passing cars whoosh instead of nuking the screen.
- [ ] Player car banks/tilts into steering and curves; off-road gets rumble shake + dust.

## F. Finish
- [ ] FINISH banner + checkered corridor visible ≥ 3 s before the line (checker spans
      the last 16 segments; banner text renders any time the zone is on screen).
- [ ] Crossing the line wins in the same frame contact happens (no run-over pass-through).
- [ ] Full run completes in 60–90 s for a competent human (robot-driver target 68–80 s).
- [ ] Start banner + READY/GO countdown polished; race timer excludes the countdown.

## G. Crash feedback
- [ ] Crash ⇒ screen flash + shake + crash sfx + heart removed from HUD within ~100 ms.
- [ ] Post-crash: ~1.5 s invulnerability with the car blinking; speed drops to ~20 % max,
      not zero (you keep, barely, moving).
- [ ] Off-road drag feels like drag (shudder + dust), not a hard switch.
- [ ] Game-over (0 hearts) → clean loss screen; win → result screen shows time.

## Grading
Each section: ✅ all lines hold · ⚠ minor miss (fix if cheap) · ❌ broken (must fix).
Grade honestly after racing ≥ 3 full runs (1 robot, 2 by hand).
