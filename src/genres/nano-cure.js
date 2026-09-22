// NANO-CURE genre — "Nano Cure" · amir-kermany-nano-cure-2
// Amir Kermany (Clinytic — spelled C-L-I-N-Y-T-I-C) pitched, at the booth: a vertical
// shoot-'em-up inside the bloodstream. You are a nanobot injected by a syringe; you must
// LITERALLY move into germs to absorb them — you can only take what you are bigger than,
// absorption takes time (you slow down while channeling), and absorbed biological material
// upgrades you across phases (cadence → rayon → mitraille). Bigger live germs hurt you.
// Bomb power-up (antiblaste). A "vertical Katamari × Strikers-1942" hybrid.
//
// ONE booth slot, 3-phase state machine (MDA precedent):
//   INJECT(anim) → CAPILLAIRES (small germs, learn absorb) → ARTÈRE (mixed sizes, aimed
//   shots, bomb pickups, UPSURGE) → PURGE FINALE (infection core: absorb spores to open
//   the membrane, shoot the nucleus ×3 cycles) → SANG PROPRE ✓ (api.complete).
//
// KIOSK RULES — 3 local hearts, 1.2 s i-frames, no insta-death, no dead-ends (the shell's
// lives bank handles retries); progress is forgiving; the pitch's "things can hurt you and
// you could die" is real but rare and always fair.
//
// ART — Route A procedural only (operator rule: zero emoji, zero glyphs in level.json,
// zero runtime fetches). Sprites are baked once per key to offscreen canvases and blitted.
// HUD copy uses approved text glyphs only (★ ♥ ✓ ▶ + plain words).
//
// BOT — ?bot=1 boots an in-module autopilot; flavors: good / partial (2 fumbled absorbs) /
// clumsy (never dodges, proves the fail path). ?debug=1 → window.__NANO { timeScale,
// state() } read-only. ?beats=1 → one DOM tile per phase transition (data-URL, #beats).

import { W, H, clamp, lerp, drawText, seasonTint, seasonNow } from "../core.js";

export const meta = {
  name: "Nano Cure",
  controls: "← ↑ ↓ → / ZQSD : conduire le nanobot · ESPACE : bombe anticorps · EN: arrows steer · SPACE: bomb — autofire + absorb are automatic",
};

// ---- palette: blood warmth + ALL IN brand tokens ---------------------------------------
const C = {
  plasmaA: "#1c040c", plasmaB: "#3f0b18", plasmaC: "#5c1228",
  wall: "#2a0510", wallEdge: "#ff5f86",
  eryA: "#7e1420", eryB: "#93182a", eryHi: "#b02036",
  streak: "#ff9db2",
  cyan: "#3ddcff", cyanHi: "#aef1ff", violet: "#8a7cff", magenta: "#ff3d9a",
  germ: "#9dff4c", germHi: "#d6ff7a", germDk: "#5a8f1e",
  coc: "#c9a1ff", cocDk: "#7a5bb8",
  maj: "#ff6f9c", majDk: "#a8295a",
  husk: "#8d8d8d",
  gold: "#ffd166",
  danger: "#ff6473",
  white: "#f4f7fd",
};

function P(g, x, y, w, h, col, u = 4) { g.fillStyle = col; g.fillRect(x * u, y * u, w * u, h * u); }

// deterministic spawn RNG (per create — every boot/sim replays the same level)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAKED = new Map();
function bake(key, w, h, painter) {
  let c = BAKED.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w; c.height = h;
    painter(c.getContext("2d"));
    BAKED.set(key, c);
  }
  return c;
}

