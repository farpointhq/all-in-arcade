// SHOOTER genre — vertical space shooter. Waves ramp up as your score climbs.
// data: { enemyRate (enemies/sec at start), targetScore, hp, bossAt }
//
// DESIGN NOTES — "Star Cavalcade" is the arcade finale, so readability beats spectacle.
// Ten enemy archetypes (all baked pixel sprites) with distinct motion + fire patterns,
// weighted by score so difficulty ramps: grunts (1hp, wiggle+wander), floats (3hp, tanky,
// telegraphed), sine-kickers (fast weave), divers (telegraph-then-dive), top-strafers
// (aimed shots), radial-bursters (6-way volley), mine-layers (bouncing mines), zig-darters
// (fast diagonal slash), armored grunts (2hp, ring visual), and mini-swarm spawners
// (drip capped tiny chasers).
// Fire-power orbs (SPREAD / RAPID / PIERCE) drop as pickups and refresh their own timer;
// 1-UP hearts grant a booth life (duck-typed api.lives) and restore one shield here.
// At ~85% of target the normal horde halts and a 3-phase FINAL BOSS takes the stage —
// killing it completes the run. Booth-forgiving throughout: generous iframes, mercy-clear,
// capped enemy bullets (≤244 px/s, telegraphed), and no unavoidable crossfire.
//
// DEBUG HOOK: ?debugShooter=1 exposes window.__shooter = { state(), step(), render(),
// forceScore() } so playtests can measure honest start→finish clear times against the
// rubric in levels/L04/EXCELLENT.md. It is inert without the query flag.

import { W, H, clamp, drawText, drawBilingualText, drawBackdrop } from "../core.js";

export const meta = {
  name: "Shooter",
  controls: "EN: ← → ↑ ↓ move (WASD too) · hold SPACE to fire · catch power-up orbs FR: ← → ↑ ↓ bouger (WASD aussi) · garde ESPACE pour tirer · attrape les orbes",
};

