// WORLD-TOUR genre — "Miray's World Tour" · miray-kavruk-world-tour
// Miray Kavruk (Gowling WLG) pitched, relayed by the operator: travel the world, one
// country on each inhabited continent, each themed to its place with puzzles and
// quizzes tied to it — Brazil's sugar plantation, Egypt's pyramids and the Sphinx's
// riddle, Istanbul's bazaar, Japan's koi, Australia's reef coast. Between continents
// you CROSS AN OCEAN: swim underwater, eat fish to grow, avoid bigger fish, and once
// big enough surface and hitch a boat to the next continent. Every crossing plays
// differently because YOU are a different creature each time:
//   1 plankton → 2 minnow → 3 tuna → 4 shark → 5 orca — each one bigger, with bigger threats.
//
// STAGE LIST (11): Canada · [plankton] · Brazil · [minnow] · Egypt · [tuna] · Türkiye ·
// [shark] · Japan · [orca] · Australia. Six passport stamps win the tour.
//
// FORGIVING BOOTH RULES — no fail state anywhere: api.fail is NEVER called. Hazards
// cost stage-local bubbles (3 per stage); at zero you soft-reset that stage only
// ("caught your breath") with all progress kept. Quizzes: wrong answers cost nothing —
// try again. The tour never dead-ends.
//
// ART — Route A procedural only (operator rule): zero emoji, zero style.glyphs, zero
// runtime fetches. Actors are baked once per key to offscreen canvases (2 frames for
// walkers/swimmers); scenery and landmarks are direct canvas paths. HUD copy uses the
// approved text glyph vocabulary (★ ♥ ✓ ▶ ▲ ▼) + plain words, EN / FR echo.
//
// CONTROLS — ARROWS / WASD (ZQSD) to move · SPACE / ENTER to tap, dig, feed, board
// and open the landmark gate · in a quiz: 1·2·3 or ↑↓ + ENTER.
//
// BOT — ?bot=1&flavor=good|partial|clumsy drives an in-module autopilot:
//   good    plays every stage properly → completes the tour;
//   partial takes hits and answers one quiz wrong first, still finishes;
//   clumsy  wanders, never interacts, never eats → must NOT complete.
// ?debug=1 → window.__WT { timeScale, state() } read-only. ?beats=1 → DOM tiles per
// story beat (#beats). ?stage=<n> boots mid-tour for stage playtesting.

import { W, H, clamp, lerp, drawText, hash, seasonNow } from "../core.js";

export const meta = {
  name: "World Tour",
  controls: "EN: ARROWS / WASD to move · SPACE / ENTER to tap, dig, feed, board & answer · quiz: 1·2·3 or ↑↓ + ENTER. Eat fish to grow, dodge bigger ones, catch the boat. FR: FLÈCHES / ZQSD pour bouger · ESPACE / ENTRÉE pour interagir · quiz : 1·2·3 ou ↑↓ + ENTRÉE. Mange pour grandir, évite les plus gros, attrape le bateau.",
};

// ---- helpers -----------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }

// local bake: multi-frame actor painters → offscreen canvases, keyed
const BAKED = new Map();
function bake(key, w, h, painter) {
  let c = BAKED.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w; c.height = h;
    painter(c.getContext("2d"), w, h);
    BAKED.set(key, c);
  }
  return c;
}
// centre-anchored blit; facing: painted creatures face LEFT, flip=1 → face right
function blitC(g, c, x, y, h, { flip = 0, alpha = 1, rot = 0 } = {}) {
  const s = h / c.height;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  if (rot) g.rotate(rot);
  if (flip) g.scale(-1, 1);
  g.drawImage(c, (-c.width * s) / 2, (-c.height * s) / 2, c.width * s, c.height * s);
  g.restore();
}

// ---- palette -------------------------------------------------------------------
const PAL = {
  ink: "#1c1430", white: "#f7f4ec",
  teal: "#3ddcff", tealHi: "#aef1ff",
  gold: "#ffd166", coral: "#ff6f61", magenta: "#ff3d9a",
  wood: "#8a5a34", woodHi: "#a8764a", woodDk: "#5e3d20",
  skin: "#eab88f", hair: "#3a2b22", jeans: "#4a5a8c", shoe: "#f2ede4",
  leafG: "#3f8f5f", leafR: "#d8623a", trunk: "#6b4a2f",
  sand: "#f4dfae", stone: "#b8a888",
  water: "#0a7ba0",
};