// ---- Route A painters -------------------------------------------------------------------
function paintNanobot(g, f) { // 11×11 cells, u4 → 44×44 ; f 0 idle, 1 boost
  P(g, 2, 8, 1, 2, C.violet); P(g, 8, 8, 1, 2, C.violet);          // side pods
  P(g, 3, 3, 5, 6, C.cyan);                                        // capsule body
  P(g, 2, 4, 1, 4, C.cyan); P(g, 8, 4, 1, 4, C.cyan);              // shoulders
  P(g, 3, 3, 5, 1, C.cyanHi);                                      // top rim light
  P(g, 4, 4, 3, 2, "#0e3a55");                                     // visor
  P(g, 4, 4, 1, 1, C.cyanHi);                                      // visor glint
  P(g, 5, 7, 1, 1, C.white);                                       // core dot
  P(g, 1, 2 + f, 1, 2, C.cyanHi); P(g, 9, 2 + f, 1, 2, C.cyanHi);  // cilia (2 frames)
  P(g, 5, 9, 1, 1, C.violet);                                      // ventral sensor
}
function paintDart(g) { // 5×2 cells, u4 → 20×8
  P(g, 0, 0, 4, 2, C.cyan); P(g, 4, 0, 1, 2, C.cyanHi);
}
function paintVirion(g) { // 7×7 cells, u4 → 28×28
  P(g, 2, 2, 3, 3, C.germDk); P(g, 3, 2, 1, 3, C.germ); P(g, 2, 3, 3, 1, C.germ);
  P(g, 3, 0, 1, 2, C.germ); P(g, 3, 5, 1, 2, C.germ); P(g, 0, 3, 2, 1, C.germ); P(g, 5, 3, 2, 1, C.germ);
  P(g, 1, 1, 1, 1, C.germ); P(g, 5, 1, 1, 1, C.germ); P(g, 1, 5, 1, 1, C.germ); P(g, 5, 5, 1, 1, C.germ);
  P(g, 3, 3, 1, 1, C.germHi);
}
function paintBacille(g) { // 9×5 cells, u4 → 36×20 (rod body; flagellum drawn live)
  P(g, 2, 1, 5, 3, C.germDk);
  P(g, 3, 1, 3, 1, C.germ); P(g, 3, 3, 3, 1, C.germHi);
  P(g, 1, 2, 1, 1, C.germ); P(g, 7, 2, 1, 1, C.germ);
  P(g, 4, 2, 1, 1, "#22401a");
}
function paintCoque(g) { // 9×9 cells, u4 → 36×36 (8-sphere cluster)
  const blobs = [[4, 1], [6, 2], [7, 4], [6, 6], [4, 7], [2, 6], [1, 4], [2, 2]];
  for (const [x, y] of blobs) { P(g, x, y, 2, 2, C.coc); P(g, x, y, 1, 1, "#e5d4ff"); }
  P(g, 3, 3, 3, 3, C.cocDk); P(g, 4, 4, 1, 1, "#ffffff");
}
function paintBacmaj(g) { // 13×7 cells, u4 → 52×28 (danger carrier rod)
  P(g, 2, 2, 9, 3, C.majDk);
  P(g, 3, 2, 7, 1, C.maj);
  P(g, 4, 3, 1, 1, C.magenta); P(g, 7, 3, 1, 1, C.magenta); P(g, 10, 3, 1, 1, C.magenta);
  P(g, 1, 3, 1, 1, C.maj); P(g, 11, 3, 1, 1, C.maj);
}
function paintSpore(g) { // 5×5 cells, u4 → 20×20
  P(g, 1, 1, 3, 3, C.germHi); P(g, 2, 1, 1, 1, "#ffffff"); P(g, 1, 4, 3, 1, C.germ);
}
function paintSyringe(g) { // 16×34 cells, u4 → 64×136
  P(g, 7, 0, 2, 2, "#c8ccd8");                       // thumb rest
  P(g, 7, 2, 2, 6, "#9aa4b4");                       // plunger rod
  P(g, 3, 8, 10, 16, "#dfe6f2");                     // glass barrel
  P(g, 4, 12, 8, 11, C.cyan);                        // serum
  P(g, 4, 12, 8, 2, C.cyanHi);                       // serum meniscus
  P(g, 3, 8, 10, 1, "#ffffff"); P(g, 3, 23, 10, 1, "#8a93ad");
  P(g, 2, 10, 1, 12, C.violet); P(g, 13, 10, 1, 12, C.violet); // graduation bands
  P(g, 6, 24, 4, 2, "#8a93ad");                      // hub
  P(g, 7, 26, 2, 7, "#c8ccd8");                      // needle
}
function paintBombPick(g) { // 7×7 cells, u4 → 28×28 (antiblaste capsule)
  P(g, 1, 1, 5, 5, C.white); P(g, 1, 1, 5, 1, C.violet);
  P(g, 3, 2, 1, 3, C.magenta); P(g, 2, 3, 3, 1, C.magenta);
}
function paintErythro(g) { // 8×5 cells, u4 → 32×20 (biconcave disc)
  P(g, 0, 1, 8, 3, C.eryB);
  P(g, 1, 0, 6, 5, C.eryA);
  P(g, 2, 1, 4, 3, C.eryB);
  P(g, 3, 2, 2, 1, C.eryHi);
}