export function create(level, api) {
  const st = level.style || {};
  const target = level.data.targetScore || 700;
  const baseRate = level.data.enemyRate || 1.4;
  const maxHp = level.data.hp || 3;
  const BOSS_AT = level.data.bossAt ?? 0.85;   // fraction of target that unleashes the boss
  const POWER_T = 13;                          // seconds a fire-power orb lasts (12–15)
  const MAX_ENEMIES = 14;                      // readable cap; keeps the screen from swarming a booth player
  const MAX_EBULLETS = 18;                     // neutral enemy-bullet pool (kept small + readable)
  const MAX_MINES = 7;
  const MAX_TINY = 4;                          // mini-swarm drip cap
  const EBULLET_SPEED = 244;                   // enemy bullets never outrun a dodge

  // ---- pixel sprites: emoji swapped for baked 8-bit-style sprites (visual pass v5) ----
  const PALETTES = {
    grunt:  { x: "#a86bff", d: "#6c3fd1" },
    float:  { r: "#ff5f6d", h: "#ffd9dd", d: "#8f1f33", k: "#ffd166" },
    ship:   { c: st.accent || "#7dfcff", s: "#eaffff", w: st.bullet || "#ffe066" },
    pick:   { s: "#5fe1ff", w: "#ffffff", d: "#2b6bd1" },
    sine:   { x: "#63e6be", d: "#2b8a6b" },
    diver:  { x: "#ff922b", d: "#b34700", w: "#ffe8cc" },
    strafe: { x: "#748ffc", d: "#364fc7", w: "#e7f5ff" },
    radial: { x: "#d0bfff", d: "#7048e8", w: "#ffd8a8" },
    mine:   { x: "#adb5bd", d: "#495057", r: "#ff6b6b" },
    zig:    { x: "#ffe066", d: "#b08968", w: "#fff9db" },
    armor:  { x: "#ced4da", d: "#495057", w: "#ffffff" },
    mini:   { x: "#69db7c", d: "#2b8a3e", w: "#d3f9d8" },
    tiny:   { x: "#b2f2bb", d: "#37b24d" },
    bossC:  { x: "#845ef7", d: "#3b2a9e", w: "#e6c9ff", e: "#ffd166" },
    bossP:  { x: "#adb5bd", d: "#343a40", w: "#dee2e6" },
  };
  const WHITE_PAL = () => ({ x: "#ffffff", d: "#ffffff", r: "#ffffff", h: "#ffffff", k: "#ffffff", s: "#ffffff", w: "#ffffff", c: "#ffffff", e: "#ffffff" });
  const ROWS = {
    grunt: [
      "..x.....x..",
      "...x...x...",
      "..xxxxxxx..",
      ".xx.xxx.xx.",
      "xxxxxxxxxxx",
      "x.xxxxxxx.x",
      "d.x.....x.d",
      "...xx.xx...",
    ],
    float: [
      "...rrr...",
      "..rrrrr..",
      ".rhrrrrr.",
      ".rrrrrrr.",
      "rrrrrrrrr",
      "rrdrrrrrr",
      ".rrrrrrr.",
      "..rrrrr..",
      "...rrr...",
      "....k....",
      "...k....k",
    ],
    ship: [
      "......c......",
      "......c......",
      ".....ccc.....",
      ".....sss.....",
      "....ccccc....",
      "...cc.w.cc...",
      "..cc.ccc.cc..",
      ".cc..ccc..cc.",
      ".c.........c",
    ],
    pick: [
      ".sssssss.",
      "sssssssss",
      "sswwwwwss",
      "sswdddwss",
      "sssssssss",
      ".sssssss.",
      "..sssss..",
      "...sss...",
    ],
    sine: [
      "....x....",
      "...x.x...",
      "..x...x..",
      ".x.....x.",
      "x.......x",
      ".x.....x.",
      "..x...x..",
      "...x.x...",
      "....x....",
    ],
    diver: [
      "....x....",
      "....x....",
      "....x....",
      "...xxx...",
      "..xxxxx..",
      ".xxxxxxx.",
      "xx.xxx.xx",
      "x..x.x..x",
      ".....x...",
    ],
    strafe: [
      "..x.....x..",
      "..x.....x..",
      "xxxxxxxxxxx",
      "xxxxxxxxxxx",
      "x.xxxxxxx.x",
      "x.xxxxxxx.x",
      "xxxxxxxxxxx",
      "...xxxxx...",
      "...x...x...",
    ],
    radial: [
      ".....x.....",
      ".....x.....",
      ".....x.....",
      "..x..x..x..",
      "..x..x..x..",
      "xx..xxx..xx",
      ".....x.....",
      "..x..x..x..",
      "..x..x..x..",
      ".....x.....",
      ".....x.....",
    ],
    mine: [
      "...xxx...",
      ".x.....x.",
      "x..xxx..x",
      "x..x.x..x",
      "..x...x..",
      "x..x.x..x",
      "x..xxx..x",
      ".x.....x.",
      "...xxx...",
    ],
    zig: [
      "...xxxx..",
      "..xxxx...",
      ".xxxx....",
      "xxxx.....",
      "xxxx.....",
      ".xxxx....",
      "..xxxx...",
      "...xxxx..",
      ".........",
    ],
    armor: [
      ".xx.....xx.",
      ".xxx...xxx.",
      "xxxxxxxxxxx",
      "xxxxxxxxxxx",
      "xxx.xxx.xxx",
      "xxxxxxxxxxx",
      "xxxxxxxxxxx",
      ".xxx...xxx.",
      "...xxx.xxx.",
    ],
    mini: [
      "...x...",
      "..xxx..",
      ".xxxxx.",
      ".xxxxx.",
      ".x.x.x.",
      ".xxxxx.",
      "..xxxx.",
    ],
    tiny: [
      "..x..",
      ".xxx.",
      "xxxxx",
      ".xxx.",
      "..x..",
    ],
    bossC: [
      "......xx......",
      ".....xxxx.....",
      "....xxxxxx....",
      "...xxxxxxxx...",
      "..x.xxxxxx.x..",
      "..x.x....x.x..",
      "..xx.eeee.xx..",
      "..xx.eeee.xx..",
      "..x.x....x.x..",
      "..x.xxxxxx.x..",
      "...xxxxxxxx...",
      "....xxxxxx....",
      ".....xxxx.....",
      "......xx......",
    ],
    bossP: [
      ".xxx.",
      ".x.x.",
      ".x.x.",
      ".x.x.",
      ".xxx.",
      "..x..",
    ],
  };
  const SPR_SCALE = { grunt: 4, float: 4.4, ship: 3.5, pick: 3, sine: 4, diver: 4.2, strafe: 3.6, radial: 3.6, mine: 3.4, zig: 4, armor: 4.2, mini: 3.8, tiny: 3, bossC: 5, bossP: 3 };
  const SPRITES = {};
  function bake(name) {
    if (SPRITES[name]) return SPRITES[name];
    const base = name.split("!")[0];
    const rows = ROWS[base];
    if (!rows || typeof document === "undefined") return null;
    const pal = name.includes("!") ? WHITE_PAL() : PALETTES[base];
    const sc = SPR_SCALE[base];
    const c = document.createElement("canvas");
    c.width = Math.max(...rows.map((r) => r.length)) * sc;
    c.height = rows.length * sc;
    const g = c.getContext("2d");
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const col = pal[row[rx]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(rx * sc, ry * sc, sc, sc);
      }
    });
    SPRITES[name] = { c, w: c.width, h: c.height };
    return SPRITES[name];
  }
  function drawPx(ctx2, name, x, y, rot, h) {
    const s = bake(name);
    if (!s) return;
    const sc = h ? h / s.h : 1;
    ctx2.save();
    ctx2.translate(x, y);
    if (rot) ctx2.rotate(rot);
    ctx2.drawImage(s.c, (-s.w * sc) / 2, (-s.h * sc) / 2, s.w * sc, s.h * sc);
    ctx2.restore();
  }
  function drawPxFlash(ctx2, name, x, y, rot, flash, h) {
    ctx2.globalAlpha = Math.min(1, flash * 6);
    drawPx(ctx2, name + "!w", x, y, rot, h);
    ctx2.globalAlpha = 1;
  }

  // ---- state ----------------------------------------------------------------
  let player, bullets, enemies, ebullets, pickups, mines, parts, popups, announce, mf;
  let score, status, spawnAcc, t, surgeAt, surgeLeft, surgeAcc, dyingT, loseBegin;
  let boss, bossDefeated;          // boss = {x,y,hp,maxHp,phase,ph,ringA,atk,atkT,inv,dive...}
  let spawnHalted, power;          // power = {spread,rapid,pierce} seconds remaining
  let winPayload;

  reset();

  function reset() {
    player = { x: W / 2, y: H - 74, hp: maxHp, inv: 0, cool: 0, shield: false };
    bullets = []; enemies = []; ebullets = []; pickups = []; mines = []; parts = []; popups = []; announce = [];
    mf = 0; score = 0; status = "playing"; spawnAcc = 0; t = 0;
    surgeAt = 16; surgeLeft = 0; surgeAcc = 0; dyingT = 0; loseBegin = false;
    boss = null; bossDefeated = false; spawnHalted = false; winPayload = null;
    power = { spread: 0, rapid: 0, pierce: 0 };
  }

  // ---- helpers ----------------------------------------------------------------
  const sfx = (n) => { try { api.audio?.sfx?.(n); } catch (e) {} };
  const shake = (k) => { try { api.eng?.shake?.(k); } catch (e) {} };

  function popup(x, y, txt, color = "#ffe066", size = 20, life = 0.9) {
    popups.push({ x, y, txt, color, size, t: life, life });
  }

  function hudRight() {
    let s = "";
    if (player.shield) s += "SHIELD ";
    for (const [k, label] of [["spread", "SPREAD"], ["rapid", "RAPID"], ["pierce", "PIERCE"]]) {
      if (power[k] > 0) s += `${label} ${Math.max(1, Math.ceil(power[k]))}s `;
    }
    s += "♥".repeat(Math.max(0, player.hp));
    return s.trim() || "—";
  }

  // ---- spawning (weighted by score so the roster ramps) -------------------------
  const ARCHES = [
    { k: "grunt",  base: 1.00, door: 0.00, w: (p) => 1.0 },
    { k: "float",  base: 0.55, door: 0.05, w: (p) => 0.55 },
    { k: "sine",   base: 0.30, door: 0.11, w: (p) => 0.30 + 0.30 * p },
    { k: "armor",  base: 0.26, door: 0.24, w: (p) => 0.26 + 0.30 * p },
    { k: "diver",  base: 0.30, door: 0.34, w: (p) => 0.30 + 0.22 * p },
    { k: "strafe", base: 0.26, door: 0.44, w: (p) => 0.26 + 0.25 * p },
    { k: "radial", base: 0.24, door: 0.55, w: (p) => 0.24 + 0.25 * p },
    { k: "mine",   base: 0.20, door: 0.62, w: (p) => 0.20 + 0.22 * p },
    { k: "zig",    base: 0.22, door: 0.70, w: (p) => 0.22 + 0.24 * p },
    { k: "mini",   base: 0.18, door: 0.76, w: (p) => 0.18 + 0.26 * p },
  ];
  function pickKind(p) {
    const cands = ARCHES.filter((a) => p >= a.door);
    let tot = 0;
    for (const a of cands) tot += a.w(p);
    let r = Math.random() * tot;
    for (const a of cands) { r -= a.w(p); if (r <= 0) return a.k; }
    return cands[cands.length - 1].k;
  }

  function spawnEnemy(kind, x, y) {
    const e = {
      kind, x, y, vx: 0, vy: 0, hp: 1, val: 100, ph: Math.random() * 6.28,
      flash: 0, id: Math.random().toString(36).slice(2, 9), fire: 0, fireT: 0,
      baseWob: x, wobble: 30, size: null, state: 0, stateT: 0,
    };
    switch (kind) {
      case "grunt":
        e.hp = 1; e.val = 180; e.vx = (Math.random() * 2 - 1) * 55;
        e.vy = 30 + score * 0.012 + Math.random() * 18;
        e.wobble = 30 + Math.random() * 18; e.size = 32; break;
      case "float":
        e.hp = 3; e.val = 420; e.vy = 18 + score * 0.008; e.wobble = 46; e.size = 50; break;
      case "sine":
        e.hp = 1; e.val = 230; e.vy = 48 + score * 0.010; e.wobble = 120; e.size = 36; break;
      case "diver":
        e.hp = 2; e.val = 280; e.vy = 0; e.vx = 0; e.size = 38; e.state = 0; e.stateT = 0.85; break;
      case "strafe":
        e.hp = 3; e.val = 380; e.size = 40; e.state = 0; e.fireT = 1.8 + Math.random() * 0.6; break;
      case "radial":
        e.hp = 3; e.val = 440; e.size = 40; e.vy = 30 + score * 0.006; e.fire = 0; e.fireT = 0; break;
      case "mine":
        e.hp = 2; e.val = 320; e.size = 36; e.vy = 24 + score * 0.006; e.fireT = 2.6 + Math.random(); break;
      case "zig":
        e.hp = 2; e.val = 360; e.size = 38; e.vx = (Math.random() < 0.5 ? -1 : 1) * (110 + Math.random() * 45);
        e.vy = 100 + Math.random() * 32; break;
      case "armor":
        e.hp = 2; e.val = 250; e.vy = 26 + score * 0.010; e.wobble = 26; e.size = 44; break;
      case "mini":
        e.hp = 3; e.val = 480; e.size = 30; e.state = 0; e.stateT = 1.6 + Math.random(); e.vy = 14; break;
      case "tiny":
        e.hp = 1; e.val = 70; e.size = 16; e.vy = 0; e.vx = 0; break;
    }
    enemies.push(e);
  }

  function addAnnounce(x, kind, t) { announce.push({ x, kind, t, dur: t }); }

  // ---- pickups ----------------------------------------------------------------
  function spawnPickup(kind, x, y) {
    const k = kind || "shield";
    pickups.push({ kind: k, x, y: Math.min(y, 130), vy: 64, ph: Math.random() * 6.28 });
  }
  function dropLoot(x, y, kindName) {
    // kindName = "float" | "elite" | "grunt" | "boss"
    if (kindName === "float") {
      spawnPickup("shield", x, y);
      popup(x, y - 34, "SHIELD DROP!", "#7dfcff", 18, 1.1);
      if (Math.random() < 0.35) spawnPickup(pick(["spread", "rapid", "pierce"]), x, y);
      if (Math.random() < 0.05) spawnPickup("heart", x, y);
    } else if (kindName === "elite") {
      if (Math.random() < 0.16) spawnPickup("shield", x, y);
      if (Math.random() < 0.30) spawnPickup(pick(["spread", "rapid", "pierce"]), x, y);
      if (Math.random() < 0.06) spawnPickup("heart", x, y);
    } else if (kindName === "grunt") {
      if (Math.random() < 0.10) spawnPickup("shield", x, y);
      if (Math.random() < 0.04) spawnPickup(pick(["spread", "rapid", "pierce"]), x, y);
      if (Math.random() < 0.03) spawnPickup("heart", x, y);
    } else if (kindName === "boss") {
      if (Math.random() < 0.5) spawnPickup("shield", x, y);
      spawnPickup(pick(["spread", "rapid", "pierce"]), x, y);
    }
  }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function rate() {
    const r = Math.min(baseRate * 1.55, baseRate * (1 + 0.8 * (score / target)));
    return player.hp === 1 ? r * 0.85 : r;
  }

  // ---- combat ----------------------------------------------------------------
  function boom(x, y, n = 14, spread = 140) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * (60 + Math.random() * spread), vy: Math.sin(a) * (60 + Math.random() * spread), t: 0.5 + Math.random() * 0.3 });
    }
  }

  function isElite(kind) {
    return ["float", "sine", "diver", "strafe", "radial", "mine", "zig", "armor", "mini"].includes(kind);
  }

  function kill(e) {
    score += e.val;
    sfx("boom");
    shake(0.28);
    boom(e.x, e.y);
    popup(e.x, e.y, `+${e.val}`, isElite(e.kind) ? "#7dfcff" : "#ffe066", isElite(e.kind) ? 24 : 20);
    if (e.kind === "float") dropLoot(e.x, e.y, "float");
    else if (e.kind === "grunt") dropLoot(e.x, e.y, "grunt");
    else dropLoot(e.x, e.y, "elite");
    api.hud({ mid: `${score}/${target}`, right: hudRight() });
    maybeStartBoss();
  }

  function fireVolley() {
    const spread = power.spread > 0;
    const angles = spread ? [-0.28, 0, 0.28] : [0];
    for (const a of angles) {
      bullets.push({
        x: player.x, y: player.y - 26,
        vx: Math.sin(a) * 640, vy: -Math.cos(a) * 640,
        pierce: power.pierce > 0 ? 1 : 0, hit: [],
      });
    }
    sfx("shoot");
    mf = 0.06;
  }

  function applyPowerup(kind) {
    if (kind === "spread") { power.spread = POWER_T; popup(player.x, player.y - 46, "SPREAD!", "#ffa94d", 22, 1.0); }
    else if (kind === "rapid") { power.rapid = POWER_T; popup(player.x, player.y - 46, "RAPID!", "#69db7c", 22, 1.0); }
    else if (kind === "pierce") { power.pierce = POWER_T; popup(player.x, player.y - 46, "PIERCE!", "#4dabf7", 22, 1.0); }
    sfx("powerup");
  }

  function gainHeart() {
    // booth-level life via the duck-typed lives bank (may be absent → self-contained).
    try { api.lives?.gain?.(1); } catch (e) {}
    const healed = player.hp < maxHp;
    player.hp = Math.min(maxHp, player.hp + 1);
    popup(player.x, player.y - 46, healed ? "1-UP + SHIELD!" : "1-UP!", "#ff8787", 22, 1.1);
    sfx("win");
    api.hud({ right: hudRight() });
  }

  function clearNearby(dx, dy) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (Math.abs(en.x - player.x) < dx && Math.abs(en.y - player.y) < dy) enemies.splice(i, 1);
    }
    for (let i = mines.length - 1; i >= 0; i--) {
      if (Math.abs(mines[i].x - player.x) < dx && Math.abs(mines[i].y - player.y) < dy) mines.splice(i, 1);
    }
    for (let i = ebullets.length - 1; i >= 0; i--) {
      if (Math.abs(ebullets[i].x - player.x) < dx && Math.abs(ebullets[i].y - player.y) < dy) ebullets.splice(i, 1);
    }
  }

  function hitPlayer() {
    if (player.shield) {
      player.shield = false;
      player.inv = 1.2;
      popup(player.x, player.y - 40, "SHIELD DOWN!", "#7dfcff", 20, 1.0);
      sfx("hit");
      shake(0.5);
      return;
    }
    player.hp--;
    player.inv = 2.2;
    sfx("hit");
    shake(0.8);
    clearNearby(190, 200);
    if (player.hp <= 0) {
      status = "dying"; dyingT = 0;
      api.hud({ right: hudRight() });
    } else {
      popup(player.x, player.y - 40, player.hp === 1 ? "SHIELDS CRITICAL!" : "HIT!", "#ff5f6d", 22, 1.0);
      api.hud({ right: hudRight() });
    }
  }

  function finishLose() {
    if (status !== "dying" || loseBegin) return;
    loseBegin = true;
    status = "lost";
    api.eng.flash = 0.4;
    sfx("lose");
    api.fail();
  }

  // ---- boss ------------------------------------------------------------------
  function maybeStartBoss() {
    if (spawnHalted || boss || bossDefeated) return;
    if (score >= target * BOSS_AT) startBoss();
  }

  function startBoss() {
    spawnHalted = true;
    // clear the horde so the duel is readable
    for (const e of enemies) boom(e.x, e.y, 8, 90);
    enemies = []; ebullets = []; mines = []; announce = [];
    boss = {
      x: W / 2, y: 112, hp: 46, maxHp: 46, phase: 1,
      ph: Math.random() * 6.28, ringA: 0, atk: 0, atkT: 1.6, fireT: 0,
      inv: 1.2, dead: false, deadT: 0, beats: 0,
    };
    player.shield = true;                          // a free shield as you take the stage (booth-forgiving)
    player.inv = Math.max(player.inv, 1.0);
    popup(W / 2, 200, "BOSSCRAFT", "#ffd166", 40, 1.6);
    popup(W / 2, 240, "SHIELD READY — DESTROY IT", "#ff8787", 18, 1.6);
    sfx("bossRoar");
    shake(1);
    api.hud({ mid: `${score}/${target}`, right: hudRight() });
  }

  function bossPhaseThresholds() {
    return [boss.maxHp * (2 / 3), boss.maxHp * (1 / 3)];
  }

  function bossCheckPhase() {
    if (!boss) return;
    if (boss.hp <= 0 && !boss.dead) {
      boss.dead = true; boss.deadT = 0; boss.beats = 0;
      popup(boss.x, boss.y, "SIGNAL LOST", "#ffd166", 30, 1.6);
      sfx("bossRoar");
      return;
    }
    if (boss.phase >= 3) return;
    const [t2, t3] = bossPhaseThresholds();
    if (boss.phase === 1 && boss.hp <= t2) {
      boss.phase = 2; boss.inv = 1.0; boss.atk = 0; boss.atkT = 1.4; boss.fireT = 0;
      popup(boss.x, boss.y - 70, "PHASE 2", "#4dabf7", 26, 1.2);
      sfx("bossRoar");
      // guaranteed 1-UP after the first phase beats you back (R9)
      spawnPickup("heart", boss.x, boss.y + 30);
      dropLoot(boss.x, boss.y + 30, "boss");
    } else if (boss.phase === 2 && boss.hp <= t3) {
      boss.phase = 3; boss.inv = 1.0; boss.atk = 0; boss.atkT = 1.0; boss.fireT = 0;
      popup(boss.x, boss.y - 70, "PHASE 3", "#ffa94d", 26, 1.2);
      sfx("bossRoar");
      dropLoot(boss.x, boss.y + 30, "boss");
    }
  }

  function bossFireAimed(angleCount, speed = 180, spreadRad = 0.0) {
    const base = Math.atan2(player.y - boss.y, player.x - boss.x);
    const count = angleCount;
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * (Math.PI / (count * 2) * 2) + spreadRad * (i - (count - 1) / 2);
      if (ebullets.length >= MAX_EBULLETS) break;
      ebullets.push({ x: boss.x, y: boss.y + 30, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ttl: 6 });
    }
  }

  function bossRadial(n, speed = 150) {
    for (let i = 0; i < n; i++) {
      if (ebullets.length >= MAX_EBULLETS) break;
      const a = (i / n) * Math.PI * 2;
      ebullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ttl: 6 });
    }
  }

  function updateBoss(dt) {
    if (boss.dead) {
      boss.deadT += dt;
      if (boss.beats < 3 && boss.deadT >= boss.beats * 0.42) {
        boom(boss.x + (Math.random() - 0.5) * 90, boss.y + (Math.random() - 0.5) * 60, 16, 190);
        sfx("boom"); shake(0.4);
        boss.beats++;
      }
      if (boss.beats >= 3 && boss.deadT >= 1.7) {
        boom(boss.x, boss.y, 40, 260);
        sfx("boom"); shake(1);
        api.eng.flash = 0.8;
        boss = null; bossDefeated = true;
        score += Math.max(Math.round(target * 0.15), 900);
        status = "won";
        sfx("win");
        api.hud({ mid: `${score}/${target}`, right: hudRight() });
        api.complete({ score });
      }
      return;
    }

    boss.ringA += dt * (boss.phase === 3 ? 1.4 : 0.6);
    boss.inv = Math.max(0, boss.inv - dt);
    boss.atkT -= dt;

    // movement per phase
    if (boss.phase === 1) {
      boss.x = W / 2 + Math.sin(t * 0.6 + boss.ph) * (W * 0.18);
      boss.y = 112 + Math.sin(t * 0.9) * 12;
      if (boss.atkT <= 0) {
        boss.fireT -= dt;
        if (boss.fireT <= 0) { bossFireAimed(1, 150); boss.fireT = 0.9; }
        if (boss.atkT <= -3.2) { boss.atkT = 1.6; boss.fireT = 0; }
      }
    } else if (boss.phase === 2) {
      boss.x = W / 2 + Math.sin(t * 1.0 + boss.ph) * (W * 0.20);
      boss.y = 140 + Math.sin(t * 1.8) * 28;
      if (boss.atkT <= 0) {
        boss.fireT -= dt;
        if (boss.fireT <= 0) { bossRadial(5, 110); boss.fireT = 1.2; }
        if (boss.atkT <= -1.6) { boss.atkT = 1.4; boss.fireT = 0; }
      }
    } else {
      boss.x = W / 2 + Math.sin(t * 1.6 + boss.ph) * (W * 0.18);
      boss.y = 170 + Math.sin(t * 1.3 + boss.ph) * 42;
      if (boss.atkT <= 0) {
        boss.fireT -= dt;
        if (boss.fireT <= 0) { bossFireAimed(2, 150); bossRadial(3, 95); boss.fireT = 1.05; }
        if (boss.atkT <= -0.8) { boss.atkT = 1.1; boss.fireT = 0; }
      }
    }
    bossCheckPhase();
  }

  // ---- enemy firing helpers ----------------------------------------------------
  function enemyFireAimed(e, speed = 200) {
    if (ebullets.length >= MAX_EBULLETS) return;
    const base = Math.atan2(player.y - e.y, player.x - e.x);
    ebullets.push({ x: e.x, y: e.y + 16, vx: Math.cos(base) * speed, vy: Math.sin(base) * speed, ttl: 6 });
  }
  function enemyRadial(e, n = 8, speed = 150) {
    for (let i = 0; i < n; i++) {
      if (ebullets.length >= MAX_EBULLETS) break;
      const a = (i / n) * Math.PI * 2;
      ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ttl: 6 });
    }
  }
  function dropMine(e) {
    if (mines.length >= MAX_MINES) return;
    mines.push({ x: e.x, y: e.y, vx: (Math.random() < 0.5 ? -1 : 1) * 46, vy: 34, bounce: 0 });
  }

  // ---- update ----------------------------------------------------------------
  function update(dt, input) {
    if (status === "dying") {
      dyingT += dt;
      for (const p of popups) { p.y -= 26 * dt; p.t -= dt; }
      popups = popups.filter((p) => p.t > 0);
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.t -= dt; }
      parts = parts.filter((p) => p.t > 0);
      if (dyingT > 1.1) finishLose();
      return;
    }
    if (status !== "playing") return;

    t += dt;
    player.inv = Math.max(0, player.inv - dt);
    player.cool = Math.max(0, player.cool - dt);
    mf = Math.max(0, mf - dt);
    for (const k of ["spread", "rapid", "pierce"]) power[k] = Math.max(0, power[k] - dt);

    // ---- input: 8-way movement (WASD + arrows), tolerating both input shapes ----
    const il = inp(input, "left"), ir = inp(input, "right");
    const iu = inp(input, "up"), id = inp(input, "down") || inp(input, "downKey");
    let mx = (ir ? 1 : 0) - (il ? 1 : 0);
    let my = (id ? 1 : 0) - (iu ? 1 : 0);
    if (mx && my) { const inv = 1 / Math.SQRT2; mx *= inv; my *= inv; }
    const spd = 330;
    player.x = clamp(player.x + mx * spd * dt, 44, W - 44);
    player.y = clamp(player.y + my * spd * dt, 90, H - 56);

    if (fireHeld(input) && player.cool <= 0) {
      player.cool = 0.16 * (power.rapid > 0 ? 0.5 : 1);
      fireVolley();
    }

    // ---- SWARM surge (halts during boss duel) ----
    if (!spawnHalted && surgeLeft === 0 && t > surgeAt) {
      surgeLeft = 5; surgeAcc = 0;
      popup(W / 2, 150, "SWARM INCOMING!", "#ff5f6d", 26, 1.3);
      surgeAt = t + 16 + Math.random() * 6;
    }
    if (surgeLeft > 0) {
      surgeAcc += dt * 5;
      while (surgeAcc >= 1) {
        surgeAcc -= 1;
        if (surgeLeft > 0 && enemies.length < MAX_ENEMIES + 4 && !spawnHalted) { surgeLeft -= 1; spawnEnemy("grunt", 60 + Math.random() * (W - 120), -30); }
      }
    }

    // ---- regular spawner (drains at cap; halts during boss) ----
    if (!spawnHalted) {
      const p = clamp(score / target, 0, 1);
      spawnAcc += dt * rate();
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        if (enemies.length < MAX_ENEMIES) {
          const k = pickKind(p);
          if (k === "float") addAnnounce(Math.random() < 0.5 ? 100 + Math.random() * 80 : W - 180 + Math.random() * 80, "float", 1.2);
          else if (k === "diver") addAnnounce(60 + Math.random() * (W - 120), "diver", 0.85);
          else spawnEnemy(k, 60 + Math.random() * (W - 120), -30);
        }
      }
    }

    // ---- float/diver telegraphs ----
    for (const a of announce) a.t -= dt;
    for (let i = announce.length - 1; i >= 0; i--) {
      if (announce[i].t <= 0) { spawnEnemy(announce[i].kind, announce[i].x, -30); announce.splice(i, 1); }
    }

    // ---- player bullets ----
    for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    bullets = bullets.filter((b) => b.y > -40 && b.y < H + 40 && b.x > -40 && b.x < W + 40);

    // ---- enemy bullets ----
    for (const b of ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt;
      if (b.ttl <= 0 || b.y > H + 20 || b.y < -20 || b.x < -20 || b.x > W + 20) b.dead = true;
    }
    ebullets = ebullets.filter((b) => !b.dead);

    // ---- enemies move ----
    for (const e of enemies) {
      e.flash = Math.max(0, e.flash - dt);
      const sp = clamp(score / target, 0, 1);
      switch (e.kind) {
        case "grunt":
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.x += Math.sin(t * 2.4 + e.ph) * e.wobble * dt;
          if (e.x < 42 || e.x > W - 42) e.vx *= -1;
          break;
        case "float":
          e.x = clamp(e.baseWob + Math.sin(t * 0.7 + e.ph) * (W * 0.3), 50, W - 50);
          e.y += e.vy * dt;
          break;
        case "sine": // fast weave
          e.y += e.vy * dt;
          e.x += Math.sin(t * 3.4 + e.ph) * e.wobble * dt;
          e.x = clamp(e.x, 40, W - 40);
          break;
        case "diver": // telegraph then dive
          e.y += e.vy * dt;
          if (e.state === 0) { e.stateT -= dt; if (e.stateT <= 0) { e.state = 1; e.vx = clamp((player.x - e.x) / 0.45, -220, 220); e.vy = 178 + sp * 90; } }
          else { e.x += e.vx * dt; e.y += e.vy * dt; }
          break;
        case "strafe": // top strafer, fires aimed shots
          if (e.y < 150 + Math.random() * 30) e.y += 40 * dt;
          e.x = clamp(e.baseWob + Math.sin(t * 0.8 + e.ph) * (W * 0.24), 50, W - 50);
          e.fireT -= dt;
          if (e.fireT <= 0) { enemyFireAimed(e, EBULLET_SPEED); e.fireT = 2.0 + Math.random() * 0.8; }
          break;
        case "radial": // slow, 8-way burst when in range
          e.y += e.vy * dt;
          if (!e.fire && Math.abs(e.y - player.y) < 260 && e.y > 60) { enemyRadial(e, 6, 130); e.fire = 1; e.fireT = 0.4; }
          if (e.fire > 0) { e.fireT -= dt; if (e.fireT <= 0) e.fire = 2; }
          break;
        case "mine": // slow, drops bouncing mines
          e.y += e.vy * dt;
          e.x = clamp(e.baseWob + Math.sin(t * 0.5 + e.ph) * (W * 0.18), 50, W - 50);
          e.fireT -= dt;
          if (e.fireT <= 0) { dropMine(e); e.fireT = 3.2 + Math.random() * 1.4; }
          break;
        case "zig": // fast diagonal slash, bounces
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.x < 44 || e.x > W - 44) e.vx *= -1;
          break;
        case "armor": // chunky grunt, 2hp (ring drawn in draw())
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.x += Math.sin(t * 2.0 + e.ph) * e.wobble * dt;
          if (e.x < 42 || e.x > W - 42) e.vx *= -1;
          break;
        case "mini": // spawner: drips capped tiny chasers
          e.y += e.vy * dt;
          e.x = clamp(e.baseWob + Math.sin(t * 0.4 + e.ph) * (W * 0.2), 50, W - 50);
          e.stateT -= dt;
          if (e.stateT <= 0) {
            e.stateT = 1.6 + Math.random();
            const tinyCount = enemies.filter((x) => x.kind === "tiny").length;
            if (tinyCount < MAX_TINY) spawnEnemy("tiny", e.x, e.y + 12);
          }
          break;
        case "tiny": // slow homing chaser
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          e.x += Math.cos(ang) * 52 * dt;
          e.y += Math.sin(ang) * 52 * dt;
          break;
      }
    }
    enemies = enemies.filter((e) => e.y < H + 60);

    // ---- mines bounce (slow-rising) ----
    for (const m of mines) {
      m.y -= m.vy * dt;
      m.x += m.vx * dt;
      if (m.x < 30 || m.x > W - 30) m.vx *= -1;
    }
    mines = mines.filter((m) => m.y > -20 && m.y < H + 20);

    // ---- player bullets collide with enemies/mines/boss ----
    if (!spawnHalted || boss) {
      for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi];
        let consumed = false;
        // boss (big hitbox)
        if (boss && !boss.dead && boss.inv <= 0) {
          const hr = 62;
          if (Math.abs(b.x - boss.x) < hr && Math.abs(b.y - boss.y) < hr + 20) {
            if (!b.hit.includes(boss)) {
              boss.hp -= 1;
              bossCheckPhase();
              if (b.pierce > 0) { b.pierce -= 1; b.hit.push(boss); }
              else consumed = true;
            }
          }
        }
        if (!consumed) {
          for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (b.hit.includes(e.id)) continue;
            const hitR = ((e.size || 30) / 2) + 6;
            if (Math.abs(b.x - e.x) < hitR && Math.abs(b.y - e.y) < hitR) {
              e.hp -= 1;
              if (e.hp <= 0) { enemies.splice(i, 1); if (status === "playing") kill(e); }
              else {
                e.flash = 0.14;
                sfx("push");
                if (e.kind === "grunt" || e.kind === "armor") e.vx = clamp(e.vx + (b.x < e.x ? -40 : 40), -70, 70);
              }
              if (b.pierce > 0) { b.pierce -= 1; b.hit.push(e.id); }
              else consumed = true;
              break;
            }
          }
        }
        if (!consumed) {
          for (let i = mines.length - 1; i >= 0; i--) {
            const m = mines[i];
            if (Math.abs(b.x - m.x) < 20 && Math.abs(b.y - m.y) < 20) {
              mines.splice(i, 1);
              boom(m.x, m.y, 8, 90);
              sfx("boom");
              if (b.pierce > 0) { b.pierce -= 1; } else consumed = true;
              break;
            }
          }
        }
        if (consumed) bullets.splice(bi, 1);
        if (status !== "playing") break;
      }
    }
    if (status !== "playing") return;

    // ---- boss update ----
    if (boss) updateBoss(dt);

    // ---- pickups drift + collect ----
    for (const pk of pickups) {
      pk.y += pk.vy * dt;
      pk.x += Math.sin(t * 1.4 + pk.ph) * 20 * dt;
    }
    pickups = pickups.filter((pk) => pk.y < H + 30);
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      if (Math.abs(pk.x - player.x) < 40 && Math.abs(pk.y - player.y) < 44) {
        pickups.splice(i, 1);
        if (pk.kind === "shield") { player.shield = true; popup(player.x, player.y - 42, "SHIELD UP!", "#7dfcff", 22, 1.0); sfx("coin"); }
        else if (pk.kind === "heart") { gainHeart(); }
        else { applyPowerup(pk.kind); }
        api.hud({ right: hudRight() });
      }
    }

    // ---- enemy contact (only when not invulnerable) ----
    if (player.inv <= 0) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const r = ((e.size || 30) / 2) + 2;
        if (Math.abs(e.x - player.x) < r && Math.abs(e.y - player.y) < r + 2) {
          enemies.splice(i, 1);
          hitPlayer();
          break;
        }
      }
    }
    // mines hit the player
    if (player.inv <= 0) {
      for (let i = mines.length - 1; i >= 0; i--) {
        const m = mines[i];
        if (Math.abs(m.x - player.x) < 20 && Math.abs(m.y - player.y) < 24) {
          mines.splice(i, 1);
          hitPlayer();
          break;
        }
      }
    }
    // enemy bullets hit the player
    if (player.inv <= 0) {
      for (let i = ebullets.length - 1; i >= 0; i--) {
        const b = ebullets[i];
        if (Math.abs(b.x - player.x) < 16 && Math.abs(b.y - player.y) < 20) {
          ebullets.splice(i, 1);
          hitPlayer();
          break;
        }
      }
    }
    if (status !== "playing") return;

    // ---- particles ----
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.t -= dt; }
    parts = parts.filter((p) => p.t > 0);

    // ---- popups ----
    for (const p of popups) { p.y -= 26 * dt; p.t -= dt; }
    popups = popups.filter((p) => p.t > 0);

    api.hud({ mid: `${score}/${target}`, right: hudRight() });
  }

  // tolerant input reader — the engine passes a function-shaped object
  // (left()/right()/up()/downKey()/down(code)); headless sims pass a flat
  // {left,right,up,down,fire} flag object. Both are read here.
  function inp(input, k) {
    if (!input) return false;
    const v = input[k];
    return typeof v === "function" ? !!v() : !!v;
  }
  function fireHeld(input) {
    if (inp(input, "fire")) return true;
    if (input && typeof input.down === "function") return !!(input.down("Space") || input.down("KeyZ"));
    return false;
  }

  // ---- draw -------------------------------------------------------------------
  function draw(ctx) {
    drawBackdrop(ctx, st, t, 0.44, t);

    // score progress bar (center-out, readable, symmetric)
    const p = Math.min(1, score / target);
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(W / 2 - 140, 58, 280, 8);
    ctx.fillStyle = st.accent || "#7dfcff";
    ctx.fillRect(W / 2 - 140 * p, 58, 280 * p, 8);

    // boss HP bar (top of canvas) when the duel is live
    if (boss && !boss.dead) {
      const bp = clamp(boss.hp / boss.maxHp, 0, 1);
      const bw = 520;
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(W / 2 - bw / 2, 22, bw, 14);
      const phaseCol = ["#ffd166", "#748ffc", "#ff5f6d"][boss.phase - 1];
      ctx.fillStyle = phaseCol;
      ctx.fillRect(W / 2 - bw / 2, 22, bw * bp, 14);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(W / 2 - bw / 2, 22, bw, 14);
      for (const f of bossPhaseThresholds()) {
        ctx.fillStyle = "#0b1030";
        ctx.fillRect(W / 2 - bw / 2 + bw * (f / boss.maxHp), 22, 2, 14);
      }
      ctx.globalAlpha = 0.9;
      drawText(ctx, `DREADNOUGHT — PHASE ${boss.phase}`, W / 2, 44, { size: 14, color: "#fff", weight: "bold", shadow: "rgba(0,0,0,.8)" });
      ctx.globalAlpha = 1;
    }

    // float/diver telegraph rings
    for (const a of announce) {
      const pulse = 0.4 + 0.5 * Math.abs(Math.sin(t * 8));
      ctx.globalAlpha = pulse * 0.7;
      ctx.strokeStyle = a.kind === "diver" ? "#ff922b" : (st.accent || "#7dfcff");
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(a.x, 18, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(a.x, 18, 9 + 8 * (1 - a.t / a.dur), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // player bullets
    for (const b of bullets) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = st.bullet || "#ffe066";
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 3.2, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 6, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // enemy bullets (distinct magenta)
    for (const b of ebullets) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#c2255c";
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // mines
    for (const m of mines) drawPx(ctx, "mine", m.x, m.y, 0, 26);

    // enemies
    for (const e of enemies) {
      const name = e.kind === "float" ? "float"
        : e.kind === "sine" ? "sine"
        : e.kind === "diver" ? "diver"
        : e.kind === "strafe" ? "strafe"
        : e.kind === "radial" ? "radial"
        : e.kind === "mine" ? "mine"
        : e.kind === "zig" ? "zig"
        : e.kind === "armor" ? "armor"
        : e.kind === "mini" ? "mini"
        : e.kind === "tiny" ? "tiny"
        : "grunt";
      let rot = 0;
      if (e.kind === "float") rot = Math.sin(t * 0.7 + e.ph) * 0.1;
      else if (e.kind === "grunt" || e.kind === "armor") rot = Math.sin(t * 3 + e.ph) * 0.12;
      else if (e.kind === "zig") rot = e.vx > 0 ? 0.35 : -0.35;
      else if (e.kind === "sine") rot = Math.sin(t * 3.4 + e.ph) * 0.2;
      drawPx(ctx, name, e.x, e.y, rot, e.size);
      if (e.flash > 0) drawPxFlash(ctx, name, e.x, e.y, rot, e.flash, e.size);
      // armored grunt ring visual (2 hits)
      if (e.kind === "armor") {
        ctx.globalAlpha = 0.5 + 0.3 * Math.abs(Math.sin(t * 6));
        ctx.strokeStyle = "#ced4da";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // boss (core + rotating armor ring)
    if (boss && !boss.dead) {
      const blink = boss.inv > 0 && Math.floor(t * 14) % 2 === 0;
      ctx.globalAlpha = blink ? 0.4 : 1;
      const R = 74;
      const plates = 8;
      for (let i = 0; i < plates; i++) {
        const a = boss.ringA + (i / plates) * Math.PI * 2;
        const px = boss.x + Math.cos(a) * R;
        const py = boss.y + Math.sin(a) * R * 0.7;
        drawPx(ctx, "bossP", px, py, a + Math.PI / 2, 30);
      }
      // outer glow
      ctx.globalAlpha = 0.25 + 0.15 * Math.abs(Math.sin(t * 3));
      ctx.strokeStyle = "#845ef7";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(boss.x, boss.y, 62, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      drawPx(ctx, "bossC", boss.x, boss.y, 0, 92);
      ctx.globalAlpha = 1;
    }

    // pickups (shield + powerup orbs + heart)
    for (const pk of pickups) {
      const bob = Math.sin(t * 4 + pk.ph) * 4;
      const col = pk.kind === "shield" ? "#7dfcff"
        : pk.kind === "spread" ? "#ffa94d"
        : pk.kind === "rapid" ? "#69db7c"
        : pk.kind === "pierce" ? "#4dabf7"
        : "#ff8787";
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(t * 4 + pk.ph));
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      drawPx(ctx, pk.kind === "pick" ? "pick" : (pk.kind === "heart" ? "pick" : "pick"), pk.x, pk.y + bob, 0, 30);
      // small label glyph baked over the orb is unnecessary; the ring colour reads the type
      if (pk.kind !== "shield" && pk.kind !== "heart") {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = col;
        ctx.font = "bold 11px 'Trebuchet MS',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(pk.kind === "spread" ? "S" : pk.kind === "rapid" ? "R" : "P", pk.x, pk.y + bob + 4);
        ctx.globalAlpha = 1;
      }
    }

    // player + thruster
    if (player.inv <= 0 || Math.floor(t * 14) % 2 === 0) {
      if (player.shield) {
        ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(t * 5));
        ctx.strokeStyle = "#7dfcff";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(player.x, player.y, 36, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 9));
      ctx.fillStyle = st.bullet || "#ffd23e";
      ctx.beginPath(); ctx.ellipse(player.x, player.y + 26, 4, 12 + Math.sin(t * 22) * 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (mf > 0) {
        ctx.globalAlpha = Math.min(1, mf / 0.06) * 0.85;
        ctx.fillStyle = st.bullet || "#ffe066";
        const mr = 5 + 9 * (1 - mf / 0.06);
        ctx.beginPath();
        ctx.moveTo(player.x - mr, player.y - 24);
        ctx.lineTo(player.x, player.y - 24 - mr * 0.6);
        ctx.lineTo(player.x + mr, player.y - 24);
        ctx.lineTo(player.x, player.y - 24 + mr * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      drawPx(ctx, "ship", player.x, player.y, 0);
    }

    // particles
    for (const q of parts) {
      ctx.globalAlpha = Math.max(0, q.t * 1.6);
      ctx.fillStyle = "#ffd23e";
      ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
      ctx.globalAlpha = 1;
    }

    // popups
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.t / p.life) * 1.4));
      drawText(ctx, p.txt, p.x, p.y, { size: p.size, color: p.color, weight: "bold", shadow: "rgba(0,0,0,.7)" });
      ctx.globalAlpha = 1;
    }

    // arcade CRT dressing: faint scanlines + corner vignette
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#000";
    for (let sy = 0; sy < H; sy += 4) ctx.fillRect(0, sy, W, 2);
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.98);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,12,0.22)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // banners
    if (status === "dying") {
      drawText(ctx, "SHIELDS DOWN", W / 2, H * 0.4, { size: 42, color: "#ff5f6d", weight: "bold", alpha: 0.55 + 0.45 * Math.abs(Math.sin(dyingT * 6)), shadow: "rgba(0,0,0,.8)" });
    } else if (t < 3.2) {
      drawBilingualText(ctx, level.objective || "", W / 2, 468, { size: 18, color: "#fff", alpha: t > 2.6 ? (3.2 - t) / 0.6 : 1, shadow: "rgba(0,0,0,.8)" });
    }
  }

  api.hud({ mid: `0/${target}`, right: hudRight() });

  // state probe — game tests & the in-page debug hook both use it (api instance-scoped)
  api.__dbg = () => ({
    score, target, hp: player.hp, shield: player.shield, status, t,
    px: player.x, py: player.y, power: { ...power },
    boss: boss && !boss.dead ? { x: boss.x, y: boss.y, hp: boss.hp, maxHp: boss.maxHp, phase: boss.phase, dead: false } : (bossDefeated ? { dead: true, defeated: true } : null),
    enemies: enemies.map((e) => ({ x: e.x, y: e.y, kind: e.kind, hp: e.hp, vx: e.vx, vy: e.vy, state: e.state })),
    pickups: pickups.map((p) => ({ kind: p.kind, x: p.x, y: p.y })),
    ebullets: ebullets.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
    mines: mines.map((m) => ({ x: m.x, y: m.y, vx: m.vx, vy: m.vy })),
  });

  // ---- debug hook (inert without ?debugShooter=1) ----
  const DBG_STUB = { left: () => false, right: () => false, down: () => false, up: () => false, jumpJust: () => false, anyJust: () => false };
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("debugShooter")) {
    window.__shooter = {
      state: () => api.__dbg(),
      step: (d, inp) => (status === "playing" || status === "dying") ? update(d, inp || DBG_STUB) : undefined,
      render: () => {
        const canvas = document.querySelector("#stage");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const s = Math.min(canvas.width / W, canvas.height / H);
        const ox = (canvas.width - W * s) / 2, oy = (canvas.height - H * s) / 2;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#05060f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(s, 0, 0, s, ox, oy);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        draw(ctx);
        ctx.restore();
      },
      forceScore: (s) => { score = s; maybeStartBoss(); },
    };
  }

  return { update, draw, status: () => status };
}
