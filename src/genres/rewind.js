// REWIND genre — "Rewind Loop" · ian-spence-rewind-loop
// Ian Spence (Leaseweb Canada) pitched, relayed by the operator at the booth: a platformer
// where the game moves BACKWARDS. You can never move forward — the position ratchets one
// way only. Phase 1: climb up-and-LEFT across decks and trees to the REWIND GATE at the
// top-left. The gate flips the world: phase 2 forces you back down-and-RIGHT to where you
// started. Everything runs backwards in time: walkers moonwalk at you, rewind wraiths
// chase then snap back along their own trail, birds fly tail-first. Portals drag you back
// to the beginning — including the "exit" portal that just restarts the whole level.
// Forever. The ONLY way to end the level is to die. Death IS the win: "Congratulations,
// you won by dying — here's the next level."
//
// LEVEL SHAPE — the climb is a two-stage stair: a 4-deck RISE (up ~60-84 px per deck), then
// a long TERRACE walk (flat planks left), alternating until the gate. So the march covers
// ~200 ft of horizontal world while gaining ~10 screens of height. Phase 2 simply runs the
// mirror: fall off terrace right-edges, drop stair-decks, land on the floor at the start.
//
// KIOSK RULES — no pits, no spikes, no stomp: falls always land somewhere safe and the
// ratchet prevents wrong-way traps. Enemies are lethal on contact, which is precisely the
// point. Portal pull is escapable at the rim; the centre captures.
//
// ART — Route A procedural only (operator rule: zero emoji, zero glyphs in level.json,
// zero runtime fetches). Everything is baked once per key to offscreen canvases and
// blitted. HUD copy uses approved text glyphs (◄ ▶ ★ ♥ ✓) + plain words, EN / FR echo.
//
// BOT — ?bot=1 boots an in-module autopilot; flavors: good (plays the whole paradox,
// loops at the start-line portal at least once, then walks into an enemy to die),
// partial (deliberately eats a mid-climb portal early, then still plays on to die),
// clumsy (hops blindly and dies in seconds — proves death is a win).
// ?debug=1 → window.__REW { timeScale, state() } read-only.
// ?beats=1 → one DOM tile per story beat (#beats).

import { W, H, clamp, lerp, drawText } from "../core.js";

export const meta = {
  name: "Rewind Loop",
  controls: "EN: the level only runs BACKWARDS — phase 1 walks LEFT (RIGHT does nothing). SPACE / ↑ / W to jump. Reach the Rewind Gate at the top-left, then run it back right. FR: le niveau ne tourne qu'en REBOBINAGE — phase 1 : gauche seulement (la droite ne fait rien). ESPACE / ↑ / W pour sauter. Atteins la Porte du Rebobinage en haut à gauche, puis redescends vers la droite.",
};

// ---- palette: VHS night + ALL IN brand tokens --------------------------------------------
const C = {
  skyA: "#0b0417", skyB: "#241233", skyC: "#402350",
  ink: "#060312", inkHi: "#140a24",
  cyan: "#3ddcff", cyanHi: "#aef1ff", violet: "#8a7cff", violetHi: "#c3b9ff",
  magenta: "#ff3d9a", magentaHi: "#ff8ac2",
  wood: "#6b4a2f", woodHi: "#9c7248", woodDk: "#432b18",
  tape: "#2b1f38", tapeHi: "#4a3a66",
  leaf: "#1d4a33", leafHi: "#2c6d4a",
  skin: "#e8b98a", denim: "#3c5a8c", denimDk: "#2a3f63", shoe: "#e8e4f2",
  reel: "#c9b8ff", glow: "#ffd166",
};

function P(g, x, y, w, h, col, u = 4) { g.fillStyle = col; g.fillRect(x * u, y * u, w * u, h * u); }

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
function blit(g, c, x, y, flip = false) {
  if (flip) { g.save(); g.translate(x + c.width, y); g.scale(-1, 1); g.drawImage(c, 0, 0); g.restore(); }
  else g.drawImage(c, x, y);
}

