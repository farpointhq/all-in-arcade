// SURVIVAL genre — auto-runner apocalypse ("Course Apocalypse" by Marc Larochelle).
// data: { targetDistance (m), runSpeed (px/s), difficulty 0..1, missiles? }
//
// DESIGN NOTES — kiosk-first: grasp instantly, die often, never feel trapped.
// The runner never stops (vitesse auto constante, 40 px = 1 m). Two lethal causes,
// straight from the author's own words: falling missiles and the ZOMBIE HORDE chasing
// from behind. Ruined houses are obstacles: hitting a wall dead-on = a STUMBLE (speed
// crash while the horde closes in). The horde only catches you after ~3 chained fails
// and drifts back whenever you go 6 s clean — isolated mistakes are forgiven.
// Jump: debris, house roofs; "door" houses are now TUNNELS / collapsed underpasses
// (restyled as an unmistakable dark arch with hazard stripes + clearance cue) that must
// be run THROUGH, never jumped. NEW: DOUBLE JUMP (pickup capsule x3, then permanent
// past 100 m) opens late-game "tall" double-gap ruins; HOVER (hold jump after the 2nd
// jump) slows the fall for up to 2.2 s; rare ♥ heart pickups feed the lives/checkpoint
// system. Seasons: gameplay constants never read the season. Win = 900 m.
//
// LIVES DUCK-TYPE (a sibling agent wires api.lives into app.js in parallel — this module
// MUST tolerate absence): api.lives = { get():n, spend(n?):boolean, gain(n?):boolean,
// enabled:boolean }. When it exists & enabled, any death spends a life → CHECKPOINT
// CONTINUE instead of a hard fail; when the bank is empty (or api.lives is absent) we
// behave exactly as today (api.fail). Every access is optional-chained.
//
// DEBUG HOOK: ?debug=1 exposes window.__SR = { state(), timeScale } (read-only) so an
// autopilot policy can dodge missiles / hop ruins and measure honest win times against
// levels/marc-larochelle-course-apocalypse/EXCELLENT.md. Inert without the flag.

import { W, H, clamp, lerp, hash, drawText, seasonTint, seasonNow } from "../core.js";

export const meta = {
  name: "Survival",
  controls: "ESPACE / ↑ : sauter (×2 = double saut, maintenir = lévitation) · FR · EN: SPACE/↑ jump (×2 = double jump, hold = hover)",
};

// ---- tuning constants (world units: px; 40 px = 1 m) ------------------------
const PX_PER_M = 40;
const GROUND_Y = 436;            // feet line
const PLAYER_X = 300;            // fixed screen x (the world scrolls under the runner)
const PLAYER_HALF = 15;          // collision half-width (sprite is ~45 px wide)
const PLAYER_H = 52;             // collision height
const GRAV = 2100;
const JUMP_V = -860;             // apex ≈176 px, air time ≈0.82 s (~330 px of world)
const COYOTE = 0.09, JBUFFER = 0.14;

const HORDE_START = 360;         // px behind the runner at t=0 (9 m)
const HORDE_KEEPUP = 0.95;       // horde base speed vs runSpeed (slow gap growth)
const HORDE_GAP_MAX = 620;       // horde never drifts out of view
const HORDE_SURGE = 1.20, HORDE_SURGE_T = 0.35; // brief visual press after each stumble
const HORDE_FAIL_CLOSE = 115;    // px the pack lunges the moment you fail (~3 chained fails = caught)
const HORDE_BACK = 40;           // px/s drift-back after 6 s clean
const HORDE_BACK_AFTER = 6;
const STUMBLE_T = 0.9;           // seconds of crippled speed after a wall hit
const STUMBLE_IV = 1.0;          // merciful iframes after a stumble

const MISSILE_R = 64;            // visual blast radius at ground (px)
const MISSILE_KILL_R = 58;       // LETHAL radius — smaller than the drawn ring (edge forgiveness)
const MISSILE_VY = 380;          // fall speed (px/s) — SLOWER so the trajectory reads (was 560)
const MISSILE_BURN = 0.22;       // s the fire stays lethal after impact (tight dodge window)
const MISSILE_MIN_GAP = 230;     // min px between salvo impacts (leaves a real lifeline)
const AIMED_P = 0.60;            // ~60% of impacts aim AT the runner's road (a real threat)
const AIMED_TELE_MIN = 0.90;     // aimed missiles are telegraphed ≥0.9 s (fair dodge window)
const AIMED_TELE_MAX = 1.15;
const AIMED_WINDOW = 90;         // aimed blast lands within the runner ± 90 px at impact
const OBSTACLE_MIN_GAP = 380;
const WARMUP_M = 70;             // metres of clean road before the first obstacle

// double jump + hover (jetpack-lite)
const MAX_AIR_JUMPS = 1;         // one extra mid-air jump
const DOUBLE_JUMP_V = -760;      // second jump boost (weaker than ground jump → a nudge, not a rocket)
const HOVER_MAX = 2.2;           // s of hover available per airtime
const HOVER_DAMP = 0.35;         // vy * 0.35 while hovering (heavily damped descent)
const DOUBLE_PERM_M = 100;       // past here double jump is PERMANENT (booth-friendly)
const DOUBLE_PICKUP_T = 30;      // s of double jump granted by a capsule pickup
const PICKUP_CAPS_M = [150, 380, 650];   // Phase A: double-jump capsule positions (m)
const PICKUP_HEART_M = [220, 440, 660, 880]; // Phase 5: rare ♥ lives pickups (~every 220 m)

const CAPS = { zombies: 12, missiles: 16, parts: 160 };