// =========================================================================================
export function create(level, api) {
  const data = level.data || {};

  // ---- tuning (level.json is source of truth; safe defaults) -----------------------------
  const SEED = data.seed ?? 20260917;
  const HEARTS = data.hearts ?? 3;
  const MOVE = data.move ?? 265;
  const FLOW = data.flow ?? 14;
  const DART_SP = data.dartSpeed ?? 640;
  const DART_DMG = data.dartDmg ?? 1;
  const HUSK_TTL = data.huskTtl ?? 6.5;
  const ABS_T = data.absorbBase ?? 0.85;
  const BOMB_CAP = data.bombCap ?? 3;
  const INJ_T = data.injectT ?? 2.8;
  const TIERS = data.tiers || [
    { thr: 0, r: 16, fire: 0.16, name: "NANOBOT" },
    { thr: 60, r: 19, fire: 0.11, name: "CADENCE +" },
    { thr: 140, r: 23, fire: 0.11, name: "RAYON +" },
    { thr: 250, r: 26, fire: 0.085, spread: 3, name: "MITRAILLE" },
  ];
  const CAP = Object.assign({ dur: 22, hw: 238, every: [1.0, 0.7], boucle: { virion: 3, bacille: 1 } }, data.capillaries);
  const ART = Object.assign({ dur: 24, hw: 296, every: [0.85, 0.5], upsurgeAt: 12, upsurgeDur: 4.5, pickupAt: [8, 17], boucle: { virion: 2, bacille: 1.2, coque: 1.5, bacmaj: 0.75 } }, data.artery);
  const BOSS = Object.assign({ hw: 332, sporesPer: 3, openT: 4.2, coreHits: 5, cycles: 3, sprayEvery: [1.3, 1.0, 0.85], aimedEvery: [2.4, 1.9, 1.6] }, data.boss);

  const KINDS = {
    virion: { r: 13, hp: 1, bio: 8, vy: 46, amp: 42, freq: 1.7, paint: () => bake("nc-virion", 28, 28, paintVirion) },
    bacille: { r: 17, hp: 2, bio: 13, vy: 34, amp: 64, freq: 0.9, paint: () => bake("nc-bacille", 36, 20, paintBacille) },
    coque: { r: 22, hp: 3, bio: 22, vy: 24, amp: 20, freq: 0.5, paint: () => bake("nc-coque", 36, 36, paintCoque) },
    bacmaj: { r: 26, hp: 4, bio: 26, vy: 18, amp: 12, freq: 0.4, shoots: true, paint: () => bake("nc-bacmaj", 52, 28, paintBacmaj) },
    spore: { r: 9, hp: 1, bio: 11, vy: 26, amp: 30, freq: 1.2, paint: () => bake("nc-spore", 20, 20, paintSpore) },
  };

  // ---- flags ------------------------------------------------------------------------------
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : { get: () => null };
  const BOT = q.get("bot") === "1";
  const BEATS = q.get("beats") === "1";
  const FLAVOR = q.get("flavor") || "good";
  const DBG = BOT || q.get("debug") === "1";

  // ---- state ------------------------------------------------------------------------------
  const rng = mulberry32(SEED);
  let t = 0, status = "playing", phase = "inject";
  const trace = [];
  let injT = 0, phaseT = 0, spawnT = 0.4, scroll = 0, upsurgeT = 0;
  const artPick = (ART.pickupAt || []).map((at) => ({ at, done: false }));
  let hearts = HEARTS, iFr = 0, bombIv = 0, flashT = 0;
  let biomass = 0, tier = 0, absorbed = 0, kills = 0, bombs = 1, bombsUsed = 0;
  const pl = { x: W / 2, y: H - 130, vx: 0, vy: 0, r: TIERS[0].r, fireT: 0.2, spawnA: 0 };
  let channelTarget = null;
  const germs = [], darts = [], globs = [], parts = [], picks = [];
  let bannerT = 3.4, bA = "INJECTION", bB = "Clinytic — Nano Cure";
  let boss = null, bossDying = 0;
  let lastHud = "";
  let fumbles = 0, fumbleT = 0; // partial-flavor bot bookkeeping

  // ---- tiny helpers ----------------------------------------------------------------------
  function sfx(n) {
    try { if (api.audio && api.audio.unlocked !== false && api.audio.sfx) api.audio.sfx(n); } catch (e) { /* thumb-safe */ }
  }
  function popup(x, y, txt, col, size = 14) { parts.push({ pop: true, x, y, txt, col, size, t: 1.0, ttl: 1.0 }); }
  function banner(a, b, dur = 2.6) { bA = a; bB = b; bannerT = dur; }
  function burst(x, y, col, n = 10, sp = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.4 + Math.random() * 0.8);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.5, ttl: 0.5, col, size: 2 + Math.random() * 2 });
    }
  }
  function snap(tag) {
    if (typeof document === "undefined") return;
    let host = document.getElementById("beats");
    if (!host) { host = document.createElement("div"); host.id = "beats"; document.body.appendChild(host); }
    const cv = document.createElement("canvas");
    cv.width = 440; cv.height = 247;
    const g = cv.getContext("2d");
    g.scale(440 / W, 247 / H);
    draw(g);
    const img = document.createElement("img");
    img.src = cv.toDataURL("image/jpeg", 0.6);
    img.dataset.tag = tag;
    host.appendChild(img);
  }
  function setPhase(tag) {
    if (tag === phase) return;
    phase = tag; phaseT = 0; spawnT = 0.5;
    trace.push(tag + "@" + t.toFixed(1));
    if (tag === "capillaries") banner("CAPILLAIRES", "Absorbez les germes affaiblis — move into them / entrez dedans");
    if (tag === "artery") banner("ARTÈRE", "Gros dangers : tirez d'abord, absorbez ensuite");
    if (tag === "boss") { banner("PURGE FINALE", "Absorbez les spores pour ouvrir la membrane"); sfx("bossRoar"); }
    if (BEATS) snap(tag);
  }
  function corridorHw(y) {
    const base = phase === "inject" ? CAP.hw : phase === "capillaries" ? CAP.hw : phase === "artery" ? ART.hw : BOSS.hw;
    return base - 24 * Math.sin(y * 0.011 + t * 0.85) - 8 * Math.sin(t * 0.5);
  }
  function fireRate() { return TIERS[Math.min(tier, TIERS.length - 1)].fire; }

  // ---- spawning ----------------------------------------------------------------------------
  function pickKind(table) {
    let tot = 0; for (const k in table) tot += table[k];
    let x = rng() * tot;
    for (const k in table) { x -= table[k]; if (x <= 0) return k; }
    return Object.keys(table)[0];
  }
  function spawnGerm(kind) {
    const K = KINDS[kind];
    const hw = corridorHw(-30) - 46;
    const bx = W / 2 + (rng() - 0.5) * 2 * hw;
    germs.push({
      kind, bx, x: bx, y: -26, r: K.r, hp: K.hp, maxHp: K.hp, bio: K.bio,
      ph: rng() * Math.PI * 2, husk: false, p: 0, ttl: HUSK_TTL, fireT: 1.6 + rng() * 1.6,
    });
  }
  function spawnPickup() {
    const hw = corridorHw(-30) - 60;
    picks.push({ x: W / 2 + (rng() - 0.5) * 2 * hw, y: -20, t: 0 });
  }

  // ---- combat --------------------------------------------------------------------------------
  function makeHusk(g) {
    g.husk = true; g.hp = 0; g.ttl = HUSK_TTL; g.p = 0;
    burst(g.x, g.y, C.germHi, 8, 70);
  }
  function damageGerm(g, dmg) {
    if (g.husk) return;
    g.hp -= dmg;
    if (g.hp <= 0) {
      kills++;
      if (g.kind === "coque") { // splits into two absorbable virions
        for (const dx of [-18, 18]) {
          germs.push({ kind: "virion", bx: g.x + dx, x: g.x + dx, y: g.y + 10, r: 13, hp: 1, maxHp: 1, bio: 8, ph: rng() * 6.28, husk: false, p: 0, ttl: HUSK_TTL, fireT: 9 });
        }
        germs.splice(germs.indexOf(g), 1);
        burst(g.x, g.y, C.coc, 12, 100); sfx("hit");
      } else makeHusk(g);
    } else sfx("hit");
  }
  function absorbable(g) {
    if (g.husk) return g.r + 2 <= pl.r + 2; // husks are always edible if shrunk into range
    return g.r + 2 <= pl.r;                 // live germs only if you're bigger (the pitch)
  }
  function channelDur(g) { return Math.max(0.45, ABS_T * g.r / pl.r) * (g.husk ? 1 : 1.35); }
  function absorbComplete(g) {
    biomass += g.bio; absorbed++;
    popup(g.x, g.y, "+" + g.bio, C.germHi, 15);
    burst(g.x, g.y, C.cyan, 12, 90); sfx("coin");
    if (g.kind === "spore" && boss) boss.meter++;
    const i = germs.indexOf(g); if (i >= 0) germs.splice(i, 1);
    while (tier < TIERS.length - 1 && biomass >= TIERS[tier + 1].thr) {
      tier++;
      pl.r = TIERS[tier].r;
      banner("ÉVOLUTION — " + TIERS[tier].name, "Biomasse " + biomass, 2.2);
      popup(pl.x, pl.y - 30, TIERS[tier].name, C.violet, 17);
      burst(pl.x, pl.y, C.violet, 18, 120); sfx("powerup");
    }
  }
  function chip(msg) {
    if (iFr > 0 || bombIv > 0 || status !== "playing") return;
    hearts--; iFr = 1.2;
    if (channelTarget && channelTarget.p) channelTarget.p *= 0.55;
    api.eng && api.eng.shake && api.eng.shake(0.7);
    popup(pl.x, pl.y - 26, "-♥", C.danger, 16);
    burst(pl.x, pl.y, C.danger, 10, 100); sfx("hit");
    if (hearts <= 0) lose(msg);
  }
  function bombNow() {
    if (bombs <= 0) return;
    bombs--; bombsUsed++; bombIv = 1.1; flashT = 0.35;
    globs.length = 0;
    for (let i = germs.length - 1; i >= 0; i--) {
      const g = germs[i];
      if (g.husk) continue;
      if (g.r + 2 <= pl.r) makeHusk(g); else { g.hp -= 2; if (g.hp <= 0) makeHusk(g); }
    }
    if (boss && boss.open) boss.hp = Math.min(BOSS.coreHits, boss.hp + 2);
    api.eng && api.eng.shake && api.eng.shake(1);
    burst(pl.x, pl.y, C.white, 26, 220); sfx("boom");
  }
  function fireDarts() {
    const spread = TIERS[Math.min(tier, TIERS.length - 1)].spread || 1;
    for (let i = 0; i < spread; i++) {
      const ang = spread === 1 ? 0 : (i - (spread - 1) / 2) * 0.24;
      darts.push({ x: pl.x, y: pl.y - pl.r - 4, vx: Math.sin(ang) * DART_SP, vy: -Math.cos(ang) * DART_SP });
    }
  }
  function lose(msg) {
    if (status !== "playing") return;
    status = "lost";
    trace.push("lost@" + t.toFixed(1));
    api.fail(msg || "L'infection prend le dessus — retente ta chance !");
  }
  function winNow() {
    if (status !== "playing") return;
    status = "won";
    trace.push("won@" + t.toFixed(1));
    banner("SANG PROPRE ✓", "Amir Kermany (Clinytic) — Nano Cure", 6);
    api.complete({ t: +t.toFixed(1), biomass, absorbed, husked: kills, bombsUsed, season: seasonNow().id });
  }

  // ---- boss ---------------------------------------------------------------------------------
  function ensureBoss() {
    boss = { x: W / 2, y: 132, r: 92, cycle: 0, meter: 0, hp: 0, open: false, openT: 0, sprayT: 1.1, aimT: 1.2, wob: 0 };
  }
  function openCore() { boss.open = true; boss.openT = BOSS.openT; boss.hp = 0; boss.aimT = 0.7; sfx("alarm"); banner("MEMBRANE OUVERTE", "Tirez le noyau !", 1.6); }
  function closeCore(pop) {
    boss.open = false; boss.cycle++; boss.meter = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      globs.push({ x: boss.x + Math.cos(a) * 60, y: boss.y + Math.sin(a) * 60, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 7 });
    }
    if (pop) { burst(boss.x, boss.y, C.magenta, 24, 190); sfx("boom"); api.eng && api.eng.shake && api.eng.shake(0.9); }
    if (boss.cycle >= BOSS.cycles) { bossDying = 1.6; sfx("1up"); }
    else sfx("bossRoar");
  }
  function bossStep(dt) {
    boss.wob += dt;
    if (bossDying > 0) {
      bossDying -= dt;
      if (Math.random() < 0.5) burst(boss.x + (Math.random() - 0.5) * 140, boss.y + (Math.random() - 0.5) * 90, Math.random() < 0.5 ? C.magenta : C.germHi, 4, 120);
      if (bossDying <= 0) winNow();
      return;
    }
    boss.y = 132 + Math.sin(boss.wob * 0.9) * 10;
    if (!boss.open) {
      boss.sprayT -= dt;
      if (boss.sprayT <= 0) {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (0.15 + (0.7 * i) / (n - 1)) + (rng() - 0.5) * 0.2;
          const sp = 62 + rng() * 34;
          germs.push({ kind: "spore", bx: boss.x + Math.cos(a) * 70, x: boss.x + Math.cos(a) * 70, y: boss.y + 40 + Math.abs(Math.sin(a)) * 20, r: 9, hp: 1, maxHp: 1, bio: 11, ph: rng() * 6.28, husk: false, p: 0, ttl: HUSK_TTL, fireT: 9, vx: Math.cos(a) * sp, fvy: Math.sin(a) * sp });
        }
        boss.sprayT = BOSS.sprayEvery[Math.min(boss.cycle, BOSS.sprayEvery.length - 1)];
      }
      if (boss.meter >= BOSS.sporesPer) openCore();
    } else {
      boss.openT -= dt;
      boss.aimT -= dt;
      if (boss.aimT <= 0) {
        const dx = pl.x - boss.x, dy = pl.y - boss.y, dd = Math.hypot(dx, dy) || 1;
        for (const off of [-0.22, 0, 0.22]) {
          const a = Math.atan2(dy, dx) + off;
          globs.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, r: 7 });
        }
        boss.aimT = 1.0;
      }
      if (boss.openT <= 0) closeCore(false);
    }
  }

  // ---- bot ----------------------------------------------------------------------------------
  const BOT_IN = {
    l: false, r: false, u: false, d: false, bombJust: false,
    left: () => BOT_IN.l, right: () => BOT_IN.r, up: () => BOT_IN.u, downKey: () => BOT_IN.d,
    just: () => BOT_IN.bombJust, jumpJust: () => false, anyJust: () => false,
    endFrame() { BOT_IN.bombJust = false; },
  };
  function botThink(dt) {
    BOT_IN.l = BOT_IN.r = BOT_IN.u = BOT_IN.d = false;
    if (phase === "inject" || status !== "playing") return;
    if (FLAVOR === "clumsy") { BOT_IN.u = Math.sin(t * 2) > 0; return; } // never dodges, never farms
    if (FLAVOR === "partial" && fumbleT > 0) { fumbleT -= dt; BOT_IN.r = true; return; }
    // danger dodge (same-frame reads). Projectiles: sidestep the SHOT LINE — a radial
    // flee runs down the projectile's own path and gets pinned against the corridor
    // wall (the live-death mechanism: one bacmaj glob herded the bot 200 px into the
    // corner clamp, then the next volley finished it). Push along the player's existing
    // perpendicular offset from the line — the shortest way out of its way.
    let sx = 0, sy = 0;
    for (const b of globs) {
      const dx = pl.x - b.x, dy = pl.y - b.y, d = Math.hypot(dx, dy);
      if (d >= 150 || !(b.vy > 0 || dy < 0)) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const ux = b.vx / sp, uy = b.vy / sp; // unit vector along the shot line
      const along = dx * ux + dy * uy;
      if (along < 0) continue; // already past the player's plane — it will miss
      const px = dx - along * ux, py = dy - along * uy;
      const pd = Math.hypot(px, py);
      const nx = pd > 1 ? px / pd : uy, ny = pd > 1 ? py / pd : -ux; // on the line: sidestep left of travel
      const w = 150 - d;
      sx += nx * w; sy += ny * w;
      if (along < 30) { sx -= ux * w * 0.5; sy -= uy * w * 0.5; } // shot about to cross: also back off along it
    }
    for (const g of germs) {
      if (g.husk || g.r + 2 <= pl.r) continue;
      const dx = pl.x - g.x, dy = pl.y - g.y, d = Math.hypot(dx, dy);
      if (d < pl.r + g.r + 46) { sx += (dx / (d || 1)) * (pl.r + g.r + 46 - d); sy += (dy / (d || 1)) * (pl.r + g.r + 46 - d); }
    }
    if (boss && !boss.open && Math.abs(pl.x - boss.x) < boss.r + 20 && pl.y - boss.y < boss.r + 60 && pl.y > boss.y) { sy += 120; } // keep-out: push back DOWN below the band (was -= 120, which shoved the bot up into the membrane)
    if (Math.hypot(sx, sy) > 22) {
      sx *= 1.3; // lateral bias — vertical dodges drift you into the flow
      BOT_IN.l = sx < 0; BOT_IN.r = sx > 0; BOT_IN.u = sy < -8; BOT_IN.d = sy > 8; return;
    }
    // seek nearest absorbable (prefer in-progress + closest) — in the boss phase, seek
    // only SPORES (the phase goal): they fall near the boss column, whereas chasing
    // stray husks can drag the bot into corners under bacmaj sniper fire. Suppressed
    // entirely during the open window: channeling drops you to 0.45× speed while aimed
    // volleys are inbound.
    if (!(boss && boss.open)) {
      let best = null, bd = 1e9;
      for (const g of germs) {
        if (!absorbable(g)) continue;
        if (boss && g.kind !== "spore") continue;
        const dy2 = g.y - pl.y; if (dy2 < -60) continue;
        const d = Math.hypot(g.x - pl.x, g.y - pl.y) - (g.p || 0) * 60;
        if (d < bd) { bd = d; best = g; }
      }
      if (best) {
        const dx = best.x - pl.x, dy = best.y - pl.y;
        if (FLAVOR === "partial" && (best.p || 0) > 0.75 && fumbles < 2) {
          fumbles++; fumbleT = 0.45; trace.push("fumble" + fumbles + "@" + t.toFixed(1));
          BOT_IN.r = true; return;
        }
        if (Math.abs(dx) > 8) { BOT_IN.l = dx < 0; BOT_IN.r = dx > 0; }
        if (Math.abs(dy) > 10) { BOT_IN.u = dy < 0; BOT_IN.d = dy > 0; }
        return;
      }
    }
    // boss: coherent positioning (F2). Closed: hold below the keep-out band, slightly
    // off-axis (darts clink off the sealed membrane harmlessly); stray germs still
    // absorbed by the seek above. Open: deliberately align x to the core axis so darts
    // land on the nucleus by intent, not wander — hold at shooting distance below.
    if (boss) {
      const open = boss.open;
      const wantX = open ? boss.x : boss.x + 46;
      const wantY = open ? boss.y + 150 : boss.y + 180; // 180 = below the 152 px keep-out band
      const dx = wantX - pl.x, dy = wantY - pl.y;
      if (Math.abs(dx) > 10) { BOT_IN.l = dx < 0; BOT_IN.r = dx > 0; }
      if (Math.abs(dy) > 10) { BOT_IN.u = dy < 0; BOT_IN.d = dy > 0; }
      return;
    }
    const wantX = W / 2 + Math.sin(t * 0.6) * 40, wantY = H - 150;
    const dx = wantX - pl.x, dy = wantY - pl.y;
    if (Math.abs(dx) > 12) { BOT_IN.l = dx < 0; BOT_IN.r = dx > 0; }
    if (Math.abs(dy) > 12) { BOT_IN.u = dy < 0; BOT_IN.d = dy > 0; }
  }

  // ---- update -------------------------------------------------------------------------------
  function update(dt, input) {
    if (status !== "playing") return;
    t += dt;
    iFr -= dt; bombIv -= dt; flashT -= dt; bannerT -= dt;
    const flow = FLOW * (upsurgeT > 0 ? 1.5 : 1);
    scroll += dt * flow * 3.4;

    if (BOT) botThink(dt);
    if (BOT) input = BOT_IN;

    // phase machine ------------------------------------------------------------------------
    if (phase === "inject") {
      injT += dt;
      if (injT >= INJ_T || input.anyJust() || (BOT && injT > 0.05)) {
        setPhase("capillaries");
        pl.spawnA = 1; // fade-in
      } else return;
    }
    if (phase === "capillaries" || phase === "artery") {
      phaseT += dt;
      const cfg = phase === "capillaries" ? CAP : ART;
      const prog = clamp(phaseT / cfg.dur, 0, 1);
      upsurgeT -= dt;
      if (phase === "artery") {
        if (!_upsurgeDone && phaseT >= ART.upsurgeAt) { _upsurgeDone = true; upsurgeT = ART.upsurgeDur; banner("UPSURGE", "La poussée bactérienne !", 1.8); sfx("alarm"); }
        for (const pk of artPick) {
          if (!pk.done && phaseT >= pk.at) { pk.done = true; spawnPickup(); }
        }
      }
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnGerm(pickKind(cfg.boucle));
        let every = lerp(cfg.every[0], cfg.every[1], prog);
        if (upsurgeT > 0) every /= 1.9;
        spawnT = every * (0.85 + rng() * 0.3);
      }
      if (phaseT >= cfg.dur) {
        if (phase === "capillaries") setPhase("artery");
        else { setPhase("boss"); ensureBoss(); }
      }
    } else if (phase === "boss") {
      bossStep(dt);
    }

    // player ------------------------------------------------------------------------------
    const dirX = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
    const dirY = (input.up() ? -1 : 0) + (input.downKey() ? 1 : 0);
    const sp = MOVE * (channelTarget ? 0.45 : 1);
    // dt-normalized approach lerp: exactly the fixed-step 0.22 at dt = 1/60 (sim behavior
    // bit-identical), same wall-clock convergence at any fps — a per-frame constant converges
    // 3× slower per second at 20 Hz, which erased the dodge margin under booth jank.
    const k = 1 - Math.pow(1 - 0.22, dt * 60);
    pl.vx = lerp(pl.vx, dirX * sp, k);
    pl.vy = lerp(pl.vy, dirY * sp * 0.9, k);
    pl.x += pl.vx * dt;
    pl.y += pl.vy * dt + flow * 0.5 * dt;
    const hw = corridorHw(pl.y);
    pl.x = clamp(pl.x, W / 2 - hw + pl.r + 4, W / 2 + hw - pl.r - 4);
    pl.y = clamp(pl.y, 96, H - 44);
    pl.spawnA = Math.min(1, (pl.spawnA || 0) + dt * 2.2);

    if (input.just && input.just("Space")) bombNow();

    // autofire
    pl.fireT -= dt;
    if (pl.fireT <= 0 && phase !== "inject") { fireDarts(); pl.fireT = fireRate(); }

    // darts
    for (let i = darts.length - 1; i >= 0; i--) {
      const d = darts[i];
      d.x += d.vx * dt; d.y += d.vy * dt;
      let dead = d.y < 26 || d.x < 0 || d.x > W;
      if (!dead) {
        for (const g of germs) {
          if (Math.hypot(d.x - g.x, d.y - g.y) < g.r + 4) {
            if (g.husk) continue;
            damageGerm(g, DART_DMG);
            dead = true; break;
          }
        }
        if (!dead && boss && bossDying <= 0) {
          if (boss.open && Math.hypot(d.x - boss.x, d.y - boss.y) < 30) {
            boss.hp++;
            burst(d.x, d.y, C.magenta, 4, 60);
            if (boss.hp >= BOSS.coreHits) closeCore(true);
            dead = true;
          } else if (!boss.open && Math.hypot(d.x - boss.x, d.y - boss.y) < boss.r) {
            burst(d.x, d.y, C.germ, 3, 50); // clink off the sealed membrane
            dead = true;
          }
        }
      }
      if (dead) darts.splice(i, 1);
    }

    // germs
    for (let i = germs.length - 1; i >= 0; i--) {
      const g = germs[i];
      const K = KINDS[g.kind];
      if (g.husk) {
        g.ttl -= dt;
        g.y += 30 * dt;
        g.r = Math.max(6, g.r * (1 - dt * 0.04));
        if (g.ttl <= 0) { germs.splice(i, 1); continue; }
      } else {
        g.y += (flow + K.vy) * dt * (upsurgeT > 0 ? 1.35 : 1);
        g.x = g.bx + Math.sin(t * K.freq + g.ph) * K.amp * 0.5;
        if (g.vx) { g.x += g.vx * dt; g.y += (g.fvy || 0) * dt; g.vx *= (1 - dt * 1.2); }
        if (K.shoots) {
          g.fireT -= dt;
          if (g.fireT <= 0 && g.y > 40 && g.y < H - 160) {
            const dx = pl.x - g.x, dy = pl.y - g.y, dd = Math.hypot(dx, dy) || 1;
            globs.push({ x: g.x, y: g.y, vx: (dx / dd) * 205, vy: (dy / dd) * 205, r: 7 });
            g.fireT = 2.8;
          }
        }
      }
      if (g.y > H + 50) { germs.splice(i, 1); continue; }
      // contact
      const d = Math.hypot(pl.x - g.x, pl.y - g.y);
      if (d < pl.r + g.r * 0.6) {
        if (!g.husk && g.r >= pl.r - 1) chip();
      }
    }

    // absorb channel (the Katamari heart of the pitch)
    channelTarget = null;
    let best = null, bd = 1e9;
    for (const g of germs) {
      if (!absorbable(g)) continue;
      const dd = Math.hypot(pl.x - g.x, pl.y - g.y);
      if (dd < pl.r + g.r * 0.9 && dd < bd) { bd = dd; best = g; }
    }
    channelTarget = best;
    if (best) {
      if (!best.p) best.p = 0;
      best.p += dt / channelDur(best);
      if (best.p >= 1) absorbComplete(best);
    }

    // globs (enemy shots)
    for (let i = globs.length - 1; i >= 0; i--) {
      const b = globs[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > H + 30 || b.y < -30 || b.x < -30 || b.x > W + 30) { globs.splice(i, 1); continue; }
      if (Math.hypot(pl.x - b.x, pl.y - b.y) < pl.r + b.r) { globs.splice(i, 1); chip(); }
    }

    // bomb pickups
    for (let i = picks.length - 1; i >= 0; i--) {
      const pk = picks[i];
      pk.t += dt; pk.y += 60 * dt;
      if (pk.y > H + 30) { picks.splice(i, 1); continue; }
      if (Math.hypot(pl.x - pk.x, pl.y - pk.y) < pl.r + 16) {
        picks.splice(i, 1);
        if (bombs < BOMB_CAP) { bombs++; popup(pk.x, pk.y, "BOMBE +1", C.violet, 15); }
        else { biomass += 10; popup(pk.x, pk.y, "+10", C.violet, 14); }
        sfx("powerup");
      }
    }

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t -= dt;
      if (p.t <= 0) { parts.splice(i, 1); continue; }
      if (!p.pop) { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    // ambient plasma motes
    pl.spawnA2 = (pl.spawnA2 || 0) + dt;
    if (pl.spawnA2 > 0.12) {
      pl.spawnA2 = 0;
      if (parts.length < 200) parts.push({ x: Math.random() * W, y: -8, vx: (Math.random() - 0.5) * 14, vy: 40 + Math.random() * 50, t: 3, ttl: 3, col: "rgba(255,157,178,0.35)", size: 1.5 + Math.random() * 1.5 });
    }

    // hud
    hudPaint();
  }
  let _upsurgeDone = false;
  function upsurgeDone(pt) { return _upsurgeDone; }
  function upsurgeStart() { _upsurgeDone = true; upsurgeT = ART.upsurgeDur; banner("UPSURGE", "La poussée bactérienne !", 1.8); sfx("alarm"); }

  function hudPaint() {
    let mid = "", right = "";
    if (phase === "inject") mid = "INJECTION";
    else if (phase === "capillaries") mid = "CAPILLAIRES " + Math.round(clamp(phaseT / CAP.dur, 0, 1) * 100) + "%";
    else if (phase === "artery") mid = "ARTÈRE " + Math.round(clamp(phaseT / ART.dur, 0, 1) * 100) + "%";
    else if (boss) mid = bossDying > 0 ? "PURGE FINALE — NETTOYAGE" : "PURGE FINALE — CYCLE " + Math.min(boss.cycle + 1, BOSS.cycles) + "/" + BOSS.cycles;
    right = "★ " + biomass + " · B ×" + bombs + " · " + TIERS[Math.min(tier, TIERS.length - 1)].name;
    const key = mid + "|" + right;
    if (key !== lastHud) { lastHud = key; try { api.hud({ mid, right }); } catch (e) { /* thumb-safe */ } }
  }

  // ---- draw ---------------------------------------------------------------------------------
  function draw(ctx) {
    // plasma backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, C.plasmaA); grad.addColorStop(0.55, C.plasmaB); grad.addColorStop(1, C.plasmaC);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // heartbeat pulse
    const pulse = 0.05 + 0.035 * Math.sin(t * 2.1);
    ctx.fillStyle = `rgba(255,61,110,${pulse.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    // flow streaks (seeded lanes)
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const lx = ((i * 137.5) % 960) + Math.sin(i * 7) * 30;
      const sp = 90 + ((i * 53) % 130);
      const yy = (scroll * (0.55 + (i % 3) * 0.2) + i * 97) % (H + 120) - 60;
      ctx.globalAlpha = 0.05 + ((i % 4) * 0.03);
      ctx.strokeStyle = C.streak; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(lx, yy); ctx.lineTo(lx + 8, yy + 26 + (i % 3) * 12); ctx.stroke();
    }
    ctx.restore();
    // drifting erythrocytes
    for (let i = 0; i < 13; i++) {
      const r = 11 + (i * 7) % 13;
      const sp = 0.72 + ((i % 5) * 0.12);
      const yy = (scroll * sp + i * 163) % (H + 160) - 80;
      const xx = 70 + ((i * 331) % 820) + Math.sin(t * 0.6 + i) * 24;
      ctx.save(); ctx.globalAlpha = 0.62; ctx.translate(xx, yy); ctx.rotate(Math.sin(t * 0.4 + i) * 0.5);
      ctx.drawImage(bake("nc-ery", 32, 20, paintErythro), -r, -r * 0.62, r * 2, r * 1.24);
      ctx.restore();
    }
    // vessel walls
    ctx.save();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side < 0 ? 0 : W, 0);
      for (let y = 0; y <= H; y += 18) {
        const hw2 = corridorHw(y);
        ctx.lineTo(W / 2 + side * hw2, y);
      }
      ctx.lineTo(side < 0 ? 0 : W, H);
      ctx.closePath();
      ctx.fillStyle = "rgba(26,3,10,0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,95,134,0.5)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    // injection sequence
    if (phase === "inject") {
      const k = clamp(injT / INJ_T, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${(0.5 * (1 - k * 0.6)).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      const sy = lerp(-160, H * 0.4, Math.min(1, k * 1.25));
      ctx.save();
      ctx.translate(W / 2, sy); ctx.rotate(-0.16);
      ctx.drawImage(bake("nc-syr", 64, 136, paintSyringe), -32, -68, 64, 136);
      ctx.restore();
      if (k > 0.72) {
        ctx.fillStyle = `rgba(138,124,255,${(0.5 * (k - 0.72) / 0.28).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // bomb pickups
    for (const pk of picks) {
      const bob = Math.sin(pk.t * 4) * 4;
      ctx.save(); ctx.globalAlpha = 0.9;
      ctx.drawImage(bake("nc-bomb", 28, 28, paintBombPick), pk.x - 16, pk.y - 16 + bob, 32, 32);
      ctx.strokeStyle = "rgba(138,124,255,0.6)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 20 + Math.sin(pk.t * 6) * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // germs
    for (const g of germs) {
      const K = KINDS[g.kind];
      const c = K.paint();
      const h = g.r * 2 + 8;
      ctx.save();
      if (g.husk) {
        ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t * 6);
        ctx.filter = "grayscale(60%)";
      }
      ctx.translate(g.x, g.y);
      ctx.rotate(g.kind === "bacille" || g.kind === "bacmaj" ? Math.sin(t * 2 + g.ph) * 0.3 : Math.sin(t + g.ph) * 0.12);
      if (g.kind === "bacille" || g.kind === "bacmaj") { // flagellum wiggle
        ctx.strokeStyle = C.germ; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 0; s < 5; s++) ctx.lineTo(-g.r - 4 - s * 5, Math.sin(t * 9 + s) * 4);
        ctx.stroke();
      }
      ctx.drawImage(c, -h / 2, -h / 2, h, h);
      ctx.restore();
      if (!g.husk && g.maxHp > 1) { // damage pips
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(g.x - 14, g.y - g.r - 12, 28, 4);
        ctx.fillStyle = C.germHi;
        ctx.fillRect(g.x - 14, g.y - g.r - 12, 28 * clamp(g.hp / g.maxHp, 0, 1), 4);
      }
      if (g.p > 0) { // absorb channel ring
        ctx.strokeStyle = g.husk ? C.cyan : C.germHi; ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r + 8, -Math.PI / 2, -Math.PI / 2 + g.p * Math.PI * 2);
        ctx.stroke();
      }
    }

    // boss
    if (boss && bossDying <= 0) {
      const b = boss;
      ctx.save();
      ctx.translate(b.x, b.y);
      const split = b.open ? 14 : 0;
      for (const side of [-1, 1]) { // lobed membrane halves
        ctx.save();
        ctx.translate(side * split, 0);
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) {
          const rr2 = b.r + Math.sin(a * 5 + b.wob * 2.2) * 7;
          const px = Math.cos(a) * rr2 * (side < 0 ? 1 : 1), py = Math.sin(a) * rr2;
          if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = b.open ? "rgba(157,255,76,0.13)" : "rgba(157,255,76,0.19)";
        ctx.fill();
        ctx.strokeStyle = b.open ? "rgba(214,255,122,0.9)" : "rgba(157,255,76,0.55)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
      if (b.open) { // nucleus
        const ng = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
        ng.addColorStop(0, "#fff6d8"); ng.addColorStop(0.5, C.magenta); ng.addColorStop(1, "rgba(255,61,154,0.1)");
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.arc(0, 0, 28 + Math.sin(b.wob * 8) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(-30, 38, 60, 5);
        ctx.fillStyle = C.gold; ctx.fillRect(-30, 38, 60 * clamp(b.hp / BOSS.coreHits, 0, 1), 5);
      } else { // shield shimmer
        ctx.strokeStyle = `rgba(214,255,122,${0.25 + 0.15 * Math.sin(b.wob * 3)})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, b.r - 12 - i * 12, b.wob + i, b.wob + i + Math.PI * 0.8);
          ctx.stroke();
        }
        // spore meter
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(-34, b.r + 14, 68, 6);
        ctx.fillStyle = C.cyan; ctx.fillRect(-34, b.r + 14, 68 * clamp(b.meter / BOSS.sporesPer, 0, 1), 6);
      }
      ctx.restore();
    }

    // darts + globs
    const dartC = bake("nc-dart", 20, 8, paintDart);
    for (const d of darts) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(Math.atan2(d.vy, d.vx) + Math.PI / 2);
      ctx.drawImage(dartC, -10, -4, 20, 8); ctx.restore();
    }
    for (const b of globs) {
      const gg = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r + 3);
      gg.addColorStop(0, "#e5b8ff"); gg.addColorStop(0.6, C.violet); gg.addColorStop(1, "rgba(138,124,255,0)");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2); ctx.fill();
    }

    // player
    if (phase !== "inject" || injT / INJ_T > 0.72) {
      const a = Math.min(1, pl.spawnA);
      ctx.save();
      ctx.globalAlpha = a * (iFr > 0 && Math.sin(t * 30) > 0 ? 0.35 : 1);
      if (bombIv > 0) { ctx.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 40)); }
      const bot = bake(BOTKEY(Math.floor(t * 8) % 2), 44, 44, (g2) => paintNanobot(g2, Math.floor(t * 8) % 2));
      ctx.translate(pl.x, pl.y);
      ctx.rotate(clamp(pl.vx / 900, -0.3, 0.3));
      ctx.drawImage(bot, -pl.r * 1.4, -pl.r * 1.4, pl.r * 2.8, pl.r * 2.8);
      ctx.restore();
      if (channelTarget) { // channel tether
        ctx.strokeStyle = "rgba(61,220,255,0.65)"; ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(channelTarget.x, channelTarget.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // particles + popups
    for (const p of parts) {
      if (p.pop) {
        drawText(ctx, p.txt, p.x, p.y - (1 - p.t) * 30, { size: p.size, color: p.col, alpha: clamp(p.t / p.ttl, 0, 1), shadow: "#000" });
      } else {
        ctx.globalAlpha = clamp(p.t / p.ttl, 0, 1);
        ctx.fillStyle = p.col;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }

    // bomb flash
    if (flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(flashT / 0.35 * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // on-canvas HUD: hearts + evolution bar
    if (phase !== "inject") {
      drawText(ctx, "♥".repeat(Math.max(0, hearts)) || "—", 26, 24, { size: 22, color: C.danger, align: "left", shadow: "#000" });
      const next = tier < TIERS.length - 1 ? TIERS[tier + 1] : null;
      if (next) {
        const prev = TIERS[tier].thr;
        const frac = clamp((biomass - prev) / Math.max(1, next.thr - prev), 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(W / 2 - 110, 18, 220, 8);
        ctx.fillStyle = C.violet; ctx.fillRect(W / 2 - 110, 18, 220 * frac, 8);
        drawText(ctx, "ÉVOLUTION", W / 2, 38, { size: 11, color: "rgba(216,228,255,0.8)" });
      }
    }

    // banners
    if (bannerT > 0) {
      const ba = clamp(bannerT / 0.5, 0, 1);
      drawText(ctx, bA, W / 2, H * 0.36, { size: 40, color: C.white, alpha: ba, shadow: C.magenta });
      drawText(ctx, bB, W / 2, H * 0.36 + 38, { size: 15, color: "rgba(216,228,255,0.92)", alpha: ba });
    }

    seasonTint(ctx);
  }
  function BOTKEY(f) { return "nc-bot" + f; }

  // ---- debug hook + compression wrapper ------------------------------------------------------
  if (DBG && typeof window !== "undefined") {
    window.__NANO = {
      timeScale: 1,
      state() {
        return {
          t: +t.toFixed(2), phase, status, trace,
          hearts, biomass, tier, r: pl.r, absorbed, kills: germs.filter((g) => !g.husk).length,
          bombs, fumbles,
          boss: boss ? { cycle: boss.cycle, meter: boss.meter, hp: boss.hp, open: boss.open, dying: bossDying > 0 } : null,
          player: { x: Math.round(pl.x), y: Math.round(pl.y) },
          counts: { germs: germs.length, globs: globs.length, darts: darts.length },
          season: seasonNow().id,
        };
      },
    };
  }
  const rawUpdate = update;
  update = function (dt, input) {
    const ts = (DBG && typeof window !== "undefined" && window.__NANO) ? window.__NANO.timeScale : 1;
    rawUpdate(dt * ts, input);
    if (BOT && BOT_IN) BOT_IN.endFrame();
  };

  if (BEATS) snap("inject");
  return { update, draw, status: () => status };
}