// ---- Route A painters ---------------------------------------------------------------------
// hero: 10×14 cells @ u3 → 30×42. Frames: f0/f1 run cycle, f2 jump. Painted FACING RIGHT;
// the world flips it while it marches left (phase 1).
function paintHero(g, f) {
  const legA = f === 0 ? 1 : 0, legB = f === 2 ? 2 : 0;
  P(g, 3, 0, 4, 3, C.skin);                                   // head
  P(g, 6, 1, 1, 1, C.ink);                                    // eye (right side = facing right)
  P(g, 3, 3, 4, 5, C.denim);                                  // torso (denim jacket)
  P(g, 3, 3, 4, 1, C.denimDk);                                // collar
  P(g, 2, 4, 1, 3, C.denimDk); P(g, 7, 4, 1, 3, C.denimDk);   // arms
  P(g, 3 + legB, 8, 1, 3, C.denimDk);                         // back leg
  P(g, 5 + legA, 8, 1, 3, C.denim);                           // front leg
  P(g, 3 + legB, 11, 1, 1, C.shoe); P(g, 5 + legA, 11, 1, 1, C.shoe);
}
// tape-walker: 11×13 @ u3 — a figure with a cassette deck for a head, moonwalking toward you.
function paintWalker(g, f) {
  const step = f === 0 ? 1 : 0;
  P(g, 2, 0, 7, 4, C.tape);                                   // cassette head
  P(g, 3, 1, 2, 2, C.inkHi); P(g, 6, 1, 2, 2, C.inkHi);       // reel holes
  P(g, 2, 0, 7, 1, C.tapeHi);
  P(g, 3, 4, 5, 5, C.violet);                                 // body
  P(g, 3, 4, 5, 1, C.violetHi);
  P(g, 2, 5, 1, 3, C.inkHi); P(g, 8, 5, 1, 3, C.inkHi);       // arms
  P(g, 3, 9, 1, 2 + step, C.inkHi);                           // legs (moonwalk shuffle)
  P(g, 7, 9, 1, 2 + (1 - step), C.inkHi);
}
// rewind wraith: 9×9 @ u3 — hovering tape-plate with a static eye.
function paintWraith(g) {
  P(g, 1, 2, 7, 5, C.tape);
  P(g, 1, 2, 7, 1, C.tapeHi);
  P(g, 3, 3, 3, 2, C.magenta); P(g, 4, 3, 1, 1, C.magentaHi); // static eye
  P(g, 0, 4, 1, 1, C.tapeHi); P(g, 8, 4, 1, 1, C.tapeHi);     // side plates
  P(g, 2, 7, 2, 1, C.tapeHi); P(g, 5, 7, 2, 1, C.tapeHi);     // flutter
}
// backward bird: 10×6 @ u3 — flying tail-first (tail fans lead; wing sweeps reversed).
function paintBird(g, f) {
  const wing = f === 0 ? 1 : 2;
  P(g, 2, 2, 6, 2, C.cyan);                                   // body (tail left = leads)
  P(g, 1, 2, 1, 1, C.cyanHi);                                 // tail fan
  P(g, 3, 1, 2, 1, C.cyanHi);                                 // hump
  P(g, 8, 2, 1, 1, C.magenta);                                // eye spot at the REAR
  P(g, 4 + wing, 0 + wing - 1, 3, 1, C.cyanHi);               // reversed wing sweep
  P(g, 3, 4, 2, 1, C.cyanHi);
}
// portal vortex: 96×96, two variants (rotates live).
function paintPortal(g, v) {
  const c1 = v === 0 ? C.violet : C.cyan, c2 = v === 0 ? C.magenta : C.cyanHi;
  g.fillStyle = C.ink; g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = i % 2 ? c1 : c2;
    g.globalAlpha = 0.85 - i * 0.13;
    g.lineWidth = 7 - i;
    g.beginPath(); g.arc(48, 48, 40 - i * 8, i * 1.2, i * 1.2 + Math.PI * 1.5); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = C.ink; g.beginPath(); g.arc(48, 48, 8, 0, Math.PI * 2); g.fill();
  g.strokeStyle = c2; g.lineWidth = 2; g.beginPath(); g.arc(48, 48, 43, 0, Math.PI * 2); g.stroke();
}
// rewind gate: 26×22 @ u6 → 156×132 — hourglass between two tape reels + sign band.
function paintGate(g) {
  P(g, 0, 0, 26, 4, C.wood);
  P(g, 0, 18, 26, 4, C.wood);
  P(g, 1, 4, 2, 14, C.woodDk); P(g, 23, 4, 2, 14, C.woodDk);
  P(g, 6, 5, 3, 3, C.ink); P(g, 17, 5, 3, 3, C.ink);
  P(g, 7, 6, 1, 1, C.reel); P(g, 18, 6, 1, 1, C.reel);
  P(g, 10, 5, 6, 10, C.glow);
  P(g, 11, 6, 4, 3, "#fff3c4");
  P(g, 12, 9, 2, 3, "#ffe9a3");
  P(g, 11, 12, 4, 2, "#fff3c4");
  P(g, 4, 14, 18, 3, C.magenta);
  P(g, 5, 15, 2, 1, C.magentaHi); P(g, 8, 15, 2, 1, C.magentaHi);
  P(g, 11, 15, 4, 1, C.cyanHi);
  P(g, 19, 15, 2, 1, C.magentaHi);
}
// tree: 8×22 @ u6 → 48×132.
function paintTree(g) {
  P(g, 3, 8, 2, 14, C.wood); P(g, 3, 8, 1, 14, C.woodDk);
  P(g, 0, 0, 8, 6, C.leaf); P(g, 1, 0, 6, 1, C.leafHi);
  P(g, 0, 5, 8, 2, C.leafHi);
  P(g, 1, 6, 2, 2, C.leaf); P(g, 5, 6, 2, 2, C.leaf);
}
// deck plank: hazard-tape edge + nail dots (stretched live to deck width).
function paintDeck(g) {
  g.fillStyle = C.wood; g.fillRect(0, 0, 128, 16);
  g.fillStyle = C.woodHi; g.fillRect(0, 0, 128, 4);
  g.fillStyle = C.woodDk; g.fillRect(0, 12, 128, 4);
  g.fillStyle = C.magenta; g.fillRect(0, 0, 128, 2);
  g.fillStyle = C.glow;
  g.fillRect(6, 6, 2, 2); g.fillRect(60, 6, 2, 2); g.fillRect(118, 6, 2, 2);
}