// ---- baked actor painters ------------------------------------------------------
// Miray the traveler — 30×44 painted FACING RIGHT; f: 0 idle, 1/2 walk
function paintTrav(g, f) {
  const u = 2;
  const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * u, y * u, w * u, h * u); };
  const legA = f === 1 ? 1 : 0, legB = f === 2 ? 1 : 0;
  P(5, 0, 6, 2, PAL.hair); P(4, 1, 8, 2, PAL.hair);          // hair
  P(6, 2, 5, 3, PAL.skin);                                    // face
  P(9, 3, 1, 1, PAL.ink);                                     // eye (facing right)
  P(5, 2, 1, 3, PAL.hair);                                    // hair back
  P(2, 5, 3, 7, "#d9a45e"); P(2, 5, 3, 1, "#e8bc7e");        // backpack
  P(4, 5, 8, 7, PAL.coral); P(4, 5, 8, 1, "#ff8a7e");        // jacket
  P(11, 6, 2, 4, "#e05a4e");                                  // arm
  P(4, 12, 3, 8 + legA, PAL.jeans);                           // back leg
  P(8, 12, 3, 8 + legB, "#3d4c78");                           // front leg
  P(4 - legA, 20 + legA, 3, 1, PAL.shoe);                     // back shoe
  P(8 - legB, 20 + legB, 3, 1, PAL.shoe);                     // front shoe
}
// boat — 120×70, hull + mast + sail (bobbed live)
function paintBoat(g) {
  g.fillStyle = PAL.wood; g.beginPath();
  g.moveTo(8, 48); g.quadraticCurveTo(60, 62, 112, 48); g.lineTo(100, 58);
  g.quadraticCurveTo(60, 66, 20, 58); g.closePath(); g.fill();
  g.fillStyle = PAL.woodHi; g.fillRect(10, 46, 100, 5);
  g.strokeStyle = PAL.woodDk; g.lineWidth = 4;
  g.beginPath(); g.moveTo(60, 46); g.lineTo(60, 8); g.stroke();
  g.fillStyle = PAL.white; g.beginPath();
  g.moveTo(63, 10); g.quadraticCurveTo(98, 26, 63, 42); g.closePath(); g.fill();
  g.fillStyle = "#e8dfd0"; g.beginPath();
  g.moveTo(57, 12); g.quadraticCurveTo(34, 28, 57, 40); g.closePath(); g.fill();
  g.fillStyle = PAL.teal; g.fillRect(60, 6, 14, 6);
}
// creatures — painted FACING LEFT (natural drift), 2 frames (tail flick)
function paintPlankton(g, f) {
  g.fillStyle = "rgba(140,255,220,0.35)"; g.beginPath(); g.arc(9, 9, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#7dffc8"; g.beginPath(); g.arc(9, 9, 4.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#0d8f6a"; g.beginPath(); g.arc(8, 9, 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#7dffc8"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(13, 10); g.quadraticCurveTo(17, f ? 13 : 5, 18, 9); g.stroke();
}
function paintMinnow(g, f) {
  g.fillStyle = "#c9d6e2"; g.beginPath();
  g.ellipse(14, 7, 10, 4.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#eef4f8"; g.beginPath(); g.ellipse(14, 5.4, 8, 2.2, 0, 0, Math.PI * 2); g.fill();
  const t = f ? 2 : -2;
  g.fillStyle = "#aebfcc"; g.beginPath();
  g.moveTo(23, 7); g.lineTo(26 + t * 0.4, 3); g.lineTo(25, 7); g.lineTo(26 + t * 0.4, 11); g.closePath(); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(6, 6, 1.3, 0, Math.PI * 2); g.fill();
}
function paintSardine(g, f) {
  g.fillStyle = "#7fb6d9"; g.beginPath();
  g.ellipse(9, 4, 7.4, 3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#cfe8f4"; g.beginPath(); g.ellipse(9, 3, 6, 1.4, 0, 0, Math.PI * 2); g.fill();
  const t = f ? 1.6 : -1.6;
  g.fillStyle = "#5d94b8"; g.beginPath();
  g.moveTo(15.5, 4); g.lineTo(18 + t, 1); g.lineTo(17.4, 4); g.lineTo(18 + t, 7); g.closePath(); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(3.4, 3.4, 1, 0, Math.PI * 2); g.fill();
}
function paintTuna(g, f) {
  g.fillStyle = "#3f6f9c"; g.beginPath();
  g.moveTo(2, 11); g.quadraticCurveTo(12, 0, 30, 8); g.quadraticCurveTo(34, 10.5, 36, 11);
  g.quadraticCurveTo(30, 15, 14, 15); g.quadraticCurveTo(6, 14.5, 2, 11); g.closePath(); g.fill();
  g.fillStyle = "#dce8f0"; g.beginPath();
  g.moveTo(4, 12); g.quadraticCurveTo(16, 16.5, 32, 12); g.quadraticCurveTo(20, 18, 8, 14); g.closePath(); g.fill();
  g.fillStyle = "#ffd166";                                     // finlets
  for (let i = 0; i < 4; i++) g.fillRect(22 + i * 3.4, 7 - i * 0.7, 2.4, 2.4);
  g.fillStyle = "#345f8a"; g.fillRect(14, 4, 2.4, 5);          // dorsal
  const t = f ? 3 : -3;
  g.fillStyle = "#2f5578"; g.beginPath();                       // crescent tail
  g.moveTo(35, 11); g.lineTo(43 + t * 0.5, 3); g.lineTo(40, 11); g.lineTo(43 + t * 0.5, 19); g.closePath(); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(6, 9.4, 1.4, 0, Math.PI * 2); g.fill();
}
function paintShark(g, f) {
  g.fillStyle = "#8494a4"; g.beginPath();                       // body
  g.moveTo(2, 16); g.quadraticCurveTo(14, 4, 40, 8); g.quadraticCurveTo(60, 11, 70, 16);
  g.quadraticCurveTo(56, 24, 30, 24); g.quadraticCurveTo(12, 23, 2, 16); g.closePath(); g.fill();
  g.fillStyle = "#d7dde4"; g.beginPath();                       // belly
  g.moveTo(6, 18); g.quadraticCurveTo(30, 27, 62, 18); g.quadraticCurveTo(40, 26, 16, 21); g.closePath(); g.fill();
  g.fillStyle = "#6d7d8d";                                      // dorsal
  g.beginPath(); g.moveTo(30, 7); g.quadraticCurveTo(36, -4, 44, 7); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(46, 9); g.lineTo(52, 5); g.lineTo(52, 10); g.closePath(); g.fill(); // pelvic
  g.strokeStyle = "#5d6d7d"; g.lineWidth = 1.4;                 // gills
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(16 + i * 4, 11); g.quadraticCurveTo(17 + i * 4, 15, 16 + i * 4, 19); g.stroke(); }
  g.fillStyle = "#4a5a6a"; g.beginPath();                       // jaw
  g.moveTo(2, 15); g.quadraticCurveTo(8, 20, 16, 20.5); g.lineTo(15, 23); g.quadraticCurveTo(6, 21, 2, 17); g.closePath(); g.fill();
  g.fillStyle = PAL.white;                                      // teeth
  for (let i = 0; i < 4; i++) g.fillRect(4 + i * 3, 19 + (i % 2), 2, 2.4);
  const t = f ? 5 : -5;
  g.fillStyle = "#6d7d8d"; g.beginPath();                       // tail
  g.moveTo(69, 15); g.lineTo(84 + t * 0.4, 2); g.lineTo(78, 16); g.lineTo(84 + t * 0.4, 27); g.closePath(); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(9, 11, 1.8, 0, Math.PI * 2); g.fill();
}
function paintOrca(g, f) {
  g.fillStyle = "#14181f"; g.beginPath();                       // body
  g.moveTo(2, 22); g.quadraticCurveTo(20, 6, 52, 10); g.quadraticCurveTo(76, 14, 92, 22);
  g.quadraticCurveTo(70, 34, 36, 34); g.quadraticCurveTo(14, 33, 2, 22); g.closePath(); g.fill();
  g.fillStyle = "#f2f4f6"; g.beginPath();                       // belly
  g.moveTo(8, 24); g.quadraticCurveTo(34, 40, 78, 25); g.quadraticCurveTo(50, 37, 20, 29); g.closePath(); g.fill();
  g.fillStyle = "#f2f4f6"; g.beginPath(); g.ellipse(10, 19, 6, 3.4, 0.5, 0, Math.PI * 2); g.fill(); // eye patch
  g.fillStyle = "#14181f"; g.beginPath();                       // dorsal (tall)
  g.moveTo(38, 9); g.quadraticCurveTo(44, -12, 54, 9); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(56, 13); g.lineTo(64, 7); g.lineTo(64, 15); g.closePath(); g.fill();  // pelvic
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(11, 19, 1.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#f2f4f6"; g.fillRect(2, 18, 3, 3);             // beak flash
  const t = f ? 6 : -6;
  g.fillStyle = "#14181f"; g.beginPath();                       // tail flukes
  g.moveTo(91, 22); g.lineTo(110 + t * 0.5, 6); g.lineTo(100, 22); g.lineTo(110 + t * 0.5, 38); g.closePath(); g.fill();
}
// foods
function paintAlgae(g) {
  g.fillStyle = "rgba(120,230,160,0.5)"; g.beginPath(); g.arc(5, 5, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8fe6a8"; g.beginPath(); g.arc(5, 5, 2.6, 0, Math.PI * 2); g.fill();
}
function paintFry(g) {
  g.fillStyle = "#dfe8ee"; g.beginPath(); g.ellipse(6, 3, 5.4, 2.2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(2.4, 2.6, 0.8, 0, Math.PI * 2); g.fill();
}
function paintReeffish(g) {
  g.fillStyle = "#ff9a62"; g.beginPath(); g.ellipse(10, 5, 8.4, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffd166"; g.beginPath(); g.ellipse(10, 3.6, 6, 1.6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#e0703a"; g.beginPath();
  g.moveTo(17, 5); g.lineTo(21, 1.5); g.lineTo(20, 5); g.lineTo(21, 8.5); g.closePath(); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(4, 4, 1, 0, Math.PI * 2); g.fill();
}
function paintTunafish(g) {
  g.fillStyle = "#4f7fa8"; g.beginPath();
  g.moveTo(1, 7); g.quadraticCurveTo(9, 0, 20, 5); g.quadraticCurveTo(24, 7, 26, 7.5);
  g.quadraticCurveTo(20, 11, 9, 10.5); g.quadraticCurveTo(4, 10, 1, 7); g.closePath(); g.fill();
  g.fillStyle = "#dce8f0"; g.beginPath(); g.moveTo(3, 8); g.quadraticCurveTo(12, 11.5, 23, 8); g.quadraticCurveTo(14, 13, 6, 10); g.closePath(); g.fill();
  g.fillStyle = "#ffd166"; g.fillRect(15, 3, 2, 2);
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(4.4, 5.4, 1, 0, Math.PI * 2); g.fill();
}
// threats
function paintJelly(g, f) {
  const sway = f ? 2 : -2;
  g.fillStyle = "rgba(255,150,200,0.75)"; g.beginPath();
  g.arc(13, 12, 11, Math.PI, 0); g.quadraticCurveTo(13, 20, 2, 13); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,200,225,0.8)"; g.beginPath();
  g.arc(13, 10, 6, Math.PI, 0); g.closePath(); g.fill();
  g.strokeStyle = "rgba(255,150,200,0.65)"; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    g.beginPath(); g.moveTo(6 + i * 4.6, 16);
    g.quadraticCurveTo(6 + i * 4.6 + sway, 24, 5 + i * 4.8 + sway, 30 + (i % 2) * 3); g.stroke();
  }
}
function paintPerch(g, f) {
  g.fillStyle = "#7a8f4e"; g.beginPath();
  g.moveTo(1, 8); g.quadraticCurveTo(10, 0, 22, 5); g.quadraticCurveTo(27, 7.5, 32, 8);
  g.quadraticCurveTo(24, 13, 10, 12.5); g.quadraticCurveTo(4, 11.5, 1, 8); g.closePath(); g.fill();
  g.fillStyle = "#4a5e2e";                                      // stripes
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(6 + i * 5, 1.5); g.lineTo(8 + i * 5, 1.5); g.lineTo(6 + i * 5, 12); g.lineTo(4 + i * 5, 12); g.closePath(); g.fill(); }
  g.fillStyle = "#e8e0c8"; g.fillRect(1, 9, 7, 2);              // mean jaw
  const t = f ? 2 : -2;
  g.fillStyle = "#5d7238"; g.beginPath();
  g.moveTo(31, 8); g.lineTo(37 + t * 0.4, 3); g.lineTo(35, 8); g.lineTo(37 + t * 0.4, 13); g.closePath(); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(5, 6, 1.2, 0, Math.PI * 2); g.fill();
}
function paintBarracuda(g, f) {
  g.fillStyle = "#9fb2c2"; g.beginPath();
  g.moveTo(1, 8); g.quadraticCurveTo(18, 2, 44, 6); g.quadraticCurveTo(56, 8, 62, 8);
  g.quadraticCurveTo(48, 13, 20, 13); g.quadraticCurveTo(8, 12, 1, 8); g.closePath(); g.fill();
  g.fillStyle = "#c8d6e0"; g.beginPath(); g.moveTo(4, 9); g.quadraticCurveTo(26, 13.5, 52, 9); g.quadraticCurveTo(30, 15, 12, 12); g.closePath(); g.fill();
  g.fillStyle = "#5d7080"; g.beginPath(); g.moveTo(20, 3); g.lineTo(26, 0); g.lineTo(26, 4); g.closePath(); g.fill();
  g.fillStyle = "#404e5a"; g.fillRect(1, 7.6, 10, 1.6);          // underbite jaw
  g.fillStyle = PAL.white; for (let i = 0; i < 5; i++) g.fillRect(2 + i * 2, 9, 1.2, 2);
  const t = f ? 2.6 : -2.6;
  g.fillStyle = "#5d7080"; g.beginPath();
  g.moveTo(61, 8); g.lineTo(69 + t * 0.4, 2); g.lineTo(66, 8); g.lineTo(69 + t * 0.4, 14); g.closePath(); g.fill();
  g.fillStyle = "#ffd166"; g.beginPath(); g.arc(6, 6, 1.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(6, 6, 0.7, 0, Math.PI * 2); g.fill();
}
function paintBullshark(g, f) {
  g.fillStyle = "#71828f"; g.beginPath();
  g.moveTo(2, 16); g.quadraticCurveTo(14, 6, 40, 9); g.quadraticCurveTo(62, 12, 72, 16);
  g.quadraticCurveTo(58, 25, 30, 25); g.quadraticCurveTo(12, 24, 2, 16); g.closePath(); g.fill();
  g.fillStyle = "#cfd6dc"; g.beginPath(); g.moveTo(6, 18); g.quadraticCurveTo(32, 28, 64, 18); g.quadraticCurveTo(42, 27, 16, 22); g.closePath(); g.fill();
  g.fillStyle = "#5d6d7a"; g.beginPath(); g.moveTo(30, 8); g.quadraticCurveTo(37, -5, 46, 8); g.closePath(); g.fill();
  g.fillStyle = "#5a6a76"; g.fillRect(2, 12, 14, 5);             // blunt snout
  g.fillStyle = PAL.white; for (let i = 0; i < 5; i++) g.fillRect(3 + i * 2.6, 17 + (i % 2), 2, 2.6);
  const t = f ? 5 : -5;
  g.fillStyle = "#5d6d7a"; g.beginPath();
  g.moveTo(71, 16); g.lineTo(88 + t * 0.4, 4); g.lineTo(81, 16); g.lineTo(88 + t * 0.4, 28); g.closePath(); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(9, 11.6, 1.8, 0, Math.PI * 2); g.fill();
}
function paintSquid(g) {
  // vertical tentacle, 34×120, drawn rising from bottom (rotate at strike)
  const grd = g.createLinearGradient(0, 0, 34, 0);
  grd.addColorStop(0, "#7a4a9e"); grd.addColorStop(1, "#a06ac2");
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(17, 0); g.quadraticCurveTo(30, 40, 24, 120); g.lineTo(10, 120);
  g.quadraticCurveTo(4, 40, 17, 0); g.closePath(); g.fill();
  g.fillStyle = "#e8d0f2";                                       // suckers
  for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(12 + (i % 2) * 6, 22 + i * 12, 2.6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "#ffd166"; g.beginPath(); g.arc(17, 6, 3, 0, Math.PI * 2); g.fill();
}
function paintNet(g) {
  g.strokeStyle = "rgba(232,226,205,0.85)"; g.lineWidth = 2;
  for (let x = 0; x <= 110; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 80); g.stroke(); }
  for (let y = 0; y <= 80; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(110, y); g.stroke(); }
  g.fillStyle = "#c87f3a";
  for (let x = 0; x <= 110; x += 27) { g.fillRect(x - 2, -3, 6, 4); g.fillRect(x - 2, 79, 6, 4); }
}
// country hazard actors
function paintTractor(g, f) {
  const b = f ? 1 : 0;
  g.fillStyle = "#c23b2e"; g.fillRect(6, 14, 46, 18);            // body
  g.fillStyle = "#9e2f24"; g.fillRect(40, 4, 16, 16);            // cabin
  g.fillStyle = "#8fd0e8"; g.fillRect(43, 7, 10, 8);             // window
  g.fillStyle = "#2a2a30"; g.beginPath(); g.arc(16, 34 + b, 10, 0, Math.PI * 2); g.fill(); // rear wheel
  g.fillStyle = "#4a4a52"; g.beginPath(); g.arc(16, 34 + b, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2a2a30"; g.beginPath(); g.arc(48, 36, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#4a4a52"; g.beginPath(); g.arc(48, 36, 2.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#55555f"; g.fillRect(10, 8, 4, 8);              // exhaust
  g.fillStyle = "#ffd166"; g.fillRect(4, 16, 3, 4);              // headlight
}
function paintShopper(g, f) {
  const u = 2;
  const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * u, y * u, w * u, h * u); };
  const step = f ? 1 : 0;
  P(3, 0, 4, 2, "#2e2e38"); P(2, 1, 6, 2, "#2e2e38");            // hair
  P(3, 2, 4, 3, "#d9a06a");                                      // face
  P(2, 5, 6, 6, "#7a5fae"); P(2, 5, 6, 1, "#9a7fce");            // coat
  P(8, 6, 2, 4, "#d9a06a");                                      // hand
  P(8, 9, 3, 4, "#e8c46a");                                      // shopping bag
  P(3, 11, 1, 4 + step, "#3a3a44"); P(6, 11, 1, 4 + (1 - step), "#3a3a44"); // legs
}
function paintSeagull(g, f) {
  g.fillStyle = PAL.white; g.beginPath();
  g.ellipse(17, 10, 12, 5.4, -0.1, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#d8dce0"; g.beginPath();                        // wing
  if (f) { g.moveTo(12, 8); g.quadraticCurveTo(22, -2, 30, 8); g.quadraticCurveTo(22, 10, 12, 10); }
  else { g.moveTo(12, 10); g.quadraticCurveTo(22, 20, 30, 12); g.quadraticCurveTo(22, 10, 12, 10); }
  g.closePath(); g.fill();
  g.fillStyle = "#4a90c2"; g.fillRect(27, 8, 5, 2.4);            // beak
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(24, 9, 1.2, 0, Math.PI * 2); g.fill();
}
// country items
function paintPail(g, done) {
  g.fillStyle = PAL.trunk; g.fillRect(7, 0, 6, 22);              // trunk mount
  g.fillStyle = done ? "#c9d6e2" : "#9fb2c2";                    // bucket
  g.beginPath(); g.moveTo(2, 8); g.lineTo(18, 8); g.lineTo(16, 22); g.lineTo(4, 22); g.closePath(); g.fill();
  g.strokeStyle = done ? "#e8eef4" : "#7a8fa0"; g.lineWidth = 2;
  g.beginPath(); g.arc(10, 8, 7, Math.PI, 0); g.stroke();
  if (done) { g.fillStyle = "#d9a45e"; g.fillRect(4, 7, 12, 4); } // sap filled
}
function paintCane(g) {
  // dark rim + bright stalk so the cane reads against the plantation greens
  g.strokeStyle = "#2e4a1e"; g.lineWidth = 7; g.lineCap = "round";
  g.beginPath(); g.moveTo(9, 52); g.quadraticCurveTo(7, 26, 9, 4); g.stroke();
  g.strokeStyle = "#a8cf62"; g.lineWidth = 4.4;
  g.beginPath(); g.moveTo(9, 52); g.quadraticCurveTo(7, 26, 9, 4); g.stroke();
  g.strokeStyle = "#d9efa0"; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(7.8, 48); g.quadraticCurveTo(6, 26, 7.8, 8); g.stroke();
  g.fillStyle = "#2e4a1e";
  g.beginPath(); g.moveTo(9, 16); g.quadraticCurveTo(19, 10, 17.5, 17); g.quadraticCurveTo(14, 18, 9, 19); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(9, 32); g.quadraticCurveTo(-1, 26, 0.5, 33); g.quadraticCurveTo(4, 34, 9, 35); g.closePath(); g.fill();
  g.fillStyle = "#7fae3e";
  g.beginPath(); g.moveTo(9, 17); g.quadraticCurveTo(16, 12.5, 15.5, 16.5); g.quadraticCurveTo(13, 17, 9, 18); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(9, 33); g.quadraticCurveTo(2, 28.5, 2.5, 32); g.quadraticCurveTo(5, 32.5, 9, 34); g.closePath(); g.fill();
}
function paintMound(g) {
  g.fillStyle = "rgba(120,86,40,0.55)"; g.beginPath(); g.ellipse(13, 13, 14, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#e6cd93"; g.beginPath(); g.moveTo(0, 14); g.quadraticCurveTo(13, -3, 26, 14); g.closePath(); g.fill();
  g.fillStyle = "#c9a562"; g.beginPath(); g.moveTo(5, 14); g.quadraticCurveTo(13, 5, 21, 14); g.closePath(); g.fill();
}
function paintScarab(g) {
  g.fillStyle = "#e8b23a"; g.beginPath(); g.ellipse(9, 8, 7, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#c28e2a"; g.beginPath(); g.ellipse(9, 8, 3.4, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8fae4e"; g.fillRect(0, 2, 5, 2); g.fillRect(13, 2, 5, 2); // front legs
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(15, 6, 1.2, 0, Math.PI * 2); g.fill();
}
function paintTile(g, i) {
  const cols = [["#3ddcff", "#f2f4f6"], ["#ff8ac2", "#f2f4f6"], ["#7dffc8", "#1c4038"], ["#ffd166", "#3a2b22"], ["#9a7fce", "#f2f4f6"]];
  const [a, b] = cols[i % cols.length];
  g.fillStyle = b; g.fillRect(0, 0, 22, 22);
  g.fillStyle = a;
  g.beginPath(); g.arc(11, 11, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = b; g.beginPath(); g.arc(11, 11, 3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = a; g.lineWidth = 2; g.strokeRect(1.5, 1.5, 19, 19);
}
function paintShell(g) {
  g.fillStyle = "#ffb8c8"; g.beginPath();
  g.moveTo(10, 16); g.quadraticCurveTo(-2, 8, 4, 2); g.quadraticCurveTo(10, -2, 16, 2);
  g.quadraticCurveTo(22, 8, 10, 16); g.closePath(); g.fill();
  g.strokeStyle = "#e08a9e"; g.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(10, 15); g.lineTo(3 + i * 4.6, 3); g.stroke(); }
  g.fillStyle = "#f2d0d8"; g.beginPath(); g.arc(10, 6, 2.6, 0, Math.PI * 2); g.fill();
}

// ==== create() ================================================================
export function create(level, api) {
  const data = level.data || {};
  const OW = data.ocean || {};
  const WK = data.walk || {};
  const NB = data.bubbles || 3;
  const tour = data.tour || [];
  const seed = (data.seed >>> 0) || 20260920;

  // ---- boot params (guarded — thumb pipeline passes none) --------------------
  let q = { get: () => null };
  try {
    if (typeof URLSearchParams !== "undefined" && typeof location !== "undefined")
      q = new URLSearchParams(location.search);
  } catch (e) {}
  const BOT = q.get("bot") === "1" ? (q.get("flavor") || "good") : null;
  const DBG = q.get("debug") === "1";
  const BEATS = q.get("beats") === "1";
  const stageQ = parseInt(q.get("stage") || "0", 10);
  const stage0 = Number.isFinite(stageQ) && stageQ > 0 ? Math.min(stageQ, tour.length - 1) : 0;

  // ---- state -----------------------------------------------------------------
  const st = {
    t: 0, frame: 0, mode: "card", cardT: 0, mapT: 0, sailT: 0, finaleT: 0,
    idx: stage0, def: tour[stage0] || {},
    s: null,                       // per-stage state
    _moving: false,
    stamps: [], stampsFull: [],
    bubbles: NB, invuln: 0, resetT: 0,
    quizzesRightFirst: 0, quizWrongTries: 0, hits: 0, eats: 0,
    completed: false, shakeT: 0, toast: "", toastT: 0,
    stageLog: [],
  };
  for (let i = 0; i < tour.length; i++) { st.stamps.push(false); st.stampsFull.push(0); }
  const PX = []; for (let i = 0; i < 80; i++) PX.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, c: "#fff", r: 2 });

  function beat(label, sub) {
    if (!BEATS || typeof document === "undefined") return;
    let host = document.getElementById("beats");
    if (!host) { host = document.createElement("div"); host.id = "beats"; document.body.appendChild(host); }
    const tile = document.createElement("img");
    const c = document.createElement("canvas"); c.width = 320; c.height = 90;
    const g = c.getContext("2d");
    g.fillStyle = "#0b1030"; g.fillRect(0, 0, 320, 90);
    g.strokeStyle = "#3ddcff"; g.strokeRect(2, 2, 316, 86);
    g.fillStyle = "#aef1ff"; g.font = "bold 22px sans-serif"; g.textAlign = "center";
    g.fillText(String(label).slice(0, 26), 160, 38);
    g.fillStyle = "#8a94c8"; g.font = "13px sans-serif";
    g.fillText(String(sub || "").slice(0, 40), 160, 62);
    tile.src = c.toDataURL();
    tile.dataset.label = label;
    host.appendChild(tile);
  }

  function say(msg, t = 2) { st.toast = msg; st.toastT = t; }
  function sfx(n) { try { api.audio?.sfx?.(n); } catch (e) {} }
  function shake(k) { try { api.eng?.shake?.(k); } catch (e) {} st.shakeT = Math.max(st.shakeT, 0.28); }

  // ---- stage construction ------------------------------------------------------
  function buildStage(idx) {
    const def = tour[idx] || {};
    const R = mulberry32(seed ^ (0x9e37 + idx * 7919));
    const s = { def, R, t: 0 };
    if (def.kind === "country") {
      s.worldW = def.worldW || 2600;
      s.groundY = 470;
      s.px = 120; s.dir = 1; s.walkT = 0;
      s.gateX = s.worldW - 220;
      s.items = [];
      const n = (def.item && def.item.n) || 5;
      const span = s.gateX - 340;
      for (let i = 0; i < n; i++) {
        const x = 300 + Math.round((i * span) / Math.max(1, n - 1) + (R() - 0.5) * 90);
        s.items.push({
          x, taken: false, i,
          shine: R() * 6, popT: 0,
          inWater: def.item && def.item.bands ? (i % 3 === 2) : false, // australia: every 3rd in shallows
        });
      }
      s.hazards = [];
      s.hzT = def.hazard ? 2.4 : 0;
      s.hzSide = 1;
      s.gateOpen = false; s.quizDone = false; s.gateHint = 0;
      s.digFx = [];
    } else {
      // ocean crossing
      s.px = 220; s.py = 300; s.pvx = 0; s.pvy = 0;
      s.size = def.size || 20;
      s.meter = 0; s.eatN = def.eatN || 12;
      s.foods = []; s.threats = [];
      s.spawnT = 0.6; s.threatT = 3;
      // opening soup: a few morsels already drifting mid-screen so the crossing
      // reads alive from the first frame (deterministic, from the same stream)
      const soupKinds = def.foods || ["algae"];
      for (let i = 0; i < 5; i++) {
        const kind = soupKinds[(R() * soupKinds.length) | 0];
        const sz = kind === "algae" ? 10 : kind === "fry" ? 12 : kind === "sardine" ? 16 : kind === "reeffish" ? 20 : 30;
        s.foods.push({ kind, x: 320 + i * 130 + (R() - 0.5) * 50, y: 140 + R() * 340, vx: -(8 + R() * 26), ph: R() * 6, sz, flee: kind !== "algae" });
      }
      s.surfaced = false; s.boatX = W * 0.5; s.boatT = 0;
      s.drift = def.speed || 46;
      s.squid = null; s.squidT = 5;
      s.netT = 0;
    }
    s.poofed = 0;
    return s;
  }

  function enterStage(idx, why) {
    st.idx = idx;
    st.def = tour[idx] || {};
    st.s = buildStage(idx);
    st.bubbles = NB; st.invuln = 1;
    st.mode = "card"; st.cardT = 0;
    st.stageLog.push({ id: st.def.id, t: +st.t.toFixed(1), why: why || "seq" });
    if (st.stageLog.length > 24) st.stageLog.shift();
    try { api.audio?.playMusic?.(st.def.music || "chill"); } catch (e) {}
    beat("leg-" + st.def.id, (st.def.kind === "country" ? st.def.continent + " — " + st.def.place : "CROSSING — " + (st.def.creature || "") + " → " + st.def.to));
  }

  // ---- quiz -------------------------------------------------------------------
  const quiz = { sel: 0, t: 0, wrongT: 0, rightT: 0, locked: false, wrongTries: 0, hinted: false };

  function openQuiz() {
    st.mode = "quiz";
    quiz.sel = 0; quiz.t = 0; quiz.wrongT = 0; quiz.rightT = 0; quiz.locked = false;
    quiz.wrongTries = 0; quiz.hinted = false;
    sfx("select");
  }
  function answerQuiz(i) {
    if (quiz.locked) return;
    quiz.sel = i;
    const q = st.def.quiz;
    if (i === q.right) {
      quiz.locked = true; quiz.rightT = 0.01;
      sfx("1up");
      st.quizzesRightFirst += quiz.wrongTries === 0 ? 1 : 0;
      st.quizWrongTries += quiz.wrongTries;
      beat("quiz-" + st.def.id + "-ok", q.opts[i]);
    } else {
      quiz.wrongTries++;
      quiz.wrongT = 0.9; quiz.hinted = true;
      sfx("lose");
      shake(0.5);
    }
  }
  function closeQuizToStamp() {
    st.stamps[st.idx] = true;
    st.stampsFull[st.idx] = 0.01;
    st.mode = "stamp"; st.cardT = 0;
    confetti(W / 2, 200, 40, [st.def.accent || PAL.teal, PAL.gold, PAL.white]);
    sfx("win");
    beat("stamp-" + st.def.id, st.def.place + " stamped");
  }

  // ---- particles ---------------------------------------------------------------
  function confetti(x, y, n, cols) {
    let placed = 0;
    for (const p of PX) {
      if (p.life > 0) continue;
      p.x = x + (st.s && st.s.R ? (st.s.R() - 0.5) * 30 : 0); p.y = y;
      p.vx = (st.s.R() - 0.5) * 340; p.vy = -120 - st.s.R() * 300;
      p.life = 1 + st.s.R() * 0.8; p.c = cols[placed % cols.length]; p.r = 2 + st.s.R() * 2.6;
      if (++placed >= n) break;
    }
  }
  function poof(x, y, col, n = 8) {
    confetti(x, y, n, [col, PAL.white]);
  }

  // ---- soft reset (never fail) ---------------------------------------------------
  function softReset() {
    st.resetT = 1.3;
    st.bubbles = NB;
    st.invuln = 1.6;
    if (st.def.kind === "country") {
      const s = st.s;
      s.px = Math.max(120, s.px - 240);
      s.hazards.length = 0; s.hzT = 3;
      say("Caught your breath — keep going!", 1.3);
    } else {
      const s = st.s;
      s.px = 220; s.py = 300; s.pvx = 0; s.pvy = 0;
      s.threats = s.threats.filter((e) => e.x > W * 0.75);
      say("The current carried you back — swim on!", 1.3);
    }
    sfx("splash");
  }

  // ---- country update ------------------------------------------------------------
  function updCountry(dt, ctl) {
    const s = st.s, def = st.def;
    s.t += dt;
    const speed = WK.speed || 224;
    // horizontal walk (vertical only for band stages)
    const bands = def.item && def.item.bands;
    const mx = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
    s._moving = mx !== 0;
    if (mx) { s.dir = mx; s.walkT += dt * 7; }
    s.px = clamp(s.px + mx * speed * dt, 40, s.gateX + (s.gateOpen ? 0 : 60));
    s.camX = clamp(s.px - (WK.camLead || 340), 0, Math.max(0, s.worldW - W));
    if (bands) {
      // dive between sand lane (y 470) and shallows (y 512)
      const target = ctl.down && !ctl.up ? 512 : 470;
      s.diveY = (s.diveY === undefined ? 470 : s.diveY) + (target - (s.diveY === undefined ? 470 : s.diveY)) * Math.min(1, dt * 7);
    } else s.diveY = 470;
    const feetY = bands ? s.diveY : s.groundY;

    // hazards
    if (def.hazard) {
      s.hzT -= dt;
      if (s.hzT <= 0 && s.hazards.length < 2) {
        const [a, b] = def.hazard.every || [5, 8];
        s.hzT = a + s.R() * (b - a);
        const fromRight = s.R() < 0.5;
        s.hazards.push({
          x: fromRight ? Math.min(s.worldW - 80, s.px + 620) : Math.max(60, s.px - 620),
          vx: (fromRight ? -1 : 1) * (def.hazard.speed || 70),
          kind: def.hazard.kind, f: 0, ft: 0,
          y: def.hazard.kind === "seagull" ? 300 : 0, swoopT: 0,
        });
      }
      for (let i = s.hazards.length - 1; i >= 0; i--) {
        const h = s.hazards[i];
        h.x += h.vx * dt; h.ft += dt;
        h.f = (h.ft * 6 | 0) % 2;
        if (h.kind === "seagull") {
          h.swoopT += dt;
          h.y = 280 + Math.sin(h.swoopT * 1.4) * 130;
        }
        const hy = h.kind === "seagull" ? h.y : s.groundY - 24;
        const hitR = h.kind === "tractor" ? 44 : h.kind === "seagull" ? 26 : 22;
        if (st.invuln <= 0 && Math.abs(h.x - s.px) < hitR && Math.abs(hy - (feetY - 22)) < 46) {
          st.bubbles--; st.hits++;
          st.invuln = 1.4;
          s.px += (s.px < h.x ? -46 : 46);
          sfx("hit"); shake(0.8);
          poof(s.px, feetY - 24, PAL.coral, 10);
          if (st.bubbles <= 0) { softReset(); return; }
        }
        if (h.x < s.camX - 160 || h.x > s.camX + W + 620) s.hazards.splice(i, 1);
      }
    }

    // items
    const interact = def.item.interact;
    let near = null;
    for (const it of s.items) {
      if (it.taken) { it.popT += dt; continue; }
      const iy = it.inWater ? 506 : (def.item.kind === "koi" ? s.groundY - 6 : s.groundY - 20);
      const d = Math.abs(it.x - s.px);
      const bandOk = !def.item.bands || ((it.inWater && feetY > 490) || (!it.inWater && feetY <= 490));
      if (d < 44 && bandOk) near = it;
      if (interact === "touch" && d < 30 && bandOk) takeItem(it);
    }
    s.nearItem = near;
    // interact press
    if (ctl.act && near && !near.taken) {
      if (interact === "tap" || interact === "dig") takeItem(near);
      else if (interact === "feed") {
        const ph = koiPhase(s, near);
        if (ph < 0.85) takeItem(near);
        else { sfx("push"); quiz.wrongT = 0; say("Wait for the koi to surface…", 1); }
      }
    }

    // dig fx
    for (let i = s.digFx.length - 1; i >= 0; i--) { s.digFx[i].t += dt; if (s.digFx[i].t > 0.6) s.digFx.splice(i, 1); }

    // landmark gate
    if (!s.gateOpen && s.items.every((it) => it.taken)) {
      s.gateOpen = true;
      sfx("powerup");
      say("All done — to the " + (def.landmarkLabel || "gate") + "! ▶", 2.4);
      beat("gate-" + def.id, def.landmarkLabel);
    }
    s.gateHint = s.gateOpen && Math.abs(s.px - s.gateX) < 70 ? 1 : 0;
    if (s.gateHint && ctl.act && !s.quizDone) { s.quizDone = true; openQuiz(); }
    if (s.px >= s.gateX && !s.gateOpen) s.px = s.gateX; // soft wall until items done
  }

  function takeItem(it) {
    it.taken = true; it.popT = 0;
    st.s.digFx.push({ x: it.x, y: it.inWater ? 506 : st.s.groundY - 16, t: 0 });
    poof(it.x, it.inWater ? 500 : st.s.groundY - 30, st.def.accent || PAL.gold, 9);
    sfx("coin");
  }
  function koiPhase(s, it) {
    return (s.t * 0.42 + it.i * 1.73) % 3.1;
  }

  // ---- ocean update ---------------------------------------------------------------
  function spawnFood(s) {
    const kinds = st.def.foods || ["algae"];
    const kind = kinds[(s.R() * kinds.length) | 0];
    const baseY = 130 + s.R() * 360;
    if (kind === "sardine") {
      const n = 4 + (s.R() * 3 | 0);
      for (let i = 0; i < n; i++)
        s.foods.push({ kind, x: W + 30 + (i % 3) * 26, y: baseY + ((i / 3) | 0) * 18 + (s.R() - 0.5) * 10, vx: -(10 + s.R() * 26), ph: s.R() * 6, sz: 16, flee: true });
    } else {
      // triple-spawn keeps the feeding pace up without walls of food
      const sz = kind === "algae" ? 12 : kind === "fry" ? 13 : kind === "reeffish" ? 20 : 30;
      for (let i = 0; i < 3; i++)
        s.foods.push({ kind, x: W + 30 + i * 26, y: baseY + (s.R() - 0.5) * 24, vx: -(8 + s.R() * 30), ph: s.R() * 6, sz, flee: kind !== "algae" });
    }
  }
  function spawnThreat(s) {
    // "squid" is a scripted strike (s.squid), never a spawned swimmer
    const pool = (st.def.threats || []).filter((k) => k !== "squid");
    if (!pool.length) return;
    const kind = pool[(s.R() * pool.length) | 0];
    const specs = {
      jelly:     { sz: 34, vx: -26, hp: 0 },
      perch:     { sz: 34, vx: -78, hp: 200 },
      barracuda: { sz: 64, vx: -150, hp: 240 },
      bullshark: { sz: 88, vx: -66, hp: 300 },
      net:       { sz: 90, vx: -34, hp: 0 },
    };
    const sp = specs[kind] || specs.jelly;
    s.threats.push({
      kind, x: W + 80, y: 140 + s.R() * 340, vx: sp.vx, vy: 0,
      sz: sp.sz, hp: sp.hp, ph: s.R() * 6, f: 0, ft: 0, cool: 0,
    });
  }
  function updOcean(dt, ctl) {
    const s = st.s, def = st.def;
    s.t += dt;
    const acc = OW.accel || 640, dragK = OW.drag || 2.1, vmax = OW.vmax || 320;
    const surfY = OW.surfY || 84;
    // steering
    let ax = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
    let ay = (ctl.down ? 1 : 0) - (ctl.up ? 1 : 0);
    s.pvx += ax * acc * dt; s.pvy += ay * acc * dt;
    s.pvx -= s.pvx * dragK * dt; s.pvy -= s.pvy * dragK * dt;
    const sp = Math.hypot(s.pvx, s.pvy);
    if (sp > vmax) { s.pvx *= vmax / sp; s.pvy *= vmax / sp; }
    s.px += s.pvx * dt; s.py += s.pvy * dt;
    s.px = clamp(s.px, 20, W - 20);
    const floor = H - 14;
    if (s.py < surfY + 14) { s.py = surfY + 14; s.pvy = Math.max(0, s.pvy); }
    if (s.py > floor) { s.py = floor; s.pvy = Math.min(0, s.pvy); }

    // growth
    s.growScale = 1 + (OW.growK || 0.05) * s.meter;

    // surfaced? boat waits
    if (s.meter >= s.eatN && !s.surfaced) {
      s.surfaced = true;
      s.boatX = W * 0.55;
      sfx("alarm");
      say("You're big enough — surface! Find the boat ▲", 3);
      beat("surface-" + def.id, def.creature + " → boat");
    }
    if (s.surfaced) {
      // boat does NOT chase the player (unreachable-at-equal-speed trap): it drifts
      // slowly with the current and re-enters from the right when it exits left
      s.boatX -= 14 * dt;
      if (s.boatX < 170) s.boatX = W - 170;
    }

    // spawns
    s.spawnT -= dt;
    if (s.spawnT <= 0 && !s.surfaced && s.foods.length < (OW.foodCap || 22) && s.meter + s.foods.length < s.eatN + 10) {
      spawnFood(s);
      const [fa, fb] = OW.foodEvery || [0.6, 1.05];
      s.spawnT = fa + s.R() * (fb - fa);
    }
    s.threatT -= dt;
    const tMax = def.threats && def.threats.length ? (OW.threatMax || 4) : 0;
    if (s.threatT <= 0 && !s.surfaced && s.threats.length < tMax) {
      spawnThreat(s);
      const [ta, tb] = OW.threatEvery || [3.2, 5.6];
      s.threatT = ta + s.R() * (tb - ta);
    }
    // squid swipes (orca stage)
    if (def.threats && def.threats.includes("squid")) {
      s.squidT -= dt;
      if (!s.squid && s.squidT <= 0) {
        s.squid = { x: clamp(s.px + (s.R() - 0.5) * 240, 80, W - 80), tel: 0.9, up: 0, hold: 0 };
        sfx("bossRoar");
      }
      if (s.squid) {
        const q = s.squid;
        if (q.tel > 0) q.tel -= dt;
        else if (q.up < 1) { q.up = Math.min(1, q.up + dt * 1.15); }
        else { q.hold += dt; if (q.hold > 0.5) { s.squid = null; s.squidT = 4.5 + s.R() * 3; } }
        if (q.tel <= 0 && q.up > 0.06 && q.up < 1) {
          const tipY = H - q.up * (H - surfY - 60);
          if (st.invuln <= 0 && Math.abs(q.x - s.px) < 34 && s.py > tipY - 10) {
            st.bubbles--; st.hits++; st.invuln = 1.4;
            s.pvy = -330; s.pvx += (s.px < q.x ? -200 : 200);
            sfx("hit"); shake(1);
            if (st.bubbles <= 0) { softReset(); return; }
          }
        }
      }
    }

    // foods
    for (let i = s.foods.length - 1; i >= 0; i--) {
      const f = s.foods[i];
      f.ph += dt;
      f.x += f.vx * dt - s.drift * dt * 0.4;
      f.y += Math.sin(f.ph * 2.1) * 16 * dt;
      if (f.flee) {
        const dx = f.x - s.px, dy = f.y - s.py, d = Math.hypot(dx, dy);
        if (d < 90 && d > 1) { f.x += (dx / d) * 64 * dt; f.y += (dy / d) * 64 * dt; }
      }
      f.x = clamp(f.x, -50, W + 60); f.y = clamp(f.y, surfY + 26, H - 20);
      // eat radius tracks the on-screen creature size (visK), not the logical size
      const eatR = s.size * s.growScale * (OW.eatK || 1.05) + 6;
      if (Math.hypot(f.x - s.px, f.y - s.py) < eatR + f.sz * 0.4) {
        s.foods.splice(i, 1);
        s.meter++; st.eats++;
        sfx("coin");
        poof(f.x, f.y, "#8fe6a8", 6);
        continue;
      }
      if (f.x < -40) s.foods.splice(i, 1);
    }
    // threats
    for (let i = s.threats.length - 1; i >= 0; i--) {
      const e = s.threats[i];
      e.ft += dt; e.f = (e.ft * 5 | 0) % 2; e.cool = Math.max(0, e.cool - dt);
      let hx = 0;
      if (e.hp && Math.hypot(e.x - s.px, e.y - s.py) < e.hp) {
        hx = Math.sign(s.px - e.x) * 40;
        e.y += Math.sign(s.py - e.y) * 22 * dt;
      }
      e.x += (e.vx + hx) * dt - s.drift * dt * 0.4;
      e.y += Math.sin(e.ph + e.ft * (e.kind === "jelly" ? 1.2 : 2.2)) * 22 * dt;
      e.y = clamp(e.y, surfY + 30, H - 30);
      if (st.invuln <= 0 && e.cool <= 0) {
        const rr = (s.size * s.growScale * (OW.hitK || 1.0)) + e.sz * 0.42;
        if (Math.hypot(e.x - s.px, e.y - s.py) < rr) {
          if (e.kind === "net") {
            // net: no damage — tangle & push
            e.cool = 1.2;
            s.pvx += (s.px < e.x ? -260 : 260); s.pvy += (s.py < e.y ? -160 : 160);
            sfx("push"); say("Tangled in the net — push free!", 1.2);
          } else {
            st.bubbles--; st.hits++; st.invuln = 1.4; e.cool = 2;
            const kx = Math.sign(s.px - e.x) || -1;
            s.pvx = kx * 300; s.pvy = -180;
            sfx("hit"); shake(1);
            poof(s.px, s.py, PAL.coral, 10);
            if (st.bubbles <= 0) { softReset(); return; }
          }
        }
      }
      if (e.x < -140) s.threats.splice(i, 1);
    }

    // boarding
    if (s.surfaced) {
      const bx = s.boatX, by = surfY - 12;
      if (Math.abs(s.px - bx) < 74 && s.py < surfY + 46) {
        st.mode = "sail"; st.sailT = 0;
        sfx("splash");
        confetti(bx, surfY - 30, 26, [PAL.teal, PAL.white]);
        beat("board-" + def.id, def.creature + " → " + def.to);
      }
    }
  }

  // ---- map / cards ------------------------------------------------------------------
  function updMap(dt, ctl) {
    st.mapT += dt;
    if (st.mapT > 0.7 && (ctl.anyJust || ctl.act || st.mapT > 3.4)) {
      const nxt = st.idx + 1;
      if (nxt < tour.length) enterStage(nxt);
    }
  }

  // ---- bot --------------------------------------------------------------------------
  const bot = BOT ? {
    flavor: BOT,
    actT: 0, pauseT: 0, doneWrong: false,
    ctl() {
      const c = { left: false, right: false, up: false, down: false, act: false, anyJust: false, sel: null, confirm: false };
      const s = st.s, def = st.def;
      if (!s) return c;
      this.actT -= 1 / 60;
      if (st.mode === "quiz") {
        const q = def.quiz;
        if (quiz.t > 0.6 && !quiz.locked) {
          let pick = q.right;
          if (this.flavor !== "good") {
            // partial: wrong once on brazil; clumsy: always wrong
            if (this.flavor === "clumsy") pick = (q.right + 1) % q.opts.length;
            else if (def.id === "brazil" && !this.doneWrong) { pick = (q.right + 1) % q.opts.length; this.doneWrong = true; }
          }
          c.sel = pick; c.confirm = true;
        }
        return c;
      }
      if (st.mode !== "play") return c;
      if (def.kind === "country") {
        // clumsy: wanders right forever — never taps, digs, feeds or answers
        if (this.flavor === "clumsy") { c.right = s.px < s.gateX; return c; }
        // nearest untaken item, else gate
        let target = null, bd = 1e9;
        for (const it of s.items) {
          if (it.taken) continue;
          const d = Math.abs(it.x - s.px);
          if (d < bd) { bd = d; target = it; }
        }
        if (target) {
          const dir = Math.sign(target.x - s.px);
          if (bd > 30) { if (dir > 0) c.right = true; else c.left = true; }
          else {
            const inter = def.item.interact;
            if (inter === "touch") { /* handled by touch */ }
            else if (inter === "feed") {
              const ph = koiPhase(s, target);
              if (ph < 0.6) c.act = true;
            } else {
              if (this.actT <= 0) { c.act = true; this.actT = 0.5; }
            }
          }
          // band stages: dive for water items
          if (def.item.bands) { if (target.inWater) c.down = true; else c.up = true; }
        } else {
          // all items done → walk to the open gate and press act inside the trigger zone
          if (s.px < s.gateX - 8) c.right = true;
          if (s.gateOpen && Math.abs(s.px - s.gateX) < 70 && this.actT <= 0) { c.act = true; this.actT = 0.8; }
        }
        return c;
      }
      // ocean bot — clumsy just drifts, never hunts, never grows
      if (this.flavor === "clumsy") {
        c.right = ((st.frame >> 5) & 1) === 0; c.down = (st.frame >> 4) % 2 === 0;
        return c;
      }
      if (s.surfaced) {
        const dx = s.boatX - s.px, dy = (OW.surfY || 84) + 20 - s.py;
        c.right = dx > 12; c.left = dx < -12; c.down = dy > 12; c.up = dy < -12;
        return c;
      }
      // threat repulsion (clumsy ignores; partial ignores 45%)
      let rx = 0, ry = 0;
      const ignore = this.flavor === "clumsy" || (this.flavor === "partial" && ((st.frame >> 4) % 100) < 45);
      if (!ignore) {
        for (const e of s.threats) {
          const dx = s.px - e.x, dy = s.py - e.y, d = Math.hypot(dx, dy) || 1;
          if (d < 120 + e.sz * 0.3) { rx += (dx / d) * 2.0; ry += (dy / d) * 2.0; }
        }
        if (s.squid && s.squid.tel <= 0.4 && Math.abs(s.squid.x - s.px) < 90) { rx += Math.sign(s.px - s.squid.x) * 2.6; ry -= 2; }
      }
      // nearest food
      let target = null, bd = 1e9;
      for (const f of s.foods) {
        const d = Math.hypot(f.x - s.px, f.y - s.py);
        if (d < bd) { bd = d; target = f; }
      }
      if (target) {
        const dx = target.x - s.px + rx * 90, dy = target.y - s.py + ry * 90;
        c.right = dx > 10; c.left = dx < -10; c.down = dy > 10; c.up = dy < -10;
      } else { c.right = rx >= 0; c.left = rx < 0; }
      return c;
    },
  } : null;

  // ---- controller merge ----------------------------------------------------------------
  function readCtl(input) {
    const c = {
      left: input.left(), right: input.right(), up: input.up(), down: input.downKey(),
      act: input.just("Space") || input.just("Enter"),
      anyJust: input.anyJust(),
      sel: null, confirm: false,
    };
    if (input.just("KeyW")) c.up = true;
    if (input.just("KeyS")) c.down = true;
    for (let i = 0; i < 3; i++) {
      if (input.just("Digit" + (i + 1)) || input.just("Numpad" + (i + 1))) { c.sel = i; c.confirm = true; }
    }
    return c;
  }
  function mergeCtl(a, b) {
    if (!b) return a;
    return {
      left: a.left || b.left, right: a.right || b.right, up: a.up || b.up, down: a.down || b.down,
      act: a.act || b.act, anyJust: a.anyJust || b.anyJust,
      sel: b.sel !== null ? b.sel : a.sel, confirm: a.confirm || b.confirm,
    };
  }

  // ---- update ---------------------------------------------------------------------------
  function update(dt, input) {
    st.frame++;
    const ts = (DBG && typeof window !== "undefined" && window.__WT && window.__WT.timeScale) || 1;
    let total = dt * ts;
    const steps = Math.max(1, Math.ceil(total / (1 / 60)));
    const sdt = total / steps;
    for (let i = 0; i < steps; i++) step(sdt, input);
  }

  function step(dt, input) {
    st.t += dt;
    if (st.shakeT > 0) st.shakeT -= dt;
    if (st.toastT > 0) st.toastT -= dt;
    st.invuln = Math.max(0, st.invuln - dt);
    for (const p of PX) { if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 760 * dt; } }
    for (let i = 0; i < st.stamps.length; i++) if (st.stampsFull[i] > 0 && st.stampsFull[i] < 1) st.stampsFull[i] = Math.min(1, st.stampsFull[i] + dt * 2.4);

    let ctl = readCtl(input);
    if (bot) ctl = mergeCtl(ctl, bot.ctl());
    if (st.resetT > 0) { st.resetT -= dt; ctl = { left: false, right: false, up: false, down: false, act: false, anyJust: false, sel: null, confirm: false }; }

    if (st.mode === "card") {
      st.cardT += dt;
      if (st.cardT > (st.idx === 0 && stage0 === 0 ? 2.1 : 1.6) || (st.cardT > 0.4 && ctl.anyJust)) st.mode = "play";
      return;
    }
    if (st.mode === "map") { updMap(dt, ctl); return; }
    if (st.mode === "quiz") {
      quiz.t += dt;
      if (quiz.wrongT > 0) quiz.wrongT -= dt;
      if (quiz.rightT > 0) { quiz.rightT += dt; if (quiz.rightT > 1.4) closeQuizToStamp(); return; }
      if (quiz.locked) return;
      if (ctl.confirm && ctl.sel !== null) { answerQuiz(ctl.sel); return; }
      if (input.just("ArrowUp") || input.just("KeyW")) { quiz.sel = (quiz.sel + 2) % 3; sfx("select"); }
      if (input.just("ArrowDown") || input.just("KeyS")) { quiz.sel = (quiz.sel + 1) % 3; sfx("select"); }
      if (ctl.act && !ctl.confirm) answerQuiz(quiz.sel);
      return;
    }
    if (st.mode === "stamp") {
      st.cardT += dt;
      if (st.cardT > 2) {
        const nxt = st.idx + 1;
        if (nxt < tour.length) { st.mode = "map"; st.mapT = 0; }
        else { st.mode = "finale"; st.finaleT = 0; beat("tour-complete", "6 stamps · 5 crossings"); }
      }
      return;
    }
    if (st.mode === "sail") {
      st.sailT += dt;
      if (st.sailT > 2.4) { st.mode = "map"; st.mapT = 0; }
      return;
    }
    if (st.mode === "finale") {
      st.finaleT += dt;
      if (st.finaleT < 2.6 && (st.finaleT * 3 | 0) !== ((st.finaleT - dt) * 3 | 0))
        confetti(120 + st.s.R() * 720, 120 + st.s.R() * 200, 22, [PAL.teal, PAL.gold, PAL.magenta, PAL.white]);
      if (st.finaleT > 3.2 && !st.completed) {
        st.completed = true;
        const payload = {
          tour: tour.map((d) => d.id), stamps: st.stamps.filter(Boolean).length,
          crossings: tour.filter((d) => d.kind === "ocean").length,
          quizzesRightFirst: st.quizzesRightFirst, quizWrongTries: st.quizWrongTries,
          hits: st.hits, eats: st.eats, t: +st.t.toFixed(1),
          season: seasonNow().id,
        };
        try { api.complete(payload); } catch (e) {}
      }
      return;
    }
    if (st.mode !== "play") return;

    if (st.def.kind === "country") updCountry(dt, ctl);
    else updOcean(dt, ctl);
  }

  // ---- camera ----------------------------------------------------------------------------
  function camX() {
    const s = st.s;
    if (!s || st.def.kind !== "country") return 0;
    return clamp(s.px - (WK.camLead || 340), 0, Math.max(0, s.worldW - W));
  }

  // ========================================================================================
  // DRAW
  // ========================================================================================
  function draw(g) {
    g.save();
    if (st.shakeT > 0) g.translate((hash(st.frame) - 0.5) * 10 * st.shakeT, (hash(st.frame + 40) - 0.5) * 8 * st.shakeT);
    const def = st.def;
    if (st.mode === "map") drawMap(g);
    else if (st.mode === "finale") drawFinale(g);
    else if (def.kind === "ocean") drawOcean(g);
    else drawCountry(g);
    if (st.mode === "card") drawCard(g);
    if (st.mode === "quiz") drawQuiz(g);
    drawHUD(g);
    drawParticles(g);
    if (st.resetT > 0) {
      g.fillStyle = `rgba(10,20,40,${0.5 * Math.min(1, st.resetT * 2)})`;
      g.fillRect(0, 0, W, H);
    }
    g.restore();
    // season wash over everything (booth season chip rule)
    try {
      // light season tint (imported from core) — kept subtle over our own art
      const s = seasonNow();
      g.fillStyle = `rgba(${s.tint},0.05)`;
      g.fillRect(0, 0, W, H);
    } catch (e) {}
  }

  function drawParticles(g) {
    for (const p of PX) {
      if (p.life <= 0) continue;
      g.globalAlpha = clamp(p.life, 0, 1);
      g.fillStyle = p.c;
      g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    g.globalAlpha = 1;
  }

  // ---- title card ------------------------------------------------------------------------
  function drawCard(g) {
    const def = st.def;
    const a = st.cardT < 0.3 ? st.cardT / 0.3 : st.cardT > 1.2 ? clamp(1 - (st.cardT - 1.2) / 0.4, 0, 1) : 1;
    g.fillStyle = `rgba(8,12,28,${0.72 * a})`;
    g.fillRect(0, 0, W, H);
    const isC = def.kind === "country";
    let legNo = 0, crossNo = 0;
    for (let i = 0; i <= st.idx; i++) { if (tour[i].kind === "country") legNo++; else crossNo++; }
    const big = isC ? def.place : (def.creature || "").toUpperCase() + " CROSSING";
    drawText(g, isC ? "LEG " + legNo + " OF 6 · " + def.continent.toUpperCase() : "OCEAN CROSSING " + crossNo + " OF 5 · " + def.from.toUpperCase() + " → " + def.to.toUpperCase(),
      W / 2, 190, { size: 22, color: PAL.gold, alpha: a, weight: "bold" });
    drawText(g, big, W / 2, 248, { size: 52, color: PAL.white, alpha: a, weight: "bold", shadow: "rgba(0,0,0,.6)" });
    drawText(g, def.tagline || "", W / 2, 300, { size: 18, color: "#c8d2e8", alpha: a });
    if (st.cardT > 0.9) drawText(g, "press any key ▶", W / 2, 350, { size: 13, color: "#8a94c8", alpha: 0.5 + 0.5 * Math.sin(st.t * 4) });
  }

  // ---- HUD (canvas) -----------------------------------------------------------------------
  function drawHUD(g) {
    if (st.mode === "map" || st.mode === "finale" || st.mode === "card") return;
    const def = st.def;
    let legNo = 0, crossNo = 0;
    for (let i = 0; i <= st.idx; i++) { if (tour[i].kind === "country") legNo++; else crossNo++; }
    // top-left leg label (shadowed for bright skies)
    drawText(g, def.kind === "country" ? "LEG " + legNo + "/6 — " + def.place.toUpperCase() : "CROSSING " + crossNo + "/5 — " + (def.creature || "").toUpperCase(), 20, 26, { size: 14, color: "#e8eef8", align: "left", shadow: "rgba(10,16,34,0.6)" });
    drawText(g, def.kind === "country" ? def.continent : def.from + " → " + def.to, 20, 44, { size: 11, color: "#c8d2e8", align: "left", shadow: "rgba(10,16,34,0.6)" });
    // bubbles
    let bb = "";
    for (let i = 0; i < NB; i++) bb += i < st.bubbles ? "♥ " : "· ";
    drawText(g, bb, W - 20, 26, { size: 16, color: st.bubbles <= 1 ? "#ff8a7e" : "#ff9ab0", align: "right", shadow: "rgba(10,16,34,0.6)" });
    // progress
    if (def.kind === "country") {
      const n = def.item.n, got = st.s.items.filter((i) => i.taken).length;
      drawText(g, def.item.label + "  " + got + "/" + n, W / 2, 26, { size: 15, color: PAL.white, shadow: "rgba(10,16,34,0.6)" });
    } else {
      const s = st.s, p = clamp(s.meter / s.eatN, 0, 1);
      const bw = 300, bx = W / 2 - bw / 2, by = 18;
      g.fillStyle = "rgba(8,14,30,0.6)"; g.fillRect(bx - 3, by - 3, bw + 6, 20);
      g.fillStyle = "#0d1c34"; g.fillRect(bx, by, bw, 14);
      g.fillStyle = s.surfaced ? PAL.gold : PAL.teal;
      g.fillRect(bx, by, bw * p, 14);
      drawText(g, s.surfaced ? "SURFACE! ▲ FIND THE BOAT" : "GROW  " + s.meter + "/" + s.eatN, W / 2, by + 33, { size: 14, color: s.surfaced ? PAL.gold : "#cfeaff", weight: "bold", shadow: "rgba(10,16,34,0.6)" });
      drawText(g, (def.creature || "").toUpperCase(), bx - 14, by + 7, { size: 13, color: "#9adfff", align: "right", weight: "bold", shadow: "rgba(10,16,34,0.6)" });
    }
    // passport stamps row (bottom-left)
    const names = ["NA", "SA", "AF", "EU", "AS", "OC"];
    let ci = 0;
    for (let i = 0; i < tour.length; i++) {
      if (tour[i].kind !== "country") continue;
      const x = 26 + ci * 30, y = H - 26;
      const k = st.stampsFull[i];
      g.save();
      g.globalAlpha = 0.35 + 0.65 * k;
      g.strokeStyle = k > 0 ? tour[i].accent : "#5a6484";
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.stroke();
      if (k > 0) {
        g.translate(x, y); g.rotate((1 - k) * 1.2 - 0.2);
        drawText(g, "✓", 0, 1, { size: 14, color: tour[i].accent });
      } else {
        drawText(g, names[ci], x, y + 1, { size: 9, color: "#5a6484" });
      }
      g.restore();
      ci++;
    }
    // toast
    if (st.toastT > 0) drawText(g, st.toast, W / 2, 86, { size: 16, color: PAL.gold, alpha: clamp(st.toastT, 0, 1), shadow: "rgba(10,16,34,0.65)" });
  }

  // ---- quiz overlay -------------------------------------------------------------------------
  function drawQuiz(g) {
    const q = st.def.quiz;
    g.fillStyle = "rgba(6,10,24,0.72)"; g.fillRect(0, 0, W, H);
    const pw = 640, ph = 320, px = W / 2 - pw / 2, py = 90;
    const wob = quiz.wrongT > 0 ? Math.sin(quiz.wrongT * 40) * 6 : 0;
    g.save(); g.translate(wob, 0);
    g.fillStyle = "#101a36"; g.fillRect(px, py, pw, ph);
    g.strokeStyle = PAL.gold; g.lineWidth = 3; g.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
    drawText(g, "★ " + (st.def.place || "").toUpperCase() + " ★", W / 2, py + 36, { size: 16, color: PAL.gold });
    // wrap question
    const words = q.q.split(" ");
    const lines = []; let line = "";
    for (const wd of words) {
      if ((line + " " + wd).trim().length > 46) { lines.push(line.trim()); line = wd; }
      else line += " " + wd;
    }
    if (line.trim()) lines.push(line.trim());
    lines.forEach((ln, i) => drawText(g, ln, W / 2, py + 72 + i * 24, { size: 19, color: PAL.white }));
    const oy = py + 96 + lines.length * 24;
    q.opts.forEach((opt, i) => {
      const y = oy + i * 46;
      const sel = quiz.sel === i;
      const isRight = quiz.locked && i === q.right;
      const isWrongPick = quiz.wrongT > 0 && sel;
      g.fillStyle = isRight ? "rgba(70,200,140,0.25)" : sel ? "rgba(61,220,255,0.16)" : "rgba(255,255,255,0.05)";
      g.fillRect(px + 40, y - 17, pw - 80, 36);
      if (sel || isRight) { g.strokeStyle = isRight ? "#5ce8a0" : PAL.teal; g.lineWidth = 2; g.strokeRect(px + 40, y - 17, pw - 80, 36); }
      drawText(g, (i + 1) + ".  " + opt, px + 60, y, { size: 18, color: isRight ? "#5ce8a0" : isWrongPick ? "#ff8a7e" : PAL.white, align: "left" });
      if (isRight) drawText(g, "✓", px + pw - 60, y, { size: 18, color: "#5ce8a0" });
      if (isWrongPick) drawText(g, "✗ try again", px + pw - 60, y, { size: 13, color: "#ff8a7e" });
    });
    if (quiz.hinted && quiz.wrongT <= 0 && !quiz.locked)
      drawText(g, "hint: " + q.hint, W / 2, py + ph - 22, { size: 13, color: "#9aa6c4" });
    if (!quiz.hinted && !quiz.locked)
      drawText(g, "1 · 2 · 3  or  ↑ ↓ + ENTER", W / 2, py + ph - 22, { size: 13, color: "#8a94c8" });
    if (quiz.rightT > 0) drawText(g, "✓ STAMPED — " + (st.def.place || ""), W / 2, py + ph + 30, { size: 20, color: "#5ce8a0" });
    g.restore();
  }

  // ---- world map -----------------------------------------------------------------------------
  const BLOBS = [
    { n: "N. AMERICA", pts: [[70, 150], [150, 128], [232, 138], [252, 180], [212, 212], [182, 252], [150, 232], [118, 202], [80, 190]], node: [170, 180] },
    { n: "S. AMERICA", pts: [[212, 268], [252, 258], [284, 300], [272, 352], [242, 412], [220, 382], [216, 320]], node: [248, 320] },
    { n: "EUROPE", pts: [[430, 150], [492, 138], [512, 170], [482, 192], [440, 186]], node: [472, 166] },
    { n: "AFRICA", pts: [[440, 210], [512, 200], [542, 252], [522, 312], [492, 352], [460, 322], [445, 262]], node: [490, 270] },
    { n: "ASIA", pts: [[522, 132], [642, 118], [702, 160], [682, 212], [622, 232], [562, 212], [526, 182]], node: [610, 175] },
    { n: "OCEANIA", pts: [[762, 322], [832, 310], [862, 346], [832, 378], [776, 368]], node: [815, 345] },
  ];
  const ROUTE = [0, 1, 2, 3, 4, 5]; // tour order maps onto these blob nodes

  function drawMap(g) {
    g.fillStyle = "#0a1830"; g.fillRect(0, 0, W, H);
    // ocean shimmer
    for (let i = 0; i < 60; i++) {
      const x = hash(i * 3) * W, y = hash(i * 3 + 1) * H;
      g.fillStyle = `rgba(61,220,255,${0.05 + 0.06 * Math.sin(st.t * 1.4 + i)})`;
      g.fillRect(x, y, 3, 1.6);
    }
    // route lines between continent nodes
    g.strokeStyle = "rgba(255,209,102,0.5)"; g.lineWidth = 2; g.setLineDash([5, 7]);
    g.lineDashOffset = -st.t * 26;
    g.beginPath();
    for (let i = 0; i < ROUTE.length; i++) {
      const b = BLOBS[ROUTE[i]];
      if (i === 0) g.moveTo(b.node[0], b.node[1]);
      else g.lineTo(b.node[0], b.node[1]);
    }
    g.stroke(); g.setLineDash([]);
    // blobs
    BLOBS.forEach((b, bi) => {
      g.fillStyle = "rgba(90,160,120,0.9)";
      g.strokeStyle = "rgba(160,220,180,0.5)"; g.lineWidth = 2;
      g.beginPath();
      b.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath(); g.fill(); g.stroke();
    });
    // visited → next node pulse
    let visitCount = 0;
    for (let i = 0; i <= st.idx; i++) if (tour[i] && tour[i].kind === "country") visitCount++;
    ROUTE.forEach((bi, ci) => {
      const b = BLOBS[bi];
      const done = ci < visitCount;
      const cur = ci === visitCount;
      g.beginPath(); g.arc(b.node[0], b.node[1], done ? 8 : 5, 0, Math.PI * 2);
      g.fillStyle = done ? PAL.gold : cur ? "#ffffff" : "rgba(255,255,255,0.35)";
      g.fill();
      if (cur) {
        const pr = 10 + 5 * (0.5 + 0.5 * Math.sin(st.t * 4));
        g.strokeStyle = PAL.teal; g.lineWidth = 2;
        g.beginPath(); g.arc(b.node[0], b.node[1], pr, 0, Math.PI * 2); g.stroke();
      }
      drawText(g, b.n, b.node[0], b.node[1] + (bi === 1 || bi === 5 ? 26 : -20), { size: 11, color: done ? PAL.gold : "#9aa6c4" });
    });
    // little boat sailing the next leg
    if (visitCount < ROUTE.length) {
      const a = BLOBS[ROUTE[Math.max(0, visitCount - 1)]].node;
      const b = BLOBS[ROUTE[visitCount]].node;
      const k = (Math.sin(st.t * 0.5) + 1) / 2;
      const bx = lerp(a[0], b[0], k), by = lerp(a[1], b[1], k) + 14;
      blitC(g, bake("boat", 120, 70, paintBoat), bx, by, 34);
    }
    const nx = tour[Math.min(st.idx + 1, tour.length - 1)] || tour[0];
    drawText(g, "MIRAY'S WORLD TOUR", W / 2, 60, { size: 30, color: PAL.white, weight: "bold", shadow: "rgba(0,0,0,.5)" });
    drawText(g, (nx.kind === "country" ? "NEXT: " + nx.place + " — " + nx.continent : "CROSSING THE SEA TO " + nx.to.toUpperCase() + " — AS A " + (nx.creature || "").toUpperCase()),
      W / 2, H - 60, { size: 17, color: PAL.gold });
    drawText(g, "press any key to continue ▶", W / 2, H - 34, { size: 12, color: "#8a94c8", alpha: 0.5 + 0.5 * Math.sin(st.t * 4) });
  }

  // ---- finale ----------------------------------------------------------------------------------
  function drawFinale(g) {
    drawMap(g);
    g.fillStyle = "rgba(6,10,24,0.55)"; g.fillRect(0, 0, W, H);
    drawText(g, "TOUR COMPLETE!", W / 2, 200, { size: 54, color: PAL.gold, weight: "bold", shadow: "rgba(0,0,0,.6)" });
    drawText(g, "6 passport stamps · 5 ocean crossings — plankton to orca", W / 2, 252, { size: 19, color: PAL.white });
    drawText(g, "Bon voyage, Miray — thanks for playing!", W / 2, 290, { size: 16, color: "#9adfff" });
    const medals = ["★"];
    drawText(g, medals[0], W / 2, 350, { size: 46, color: PAL.gold, shadow: "rgba(255,209,102,.8)" });
  }

  // ======================================================================================
  // COUNTRY SCENE
  // ======================================================================================
  function drawCountry(g) {
    const s = st.s, def = st.def;
    const cam = camX();
    // sky
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, def.sky[0]); grd.addColorStop(0.55, def.sky[1]); grd.addColorStop(1, def.sky[2]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    drawSceneBackdrop(g, def, cam);
    // mid parallax + ground
    drawSceneMid(g, def, cam);
    // ground band
    const gy = s.groundY;
    const gg = g.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, def.ground[0]); gg.addColorStop(1, def.ground[1]);
    g.fillStyle = gg; g.fillRect(0, gy, W, H - gy);
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, gy, W, 4);
    drawGroundDeco(g, def, cam, gy);
    if (def.item && def.item.bands) drawShallows(g, def, cam, gy);

    // items
    for (const it of s.items) drawItem(g, def, it, cam, s);
    // hazards
    for (const h of s.hazards) drawHazard(g, h, cam);
    // landmark
    drawLandmark(g, def, s.gateX - cam, s);
    // item beacons — topmost so nothing occludes them
    drawItemBeacons(g, def, cam, s);
    // player
    drawTrav(g, s.px - cam, def.item && def.item.bands ? s.diveY : gy);
    // interact hint
    if (s.nearItem && !s.nearItem.taken && def.item.interact !== "touch") {
      const hy = (def.item.bands && s.nearItem.inWater ? 506 : gy - 74) - 8;
      drawText(g, "▲ SPACE", s.nearItem.x - cam, hy - 6 * Math.abs(Math.sin(st.t * 3)), { size: 13, color: PAL.white, shadow: "rgba(0,0,0,.6)" });
    }
    if (s.gateHint)
      drawText(g, "SPACE — " + (def.landmarkLabel || ""), s.px - cam, gy - 96, { size: 14, color: PAL.white, shadow: "rgba(0,0,0,.6)" });
  }

  function drawTrav(g, x, feetY) {
    const s = st.s;
    const moving = s ? !!s._moving : false;
    const frame = moving ? ((s.walkT | 0) % 2 ? 1 : 2) : 0;
    const c = bake("trav" + frame, 30, 44, (gg) => paintTrav(gg, frame));
    const blink = st.invuln > 0 && (st.t * 12 | 0) % 2 === 0;
    blitC(g, c, x, feetY - 22, 44, { flip: st.s.dir < 0 ? 1 : 0, alpha: blink ? 0.4 : 1 });
    if (st.invuln > 0 && !blink) {
      g.strokeStyle = "rgba(255,138,126,0.7)"; g.lineWidth = 2;
      g.beginPath(); g.arc(x, feetY - 24, 28, 0, Math.PI * 2); g.stroke();
    }
  }

  // per-theme scene layers ------------------------------------------------------------------
  function drawSceneBackdrop(g, def, cam) {
    const id = def.id;
    if (id === "canada") {
      // fading stars + aurora
      for (let i = 0; i < 40; i++) {
        const x = hash(i * 7) * W, y = hash(i * 7 + 1) * 220;
        g.fillStyle = `rgba(255,255,255,${0.4 * (1 - hash(i) * 0.7)})`;
        g.fillRect(x, y, 2, 2);
      }
      for (let k = 0; k < 2; k++) {
        g.fillStyle = k ? "rgba(61,220,200,0.12)" : "rgba(120,255,160,0.10)";
        g.beginPath();
        g.moveTo(0, 60 + k * 46);
        for (let x = 0; x <= W; x += 24)
          g.lineTo(x, 60 + k * 46 + Math.sin(x * 0.012 + st.t * (0.5 + k * 0.3) + k * 2) * 26);
        g.lineTo(W, 0); g.lineTo(0, 0); g.closePath(); g.fill();
      }
      // sun low
      const sg = g.createRadialGradient(W * 0.24, 200, 8, W * 0.24, 200, 110);
      sg.addColorStop(0, "rgba(255,220,160,0.9)"); sg.addColorStop(1, "rgba(255,220,160,0)");
      g.fillStyle = sg; g.fillRect(W * 0.24 - 120, 80, 240, 240);
      // far pines
      drawPineRow(g, cam * 0.22, 356, "#24473a", 60, 90);
    } else if (id === "brazil") {
      const sg = g.createRadialGradient(W * 0.7, 130, 12, W * 0.7, 130, 130);
      sg.addColorStop(0, "rgba(255,240,190,0.95)"); sg.addColorStop(1, "rgba(255,240,190,0)");
      g.fillStyle = sg; g.fillRect(W * 0.7 - 140, -10, 280, 280);
      drawHillBand(g, cam * 0.2, 330, 46, def.hills[0]);
      drawTreeline(g, cam * 0.34, 368, "#2f7a4f");
    } else if (id === "egypt") {
      const sg = g.createRadialGradient(W * 0.62, 140, 14, W * 0.62, 140, 150);
      sg.addColorStop(0, "rgba(255,244,200,0.95)"); sg.addColorStop(1, "rgba(255,244,200,0)");
      g.fillStyle = sg; g.fillRect(W * 0.62 - 160, -20, 320, 320);
      // pyramids far
      const pxs = [[240, 150, 230], [560, 110, 300], [880, 170, 200]];
      for (const [x0, hgt, wd] of pxs) {
        const x = ((x0 - cam * 0.18) % (W + 400) + W + 400) % (W + 400) - 200;
        g.fillStyle = "#d9a45e";
        g.beginPath(); g.moveTo(x, 380); g.lineTo(x + wd / 2, 380 - hgt); g.lineTo(x + wd, 380); g.closePath(); g.fill();
        g.fillStyle = "#c08d4a";
        g.beginPath(); g.moveTo(x + wd / 2, 380 - hgt); g.lineTo(x + wd, 380); g.lineTo(x + wd / 2 + 30, 380); g.closePath(); g.fill();
      }
    } else if (id === "turkiye") {
      // dusk domes + minarets skyline + sea sparkle strip
      g.fillStyle = "rgba(60,40,90,0.55)";
      for (let i = 0; i < 5; i++) {
        const x = ((i * 260 - cam * 0.2) % (W + 300) + W + 300) % (W + 300) - 150;
        g.beginPath(); g.arc(x + 60, 352, 46, Math.PI, 0); g.fill();
        g.fillRect(x + 14, 352, 92, 30);
        g.fillRect(x + 56, 262, 7, 44);
        g.beginPath(); g.arc(x + 59.5, 262, 5, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = "rgba(61,220,255,0.18)"; g.fillRect(0, 384, W, 26);
      for (let i = 0; i < 30; i++) {
        const x = hash(i * 11) * W, y = 386 + hash(i * 13) * 22;
        g.fillStyle = `rgba(255,255,255,${0.2 + 0.2 * Math.sin(st.t * 2 + i)})`;
        g.fillRect(x, y, 8, 1.4);
      }
    } else if (id === "japan") {
      // Fuji
      const fx = W * 0.68 - cam * 0.14;
      g.fillStyle = "#7d94b8";
      g.beginPath(); g.moveTo(fx - 190, 380); g.lineTo(fx, 218); g.lineTo(fx + 190, 380); g.closePath(); g.fill();
      g.fillStyle = "#f2f4f8";
      g.beginPath(); g.moveTo(fx - 52, 258); g.lineTo(fx, 218); g.lineTo(fx + 52, 258);
      g.lineTo(fx + 34, 252); g.lineTo(fx + 16, 260); g.lineTo(fx - 4, 250); g.lineTo(fx - 22, 260); g.closePath(); g.fill();
      drawCloudBand(g, cam * 0.1, 150);
    } else if (id === "australia") {
      // sea horizon + surf line
      g.fillStyle = "#2f9ec4"; g.fillRect(0, 356, W, 60);
      g.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 8; i++) {
        const x = ((i * 150 - cam * 0.3 - st.t * 30) % (W + 160) + W + 160) % (W + 160) - 80;
        g.fillRect(x, 360 + hash(i) * 40, 60, 3);
      }
      g.fillStyle = "rgba(61,220,255,0.25)"; g.fillRect(0, 412, W, 8);
    }
  }

  function drawSceneMid(g, def, cam) {
    const id = def.id;
    if (id === "canada") {
      drawMapleRow(g, cam, 9);
      drawPineRow(g, cam * 0.55, 408, "#2e5b46", 40, 66);
    } else if (id === "brazil") {
      drawCaneField(g, cam);
    } else if (id === "egypt") {
      drawPalmRow(g, cam, 7);
      drawDuneCurve(g, cam * 0.6, 420, "rgba(192,141,74,0.5)");
    } else if (id === "turkiye") {
      drawStallRow(g, cam);
    } else if (id === "japan") {
      drawCherryRow(g, cam, 8);
      drawStonePath(g, cam);
    } else if (id === "australia") {
      drawEucalyptRow(g, cam, 6);
    }
  }

  function drawGroundDeco(g, def, cam, gy) {
    const id = def.id;
    const cols = { canada: "#ffffff", brazil: "#b8935e", egypt: "#e8cf96", turkiye: "#b89a72", japan: "#c8b8a8", australia: "#e8d8a8" };
    for (let i = 0; i < 46; i++) {
      const wx = (i * 97 + hash(i * 3) * 60);
      const x = wx - cam;
      if (x < -20 || x > W + 20) continue;
      const y = gy + 8 + hash(i * 5) * 52;
      if (id === "canada") { g.fillStyle = cols[id]; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(x, y, 9 + hash(i) * 12, 4, 0, 0, Math.PI * 2); g.fill(); }
      else if (id === "japan") { g.fillStyle = cols[id]; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(x, y, 10, 5, 0, 0, Math.PI * 2); g.fill(); }
      else { g.fillStyle = cols[id]; g.globalAlpha = 0.4; g.fillRect(x, y, 4 + hash(i) * 6, 2.4); }
      g.globalAlpha = 1;
    }
  }

  function drawShallows(g, def, cam, gy) {
    g.fillStyle = "rgba(47,158,196,0.55)";
    g.fillRect(0, 492, W, H - 492);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 9; i++) {
      const x = ((i * 130 - cam - st.t * 24) % (W + 140) + W + 140) % (W + 140) - 70;
      g.fillRect(x, 496 + Math.sin(st.t * 2 + i) * 3, 44, 2.4);
    }
  }

  // scenery rows (world-anchored, repeat)
  function drawPineRow(g, off, baseY, col, h0, h1) {
    for (let i = -1; i < 14; i++) {
      const x = ((i * 130 - off) % (W + 260) + W + 260) % (W + 260) - 130;
      const h = h0 + hash(i * 3 + 1) * (h1 - h0);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x - h * 0.3, baseY); g.lineTo(x, baseY - h); g.lineTo(x + h * 0.3, baseY);
      g.closePath(); g.fill();
      g.fillRect(x - 3, baseY - 2, 6, 6);
    }
  }
  function drawMapleRow(g, cam, n) {
    for (let i = 0; i < n; i++) {
      const wx = 160 + i * 300 + hash(i * 9) * 80;
      const x = wx - cam;
      if (x < -80 || x > W + 80) continue;
      const baseY = 466;
      g.fillStyle = PAL.trunk; g.fillRect(x - 6, baseY - 78, 12, 78);
      g.fillStyle = PAL.leafR;
      g.beginPath(); g.arc(x - 22, baseY - 92, 26, 0, Math.PI * 2); g.arc(x + 20, baseY - 96, 24, 0, Math.PI * 2); g.arc(x, baseY - 112, 28, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#e8763a"; g.beginPath(); g.arc(x, baseY - 100, 20, 0, Math.PI * 2); g.fill();
    }
  }
  function drawHillBand(g, off, baseY, amp, col) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) {
      const u = (x + off) * 0.008;
      g.lineTo(x, baseY - (Math.sin(u) * 0.6 + Math.sin(u * 2.7) * 0.4) * amp);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  function drawTreeline(g, off, baseY, col) {
    for (let i = -1; i < 16; i++) {
      const x = ((i * 90 - off) % (W + 180) + W + 180) % (W + 180) - 90;
      const r = 22 + hash(i * 5) * 16;
      g.fillStyle = col;
      g.beginPath(); g.arc(x, baseY, r, 0, Math.PI * 2); g.fill();
      g.fillRect(x - 4, baseY, 8, 26);
    }
  }
  function drawCaneField(g, cam) {
    for (let i = 0; i < 30; i++) {
      const wx = i * 110 + hash(i * 7) * 40;
      const x = wx - cam * 0.85;
      if (x < -30 || x > W + 30) continue;
      const h = 60 + hash(i) * 40;
      g.strokeStyle = "rgba(143,174,78,0.8)"; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x, 466); g.quadraticCurveTo(x + 6, 466 - h * 0.6, x - 2, 466 - h); g.stroke();
    }
  }
  function drawPalmRow(g, cam, n) {
    for (let i = 0; i < n; i++) {
      const wx = 220 + i * 380 + hash(i * 13) * 90;
      const x = wx - cam;
      if (x < -80 || x > W + 80) continue;
      g.strokeStyle = PAL.trunk; g.lineWidth = 8;
      g.beginPath(); g.moveTo(x, 468); g.quadraticCurveTo(x + 8, 400, x + 2, 356); g.stroke();
      g.fillStyle = "#4f8f4a";
      for (let k = 0; k < 5; k++) {
        const a = -0.4 - k * 0.55;
        g.beginPath(); g.ellipse(x + 2 + Math.cos(a) * 30, 352 + Math.sin(a) * 16, 30, 8, a, 0, Math.PI * 2); g.fill();
      }
    }
  }
  function drawDuneCurve(g, off, baseY, col) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 24) g.lineTo(x, baseY - Math.sin((x + off) * 0.01) * 16);
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  function drawStallRow(g, cam) {
    for (let i = 0; i < 6; i++) {
      const wx = 240 + i * 430;
      const x = wx - cam;
      if (x < -140 || x > W + 140) continue;
      // bazaar stall: canopy + rug
      g.fillStyle = PAL.wood; g.fillRect(x - 44, 396, 88, 70);
      g.fillStyle = i % 2 ? "#c23b2e" : "#3d6fa8";
      for (let k = 0; k < 5; k++) g.fillRect(x - 48 + k * 20, 384, 20, 16);
      g.fillStyle = "#8a5f9e"; g.fillRect(x - 36, 420, 30, 22);
      g.fillStyle = "#e8c46a"; g.fillRect(x + 6, 424, 24, 14);
      g.fillStyle = "rgba(255,209,102,0.8)"; g.beginPath(); g.arc(x, 378, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = PAL.woodDk; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, 383); g.lineTo(x, 396); g.stroke();
    }
  }
  function drawCherryRow(g, cam, n) {
    for (let i = 0; i < n; i++) {
      const wx = 140 + i * 350 + hash(i * 17) * 70;
      const x = wx - cam;
      if (x < -80 || x > W + 80) continue;
      g.fillStyle = "#6b4a2f"; g.fillRect(x - 5, 388, 10, 80);
      g.fillStyle = "#ffb8c8";
      g.beginPath(); g.arc(x - 20, 380, 24, 0, Math.PI * 2); g.arc(x + 18, 384, 22, 0, Math.PI * 2); g.arc(x, 362, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ff9ab8"; g.beginPath(); g.arc(x, 376, 18, 0, Math.PI * 2); g.fill();
      // petals
      for (let k = 0; k < 3; k++) {
        const px = x - 30 + ((hash(i * 3 + k) * 60 + st.t * 12) % 60);
        const py = 380 + ((hash(i * 5 + k) * 40 + st.t * 20) % 60);
        g.fillStyle = "rgba(255,184,200,0.8)"; g.fillRect(px, py, 3, 3);
      }
    }
  }
  function drawStonePath(g, cam) {
    for (let i = 0; i < 20; i++) {
      const x = i * 140 - (cam % 140);
      g.fillStyle = "rgba(160,144,128,0.7)";
      g.beginPath(); g.ellipse(x, 500, 26, 8, 0, 0, Math.PI * 2); g.fill();
    }
  }
  function drawEucalyptRow(g, cam, n) {
    for (let i = 0; i < n; i++) {
      const wx = 200 + i * 430 + hash(i * 23) * 80;
      const x = wx - cam;
      if (x < -80 || x > W + 80) continue;
      g.fillStyle = "#9aa88a"; g.fillRect(x - 5, 386, 10, 84);
      g.fillStyle = "#7fa08a";
      g.beginPath(); g.arc(x - 16, 380, 20, 0, Math.PI * 2); g.arc(x + 16, 376, 18, 0, Math.PI * 2); g.arc(x, 362, 22, 0, Math.PI * 2); g.fill();
    }
  }
  function drawCloudBand(g, off, baseY) {
    for (let i = 0; i < 5; i++) {
      const x = ((i * 220 - off) % (W + 240) + W + 240) % (W + 240) - 120;
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.beginPath(); g.ellipse(x, baseY, 44, 12, 0, 0, Math.PI * 2); g.ellipse(x + 30, baseY + 4, 30, 9, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // items -------------------------------------------------------------------------------------
  function drawItem(g, def, it, cam, s) {
    const x = it.x - cam;
    if (x < -60 || x > W + 60) return;
    const kind = def.item.kind;
    if (kind === "pail") {
      if (it.taken && it.popT > 0.5) return;
      blitC(g, bake("pail" + (it.taken ? 1 : 0), 20, 22, (gg) => paintPail(gg, it.taken)), x, s.groundY - 11, 22);
      if (!it.taken) drawMapleTrunkHint(g, x, s.groundY);
    } else if (kind === "cane") {
      if (it.taken) return;
      blitC(g, bake("cane", 18, 56, paintCane), x, s.groundY - 30, 60);
    } else if (kind === "scarab") {
      if (it.taken) {
        if (it.popT < 0.8) blitC(g, bake("scarab", 18, 16, paintScarab), x, s.groundY - 14 - it.popT * 26, 16);
        return;
      }
      blitC(g, bake("mound", 28, 16, paintMound), x, s.groundY - 8, 18);
      const sh = 0.4 + 0.35 * Math.sin(st.t * 3 + it.shine);
      g.fillStyle = `rgba(255,224,130,${sh})`;
      g.beginPath(); g.ellipse(x, s.groundY - 12, 16, 4, 0, 0, Math.PI * 2); g.fill();
    } else if (kind === "tile") {
      if (it.taken) return;
      // hanging at a stall post
      blitC(g, bake("tile" + it.i, 22, 22, (gg) => paintTile(gg, it.i)), x, s.groundY - 46 + Math.sin(st.t * 2 + it.i) * 3, 24);
      g.fillStyle = PAL.wood; g.fillRect(x - 3, s.groundY - 34, 6, 34);
    } else if (kind === "koi") {
      // pond at the path edge
      const py = s.groundY - 4;
      g.fillStyle = "rgba(47,130,180,0.8)";
      g.beginPath(); g.ellipse(x, py + 26, 46, 20, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.4)"; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, py + 26, 46, 20, 0, 0, Math.PI * 2); g.stroke();
      const ph = koiPhase(s, it);
      if (!it.taken) {
        if (ph < 0.85) {
          const k = ph / 0.85;
          const ring = 8 + 26 * k;
          g.strokeStyle = `rgba(255,138,194,${0.9 - k * 0.6})`; g.lineWidth = 2.4;
          g.beginPath(); g.arc(x, py + 22, ring, 0, Math.PI * 2); g.stroke();
          // koi flash
          g.fillStyle = "#ff8a5e"; g.beginPath(); g.ellipse(x, py + 22, 12 * (1 - k * 0.4), 5, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#f2f4f6"; g.beginPath(); g.ellipse(x - 4, py + 21, 4, 2.4, 0, 0, Math.PI * 2); g.fill();
        }
      } else if (it.popT < 0.6) {
        g.fillStyle = "rgba(255,209,102,0.7)"; g.beginPath(); g.arc(x, py + 22, 8 + it.popT * 30, 0, Math.PI * 2); g.stroke();
      }
    } else if (kind === "shell") {
      if (it.taken) return;
      const y = it.inWater ? 506 + Math.sin(st.t * 2 + it.i) * 4 : s.groundY - 8;
      blitC(g, bake("shell", 20, 16, paintShell), x, y, 16);
      if (it.inWater) {
        g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 1.6;
        g.beginPath(); g.ellipse(x, y - 10, 12, 3, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    // findability beacon moved to a topmost pass (drawItemBeacons) — the landmark
    // draws after items and used to hide beacons near the gate
  }
  function drawMapleTrunkHint(g, x, gy) {
    // small tree next to pail
    g.fillStyle = PAL.trunk; g.fillRect(x + 14, gy - 66, 9, 66);
    g.fillStyle = PAL.leafR;
    g.beginPath(); g.arc(x + 18, gy - 78, 22, 0, Math.PI * 2); g.arc(x + 2, gy - 66, 16, 0, Math.PI * 2); g.fill();
  }

  function drawItemBeacons(g, def, cam, s) {
    if (def.item && def.item.interact === "feed") return; // koi ponds flash instead
    const tops = { pail: 36, cane: 72, scarab: 30, tile: 74, shell: 34 };
    for (const it of s.items) {
      if (it.taken) continue;
      const x = it.x - cam;
      if (x < -20 || x > W + 20) continue;
      const by = (it.inWater ? 484 : s.groundY - (tops[def.item.kind] || 40)) + Math.sin(st.t * 3 + it.i) * 4;
      const a = 0.72 + 0.28 * Math.sin(st.t * 4 + it.i * 1.7);
      g.fillStyle = `rgba(26,16,6,${0.55 * a})`;
      g.beginPath(); g.moveTo(x + 1.5, by + 10.5); g.lineTo(x - 5.5, by + 0.5); g.lineTo(x + 8.5, by + 0.5); g.closePath(); g.fill();
      g.fillStyle = `rgba(255,209,102,${a})`;
      g.beginPath(); g.moveTo(x, by + 9); g.lineTo(x - 7, by - 1); g.lineTo(x + 7, by - 1); g.closePath(); g.fill();
    }
  }

  // hazards ------------------------------------------------------------------------------------
  function drawHazard(g, h, cam) {
    const x = h.x - cam;
    if (x < -120 || x > W + 120) return;
    if (h.kind === "tractor") {
      blitC(g, bake("tractor" + h.f, 76, 48, (gg) => paintTractor(gg, h.f)), x, 470 - 26, 48, { flip: h.vx < 0 ? 1 : 0 });
    } else if (h.kind === "shopper") {
      blitC(g, bake("shopper" + h.f, 22, 34, (gg) => paintShopper(gg, h.f)), x, 470 - 17, 40, { flip: h.vx < 0 ? 1 : 0 });
    } else if (h.kind === "seagull") {
      blitC(g, bake("gull" + h.f, 34, 20, (gg) => paintSeagull(gg, h.f)), x, h.y, 22, { flip: h.vx < 0 ? 1 : 0 });
    }
  }

  // landmarks -----------------------------------------------------------------------------------
  function drawLandmark(g, def, x, s) {
    if (x < -260 || x > W + 260) return;
    const open = s.gateOpen;
    const gy = 470;
    g.save();
    if (!open) g.globalAlpha = 0.92;
    if (def.landmark === "sugarshack") {
      g.fillStyle = PAL.wood; g.fillRect(x - 90, gy - 130, 180, 130);
      g.fillStyle = PAL.woodHi; g.fillRect(x - 90, gy - 130, 180, 12);
      g.fillStyle = PAL.woodDk; g.fillRect(x - 60, gy - 78, 40, 78);
      g.fillStyle = "#8fd0e8"; g.fillRect(x + 10, gy - 100, 34, 30);
      g.fillStyle = "#5e3d20"; g.fillRect(x + 40, gy - 168, 16, 44); // chimney
      g.fillStyle = "rgba(200,200,210,0.6)";
      g.beginPath(); g.arc(x + 48, gy - 174, 9, 0, Math.PI * 2); g.arc(x + 58, gy - 184, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.woodDk; g.fillRect(x - 110, gy - 148, 220, 18);
      drawText(g, "SUGAR SHACK", x, gy - 139, { size: 13, color: "#ffd9a0" });
    } else if (def.landmark === "mill") {
      g.fillStyle = "#c8b8a0"; g.beginPath();
      g.moveTo(x - 70, gy); g.lineTo(x - 52, gy - 150); g.lineTo(x + 52, gy - 150); g.lineTo(x + 70, gy); g.closePath(); g.fill();
      g.fillStyle = "#b09880"; g.fillRect(x - 70, gy - 30, 140, 30);
      // rotating blades
      g.save(); g.translate(x, gy - 150); g.rotate(st.t * 0.7);
      g.strokeStyle = PAL.woodHi; g.lineWidth = 7;
      for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(62, 0); g.stroke(); }
      g.restore();
      g.fillStyle = PAL.woodDk; g.fillRect(x - 12, gy - 60, 24, 60);
      drawText(g, "SUGAR MILL", x, gy - 172, { size: 13, color: "#ffe9c9" });
    } else if (def.landmark === "sphinx") {
      g.fillStyle = "#d9a45e"; g.fillRect(x - 140, gy - 24, 280, 24);
      g.fillStyle = "#c9904e";                                        // body
      g.fillRect(x - 90, gy - 62, 150, 40);
      g.beginPath(); g.moveTo(x - 90, gy - 62); g.lineTo(x - 104, gy - 22); g.lineTo(x - 76, gy - 22); g.closePath(); g.fill();
      g.fillStyle = "#e0b070";                                        // head
      g.fillRect(x + 44, gy - 96, 42, 56);
      g.fillStyle = "#3f5a80"; g.fillRect(x + 70, gy - 84, 10, 6);    // headdress stripe
      g.fillRect(x + 48, gy - 84, 10, 6);
      g.fillStyle = "#8a6a3a";                                        // paws
      g.fillRect(x + 60, gy - 30, 34, 10); g.fillRect(x + 8, gy - 30, 34, 10);
      drawText(g, "THE SPHINX KEEPS A RIDDLE", x, gy - 112, { size: 13, color: "#fff2cf" });
    } else if (def.landmark === "bazaar") {
      g.fillStyle = "#c8a06a"; g.fillRect(x - 110, gy - 140, 220, 140);
      g.fillStyle = "#b08a54"; g.beginPath(); g.arc(x, gy - 140, 66, Math.PI, 0); g.fill();
      g.fillStyle = "#3d2f4a"; g.beginPath(); g.arc(x, gy, 52, Math.PI, 0); g.fill();
      g.fillStyle = "#ffd166";
      for (let k = -1; k <= 1; k++) {
        g.beginPath(); g.arc(x + k * 70, gy - 108, 5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(255,209,102,0.7)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + k * 70, gy - 140); g.lineTo(x + k * 70, gy - 112); g.stroke();
      }
      g.fillStyle = "#7a5fae"; g.fillRect(x - 96, gy - 60, 24, 60); g.fillRect(x + 72, gy - 60, 24, 60);
      drawText(g, "GRAND BAZAAR", x, gy - 158, { size: 13, color: "#ffe9c9" });
    } else if (def.landmark === "torii") {
      g.fillStyle = "#c23b2e";
      g.fillRect(x - 84, gy - 150, 16, 150); g.fillRect(x + 68, gy - 150, 16, 150);
      g.fillRect(x - 100, gy - 156, 200, 14);
      g.fillStyle = "#a02e22"; g.fillRect(x - 92, gy - 122, 184, 10);
      g.fillStyle = "#ffd166";                                        // lanterns
      for (const lx of [x - 50, x + 50]) {
        g.fillRect(lx - 7, gy - 108, 14, 18);
        g.strokeStyle = "#5e3d20"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(lx, gy - 116); g.lineTo(lx, gy - 108); g.stroke();
      }
      g.fillStyle = "rgba(47,130,180,0.7)"; g.fillRect(x - 130, gy - 16, 260, 16);
      drawText(g, "TORII GATE", x, gy - 176, { size: 14, color: "#ffe9c9" });
    } else if (def.landmark === "reefstation") {
      g.fillStyle = PAL.wood;
      g.fillRect(x - 54, gy - 34, 10, 34); g.fillRect(x + 44, gy - 34, 10, 34);
      g.fillRect(x - 64, gy - 96, 128, 62);
      g.fillStyle = PAL.woodHi; g.fillRect(x - 64, gy - 96, 128, 10);
      g.fillStyle = "#8fd0e8"; g.fillRect(x - 40, gy - 80, 28, 22); g.fillRect(x + 12, gy - 80, 28, 22);
      g.strokeStyle = "#e8eef4"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 60, gy - 96); g.lineTo(x + 60, gy - 140); g.stroke();
      g.fillStyle = PAL.teal; g.beginPath();
      g.moveTo(x + 60, gy - 140); g.lineTo(x + 88, gy - 132); g.lineTo(x + 60, gy - 122); g.closePath(); g.fill();
      drawText(g, "REEF STATION", x, gy - 112, { size: 13, color: "#e8f7ff" });
    }
    g.restore();
    if (open && !s.quizDone) {
      const bob = 6 * Math.sin(st.t * 3);
      drawText(g, "▶", x, gy - 196 + bob, { size: 30, color: PAL.gold, shadow: "rgba(0,0,0,.5)" });
    }
  }

  // ======================================================================================
  // OCEAN SCENE
  // ======================================================================================
  function drawOcean(g) {
    const s = st.s, def = st.def;
    const surfY = OW.surfY || 84;
    // water gradient
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, def.sky[0]); grd.addColorStop(0.5, def.sky[1]); grd.addColorStop(1, def.sky[2]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // sun shafts
    for (let i = 0; i < 4; i++) {
      const x = ((i * 260 - s.t * 12) % (W + 300) + W + 300) % (W + 300) - 150;
      g.fillStyle = "rgba(180,240,255,0.05)";
      g.beginPath();
      g.moveTo(x, surfY); g.lineTo(x + 60, surfY); g.lineTo(x + 130, H); g.lineTo(x + 30, H);
      g.closePath(); g.fill();
    }
    // plankton speckle ambience
    for (let i = 0; i < 26; i++) {
      const x = (hash(i * 7) * W + s.t * 14) % W;
      const y = surfY + 40 + hash(i * 9) * (H - surfY - 60) + Math.sin(s.t + i) * 8;
      g.fillStyle = `rgba(190,240,255,${0.14 + 0.1 * Math.sin(s.t * 2 + i)})`;
      g.fillRect(x, y, 2.4, 2.4);
    }
    // rising bubble columns
    for (let i = 0; i < 5; i++) {
      const bx = 60 + i * 210;
      for (let k = 0; k < 4; k++) {
        const by = H - ((s.t * (26 + k * 9) + i * 130 + k * 60) % (H - surfY));
        g.strokeStyle = "rgba(200,240,255,0.22)"; g.lineWidth = 1.4;
        g.beginPath(); g.arc(bx + Math.sin(by * 0.03 + i) * 8, by, 2.4 + k * 0.7, 0, Math.PI * 2); g.stroke();
      }
    }
    // net patches (behind actors)
    for (const e of s.threats) if (e.kind === "net") blitC(g, bake("net", 110, 80, paintNet), e.x, e.y, e.sz, { alpha: 0.85 });
    // foods — dark halo + 1.5× render so morsels read against open water
    for (const f of s.foods) {
      const c = bake("food-" + f.kind, f.kind === "algae" ? 10 : f.kind === "fry" ? 12 : f.kind === "sardine" ? 18 : f.kind === "reeffish" ? 22 : 28,
        f.kind === "algae" ? 10 : f.kind === "fry" ? 6 : f.kind === "sardine" ? 8 : f.kind === "reeffish" ? 10 : 12,
        FOOD_PAINT[f.kind] || paintFry);
      const fh = f.sz * 1.5;
      g.fillStyle = "rgba(6,20,36,0.30)";
      g.beginPath(); g.ellipse(f.x + 3, f.y + 3, fh * 0.7, fh * 0.5, 0, 0, Math.PI * 2); g.fill();
      blitC(g, c, f.x, f.y, fh, { flip: f.vx > 0 ? 1 : 0 });
    }
    // squid strike
    if (s.squid) {
      const q = s.squid;
      if (q.tel > 0) {
        const a = 0.3 + 0.4 * Math.abs(Math.sin(q.tel * 12));
        g.fillStyle = `rgba(160,106,194,${a})`;
        g.beginPath(); g.ellipse(q.x, H - 12, 40, 16, 0, 0, Math.PI * 2); g.fill();
        drawText(g, "!", q.x, H - 40, { size: 22, color: "#e8d0f2" });
      } else {
        const rise = q.up * (H - surfY - 40);
        blitC(g, bake("squid", 34, 120, paintSquid), q.x, H - rise / 2, rise, { rot: Math.sin(st.t * 6) * 0.06 });
      }
    }
    // threats
    for (const e of s.threats) {
      if (e.kind === "net") continue;
      const c = bake("threat-" + e.kind + e.f, THREAT_SIZE[e.kind].w, THREAT_SIZE[e.kind].h, (gg) => THREAT_PAINT[e.kind](gg, e.f));
      blitC(g, c, e.x, e.y, e.sz, { flip: e.x < s.px ? 1 : 0, alpha: e.cool > 1 ? 0.8 : 1 });
    }
    // boat on surface (when grown)
    if (s.surfaced) {
      const bob = Math.sin(st.t * 1.6) * 4;
      const glow = 0.25 + 0.15 * Math.sin(st.t * 3);
      g.fillStyle = `rgba(255,224,130,${glow})`;
      g.beginPath(); g.ellipse(s.boatX, surfY, 90, 12, 0, 0, Math.PI * 2); g.fill();
      blitC(g, bake("boat", 120, 70, paintBoat), s.boatX, surfY - 26 + bob, 64);
      // prompt BELOW the waterline — it used to collide with the grow bar at the top
      const nearBoat = Math.abs(s.px - s.boatX) < 150;
      drawText(g, nearBoat ? "▲ SWIM UP — BOARD NOW!" : "▲ swim to the boat", s.boatX, surfY + 36 + bob,
        { size: nearBoat ? 15 : 13, color: nearBoat ? PAL.gold : PAL.white, shadow: "rgba(0,0,0,.6)" });
    }
    // surface line + sky sliver
    g.fillStyle = "rgba(220,245,255,0.9)"; g.fillRect(0, surfY - 3, W, 3);
    g.fillStyle = "rgba(140,220,250,0.25)"; g.fillRect(0, surfY, W, 10);
    for (let i = 0; i < 9; i++) {
      const x = ((i * 130 - s.t * 36) % (W + 140) + W + 140) % (W + 140) - 70;
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillRect(x, surfY - 2 + Math.sin(s.t * 2.4 + i) * 2, 40, 2);
    }
    // the creature
    const psz = s.size * s.growScale * (OW.visK || 2.1);
    const ck = CREATURE_KEY[def.creature] || "minnow";
    const fr = (st.t * 5 | 0) % 2;
    const facing = s.pvx > 20 ? 1 : s.pvx < -20 ? 0 : (s._lastFace || 0);
    if (Math.abs(s.pvx) > 20) s._lastFace = facing;
    const c = bake("me-" + ck + fr, CREATURE_SIZE[ck].w, CREATURE_SIZE[ck].h, (gg) => CREATURE_PAINT[ck](gg, fr));
    const blink = st.invuln > 0 && (st.t * 12 | 0) % 2 === 0;
    blitC(g, c, s.px, s.py, psz, { flip: facing, alpha: blink ? 0.4 : 1, rot: clamp(s.pvy / 900, -0.4, 0.4) * (facing ? -1 : 1) });
    // "you are here" ring — the creature must never be mistaken for food
    if (!blink) {
      const rr = psz * 0.72 + 6 + Math.sin(st.t * 3) * 3;
      g.strokeStyle = `rgba(255,255,255,${0.26 + 0.14 * Math.sin(st.t * 3)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(s.px, s.py, rr, 0, Math.PI * 2); g.stroke();
    }
  }

  const FOOD_PAINT = {
    algae: paintAlgae, fry: paintFry, sardine: paintSardine, reeffish: paintReeffish, tunafish: paintTunafish,
  };
  const THREAT_PAINT = { jelly: paintJelly, perch: paintPerch, barracuda: paintBarracuda, bullshark: paintBullshark };
  const THREAT_SIZE = {
    jelly: { w: 26, h: 34 }, perch: { w: 38, h: 16 }, barracuda: { w: 70, h: 16 }, bullshark: { w: 90, h: 30 },
  };
  const CREATURE_PAINT = { plankton: paintPlankton, minnow: paintMinnow, tuna: paintTuna, shark: paintShark, orca: paintOrca };
  const CREATURE_SIZE = {
    plankton: { w: 18, h: 18 }, minnow: { w: 28, h: 14 }, tuna: { w: 44, h: 20 }, shark: { w: 86, h: 30 }, orca: { w: 112, h: 40 },
  };
  const CREATURE_KEY = { plankton: "plankton", minnow: "minnow", tuna: "tuna", shark: "shark", orca: "orca" };

  // ---- debug seam ---------------------------------------------------------------------------
  if (DBG && typeof window !== "undefined") {
    window.__WT = {
      timeScale: 1,
      state: () => ({
        mode: st.mode, idx: st.idx, id: st.def.id, kind: st.def.kind,
        t: +st.t.toFixed(2), stageT: st.s ? +st.s.t.toFixed(2) : 0,
        bubbles: st.bubbles,
        items: st.def.kind === "country" && st.s ? st.s.items.filter((i) => i.taken).length + "/" + st.def.item.n : null,
        gateOpen: st.def.kind === "country" && st.s ? st.s.gateOpen : null,
        px: st.s ? Math.round(st.s.px || 0) : 0, py: st.s && st.def.kind === "ocean" ? Math.round(st.s.py) : null,
        meter: st.s && st.def.kind === "ocean" ? st.s.meter + "/" + st.s.eatN : null,
        surfaced: st.s && st.def.kind === "ocean" ? !!st.s.surfaced : null,
        foods: st.s && st.def.kind === "ocean" ? st.s.foods.length : null,
        threats: st.s && st.def.kind === "ocean" ? st.s.threats.length : null,
        stamps: st.stamps.filter(Boolean).length,
        completed: st.completed,
        stageLog: st.stageLog,
        quiz: st.mode === "quiz" ? { sel: quiz.sel, wrongTries: quiz.wrongTries, locked: quiz.locked } : null,
      }),
    };
  }

  beat("boot", "miray-kavruk-world-tour · stage " + stage0);
  enterStage(stage0, "boot"); // always boot through a stage (st.s must exist before first draw)
  return { update, draw, meta };
}