export function create(level, api) {
  const st = level.style || {};
  const data = level.data || {};
  const targetM = level.win?.distance || data.targetDistance || 900;
  const runSpeed = data.runSpeed || 400;
  const diff = clamp(data.difficulty ?? 0.45, 0, 1);
  const missilesOn = data.missiles !== false; // tuning knob: data.missiles=false stops the missile rains

  const debug = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  // ---- state ---------------------------------------------------------------
  let t = 0, wx = 0;               // wx = runner's world x (never stops)
  let py = GROUND_Y, vy = 0, onGround = true, jumpBuf = 0, coyote = 0;
  let stumble = 0, iframe = 0, sinceFail = 99, fails = 0;
  let status = "playing", dyingT = 0, killCause = "";
  let hordeX = -HORDE_START, hordeSurge = 0, minGapSeen = 1e9;
  let missiles = [], explosions = [], obstacles = [], parts = [], popups = [], banner = 2.6;
  let nextMissileAt = 6.5, nextObstacleX = WARMUP_M * PX_PER_M + 200, frameN = 0; // first salvo clears the banner
  let dtAvg = 1 / 60, maxSeen = { zombies: 0, missiles: 0, parts: 0 };
  let mStats = { total: 0, aimed: 0, aimedTele: 0 }; // spawned-missile telemetry (debug only)

  // double jump + hover + pickups + lives (all optional-chained toward api.lives)
  let airJumps = MAX_AIR_JUMPS, hoverT = 0, hoverOn = false, jetOn = false, doubleJumpT = 0;
  let pickups = [], lastSafeWx = 0, lifeBanner = 0, catchCount = 0;

  const dist = () => Math.floor(wx / PX_PER_M);
  const hordeGap = () => wx - hordeX;
  const hasDouble = () => doubleJumpT > 0 || dist() >= DOUBLE_PERM_M;

  // ---- pickups (double-jump capsules + rare ♥ hearts) -----------------------
  for (const m of PICKUP_CAPS_M) {
    const x = m * PX_PER_M;
    const r = hash((m * 0.017) | 0 + 13);
    pickups.push({ kind: "double", x, y: GROUND_Y - 96 - Math.floor(r * 52), caught: false, ph: r * 6.28 });
  }
  for (const m of PICKUP_HEART_M) {
    const x = m * PX_PER_M;
    const r = hash((m * 0.019) | 0 + 29);
    pickups.push({ kind: "heart", x, y: GROUND_Y - 66 - Math.floor(r * 50), caught: false, ph: r * 6.28 });
  }

  // ---- obstacles (ruined houses) ---------------------------------------------
  // "debris" (hop it) · "house" (jump ONTO the roof) · "tunnel" (run THROUGH, don't jump)
  // · "tall" (double-gap ruin AFTER 100 m — needs the SECOND jump)
  function spawnObstacle(x) {
    const r = hash(Math.floor(x * 0.017) + 71); // deterministic per position
    const pastDouble = x > DOUBLE_PERM_M * PX_PER_M;
    let type;
    if (pastDouble) {
      if (r < 0.14) type = "tall";
      else if (r < 0.46) type = "debris";
      else if (r < 0.78) type = "house";
      else type = "tunnel";
    } else {
      type = r < 0.38 ? "debris" : r < 0.72 ? "house" : "tunnel";
    }
    let o;
    if (type === "debris") o = { type, x, w: 50 + ((r * 160) % 44), h: 54 + ((r * 97) % 26) };
    else if (type === "house") o = { type, x, w: 88 + ((r * 233) % 46), h: 96 + ((r * 311) % 54) };
    else if (type === "tall") o = { type, x, w: 300 + ((r * 541) % 160), h: 200 + ((r * 277) % 50) };
    else o = { type, x, w: 120 + ((r * 401) % 34), h: 300, doorH: 108 };
    o.top = type === "tunnel" ? GROUND_Y - o.doorH : GROUND_Y - o.h; // wall-face top y
    obstacles.push(o);
    obstacles.sort((a, b) => a.x - b.x);
  }
  function ensureObstacles() {
    while (nextObstacleX < wx + W + 400) {
      spawnObstacle(nextObstacleX);
      const r2 = hash(Math.floor(nextObstacleX * 0.013) + 997);
      nextObstacleX += OBSTACLE_MIN_GAP + lerp(240, 40, diff) + r2 * 220;
    }
    if (obstacles.length > 14) obstacles.splice(0, obstacles.length - 14);
  }

  // ---- missiles --------------------------------------------------------------
  // Two intents: ~60% AIMED at the runner's road (blast lands within ±90 px of where the
  // runner WILL be, telegraphed ≥0.9 s → a readable threat you must jump), ~40% the old
  // "ahead of you" near-miss (lands 0.15–0.5 s ahead so it just missed you, dodge by timing).
  function spawnMissile(idx) {
    if (missiles.length >= CAPS.missiles) return;
    const aimed = Math.random() < AIMED_P;
    const tele = aimed
      ? clamp(lerp(AIMED_TELE_MAX, AIMED_TELE_MIN, Math.random()), AIMED_TELE_MIN, AIMED_TELE_MAX)
      : clamp(lerp(0.95, 0.62, Math.random()) + (idx || 0) * 0.22, 0.62, 0.96);
    let x = aimed
      ? wx + runSpeed * tele + (Math.random() * (AIMED_WINDOW * 2) - AIMED_WINDOW)
      : wx + runSpeed * (tele + lerp(0.5, 0.15, Math.random()));
    for (const o of obstacles) { // never welded to an obstacle face (fair sequencing)
      if (o.x + o.w < wx - 40) continue; // behind us — no guard needed
      if (x > o.x - 150 - MISSILE_R && x < o.x + o.w + 150 + MISSILE_R)
        x = o.x + o.w + MISSILE_R + 160; // slide FORWARD of the ruin — landing near you is never fair
    }
    for (let pass = 0; pass < 2; pass++) { // two passes: slides can crowd impacts together
      for (const m of missiles) {
        if (Math.abs(m.x - x) < MISSILE_MIN_GAP) x = m.x + MISSILE_MIN_GAP;
      }
    }
    // hard floor: never lands ON/BEHIND the runner's current spot. Aimed shots keep a
    // small lead (tele*0.3) so the blast still lands right near the runner at impact,
    // while non-aimed shots keep the old +0.16 s safe-life floor.
    x = Math.max(x, wx + runSpeed * (aimed ? tele * 0.3 : tele + 0.16));
    missiles.push({ x, y: GROUND_Y - MISSILE_VY * tele, vy: MISSILE_VY, tHit: tele, tele, aimed });
    mStats.total++; if (aimed) { mStats.aimed++; if (tele >= AIMED_TELE_MIN) mStats.aimedTele++; }
  }
  function scheduleMissiles(now) {
    if (!missilesOn) return;
    if (now < nextMissileAt) return;
    const salvo = 1 + Math.floor(Math.random() * (diff > 0.55 ? 3 : diff > 0.3 ? 2 : 1.6));
    for (let i = 0; i < salvo; i++) spawnMissile(i);
    const ramp = lerp(1, 0.55, clamp(dist() / targetM, 0, 1)); // denser late
    nextMissileAt = now + lerp(2.6, 1.4, diff) * ramp * (1.0 + Math.random() * 0.5);
  }

  // ---- fails & deaths --------------------------------------------------------
  function popup(x, y, txt, color, size = 20, life = 0.9) {
    popups.push({ x, y, txt, color, size, t: life, life });
  }
  function stumbleNow(cause, vault) {
    fails++; sinceFail = 0; stumble = STUMBLE_T; iframe = STUMBLE_IV;
    hordeSurge = HORDE_SURGE_T;
    hordeX = Math.min(hordeX + HORDE_FAIL_CLOSE, wx - 9); // the pack lunges ~3 chained fails = caught
    api.audio.sfx("crash"); api.eng.shake(0.5);
    popup(PLAYER_X, py - 66, cause, "#ff8a5f", 20);
    if (vault) { // hop up ON to the ruin (the speed hit + the horde lunge are the lesson)
      py = vault.top; vy = 0; onGround = true;
    } else if (!onGround) vy = Math.min(vy, 60); // knocked out of the air
  }
  // LIVES: when api.lives exists & enabled, a death spends one life → checkpoint continue.
  // Returns true if a checkpoint was performed (caller must NOT fall through to api.fail).
  function checkpointContinue(cause) {
    const lives = api.lives;
    if (!lives || lives.enabled === false || typeof lives.spend !== "function") return false;
    const ok = lives.spend(1);
    if (!ok) return false; // bank empty → behave exactly as today (hard fail)
    status = "playing";
    wx = lastSafeWx; py = GROUND_Y; vy = 0; onGround = true;
    airJumps = MAX_AIR_JUMPS; hoverT = 0; hoverOn = false; jetOn = false;
    iframe = 1.2; stumble = 0; sinceFail = 0; fails = 0;
    hordeX = wx - HORDE_START; hordeSurge = 0;              // push the pack back to a comfortable lead
    missiles.length = 0; explosions.length = 0;             // clear any looming threat at the respawn
    nextMissileAt = t + 2.2;                                // small grace before the next salvo
    lastSafeWx = wx;
    banner = 0; lifeBanner = 1.7;
    popup(PLAYER_X, GROUND_Y - 88, "♥ LIFE SPENT", "#7de2a8", 20, 1.5);
    api.audio.sfx("jump");
    return true;
  }
  function die(cause) {
    if (status !== "playing") return;
    if (checkpointContinue(cause)) return; // a life was banked → checkpoint, not a fail
    status = "dying"; dyingT = 0; killCause = cause;
    api.audio.sfx("lose"); api.eng.shake(0.9);
  }
  function finishLose() {
    if (status !== "dying") return;
    status = "lost";
    api.fail(killCause + " — " + dist() + " m parcourus");
  }
  function boom(x, y) {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      const sp = 90 + Math.random() * 220;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0.5 + Math.random() * 0.4, fire: true });
    }
    if (parts.length > CAPS.parts) parts.splice(0, parts.length - CAPS.parts);
  }

  // ---- update ----------------------------------------------------------------
  function update(dt, input) {
    dtAvg = dtAvg * 0.95 + dt * 0.05; frameN++;
    if (status === "dying") { dyingT += dt; fx(dt); if (dyingT > 1.15) finishLose(); return; }
    if (status === "won") { fx(dt); return; }
    if (status !== "playing") return;

    t += dt;
    banner = Math.max(0, banner - dt);
    lifeBanner = Math.max(0, lifeBanner - dt);
    sinceFail += dt; stumble = Math.max(0, stumble - dt); iframe = Math.max(0, iframe - dt);

    // cruise: constant speed, seulement stumbles cripple it (never a full stop)
    const speedMult = stumble > 0 ? lerp(1, 0.15, stumble / STUMBLE_T) : 1;
    wx += runSpeed * speedMult * dt;

    // jump (buffered + coyote — real keypresses only) + mid-air DOUBLE JUMP + HOVER
    jumpBuf = Math.max(0, jumpBuf - dt);
    coyote = onGround ? COYOTE : Math.max(0, coyote - dt);
    if (input.jumpJust()) jumpBuf = JBUFFER;
    if (onGround) airJumps = MAX_AIR_JUMPS;

    if (jumpBuf > 0 && coyote > 0) {
      vy = JUMP_V; onGround = false; coyote = 0; jumpBuf = 0;
      hoverT = HOVER_MAX; hoverOn = false; jetOn = false;        // reset hover per jump
      api.audio.sfx("jump");
    } else if (jumpBuf > 0 && !onGround && coyote <= 0 && hasDouble() && airJumps > 0) {
      vy = DOUBLE_JUMP_V; airJumps--; jumpBuf = 0; hoverT = HOVER_MAX; hoverOn = false;
      api.audio.sfx("jump");
      if (parts.length < CAPS.parts) { // mid-air burst (reads as a jet kick)
        for (let i = 0; i < 8; i++)
          parts.push({ x: PLAYER_X + (Math.random() - 0.5) * 8, y: py + 8, vx: (Math.random() - 0.5) * 90, vy: 120 + Math.random() * 80, t: 0.35, fire: true });
      }
    }
    if (!onGround) {
      vy += GRAV * dt;
      // jetpack-lite: after the SECOND jump, HOLDING the jump key slowly descends (≤2.2 s/airtime)
      const hoverHeld = input.down("Space") || input.down("ArrowUp") || input.down("KeyW");
      hoverOn = hoverT > 0 && airJumps <= 0 && hoverHeld;
      jetOn = hoverOn;
      if (hoverOn && vy > 0) { vy = Math.max(22, vy * HOVER_DAMP); hoverT = Math.max(0, hoverT - dt); }
      py += vy * dt;
    } else { hoverOn = false; jetOn = false; }

    // ---- obstacle passes: roof-landing free, dead-on face = stumble
    const px0 = wx - PLAYER_HALF, px1 = wx + PLAYER_HALF;
    let surface = GROUND_Y, face = null;
    for (const o of obstacles) {
      const x0 = o.x, x1 = o.x + o.w;
      if (px1 <= x0 || px0 >= x1) continue;
      if (o.type === "tunnel") {
        const beamY = GROUND_Y - o.doorH;
        if (py - PLAYER_H < beamY && iframe <= 0 && stumble <= 0) {
          face = { msg: "Pas sous le linteau !" }; // doorway: no rooftound — pop back and run through
          vy = Math.max(vy, 120); // bonk down
        }
        continue;
      }
      if (py <= o.top + 14) surface = Math.min(surface, o.top); // roof support candidate
      else if (iframe <= 0 && stumble <= 0) {
        stumbleNow("Le mur des ruines !", o); // vault up the ruin — crawl while the horde lurches
      }
    }
    if (face) {
      stumbleNow(face.msg);
      if (face.o) wx = face.o.x - PLAYER_HALF - 4; // pop back in front, free to retry
    }
    if (!onGround) {
      if (vy >= 0 && py >= surface) { py = surface; vy = 0; onGround = true; } // land
      if (py >= GROUND_Y) { py = GROUND_Y; vy = 0; onGround = true; }
    } else if (py < surface - 1) {
      onGround = false; // walked off a roof edge → fall
    }

    // a safe respawn anchor: last grounded, un-stumbled, un-stunned spot
    if (onGround && iframe <= 0 && stumble <= 0) lastSafeWx = wx;

    // ---- pickups (catch by overlap of the runner's body while jumping)
    doubleJumpT = Math.max(0, doubleJumpT - dt);
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (p.caught) continue;
      if (Math.abs(p.x - wx) < 34 && py - PLAYER_H < p.y + 26 && py > p.y - 26) {
        p.caught = true; catchCount++;
        if (p.kind === "double") {
          doubleJumpT = DOUBLE_PICKUP_T;
          popup(PLAYER_X, p.y, "DOUBLE SAUT !", "#ffd166", 17, 1.1);
          api.audio.sfx("pickup");
        } else {
          api.lives?.gain?.(1);          // optional-chained: no-op when api.lives absent
          popup(PLAYER_X, p.y, "+1 ♥", "#ff3d9a", 18, 1.0);
          api.audio.sfx("pickup");
        }
        pickups.splice(i, 1);
      }
    }

    // ---- horde: keeps up, surges on stumble, drifts back when clean
    hordeSurge = Math.max(0, hordeSurge - dt);
    let hSpeed = runSpeed * HORDE_KEEPUP;
    if (hordeSurge > 0) hSpeed = runSpeed * HORDE_SURGE;
    else if (stumble > 0) hSpeed = runSpeed * lerp(1, 0.15, stumble / STUMBLE_T); // sticks to the fumbling runner — the lunge IS the cost
    else if (sinceFail > HORDE_BACK_AFTER) hSpeed = runSpeed * HORDE_KEEPUP - HORDE_BACK;
    hordeX = Math.max(hordeX + hSpeed * dt, wx - HORDE_GAP_MAX);
    const gap = hordeGap();
    minGapSeen = Math.min(minGapSeen, gap);
    if (gap <= 8) die("La horde t'a rattrapé…"); // the horde is the fail-punisher: iframes can't protect you from it

    // ---- missiles fall
    ensureObstacles();
    scheduleMissiles(t);
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.y += m.vy * dt; m.tHit = Math.max(0, m.tHit - dt);
      // rare direct body hit mid-air (the marker is the real threat)
      if (Math.abs(m.x - wx) < 22 + PLAYER_HALF && m.y > py - PLAYER_H && m.y < py + 4 && iframe <= 0) {
        missiles.splice(i, 1); boom(m.x, py); die("Touché par un missile…"); continue;
      }
      if (m.y >= GROUND_Y) {
        missiles.splice(i, 1);
        boom(m.x, GROUND_Y);
        explosions.push({ x: m.x, t: MISSILE_BURN });
        api.audio.sfx("boom"); api.eng.shake(0.35);
        if (Math.abs(m.x - wx) < MISSILE_KILL_R && py > GROUND_Y - 62 && iframe <= 0) {
          die("Pris par l'explosion du missile…"); continue;
        }
      }
    }
    // blast burn window: the fire is deadly for ~0.3 s at ground level
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.t -= dt;
      if (e.t <= 0) { explosions.splice(i, 1); continue; }
      if (Math.abs(e.x - wx) < MISSILE_KILL_R && py > GROUND_Y - 62 && iframe <= 0) {
        die("Pris par l'explosion du missile…");
      }
    }

    // ---- win
    if (dist() >= targetM) {
      status = "won";
      api.audio.sfx("win"); api.eng.flash = 0.7;
      api.complete({ distance: dist(), time: Math.round(t * 10) / 10 });
      api.hud({ mid: `${targetM} m / ${targetM} m — survécu !`, right: "HORDE " + Math.ceil(gap / PX_PER_M) + "m" });
      return;
    }

    fx(dt);
    api.hud({
      mid: `${dist()} m / ${targetM} m`,
      right: gap < 8 * PX_PER_M ? `⚠ HORDE ${Math.ceil(gap / PX_PER_M)}m` : `HORDE ${Math.ceil(gap / PX_PER_M)}m`,
    });
  }

  function fx(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.t -= dt; }
    parts = parts.filter((p) => p.t > 0);
    for (const p of popups) { p.y -= 30 * dt; p.t -= dt; }
    popups = popups.filter((p) => p.t > 0);
  }

  // ---- Route A painters (baked once; zero emoji, zero assets, zero fetch) ----
  const SPR = {};
  function bake(name, paint, w, h) {
    if (SPR[name]) return SPR[name];
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    paint(c.getContext("2d"), w, h);
    SPR[name] = c; return c;
  }
  const P3 = (g, x, y, w2, h2, col) => { g.fillStyle = col; g.fillRect(x * 3, y * 3, w2 * 3, h2 * 3); };
  function bakeRunner(frame) { // 15×17 px grid · 3× scale → 45×51 — mirrored so he faces RIGHT (the run direction)
    return bake("run" + frame, (g) => {
      const skin = "#e8c39e", dark = "#262e38", cyan = "#3ddcff";
      const P = (x, y, w2, h2, col) => P3(g, 15 - x - w2, y, w2, h2, col); // horizontal mirror
      P(5, 0, 5, 5, skin);                        // head
      P(4, 1, 2, 1, dark);                        // eye now near the leading (right) edge
      P(4, 5, 7, 5, dark);                        // torso vest
      P(6, 5, 3, 5, cyan);                        // runner stripe (shell cyan token)
      P3(g, 9, 0, 2, 4, "#ff9a4d");               // fire-side rim light stays on the leading edge (not mirrored)
      P3(g, 10, 5, 1, 5, "#ff9a4d");              // fire-side rim light (torso edge)
      if (frame === 0) { P3(g, 3, 10, 3, 4, dark); P3(g, 9, 10, 3, 4, dark); P3(g, 2, 14, 4, 2, dark); P3(g, 9, 14, 4, 2, dark); }
      else if (frame === 1) { P3(g, 5, 10, 3, 4, dark); P3(g, 8, 11, 3, 3, dark); P3(g, 4, 14, 4, 2, dark); P3(g, 10, 13, 4, 2, dark); }
      else { P3(g, 2, 9, 4, 3, dark); P3(g, 10, 8, 4, 3, dark); P3(g, 1, 11, 3, 2, dark); P3(g, 11, 10, 3, 2, dark); }
      P3(g, frame === 2 ? 0 : 2, 6, 4, 2, skin);  // arm leads
      P3(g, frame === 2 ? 11 : 9, 6, 4, 2, skin);
    }, 45, 51);
  }
  function bakeZombie(frame) { // 14×17 → 42×51, arms out, magenta eyes
    return bake("z" + frame, (g) => {
      const body = "#3a2438", eye = "#ff3d9a";
      P3(g, 4, 1, 6, 5, body); P3(g, 3, 6, 8, 9, body);
      P3(g, 5, 3, 1, 1, eye); P3(g, 8, 3, 1, 1, eye);
      if (frame === 0) { P3(g, 0, 6, 4, 2, body); P3(g, 11, 5, 3, 2, body); P3(g, 3, 15, 3, 2, body); P3(g, 9, 15, 3, 2, body); }
      else { P3(g, 1, 5, 4, 2, body); P3(g, 10, 7, 4, 2, body); P3(g, 4, 15, 3, 2, body); P3(g, 8, 14, 3, 2, body); }
    }, 42, 51);
  }
  function bakeMissile() { // 30×78
    return bake("missile", (g) => {
      g.fillStyle = "#c9ccd4"; g.fillRect(9, 0, 12, 34);
      g.fillStyle = "#8a7cff"; g.fillRect(9, 10, 12, 4);          // violet band
      g.beginPath(); g.moveTo(9, 0); g.lineTo(15, -9); g.lineTo(21, 0); g.closePath(); g.fillStyle = "#e05a4e"; g.fill();
      g.fillStyle = "#ff7a2d"; g.fillRect(11, 34, 8, 14);
      g.fillStyle = "#ffd166"; g.fillRect(13, 40, 4, 12);
    }, 30, 78);
  }
  function bakeCapsule() { // double-jump power-up: a capsule with an up double-chevron (rocket motif)
    return bake("capsule", (g) => {
      const w = 44, h = 30, r = h / 2;
      const pill = () => {
        g.beginPath();
        g.moveTo(r, 1); g.lineTo(w - r, 1);
        g.arc(w - r, r, r - 1, -Math.PI / 2, Math.PI / 2);
        g.lineTo(r, h - 1);
        g.arc(r, r, r - 1, Math.PI / 2, -Math.PI / 2);
        g.closePath();
      };
      g.fillStyle = "#1e2733"; pill(); g.fill();
      g.strokeStyle = "#8a7cff"; g.lineWidth = 2; pill(); g.stroke();
      const cy = h / 2 + 1;
      g.strokeStyle = "#ffd166"; g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
      for (let i = 0; i < 2; i++) {
        const oy = i * 8;
        g.beginPath();
        g.moveTo(w / 2 - 9, cy + 5 - oy); g.lineTo(w / 2, cy - 3 - oy); g.lineTo(w / 2 + 9, cy + 5 - oy);
        g.stroke();
      }
    }, 44, 30);
  }
  function bakeHeart() { // procedural heart sprite (♥ shape, no emoji)
    return bake("heart", (g, w, h) => {
      const cx = w / 2, cy = h / 2 + 2;
      g.fillStyle = "#ff3d9a";
      g.beginPath();
      g.moveTo(cx, cy + 12);
      g.bezierCurveTo(cx - 18, cy - 3, cx - 9, cy - 16, cx, cy - 5);
      g.bezierCurveTo(cx + 9, cy - 16, cx + 18, cy - 3, cx, cy + 12);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,.5)";
      g.beginPath(); g.arc(cx - 5, cy - 5, 2.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx - 1, cy + 8); g.quadraticCurveTo(cx + 5, cy + 2, cx + 6, cy - 4); g.stroke();
    }, 40, 36);
  }

  // ---- draw -------------------------------------------------------------------
  function draw(ctx) {
    drawSky(ctx);
    drawSmoke(ctx);
    drawSkyline(ctx);
    drawMidRuins(ctx);
    drawGround(ctx);
    drawObstacles(ctx);
    drawPickups(ctx);
    drawHorde(ctx);
    drawMissiles(ctx);
    drawRunner(ctx);
    drawParticles(ctx);
    drawBanner(ctx);
    drawLifeBanner(ctx);
    seasonTint(ctx); // engine's season wash over everything
  }

  function drawSky(ctx) {
    const sky = st.sky || ["#080612", "#1a1326", "#2e1c2e"];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky[0]); g.addColorStop(0.62, sky[1] || sky[0]); g.addColorStop(1, sky[2] || sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // horizon fire — anchored BEHIND the skyline: the glow reads as a burning city, not a floating sun
    const sx = W * 0.75, sy = Math.round(H * 0.4);
    const hz = ctx.createLinearGradient(0, sy - 170, 0, GROUND_Y - 2);
    hz.addColorStop(0, "rgba(255,60,80,0)"); hz.addColorStop(0.72, "rgba(255,122,45,.18)"); hz.addColorStop(1, "rgba(120,66,30,.30)");
    ctx.fillStyle = hz; ctx.fillRect(0, sy - 170, W, GROUND_Y - 2 - (sy - 170));
    const sg = ctx.createRadialGradient(sx, sy, 12, sx, sy, 230);
    sg.addColorStop(0, "rgba(255,122,45,.38)"); sg.addColorStop(0.55, "rgba(255,60,80,.16)"); sg.addColorStop(1, "rgba(255,60,80,0)");
    ctx.fillStyle = sg; ctx.fillRect(sx - 250, sy - 250, 500, 500);
  }
  function drawSmoke(ctx) { // basses fumées — 0.15×
    for (let i = 0; i < 6; i++) {
      const span = W + 500;
      let u = (hash(i * 31 + 5) * span + t * 14 - (wx * 0.15) % span) % span; if (u < 0) u += span;
      const y = 60 + hash(i * 7 + 2) * 150, r = 90 + hash(i + 13) * 120;
      const g = ctx.createRadialGradient(u - 250, y, 10, u - 250, y, r);
      g.addColorStop(0, "rgba(138,124,255,0.10)"); g.addColorStop(1, "rgba(138,124,255,0)");
      ctx.fillStyle = g; ctx.fillRect(u - 250 - r, y - r, r * 2, r * 2);
    }
  }
  function drawSkyline(ctx) { // 0.30× — deterministic per i, never flickers
    const off = wx * 0.30;
    ctx.fillStyle = "#171126";
    for (let i = 0; i < 26; i++) {
      const bw = 60 + hash(i * 3 + 1) * 90;
      const bh = 90 + hash(i * 5 + 2) * 150;
      const x = ((((i * 97) % 1300) - off) % 1300 + 1300) % 1300 - 170;
      ctx.fillRect(x, GROUND_Y - 60 - bh, bw, bh + 60);
      if (hash(i * 7 + 8) > 0.85) { // some towers burn — the glow has an actual SOURCE
        const fx0 = x + bw * (0.2 + hash(i * 9 + 6) * 0.5), fy = GROUND_Y - 66 - bh;
        const fl = ((0.32 + 0.18 * Math.sin(t * 7 + i * 1.7)) * 1000 | 0) / 1000;
        ctx.fillStyle = "rgba(255,122,45," + fl + ")";
        ctx.fillRect(fx0, fy, 10, 7);
        ctx.fillStyle = "rgba(255,209,102," + (0.45 + 0.25 * Math.sin(t * 9 + i * 2.3)) + ")";
        ctx.fillRect(fx0 + 2, fy + 2, 5, 3);
        ctx.fillStyle = "#171126";
      }
      if (hash(i * 9 + 4) > 0.72) {
        ctx.fillStyle = "rgba(61,220,255,.5)";
        ctx.fillRect(x + bw * 0.5, GROUND_Y - 40 - bh * 0.4, 4, 6);
        ctx.fillStyle = "#171126";
      }
    }
  }
  function drawMidRuins(ctx) { // 0.55×
    const off = wx * 0.55;
    ctx.fillStyle = "#241b2a";
    for (let i = 0; i < 18; i++) {
      const w2 = 40 + hash(i * 11 + 3) * 70;
      const h2 = 34 + hash(i * 13 + 7) * 66;
      const x = ((((i * 211) % 1100) - off) % 1100 + 1100) % 1100 - 150;
      ctx.fillRect(x, GROUND_Y - 10 - h2, w2, h2 + 10);
      ctx.save(); ctx.translate(x + w2 / 2, GROUND_Y - h2);
      ctx.rotate((hash(i + 17) - 0.5) * 0.5);
      ctx.fillRect(-w2 * 0.7, -8, w2 * 1.4, 8);
      ctx.restore();
      if (hash(i * 17 + 1) > 0.8) {
        ctx.fillStyle = "rgba(255,61,154,.35)"; ctx.fillRect(x + w2 * 0.7, GROUND_Y - 14, 3, 3);
        ctx.fillStyle = "#241b2a";
      }
    }
  }
  function drawGround(ctx) {
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    g.addColorStop(0, "#1d1524"); g.addColorStop(1, "#0e0a14");
    ctx.fillStyle = g; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "rgba(61,220,255,.13)"; ctx.fillRect(0, GROUND_Y, W, 2);
    ctx.fillStyle = "rgba(255,255,255,.07)";
    for (let i = 0; i < 12; i++) {
      const x = (((i * 90 - wx) % (W + 90)) + (W + 90)) % (W + 90) - 20;
      ctx.fillRect(x, GROUND_Y + 34, 34, 3);
    }
    // frozen rubble + debris in the asphalt — pure dressing at 1×, zero collision
    ctx.fillStyle = "#2b2033";
    for (let i = 0; i < 9; i++) {
      const x = (((i * 137 - wx) % (W + 60)) + (W + 60)) % (W + 60) - 30;
      const y = GROUND_Y + 12 + hash(i * 29 + 3) * 74;
      ctx.fillRect(x, y, 10 + hash(i + 41) * 26, 4 + hash(i * 13 + 5) * 6);
    }
    ctx.fillStyle = "#241b2f";
    for (let i = 0; i < 5; i++) {
      const x = (((i * 251 - wx) % (W + 120)) + (W + 120)) % (W + 120) - 60;
      const y = GROUND_Y + 18 + hash(i * 7 + 11) * 58;
      ctx.fillRect(x, y, 18 + hash(i + 57) * 22, 6);
    }
    // 100 m posts (1× world — milestones you FEEL pass)
    const cam = wx - PLAYER_X;
    for (let k = 1; k * 100 <= targetM; k++) {
      const sx = k * 100 * PX_PER_M - cam;
      if (sx < -40 || sx > W + 40) continue;
      ctx.fillStyle = "#241c2e"; ctx.fillRect(sx - 2, GROUND_Y - 52, 5, 52);
      ctx.fillStyle = "#3ddcff"; ctx.fillRect(sx - 9, GROUND_Y - 62, 19, 12);
      drawText(ctx, k * 100 + "m", sx, GROUND_Y - 56, { size: 9, color: "#04121c" });
    }
  }
  // TUNNEL / collapsed-underpass: unmistakably a passage you RUN UNDER, never jump.
  function drawTunnel(ctx, o, sx) {
    const doorTop = GROUND_Y - o.doorH;       // 328 — bottom of the lintel (clearance line)
    const top = GROUND_Y - o.h;               // 136 — top of the ruined structure
    const wall = 16;                          // parapet thickness (shoulder block)
    const inX = sx + wall, inW = o.w - wall * 2;

    // overall dark structure mass
    ctx.fillStyle = "#241b2f";
    ctx.fillRect(sx, top, o.w, o.h);

    // interior: dark arch MOUTH with visible depth (gradient to near-pitch) + a distant light
    const ig = ctx.createLinearGradient(0, doorTop, 0, GROUND_Y);
    ig.addColorStop(0, "#0a060f"); ig.addColorStop(0.55, "#16101f"); ig.addColorStop(1, "#05030a");
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.moveTo(inX, GROUND_Y);
    ctx.lineTo(inX, doorTop + 26);
    ctx.quadraticCurveTo(inX + inW / 2, doorTop - 16, inX + inW, doorTop + 26);
    ctx.lineTo(inX + inW, GROUND_Y);
    ctx.closePath(); ctx.fill();
    const dl = 0.55 + 0.25 * Math.sin(t * 3 + o.x); // depth cue: "there is a way through"
    ctx.fillStyle = `rgba(61,220,255,${0.16 * dl})`;
    ctx.beginPath(); ctx.arc(sx + o.w / 2, doorTop + 54, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,122,45,${0.22 * dl})`;
    ctx.beginPath(); ctx.arc(sx + o.w / 2, doorTop + 50, 4, 0, Math.PI * 2); ctx.fill();

    // parapets / shoulders framing the gap (concrete blocks, read as the overpass abutments)
    ctx.fillStyle = "#332741";
    ctx.fillRect(sx, doorTop - 46, wall, GROUND_Y - (doorTop - 46));
    ctx.fillRect(sx + o.w - wall, doorTop - 46, wall, GROUND_Y - (doorTop - 46));
    ctx.fillStyle = "#241b2c";
    ctx.fillRect(sx + 2, doorTop - 46, wall - 4, GROUND_Y - (doorTop - 46));
    ctx.fillRect(sx + o.w - wall + 2, doorTop - 46, wall - 4, GROUND_Y - (doorTop - 46));

    // hazard-striped lintel beam (the bar you run UNDER — do not jump it)
    const beamH = 22, beamY = doorTop - beamH;
    ctx.fillStyle = "#1c1524";
    ctx.fillRect(sx + wall, beamY, inW, beamH);
    ctx.save();
    ctx.beginPath(); ctx.rect(sx + wall, beamY, inW, beamH); ctx.clip();
    for (let i = -1; i < (inW / 16) + 1; i++) {
      const x0 = sx + wall + i * 16;
      ctx.fillStyle = "#e8c84a";
      ctx.beginPath();
      ctx.moveTo(x0, beamY + beamH); ctx.lineTo(x0 + 8, beamY + beamH); ctx.lineTo(x0 + 16, beamY); ctx.lineTo(x0 + 8, beamY);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#141018";
    ctx.fillRect(sx + wall, beamY, inW, 3);
    ctx.restore();

    // clearance cue: a low bar at the lintel bottom + a small hanging sign with the height
    ctx.fillStyle = "rgba(255,95,61,.85)";
    ctx.fillRect(inX, doorTop - 1, inW, 2);
    ctx.fillStyle = "#0e0a14";
    ctx.fillRect(sx + o.w / 2 - 17, beamY - 13, 34, 15);
    ctx.fillStyle = "#e8c84a";
    ctx.fillRect(sx + o.w / 2 - 15, beamY - 11, 30, 11);
    drawText(ctx, (o.doorH / 100).toFixed(2) + "m", sx + o.w / 2, beamY - 5, { size: 8, color: "#1c1524" });

    // glyph hint (allowed ▶): "go through, under here" — a small cyan chevron
    ctx.fillStyle = "#3ddcff";
    const cx = sx + o.w / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, doorTop - 38); ctx.lineTo(cx + 2, doorTop - 31); ctx.lineTo(cx - 6, doorTop - 24);
    ctx.closePath(); ctx.fill();
  }
  // "tall" double-gap ruin: too tall for a single jump — the SECOND jump is required.
  function drawTall(ctx, o, sx) {
    const top = GROUND_Y - o.h;
    ctx.fillStyle = "#2b2033";
    ctx.fillRect(sx, top, o.w, o.h);
    ctx.fillStyle = "#1c1524";
    ctx.beginPath();
    ctx.moveTo(sx - 4, top + 12);
    ctx.lineTo(sx + o.w * 0.22, top - 14);
    ctx.lineTo(sx + o.w * 0.40, top - 2);
    ctx.lineTo(sx + o.w * 0.58, top - 18);
    ctx.lineTo(sx + o.w * 0.80, top - 4);
    ctx.lineTo(sx + o.w + 4, top + 8);
    ctx.lineTo(sx + o.w + 4, top + 16); ctx.lineTo(sx - 4, top + 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,61,154,.4)";
    ctx.fillRect(sx + o.w * 0.2, top + 28, 7, 9);
    ctx.fillStyle = "rgba(61,220,255,.35)";
    ctx.fillRect(sx + o.w * 0.62, top + 42, 8, 11);
    // cue: two stacked up-chevrons (procedural double-jump signal, no emoji)
    ctx.save();
    ctx.translate(sx + o.w / 2, top + 24);
    ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-11, 4 - i * 13); ctx.lineTo(0, -5 - i * 13); ctx.lineTo(11, 4 - i * 13);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawObstacles(ctx) {
    const cam = wx - PLAYER_X;
    for (const o of obstacles) {
      const sx = o.x - cam;
      if (sx > W + 60 || sx + o.w < -60) continue;
      if (o.type === "tunnel") { drawTunnel(ctx, o, sx); continue; }
      if (o.type === "tall") { drawTall(ctx, o, sx); continue; }
      if (o.type === "house") {
        ctx.fillStyle = "#2c2135";
        ctx.fillRect(sx, GROUND_Y - o.h, o.w, o.h);
      } else {
        ctx.fillStyle = "#332741";
        ctx.fillRect(sx, GROUND_Y - o.h, o.w, o.h);
      }
      ctx.fillStyle = "#201829";
      ctx.beginPath();
      ctx.moveTo(sx - 4, GROUND_Y - o.h + 12);
      ctx.lineTo(sx + o.w * 0.3, GROUND_Y - o.h - 12);
      ctx.lineTo(sx + o.w * 0.62, GROUND_Y - o.h - 4);
      ctx.lineTo(sx + o.w + 4, GROUND_Y - o.h + 6);
      ctx.lineTo(sx + o.w + 4, GROUND_Y - o.h + 14); ctx.lineTo(sx - 4, GROUND_Y - o.h + 14);
      ctx.closePath(); ctx.fill();
      const lit = hash(Math.floor(o.x)) > 0.6;
      ctx.fillStyle = lit ? "rgba(255,61,154,.45)" : "rgba(61,220,255,.35)";
      ctx.fillRect(sx + o.w * 0.2, GROUND_Y - o.h * 0.62, 7, 9);
      ctx.fillStyle = "rgba(255,255,255,.05)";
      ctx.fillRect(sx + o.w * 0.55, GROUND_Y - o.h * 0.4, 9, 12);
    }
  }
  function drawPickups(ctx) {
    const cam = wx - PLAYER_X;
    for (const p of pickups) {
      if (p.caught) continue;
      const sx = p.x - cam;
      if (sx < -60 || sx > W + 60) continue;
      const y = p.y + Math.sin(t * 3 + p.ph) * 5;
      const img = p.kind === "double" ? bakeCapsule() : bakeHeart();
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, sx - img.width / 2, y - img.height / 2);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.10 * Math.sin(t * 6 + p.ph);
      ctx.fillStyle = p.kind === "double" ? "#ffd166" : "#ff3d9a";
      ctx.beginPath(); ctx.arc(sx, y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  function drawMissiles(ctx) {
    const cam = wx - PLAYER_X;
    for (const m of missiles) {
      const sx = m.x - cam;
      const k = 1 - m.tHit; // → 1 as impact nears
      // trajectory: a thin dashed line from the falling body down to the landing marker —
      // the player READS exactly where it will hit.
      ctx.save();
      ctx.globalAlpha = 0.40 + 0.20 * Math.sin(t * 12 + m.x);
      ctx.strokeStyle = m.aimed ? "#ffd166" : "#ff5f3d";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(sx, m.y); ctx.lineTo(sx, GROUND_Y + 4); ctx.stroke();
      ctx.setLineDash([]);
      // exhaust streak above the body (motion cue)
      const ex = ctx.createLinearGradient(0, m.y - 44, 0, m.y + 10);
      ex.addColorStop(0, "rgba(255,122,45,0)"); ex.addColorStop(1, "rgba(255,209,102,.8)");
      ctx.fillStyle = ex;
      ctx.fillRect(sx - 2, m.y - 42, 4, 46);
      ctx.restore();
      // pulsing ground landing marker (double ring + warning column)
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(t * 14));
      ctx.strokeStyle = m.aimed ? "#ff3d3d" : "#ff5f3d"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 6, MISSILE_R * (0.45 + 0.55 * k), 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 6, Math.max(4, MISSILE_R * k * 0.8), 7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.10 + 0.10 * k;
      ctx.fillStyle = m.aimed ? "#ff3d3d" : "#ff5f3d";
      ctx.fillRect(sx - MISSILE_R * 0.5, GROUND_Y - 210, MISSILE_R, 210);
      ctx.restore();
      // the falling body
      ctx.save();
      ctx.translate(sx, m.y); ctx.rotate(0.06 * Math.sin(t * 3 + m.x));
      const img = bakeMissile();
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
      if (Math.random() < 0.5 && parts.length < CAPS.parts)
        parts.push({ x: m.x - 4, y: m.y + 16, vx: (Math.random() - 0.5) * 30, vy: -80 - Math.random() * 60, t: 0.3, fire: true });
    }
    // burn window: expanding fire ring — the visuals MATCH the lethal window
    for (const e of explosions) {
      const sx = e.x - (wx - PLAYER_X), k = 1 - e.t / MISSILE_BURN; // 0→1 over the burn
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.fillStyle = "#ff7a2d";
      ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 4, MISSILE_R * (0.55 + 0.75 * k), 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 2, MISSILE_R * (0.25 + 0.45 * k), 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,95,61,.8)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 4, MISSILE_R * (0.7 + 0.6 * k), 11, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  function drawHorde(ctx) {
    const front = hordeX - (wx - PLAYER_X);
    if (front < -60) return;         // safely off-screen early on
    ctx.save();
    ctx.globalAlpha = 0.30;
    for (let i = 0; i < 7; i++) {
      const r = 26 + hash(i * 3 + Math.floor(t * 2)) * 30;
      const x = front - 30 - hash(i + Math.floor(t * 3)) * 170;
      const y = GROUND_Y - 20 - hash(i * 5) * 60;
      ctx.fillStyle = "rgba(120,100,140,.14)";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // three lead sprinters just ahead of the pack wall — the chase READS as a chase
    for (let i = 0; i < 3; i++) {
      const zx = front + 34 + Math.sin(t * 10 + i * 2.4) * 8;
      const zy = GROUND_Y - 4 - Math.abs(Math.sin(t * 12 + i * 1.3)) * 10;
      const img = bakeZombie(Math.floor(t * 9 + i) % 2);
      ctx.save(); ctx.globalAlpha = 0.95;
      ctx.drawImage(img, zx - 24, zy - 55, 48, 55);
      ctx.restore();
    }
    const n = CAPS.zombies;
    for (let i = 0; i < n; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const zx = front - 14 - col * 24 + Math.sin(t * (6 + row) + i * 2.1) * 7;
      const zy = GROUND_Y - 6 - row * 7 - Math.abs(Math.sin(t * 9 + i)) * 7;
      if (zx > -40) {
        const img = bakeZombie(Math.floor(t * 8 + i) % 2);
        ctx.save();
        ctx.globalAlpha = row === 0 ? 1 : 0.65 - row * 0.15;
        ctx.drawImage(img, zx - 21, zy - 51, 42, 51);
        ctx.restore();
      }
    }
    maxSeen.zombies = n;
  }
  function drawRunner(ctx) {
    const frame = onGround ? Math.floor(t * 12) % 2 : 2;
    const img = bakeRunner(frame);
    const bob = onGround ? Math.sin(t * 24) * 1.5 : 0;
    ctx.save();
    ctx.globalAlpha = onGround ? 0.30 : clamp(0.30 - (GROUND_Y - py) / 700, 0.05, 0.30);
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(PLAYER_X + 2, onGround ? py + 3 : GROUND_Y + 5, 26, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    if (iframe > 0 && Math.floor(t * 16) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.drawImage(img, PLAYER_X - 22, py - PLAYER_H + bob, 45, 51);
    ctx.restore();
    // procedural jet-flame (hover): a small flickering flame under the feet
    if (jetOn) {
      ctx.save();
      const fy = py + 4;
      for (let i = 0; i < 3; i++) {
        const len = 13 + Math.random() * 16 + Math.sin(t * 40 + i) * 4;
        ctx.globalAlpha = 0.55 - i * 0.13;
        ctx.fillStyle = i % 2 ? "#ffd166" : "#ff7a2d";
        ctx.beginPath();
        ctx.moveTo(PLAYER_X - 5 + i * 2, fy);
        ctx.quadraticCurveTo(PLAYER_X + (Math.random() - 0.5) * 4, fy + len * 0.6, PLAYER_X + (Math.random() - 0.5) * 6, fy + len);
        ctx.lineTo(PLAYER_X + 5 - i * 2, fy);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#3ddcff"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const y = py - 30 - i * 14;
      ctx.beginPath(); ctx.moveTo(PLAYER_X - 66 - i * 16, y); ctx.lineTo(PLAYER_X - 22 - i * 16, y); ctx.stroke();
    }
    ctx.restore();
  }
  function drawParticles(ctx) {
    const cam = wx - PLAYER_X;
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.t * 2, 0, 1);
      ctx.fillStyle = p.fire ? (p.t > 0.3 ? "#ff7a2d" : "#ffd166") : "rgba(200,200,220,.8)";
      ctx.fillRect(p.x - cam - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(ctx, p.txt, p.x, p.y, { size: p.size, color: p.color, shadow: "#000" });
    maxSeen.parts = Math.max(maxSeen.parts, parts.length);
  }
  function drawBanner(ctx) {
    if (banner <= 0) return;
    const a = clamp(banner / 0.8, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(5,6,15,.55)"; ctx.fillRect(0, 150, W, 128);
    drawText(ctx, "SURVIS " + targetM + " m — COURS !", W / 2, 196, { size: 34, color: "#fff", shadow: "#3ddcff" });
    drawText(ctx, "Missiles : sors des zones d'impact · Ruines : saute (sauf les TUNNELS : cours dessous !) · Double saut + lévitation · La Horde arrive !",
      W / 2, 238, { size: 15, color: "rgba(216,228,255,.85)" });
    drawText(ctx, "EN: outrun " + targetM + " m — leave marked blast zones, jump the ruins (NOT tunnels: run under), use double jump + hover, stay ahead of the horde",
      W / 2, 262, { size: 12, color: "rgba(216,228,255,.55)" });
    ctx.restore();
  }
  function drawLifeBanner(ctx) {
    if (lifeBanner <= 0) return;
    const a = clamp(lifeBanner / 0.5, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(7,10,18,.6)"; ctx.fillRect(0, 210, W, 66);
    drawText(ctx, "♥ LIFE SPENT — checkpoint", W / 2, 232, { size: 22, color: "#7de2a8", shadow: "#000" });
    drawText(ctx, "Encore une chance, cours ! · EN: another chance — keep running!", W / 2, 260, { size: 11, color: "rgba(216,228,255,.7)" });
    ctx.restore();
  }

  // ---- debug hook (?debug=1 → window.__SR, read-only) --------------------------
  if (debug && typeof window !== "undefined") {
    window.__SR = {
      timeScale: 1,
      state() {
        return {
          t: +t.toFixed(2), frame: frameN, dist: dist(), target: targetM,
          player: { wx: Math.round(wx), py: Math.round(py), vy: Math.round(vy), onGround, stumble: stumble > 0, iframe: iframe > 0, airJumps, hover: hoverOn, hoverT: +hoverT.toFixed(2), jet: jetOn },
          double: { perm: dist() >= DOUBLE_PERM_M, t: +doubleJumpT.toFixed(1), can: hasDouble(), catches: catchCount },
          horde: { gap: Math.round(hordeGap()), minGap: Math.round(minGapSeen === 1e9 ? -1 : minGapSeen), fails },
          missiles: missiles.map((m) => ({ x: Math.round(m.x), tHit: +m.tHit.toFixed(3), tele: +m.tele.toFixed(3), y: Math.round(m.y), aimed: !!m.aimed })),
          explosions: explosions.map((e) => ({ x: Math.round(e.x), t: +e.t.toFixed(3) })),
          pickups: pickups.map((p) => ({ kind: p.kind, x: Math.round(p.x), y: Math.round(p.y), caught: p.caught })),
          lives: (typeof api.lives?.get === "function") ? api.lives.get() : null,
          obstacles: obstacles.filter((o) => o.x + o.w > wx - 80).slice(0, 4)
            .map((o) => ({ x: Math.round(o.x), w: Math.round(o.w), h: Math.round(o.h), type: o.type })),
          maxSeen, dtAvg: +dtAvg.toFixed(4),
          missileStats: { total: mStats.total, aimed: mStats.aimed, aimedTele: mStats.aimedTele },
          cause: killCause, status: status,
          season: seasonNow().id,
        };
      },
    };
  }

  // autopilot compression (debug only): engine dt × timeScale — real dt stays honest
  const rawUpdate = update;
  update = function (dt, input) { rawUpdate(dt * (debug ? window.__SR.timeScale : 1), input); };

  return { update, draw, status: () => (status === "dying" ? "playing" : status) };
}