// ==== create() ==============================================================================
export function create(level, api) {
  const data = level.data || {};
  const MV = data.move || {};
  const EN = data.enemy || {};

  // ---- boot params (guarded; thumb pipeline passes none, so bot/beats stay off) -----------
  let q = { get: () => null };
  try {
    if (typeof URLSearchParams !== "undefined" && typeof location !== "undefined")
      q = new URLSearchParams(location.search);
  } catch (e) {}
  const BOT = q.get("bot") === "1" ? (q.get("flavor") || "good") : null;
  const DBG = q.get("debug") === "1";
  const BEATS = q.get("beats") === "1";

  // ---- deterministic world ----------------------------------------------------------------
  const seed = (data.seed >>> 0) || 20260918;
  const R = mulberry32(seed);
  const worldW = data.worldW || 4480, groundY = data.groundY || 1400, ftPx = data.ftPx || 21;
  const spawnX = data.spawnX || 4340, gate = data.gate || { x: 205, y: 150 };
  const worldH = data.worldH || 1780;

  // -- deck generation: [RISE 4 decks] → [TERRACE 3-4 planks] → repeat, until the gate. -----
  // Invariants per hop: rise 58..84 px (apex ≈ 120), left step 100..150 px, width 120..210 →
  // the next deck's right edge overlaps the hop lane (or a ≤ 40 px true gap). Terraces are
  // flat planks with small left steps — a breather between climbs.
  const decks = [];
  {
    let x = spawnX - 30, y = groundY - 70;
    decks.push({ x, y: Math.round(y), w: 150 });               // first easy deck
    x -= 120;
    while (x > gate.x + 150 && y > gate.y + 90) {
      for (let k = 0; k < 4 && x > gate.x + 150 && y > gate.y + 90; k++) {   // rise run
        decks.push({ x, y: Math.round(y), w: Math.round(120 + R() * 80) });
        x -= 100 + R() * 50;
        y -= 58 + R() * 26;
      }
      if (y > gate.y + 120) {
        for (let k = 0; k < 3 && x > gate.x + 200; k++) {                    // terrace walk
          const w = Math.round(240 + R() * 160);
          decks.push({ x: x - w, y: Math.round(y), w });
          x -= w + 90 + R() * 40;
        }
      }
    }
    decks.push({ x: gate.x - 60, y: gate.y + 62, w: 300 });    // gate plateau
  }
  // Data-driven portal anchors (deterministic from the seed):
  //  - "lane"   : a phase-1 clamp — it sits ON a deck's walk line: walk in and it catches you;
  //    arc a full jump over it and you pass. Skill check in the climb.
  //  - "p2"     : floating just past a deck's right end — scares phase-2 descenders who
  //    hug the edge.
  //  - "exit"   : at the start line, visible only in phase 2 — it does exactly what it
  //    looks like it does (“▶ AGAIN ?”) and it does the same thing to everyone. No exceptions.
  const portals = (data.portals || []).map((p) => {
    if (p.type === "exit") return { ...p, x: spawnX, cy: groundY - 48 };
    const d = decks[Math.min(decks.length - 1, (p.idx | 0) + 2)] || decks[0];
    if (p.type === "p2")
      return { ...p, type: "p2", x: Math.round(d.x + d.w + 56), cy: Math.round(d.y - 40) };
    return { ...p, type: "lane", x: Math.round(d.x + d.w * (p.frac ?? 0.4)), cy: Math.round(d.y - 23) };
  });
  // trees between decks (pure art).
  const trees = [];
  for (let i = 0; i < decks.length - 1; i++) {
    if (R() < 0.55) trees.push({ x: decks[i].x - 26 - R() * 60, y: decks[i].y + 16 });
  }
  // perchers: resident enemies on fixed decks (activate when the player is near).
  const perchers = [];
  {
    const R2 = mulberry32(seed ^ 0x5f5f);
    const pool = decks.slice(3, decks.length - 1);
    for (let i = 0; i < (EN.perchers || 4) && pool.length; i++) {
      const d = pool.splice(Math.floor(R2() * pool.length), 1)[0];
      perchers.push({ home: d.x + d.w * 0.5, x: d.x + d.w * 0.5, y: d.y, active: false, f: 0, deck: d });
    }
  }

  // ---- state ------------------------------------------------------------------------------
  const st = {
    t: 0, phase: 1, state: "play", fx: 0,
    x: spawnX, y: groundY - 46, vx: 0, vy: 0, onGround: true,
    coyote: 0, buffer: 0, cutDone: false,
    ratchet: spawnX, cam: 0, camY: 0, travelled: 0,
    loops: 0, killer: "", enemies: [], spawnT: 1.2, rewT: 0, birdT: 0, frame: 0,
    portalsHit: 0, completed: false, beep: 0, hudKey: "", dieAfter: 96,
  };
  st.cam = clamp(spawnX - 430, 0, worldW - W);
  st.camY = clamp((st.y + 23) - 300, 0, worldH - H);
  const enemies = st.enemies;
  const PXB = []; for (let i = 0; i < 26; i++) PXB.push({ x: 0, y: 0, vx: 0, vy: 0, c: "#fff" });

  function spawnEnemy(kind) {
    if (enemies.length >= (EN.maxAlive || 9)) return;
    const ramp = clamp((st.t - (EN.graceT || 6)) / 64, 0, 1);
    const ahead = st.phase === 1 ? st.cam - 70 : st.cam + W + 70;
    if (kind === "walker") {
      // tape-walkers haunt only the FLOOR stratum (last ~350 px): they come at you
      // horizontally, so the low march is a minefield — the tower above belongs to birds,
      // wraiths and perchers. Spawning side stays "ahead" of your ratchet direction.
      if (st.y + PH < groundY - 350) return;
      const plane = surfaceYAt(st.x, st.y + 30);
      const v = lerp((EN.walkerSpeed || [56, 96])[0], (EN.walkerSpeed || [56, 96])[1], ramp);
      enemies.push({ kind, x: ahead, y: plane - 20, vx: st.phase === 1 ? v : -v, r: 15, f: 0, ft: 0, plane });
    } else if (kind === "wraith") {
      enemies.push({ kind, x: ahead, y: st.y + 23, vx: 0, r: 16, chase: EN.rewindChase || 150,
        cyc: 0, hist: [] });
    } else if (kind === "bird") {
      const v = lerp((EN.birdSpeed || [112, 164])[0], (EN.birdSpeed || [112, 164])[1], ramp);
      enemies.push({ kind, x: ahead, y: clamp(st.y + 23 + (R() * 2 - 1) * (EN.birdAmp || 44), 60, groundY - 60),
        vx: st.phase === 1 ? v : -v, r: 14, amp: EN.birdAmp || 44, b: R() * 6 });
    }
  }

  // ---- win-by-dying (the ONLY api.complete call site) --------------------------------------
  function dieBy(killer) {
    if (st.state !== "play") return;
    st.state = "won"; st.killer = killer; st.fx = 0;
    try { api.audio?.sfx?.("radioStatic"); } catch (e) {}
    try { api.eng?.shake?.(1); } catch (e) {}
    for (let i = 0; i < PXB.length; i++) {
      const p = PXB[i];
      p.x = st.x; p.y = st.y + 23;
      p.vx = (R() * 2 - 1) * 260; p.vy = -(60 + R() * 300);
      p.c = [C.cyan, C.denim, C.skin, C.magenta][i % 4];
    }
  }
  function rewindToStart() {
    st.loops++; st.portalsHit++;
    st.state = "rewounded"; st.fx = 0;
    try { api.audio?.sfx?.("alarm"); } catch (e) {}
  }
  function hardReset() {
    st.phase = 1; st.x = spawnX; st.y = groundY - 46; st.vx = 0; st.vy = 0; st.ratchet = spawnX;
    st.travelled = 0; enemies.length = 0; st.spawnT = 1.2; st.rewT = 0; st.birdT = 0;
    for (const p of perchers) { p.active = false; p.x = p.home; p.y = p.deck.y; }
    st.cam = clamp(spawnX - 430, 0, worldW - W);
    st.camY = clamp((st.y + 23) - 300, 0, worldH - H);
    st.state = "play"; st.fx = 0;
  }
  function completeWin() {
    if (st.completed) return;
    st.completed = true;
    try { api.complete({ cause: "died", killer: st.killer, loops: st.loops, ft: feet(), survived: +st.t.toFixed(1), portalsHit: st.portalsHit, season: (typeof seasonNow === "function" ? seasonNow() : { id: "na" }).id }); } catch (e) {}
  }
  // feet: phase 1 counts UP toward the gate; phase 2 counts back DOWN ("rewinding" the odometer).
  function feet() {
    const raw = st.travelled / ftPx;
    return Math.max(0, Math.round(st.phase === 1 ? Math.min(raw, 200) : Math.max(0, 200 - raw)));
  }
  function pushHUD() {
    const key = st.phase + "|" + feet() + "|" + st.loops;
    if (key === st.hudKey) return;
    st.hudKey = key;
    const arrow = st.phase === 1 ? "◄" : "►";
    const phaseName = st.phase === 1 ? "CLIMB BACK" : "RUN IT BACK";
    try { api.hud({ mid: `${arrow} ${feet()} / 200 ft · ${phaseName} · LOOP ×${st.loops}`, right: "die to win" }); } catch (e) {}
  }

  // ---- beats tiles (DOM data-URL proof — shared-tab safe) ----------------------------------
  function beat(label) {
    if (!BEATS || typeof document === "undefined") return;
    try {
      let host = document.getElementById("beats");
      if (!host) { host = document.createElement("div"); host.id = "beats"; document.body.appendChild(host); }
      const c = document.createElement("canvas"); c.width = 480; c.height = 270;
      const g = c.getContext("2d"); g.fillStyle = C.skyA; g.fillRect(0, 0, 480, 270);
      g.save(); g.scale(0.5, 0.5); draw(g); g.restore();
      const img = document.createElement("img");
      img.dataset.label = label;
      img.src = c.toDataURL("image/jpeg", 0.55);
      host.appendChild(img);
    } catch (e) {}
  }
  const beatAt = {};
  function beatOnce(key, label) { if (!beatAt[key]) { beatAt[key] = true; beat(label || key); } }

  // ---- bot (in-module autopilot) ------------------------------------------------------------
  // ---- bot (in-module autopilot) ------------------------------------------------------------
  const bot = BOT ? { flavor: BOT, want: { left: false, right: false, jump: false } } : null;
  function threatNear() {
    // a backwards-time enemy near my plane, closing: hop EARLY — with the walker
    // hesitation window the arc clears it well before contact.
    return enemies.some((e) => Math.abs(e.y - (st.y + 23)) < 64 && Math.abs(e.x - st.x) < 240);
  }
  function runBot() {
    const b = bot.want; b.left = false; b.right = false; b.jump = false;
    if (st.state !== "play") return b;

    // once a loop exists, every non-clumsy bot stands DEAD STILL and lets time arrive:
    // portals never end the level — death does. No hopping after the loop.
    if (bot.flavor !== "clumsy" && st.loops >= 1) return b;
    if (bot.flavor === "partial" && st.phase === 1 && st.t > 6) {
      // stunt: hold AT the first lane portal until the pull captures (bouncy approach, dodge
      // walkers over long terraces; arrival = instant capture via the pull).
      const p = portals.find((pp) => pp.type === "lane");
      if (p) {
        b.left = st.x > p.x + 8;
        b.jump = st.onGround && (threatNear() || st.frame % 12 === 0);
        return b;
      }
    }
    const go = st.phase === 1 ? "left" : "right";
    b[go] = true;

    if (bot.flavor === "clumsy") {
      // walks blindly into whatever comes: the first terraced walker catches it fast.
      return b;
    }
    // platform policy: probe ahead; jump if a deck rises OR a lane portal gapes ahead
    // OR a threat is closing (hop it — arcs clear the capture core). A cheap bounce keeps
    // good bots air-dominant over long terraces instead of nibbling walkers.
    if (st.onGround) {
      const dir = st.phase === 1 ? -1 : 1;
      const probe = st.x + dir * 122;
      const covers = (d) => probe > d.x - 12 && probe < d.x + d.w + 12;
      const above = decks.some((d) => covers(d) && d.y + 16 <= st.y - 8);
      const laneAhead = portals.some((pp) => pp.type === "lane" && Math.abs(pp.x - st.x) < 126);
      b.jump = above || laneAhead || threatNear() || st.frame % 12 === 0;
    }
    return b;
  }

  // ---- surfaces ----------------------------------------------------------------------------
  const PH = 46; // player height
  function surfaceYAt(x, fromY) {
    let best = groundY;
    for (const d of decks)
      if (x >= d.x - 6 && x <= d.x + d.w + 6 && d.y >= fromY - 2 && d.y < best) best = d.y;
    return best;
  }
  st.onFloorish = function () {
    return st.y + PH >= groundY - 2;
  };

  // ---- update ------------------------------------------------------------------------------
  function update(dt, input) {
    st.frame++;
    const ts = (DBG && typeof window !== "undefined" && window.__REW && window.__REW.timeScale) || 1;
    if (ts !== 1) dt *= ts;
    st.t += dt;

    if (st.state === "won") {
      st.fx += dt;
      for (const p of PXB) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vy += 900 * dt; } // REWIND: pixels fly back in
      if (st.fx >= (data.deathFx || 2.35)) completeWin();
      return;
    }
    if (st.state === "rewounded") {
      st.fx += dt;
      if (st.fx >= (data.rewoundFx || 0.9)) hardReset();
      return;
    }
    if (st.state === "flipping") {
      st.fx += dt;
      if (st.fx >= (data.flipFx || 1)) { st.state = "play"; st.phase = 2; st.ratchet = st.x; }
      return;
    }

    // ---- input: the ratchet. phase 1 forbids rightward; phase 2 forbids leftward. ----------
    let want = 0;
    if (bot) {
      const b = runBot();
      want = b.left ? -1 : b.right ? 1 : 0;
      if (b.jump) st.buffer = MV.buffer || 0.1;
      // bots hold full hops (no input cut) — their arcs must clear the deck rises honestly
    } else if (input) {
      const fwd = st.phase === 1 ? (input.left && input.left()) : (input.right && input.right());
      const blocked = st.phase === 1 ? (input.right && input.right()) : (input.left && input.left());
      if (fwd) want = st.phase === 1 ? -1 : 1;
      if (blocked) st.beep = 0.14;
      if (input.jumpJust && input.jumpJust()) st.buffer = MV.buffer || 0.1;
      if (input.up && !input.up() && st.vy < 0) st.cutDone = true;
    }
    st.beep = Math.max(0, st.beep - dt);
    const speed = MV.speed || 212, airK = MV.airK || 0.78;
    const target = want * speed * (st.onGround ? 1 : airK);
    st.vx += clamp(target - st.vx, -2400 * dt, 2400 * dt);

    // jump: coyote + buffer + variable cut
    st.coyote = st.onGround ? (MV.coyote || 0.09) : Math.max(0, st.coyote - dt);
    st.buffer = Math.max(0, st.buffer - dt);
    if (st.buffer > 0 && st.coyote > 0) {
      st.vy = MV.jumpV || -622; st.buffer = 0; st.coyote = 0; st.cutDone = false; st.onGround = false;
      try { api.audio?.sfx?.("hover"); } catch (e) {}
    }
    if (st.onGround) st.vy = 0; else st.vy = Math.min(st.vy + (MV.grav || 1560) * dt, MV.maxFall || 780);

    // integrate x with the POSITION ratchet (one-way made physical)
    const nx = st.x + st.vx * dt;
    st.travelled += Math.abs(st.vx * dt);
    if (st.phase === 1) { st.ratchet = Math.min(st.ratchet, nx); st.x = Math.min(nx, st.ratchet); }
    else { st.ratchet = Math.max(st.ratchet, nx); st.x = Math.max(nx, st.ratchet); }
    st.x = clamp(st.x, 8, worldW - 8);

    // integrate y with one-way decks (solid only when falling onto them)
    const prevY = st.y;
    st.y += st.vy * dt;
    const wasGround = st.onGround;
    st.onGround = false;
    if (st.y >= groundY - PH) { st.y = groundY - PH; st.vy = 0; st.onGround = true; }
    else if (st.vy >= 0) {
      for (const d of decks) {
        if (st.x > d.x - 6 && st.x < d.x + d.w + 6) {
          const top = d.y - PH;
          if (st.y >= top && prevY <= top + 6) { st.y = top; st.vy = 0; st.onGround = true; break; }
        }
      }
    }
    if (!wasGround && st.onGround) st.cutDone = false;

    // camera: monotone x per phase; y follows the climb freely
    const tx = clamp(st.x - 430, 0, worldW - W);
    st.cam = st.phase === 1 ? Math.min(st.cam, tx) : Math.max(st.cam, tx);
    st.camY = lerp(st.camY, clamp((st.y + 23) - 300, 0, worldH - H), Math.min(1, dt * 6));

    // gate flip (phase 1 → 2) — reached near the top-left plateau
    if (st.phase === 1 && st.y + PH <= gate.y + 70 && st.x < gate.x + 170) {
      st.state = "flipping"; st.fx = 0;
      try { api.audio?.sfx?.("carousel"); } catch (e) {}
      beatOnce("gateflip", "gate-flip");
      pushHUD();
    }

    // portals: phase-gated. lane portals belong to phase 1 (hop them); the p2 scare and
    // the exit portal arm on the way DOWN. Gentle pull (escapable), capture only near the core.
    for (const p of portals) {
      const active = p.type === "lane" ? st.phase === 1 : st.phase === 2;
      if (!active) continue;
      const dx = p.x - st.x, dy = p.cy - (st.y + PH / 2), d2 = Math.hypot(dx, dy);
      if (d2 < 54 && st.state === "play") { st.vx += (dx / d2) * 60 * dt; st.vy += (dy / d2) * 30 * dt; }
      if (d2 < 15 && st.state === "play") { rewindToStart(); beatOnce("loop" + st.loops, "loop-" + st.loops); return; }
    }

    // ---- enemy spawning (backwards in time: they arrive from ahead) ------------------------
    if (st.t > (EN.graceT || 6)) {
      const mul = st.phase === 2 ? 1 / (EN.phase2Mul || 1.35) : 1;
      st.spawnT -= dt * mul;
      if (st.spawnT <= 0) {
        const ramp = clamp((st.t - (EN.graceT || 6)) / 64, 0, 1);
        st.spawnT = lerp((EN.walkerEvery || [3.4, 1.7])[0], (EN.walkerEvery || [3.4, 1.7])[1], ramp) * (0.8 + R() * 0.4);
        spawnEnemy("walker");
        if (st.t > (EN.rewinderFrom || 18)) { st.rewT -= dt * mul; if (st.rewT <= 0) { st.rewT = lerp((EN.rewinderEvery || [7, 4.6])[0], (EN.rewinderEvery || [7, 4.6])[1], ramp); spawnEnemy("wraith"); } }
        if (st.t > (EN.birdFrom || 34)) { st.birdT -= dt * mul; if (st.birdT <= 0) { st.birdT = lerp((EN.birdEvery || [8, 5.2])[0], (EN.birdEvery || [8, 5.2])[1], ramp); spawnEnemy("bird"); } }
      }
    }

    // ---- enemy behaviour + contact ----------------------------------------------------------
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.kind === "walker") {
        // backwards-in-time stroll, but tape HESITATES near the player: the crossing
        // becomes a readable jump-over window instead of a coin flip.
        const froze = Math.abs(e.x - st.x) < 170 ? 0.35 : 1;
        e.x += e.vx * froze * dt; e.ft += dt;
        if (e.ft > 0.18) { e.ft = 0; e.f = 1 - e.f; }
      } else if (e.kind === "wraith") {
        e.cyc += dt;
        if (e.cyc < 1.15) {
          e.hist.push({ x: e.x, y: e.y });
          if (e.hist.length > 26) e.hist.shift();
          e.x += Math.sign(st.x - e.x) * (e.chase || 150) * dt;
          e.y += clamp((st.y + 23) - e.y, -60 * dt, 60 * dt);
        } else if (e.cyc >= (EN.rewindCycle || 2.6)) {
          const h = e.hist[0] || e; e.x = h.x; e.y = h.y; e.hist.length = 0; e.cyc = 0;
        }
      } else if (e.kind === "bird") {
        e.b += dt * 5;
        e.x += e.vx * dt;
        e.y += Math.sin(e.b) * (e.amp || 44) * dt * 2.2;
      }
      const ddx = e.x - st.x, ddy = e.y - (st.y + PH / 2);
      if (Math.hypot(ddx, ddy) < e.r + 15) {
        dieBy(e.kind === "walker" ? "tape-walker" : e.kind === "wraith" ? "rewind-wraith" : "backward-bird");
        return;
      }
      if (e.x < st.cam - 140 || e.x > st.cam + W + 140) enemies.splice(i, 1);
    }
    // perchers: scuttle at you on their deck plane once you're close
    for (const p of perchers) {
      if (!p.active && Math.abs(st.x - p.home) < 240 && Math.abs((st.y + PH) - p.y) < 220) p.active = true;
      if (p.active) {
        p.x = clamp(p.x + Math.sign(st.x - p.x) * 74 * dt, p.deck.x + 8, p.deck.x + p.deck.w - 8);
        p.f = (st.frame >> 4) % 2;
        if (Math.hypot(p.x - st.x, (p.y - 19) - (st.y + PH / 2)) < 30) { dieBy("deck-percher"); return; }
      }
    }

    pushHUD();
    // story beats
    if (st.phase === 1 && feet() >= 92) beatOnce("midclimb", "mid-climb");
    if (st.phase === 2) beatOnce("phase2", "phase2-descent");
  }

  // ---- draw --------------------------------------------------------------------------------
  function draw(g) {
    const cam = st.cam, camY = st.camY;
    // sky + stars (screen-space)
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, C.skyA); grad.addColorStop(0.55, C.skyB); grad.addColorStop(1, C.skyC);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 40; i++) g.fillRect((i * 137 + (st.frame >> 2)) % W, (i * 89) % 300, 2, 2);
    g.globalAlpha = 0.07;
    drawText(g, "◄◄ REW", W * 0.5, 150, { size: 120, color: C.cyanHi });
    g.globalAlpha = 1;
    const trackY = (st.t * 90) % (H + 80) - 40;
    g.fillStyle = "rgba(180,200,255,0.06)"; g.fillRect(0, trackY, W, 26);
    g.fillStyle = "rgba(255,80,160,0.05)"; g.fillRect(0, (trackY + 240) % H, W, 10);

    g.save(); g.translate(-cam, -camY);
    // ground slab + floor stripes
    g.fillStyle = C.inkHi; g.fillRect(0, groundY, worldW, worldH - groundY + 60);
    g.fillStyle = C.tapeHi; g.fillRect(0, groundY, worldW, 3);
    for (let x = cam - (cam % 84); x < cam + W + 84; x += 84) { g.fillStyle = C.ink; g.fillRect(x, groundY + 8, 40, 6); }
    // spawn-view wall branding (in-world, thumb-visible)
    drawText(g, "ONE WAY BACK", worldW - 420, 240, { size: 44, color: "rgba(174,241,255,0.20)" });
    drawText(g, "IAN SPENCE · LEASEWEB CANADA", worldW - 420, 285, { size: 16, color: "rgba(255,138,194,0.34)" });
    // trees
    for (const t of trees) blit(g, bake("tree", 48, 132, paintTree), t.x, t.y - 132);
    // decks
    const dc = bake("deck", 128, 16, paintDeck);
    for (const d of decks) g.drawImage(dc, 0, 0, 128, 16, d.x, d.y, d.w, 16);
    // ratchet wall (the one-way boundary made visible)
    const rx = st.ratchet + (st.phase === 1 ? -6 : 54);
    g.fillStyle = "rgba(255,61,154,0.16)"; g.fillRect(rx, 0, 6, worldH);
    drawText(g, st.phase === 1 ? "◄◄" : "►►", rx + (st.phase === 1 ? 30 : -34), camY + 40, { size: 22, color: C.magentaHi });
    // gate
    blit(g, bake("gate", 156, 132, paintGate), gate.x - 60, gate.y - 66);
    drawText(g, "◄◄ REWIND", gate.x + 30, gate.y - 84, { size: 26, color: C.magentaHi });
    // portals
    for (const p of portals) {
      if (p.exit && st.phase !== 2) continue;
      const bob = Math.sin(st.t * 3 + p.x) * 5;
      const c = bake("portal" + (p.exit ? 1 : 0), 96, 96, (gg) => paintPortal(gg, p.exit ? 1 : 0));
      g.save(); g.translate(p.x, p.cy + bob); g.rotate(st.t * (p.exit ? -1.4 : 1.1)); g.drawImage(c, -48, -48); g.restore();
      drawText(g, p.label || "◄◄", p.x, p.cy + 62, { size: 13, color: p.exit ? C.cyanHi : C.violetHi, alpha: 0.85 });
    }
    // perchers
    for (const p of perchers) if (p.active) blit(g, bake("walker" + p.f, 33, 39, (gg) => paintWalker(gg, p.f)), p.x - 16, p.y - 39, st.phase === 1);
    // enemies
    for (const e of enemies) {
      if (e.kind === "walker") blit(g, bake("walker" + e.f, 33, 39, (gg) => paintWalker(gg, e.f)), e.x - 16, e.y - 39, st.phase === 1);
      else if (e.kind === "wraith") {
        for (let i = 0; i < e.hist.length; i += 8) {
          g.globalAlpha = 0.12 + (i / e.hist.length) * 0.2;
          blit(g, bake("wraith", 27, 27, paintWraith), e.hist[i].x - 13, e.hist[i].y - 13);
        }
        g.globalAlpha = 1;
        blit(g, bake("wraith", 27, 27, paintWraith), e.x - 13, e.y - 13);
      } else if (e.kind === "bird") {
        blit(g, bake("bird" + (st.frame >> 3) % 2, 30, 18, (gg) => paintBird(gg, (st.frame >> 3) % 2)), e.x - 15, e.y - 9, st.phase === 1);
      }
    }
    // player / death burst
    if (st.state !== "won") {
      const f = !st.onGround ? 2 : (Math.abs(st.vx) > 30 ? (st.frame >> 3) % 2 : 0);
      blit(g, bake("hero" + f, 30, 42, (gg) => paintHero(gg, f)), st.x - 15, st.y, st.phase === 1);
    } else {
      for (const p of PXB) { g.fillStyle = p.c; g.fillRect(p.x - 3, p.y - 3, 6, 6); }
    }
    g.restore();

    // banner overlays (screen-space)
    if (st.state === "won") {
      const a = clamp((st.fx - 0.9) / 0.5, 0, 1);
      g.globalAlpha = a;
      g.fillStyle = "rgba(6,3,18,0.82)"; g.fillRect(0, H * 0.28, W, 200);
      drawText(g, "CONGRATULATIONS — YOU WON BY DYING.", W / 2, H * 0.28 + 54, { size: 30, color: C.magentaHi });
      drawText(g, "Ian, the loop can't be left alive. La boucle est incassable.", W / 2, H * 0.28 + 98, { size: 17, color: C.cyanHi });
      drawText(g, "Here's the next level. / Voici le prochain niveau.", W / 2, H * 0.28 + 128, { size: 15, color: "#cfd6ea" });
      g.globalAlpha = 1;
      for (let i = 0; i < 5; i++) {
        g.fillStyle = "rgba(200,220,255,0.08)";
        g.fillRect(0, (st.fx * 260 + i * 47) % H, W, 5);
      }
    }
    if (st.state === "rewounded") {
      g.globalAlpha = clamp(st.fx * 2.2, 0, 1);
      drawText(g, "◄◄ REWOUND — LOOP ×" + st.loops, W / 2, H * 0.4, { size: 34, color: C.cyanHi });
      drawText(g, "back to the beginning / retour au début", W / 2, H * 0.4 + 40, { size: 16, color: "#cfd6ea" });
      g.globalAlpha = 1;
    }
    if (st.state === "flipping") {
      g.globalAlpha = clamp(st.fx * 2, 0, 1);
      drawText(g, "◄◄ REVERSED ►►", W / 2, H * 0.42, { size: 38, color: C.magentaHi });
      drawText(g, "run it back the other way / redescends dans l'autre sens", W / 2, H * 0.42 + 44, { size: 17, color: "#cfd6ea" });
      g.globalAlpha = 1;
      // tracking-bar wipe
      const sweep = (st.fx / (data.flipFx || 1)) * (W + 200) - 100;
      g.fillStyle = "rgba(174,241,255,0.30)"; g.fillRect(0, 0, clamp(sweep, 0, W), H);
    }
    // lock blink (player pressed the dead direction)
    if (st.beep > 0) {
      drawText(g, st.phase === 1 ? "◄ ONLY" : "► ONLY", W / 2, 90, { size: 30, color: C.magentaHi, alpha: clamp(st.beep * 7, 0, 1) });
    }
  }

  // ---- debug seam --------------------------------------------------------------------------
  if (DBG && typeof window !== "undefined") {
    window.__REW = {
      timeScale: 1,
      state: () => ({ phase: st.phase, x: Math.round(st.x), y: Math.round(st.y), vx: +st.vx.toFixed(1),
        vy: +st.vy.toFixed(1), cam: Math.round(st.cam), ft: feet(), loops: st.loops, state: st.state,
        enemies: enemies.length, t: +st.t.toFixed(2), portalsHit: st.portalsHit, completed: st.completed,
        decks: decks.length, pulls: portals.map((p) => p.x),
        detail: enemies.slice(0, 6).map((e) => ({ k: e.kind, x: Math.round(e.x), y: Math.round(e.y), vx: Math.round(e.vx) })) }),
    };
  }

  setTimeout(() => beatOnce("boot", "boot-view"), 350);
  return { update, draw, meta };
}
