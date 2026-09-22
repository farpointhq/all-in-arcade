// MAZE-STUDYHALL genre — old-school Pac-style maze chaser, reimagined as a
// school hallway. Private genre module for "Study Hall Scramble"
// (Kristopher Federico's level) so no parallel booth agent's shared-file edits
// can drift into this level's behavior (precedent: star-racer.js split).
//
// Munch every chalk fact, dodge the staff — Hall Monitor (red, direct), Math
// Teacher (pink, ambush), Librarian (cyan, flanks), Janitor (orange, shy) —
// gold apples grant a RECESS power window where the staff turns pale and can
// be chased for credit. Arcade-canon mechanics: tile-tween movement, buffered
// turns + instant reversal, wrap-around tunnel with slow-down, scatter/chase
// waves with per-ghost AI targets, frightened blinking, eaten eyes fly home to
// the lounge, courage ramp (the hall monitor speeds up when few facts remain).
//
// Art is Route A procedural only (no emoji, no files, no fetches): lockers,
// corkboard frame, chalkboard backing, hand-painted staff + a graduating
// muncher with a mortarboard that stays upright while the body rolls.
//
// Playtest hooks (L04 convention): `?debugMaze=1` shows the state readout;
// `?ap=1` boots an ETA-routed autopilot and exposes window.__TEST_API__ so the
// harness can drive full start→finish runs and collect timing evidence.

import { W, H, clamp, drawText, hash, seasonTint, blit } from "../core.js";

const PI2 = Math.PI * 2;
// classic tie-break canon: up > left > down > right (identity objects matter)
const U = { x: 0, y: -1 }, L = { x: -1, y: 0 }, D = { x: 0, y: 1 }, R = { x: 1, y: 0 };
const TIE = [U, L, D, R];
const opp = (d) => (d === U ? D : d === D ? U : d === L ? R : d === R ? L : null);

const INK = "#241f3d";
const GOLD = "#ffd23f";
const CREAM = "#fdf2d0";

// tuning defaults (level.data.speeds can override per level)
const DEF = {
  player: 140, ghost: 112, fright: 66, eyes: 205,
  frightSeconds: 7.5, tunnelSlow: 0.55,
  release: [0, 4.5, 9.5, 15],       // staff leave the lounge, staggered
  progressRelease: [124, 108, 86],  // …or when you've munched this deep (pink/cyan/orange)
  elroy: [[24, 1.05], [10, 1.10]],
  mercy: 0.92,
};

// ---- helpers -------------------------------------------------------------------
function rr(g, x, y, w, h, rad) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, rad); return; }
  g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
  g.lineTo(x + rad, y + h); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
}
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// ---- Route A actor art ----------------------------------------------------------
function paintGhost(g, w, h, spec, frame, fear) {
  const cx = w / 2, R = w * 0.33;
  const body = fear ? (spec.body || "#a8ecf2") : spec.body;
  g.lineJoin = "round"; g.lineCap = "round";
  // dome + wavy skirt (2-frame wobble)
  g.fillStyle = body; g.strokeStyle = INK; g.lineWidth = 3.2;
  g.beginPath();
  g.moveTo(cx - R, h - 7);
  g.lineTo(cx - R, h * 0.55);
  g.arc(cx, h * 0.55, R, Math.PI, 0);
  g.lineTo(cx + R, h - 7);
  const n = 5, wob = frame ? 3 : -3;
  for (let i = 0; i < n; i++) {
    const fr = cx + R - (2 * R * (i + 0.5)) / n;
    g.lineTo(fr, h - 7 + (i % 2 ? wob : -wob) * 0.9);
    g.lineTo(fr - R / n, h - 7);
  }
  g.closePath(); g.fill(); g.stroke();
  if (fear) {
    g.fillStyle = "#f6fffe";
    g.beginPath(); g.ellipse(cx - 7, h * 0.44, 4.6, 5.4, 0, 0, PI2); g.fill();
    g.beginPath(); g.ellipse(cx + 7, h * 0.44, 4.6, 5.4, 0, 0, PI2); g.fill();
    g.strokeStyle = "#2b5a66"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 9, h * 0.64);
    for (let i = 1; i <= 4; i++) g.lineTo(cx - 9 + i * 4.5, h * 0.64 + (i % 2 ? 2.6 : -2.6));
    g.stroke();
  } else {
    const ey = h * 0.42;
    for (const s of [-1, 1]) {
      g.fillStyle = "#ffffff"; g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath(); g.ellipse(cx + s * 8.2, ey, 6.0, 7.0, 0, 0, PI2); g.fill(); g.stroke();
      g.fillStyle = "#2c2a55";
      g.beginPath(); g.arc(cx + s * 8.2 + spec.look * 2.2, ey + 1.4, 2.9, 0, PI2); g.fill();
    }
    spec.paint(g, cx, h);
  }
}

const PERSONAS = [
  { key: "red", body: "#e6413f", dark: "#8c1f26", look: 1, // Hall Monitor: sash + badge
    paint: (g, cx, h) => {
      g.save();
      g.strokeStyle = "#ffcf3e"; g.lineWidth = 6.5; g.globalAlpha = 0.95;
      g.beginPath(); g.moveTo(cx + 7, h * 0.62); g.lineTo(cx + 16, h - 10); g.stroke();
      g.restore();
      g.fillStyle = "#fff"; g.strokeStyle = INK; g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx - 9, h - 15, 5.4, 0, PI2); g.fill(); g.stroke();
      g.fillStyle = "#e6413f"; g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5, r2 = i % 2 ? 1.3 : 2.8;
        g[i ? "lineTo" : "moveTo"](cx - 9 + Math.cos(a) * r2, h - 15 + Math.sin(a) * r2);
      }
      g.closePath(); g.fill();
    } },
  { key: "pink", body: "#ff9ed8", dark: "#c255a1", look: 1, // Math Teacher: glasses + bun
    paint: (g, cx, h) => {
      g.strokeStyle = INK; g.lineWidth = 2.3;
      g.beginPath(); g.arc(cx - 8.2, h * 0.42, 6.2, 0, PI2); g.stroke();
      g.beginPath(); g.arc(cx + 8.2, h * 0.42, 6.2, 0, PI2); g.stroke();
      g.beginPath(); g.moveTo(cx - 2.4, h * 0.42); g.lineTo(cx + 2.4, h * 0.42); g.stroke();
      g.fillStyle = "#7c4a3a"; g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, h * 0.42 - 15.5, 5.8, 0, PI2); g.fill(); g.stroke();
    } },
  { key: "cyan", body: "#3fc8c4", dark: "#1f7a78", look: -1, // Librarian: ponytail + book
    paint: (g, cx, h) => {
      g.fillStyle = "#a46a3f"; g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath(); g.ellipse(cx + 14, h * 0.30, 5.2, 9.2, 0.5, 0, PI2); g.fill(); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 2.3;
      g.beginPath(); g.arc(cx - 8.2, h * 0.42, 5.2, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
      g.beginPath(); g.arc(cx + 8.2, h * 0.42, 5.2, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
      g.save(); g.translate(cx - 15, h - 19); g.rotate(-0.5);
      g.fillStyle = "#8a5c33"; g.strokeStyle = INK; g.lineWidth = 1.8;
      rr(g, -5, -7, 10, 14, 1.6); g.fill(); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-2, -4); g.lineTo(-2, 4); g.stroke();
      g.restore();
    } },
  { key: "orange", body: "#f5a23f", dark: "#a3621b", look: 1, // Janitor: cap + mop
    paint: (g, cx, h) => {
      g.fillStyle = "#3f608f"; g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - 13, h * 0.32); g.lineTo(cx + 13, h * 0.32);
      g.quadraticCurveTo(cx, h * 0.18, cx - 13, h * 0.32); g.closePath(); g.fill(); g.stroke();
      g.save(); g.translate(cx - 6, h - 22); g.rotate(-1.05);
      g.strokeStyle = "#b98155"; g.lineWidth = 4;
      g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.stroke();
      g.fillStyle = "#cfd6e2"; g.strokeStyle = INK; g.lineWidth = 1.6;
      rr(g, 10, -7, 6, 14, 2); g.fill(); g.stroke();
      g.restore();
    } },
];

const GF = 72;
const GHOST_SPRITES = PERSONAS.map((p) =>
  [0, 1].map((f) => {
    const c = document.createElement("canvas"); c.width = GF; c.height = GF;
    paintGhost(c.getContext("2d"), GF, GF, p, f, false);
    return c;
  }));
const FRIGHT_SPRITE = [0, 1].map((f) => {
  const c = document.createElement("canvas"); c.width = GF; c.height = GF;
  paintGhost(c.getContext("2d"), GF, GF, { body: "#a8ecf2", dark: "", look: 0, paint: () => {} }, f, true);
  return c;
});
const FRIGHT_FLASH = [0, 1].map(() => {
  const c = document.createElement("canvas"); c.width = GF; c.height = GF;
  paintGhost(c.getContext("2d"), GF, GF, { body: "#f2ffff", dark: "", look: 0, paint: () => {} }, 0, true);
  return c;
});

const APPLE = (() => {
  const c = document.createElement("canvas"); c.width = 44; c.height = 44;
  const g = c.getContext("2d"), cx = 22, cy = 25, R = 13;
  g.lineJoin = "round";
  g.fillStyle = "#ff5a4e"; g.strokeStyle = INK; g.lineWidth = 2.6;
  g.beginPath();
  g.arc(cx - 5.5, cy, R * 0.92, Math.PI * 0.6, Math.PI * 1.9);
  g.arc(cx + 5.5, cy, R * 0.92, Math.PI * 1.1, Math.PI * 0.4);
  g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = "#7c4a2a"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx, cy - 11); g.quadraticCurveTo(cx + 2, cy - 17, cx + 5, cy - 19); g.stroke();
  g.fillStyle = "#6cc24a"; g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.ellipse(cx + 10, cy - 16, 7, 3.6, -0.5, 0, PI2); g.fill(); g.stroke();
  g.fillStyle = "rgba(255,255,255,.55)";
  g.beginPath(); g.ellipse(cx - 7, cy - 5, 3.4, 5, -0.6, 0, PI2); g.fill();
  return c;
})();

const NOTEBOOK = (() => {
  const c = document.createElement("canvas"); c.width = 52; c.height = 52;
  const g = c.getContext("2d"), cx = 26, cy = 26;
  g.fillStyle = "#2f4f8a"; g.strokeStyle = INK; g.lineWidth = 2.4;
  rr(g, cx - 15, cy - 11, 30, 22, 3); g.fill(); g.stroke();
  g.fillStyle = "#fdf2d0"; rr(g, cx - 12, cy - 8, 24, 16, 2); g.fill();
  g.fillStyle = "#f5d9a8";
  for (let i = 0; i < 3; i++) g.fillRect(cx - 15 + (4 + i * 3.6), cy - 6.5, 1.6, 13);
  g.fillStyle = "#ffd23f"; g.strokeStyle = "#b8860b"; g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r2 = i % 2 ? 2.8 : 6;
    g[i ? "lineTo" : "moveTo"](cx + 3 + Math.cos(a) * r2, cy + Math.sin(a) * r2);
  }
  g.closePath(); g.fill(); g.stroke();
  return c;
})();

// ---------- the genre ------------------------------------------------------------
export const meta = {
  name: "Maze Muncher",
  controls: "← ↑ → ↓ / WASD steer · munch every fact · gold apples grant RECESS power",
};

export function create(level, api) {
  const data = level.data || {};
  const rows = data.rows;
  const ROWS = rows.length, COLS = rows[0].length;
  const T = 26;
  const BW = COLS * T, BH = ROWS * T;
  const ox = Math.round((W - BW) / 2), oy = Math.round((H - BH) / 2) + 10;
  const st0 = level.style || {};
  const tune = { ...DEF, ...(data.speeds || {}) };

  // ---- grid parse ----
  const wall = [], kind = {};
  let door = null;
  const interior = [];
  for (let r = 0; r < ROWS; r++) {
    wall.push([]);
    for (let c = 0; c < COLS; c++) {
      const ch = rows[r][c] || "#";
      wall[r][c] = ch === "#" || ch === "-";
      kind[c + "," + r] = ch;
      if (ch === "-") door = { c, r };
      if (ch === " ") interior.push({ c, r });
    }
  }
  const tunnelRows = [];
  for (let r = 0; r < ROWS; r++) if (!wall[r][0] && !wall[r][COLS - 1]) tunnelRows.push(r);
  const doorOut = door ? { c: door.c, r: door.r + 1 } : null; // below-door corridor tile
  const penRow = interior.length ? interior[0].r : 3;

  const dots = {};
  let totalFacts = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = kind[c + "," + r];
    if (ch === "." || ch === "o") { dots[c + "," + r] = { v: ch === "o" ? 50 : 10, apple: ch === "o", got: false }; totalFacts++; }
  }

  let spawnC = door ? door.c : COLS >> 1, spawnR = door ? door.r + 3 : ROWS >> 1;
  outer: for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (kind[c + "," + r] === "P") { spawnC = c; spawnR = r; break outer; }

  const wrapC = (c) => ((c % COLS) + COLS) % COLS;
  // toroidal column distance — columns wrap through the tunnel, rows don't;
  // exact on fractional tile positions (fx floats, issue #8)
  const wdx = (a, b) => { const d = Math.abs(a - b); return Math.min(d, COLS - d); };
  const inTunnelRow = (r) => tunnelRows.includes(r);
  const isPen = (c, r) => r >= 0 && r < ROWS && kind[wrapC(c) + "," + r] === " " && !inTunnelRow(r);
  const corridorPass = (c, r) => { // shared by player + roaming ghosts + eyes' BFS
    if (r < 0 || r >= ROWS) return false;
    const tc = wrapC(c);
    if (wall[r][tc]) return false;      // includes the lounge door
    if (isPen(tc, r)) return false;     // teachers' lounge is script-only
    return true;
  };

  // generic BFS over corridor tiles (wrap-aware); returns steps [{c,r},…] or null
  function bfs(sc, sr, isGoal, passFn) {
    const q = [{ c: sc, r: sr }];
    const prev = new Map([[sc + "," + sr, null]]);
    while (q.length) {
      const cur = q.shift();
      if (!(cur.c === sc && cur.r === sr) && isGoal(cur)) {
        const path = [];
        let node = cur;
        while (prev.get(node.c + "," + node.r)) { path.unshift({ c: node.c, r: node.r }); node = prev.get(node.c + "," + node.r); }
        return path;
      }
      for (const d of TIE) {
        const nc = wrapC(cur.c + d.x), nr = cur.r + d.y;
        if (nr < 0 || nr >= ROWS) continue;
        if (!passFn(nc, nr)) continue;
        const k = nc + "," + nr;
        if (prev.has(k)) continue;
        prev.set(k, cur);
        q.push({ c: nc, r: nr });
      }
    }
    return null;
  }

  // ---- entities ----
  const SCATTER = [
    { c: 1, r: 1 }, { c: COLS - 2, r: 1 }, { c: 1, r: ROWS - 2 }, { c: COLS - 2, r: ROWS - 2 },
  ];
  const mkPlayer = () => ({ fx: spawnC, fy: spawnR, tx: null, ty: null, prog: 0, dir: null, want: null, lastDir: L });
  let P = mkPlayer();
  let ghosts = [];
  function buildGhosts(relMul) {
    ghosts = PERSONAS.map((p, i) => ({
      spec: p, idx: i,
      fx: i === 0 ? doorOut.c : interior[i - 1].c,
      fy: i === 0 ? doorOut.r : interior[i - 1].r,
      tx: null, ty: null, prog: 0, dir: null, script: null, done: null,
      phase: i === 0 ? "roam" : "pen",
      wait: (i === 0 ? 1.4 : tune.release[i]) * relMul, // red pauses briefly before roaming
      fright: false, eaten: false, rev: false, bob: i * 0.9,
    }));
  }

  // ---- state ----
  let G;
  const hearts = () => "♥".repeat(Math.max(0, G.lives));
  const hudMid = () =>
    `SCORE ${String(G.score).padStart(5, "0")} · FACTS ${G.facts}/${totalFacts}` +
    (G.fright > 0 ? ` · RECESS ${Math.ceil(G.fright)}s` : "");
  function freshState() {
    G = {
      status: "ready", tReady: 1.7, t: 0,
      score: 0, lives: data.lives || 3, facts: totalFacts,
      wave: 0, waveT: 0, fright: 0, chain: 0,
      applesEaten: 0, notebook: null,
      popups: [], parts: [],
      dying: 0, bell: 0,
    };
    P = mkPlayer();
    buildGhosts(1);
    api.hud({ mid: hudMid(), right: hearts() });
  }

  // ---- fx ----
  function popup(x, y, txt, color, size) { G.popups.push({ x, y, txt, color, size: size || 15, t: 0, life: 0.95 }); }
  function burst(x, y, color, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = hash(i * 7 + G.t * 13) * PI2, sp = (0.3 + hash(i * 3 + 1)) * (spread || 80);
      G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, t: 0, life: 0.5 + hash(i) * 0.4, color, size: 2 + hash(i * 5) * 2.5 });
    }
  }
  function tickFx(dt) {
    for (const p of G.popups) p.t += dt;
    G.popups = G.popups.filter((p) => p.t < p.life);
    for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; }
    G.parts = G.parts.filter((p) => p.t < p.life);
  }

  // ---- movement plumbing ----
  const anchor = (e) => ({
    x: (e.fx + (e.tx != null ? (e.tx - e.fx) * e.prog : 0) + 0.5) * T,
    y: (e.fy + (e.ty != null ? (e.ty - e.fy) * e.prog : 0) + 0.5) * T,
  });
  function setTarget(e, c, r) {
    e.tx = c; e.ty = r;
    let dx = c - e.fx, dy = r - e.fy;
    if (dx > 1) dx = -1; else if (dx < -1) dx = 1;
    if (dy > 1) dy = -1; else if (dy < -1) dy = 1;
    e.dir = TIE.find((d) => d.x === dx && d.y === dy) || { x: dx, y: dy };
    e.prog = 0;
  }
  function doReverse(e) {
    const nfx = e.tx, nfy = e.ty;
    e.tx = e.fx; e.ty = e.fy; e.fx = nfx; e.fy = nfy;
    e.prog = 1 - e.prog; e.dir = opp(e.dir);
  }

  // ---- eating ----
  function eatAt(c, r) {
    const k = wrapC(c) + "," + r;
    const d = dots[k];
    if (!d || d.got) return;
    d.got = true; G.facts--; G.score += d.v;
    const ax = (wrapC(c) + 0.5) * T, ay = (r + 0.5) * T;
    if (d.apple) {
      G.applesEaten++;
      G.fright = tune.frightSeconds; G.chain = 0;
      for (const g of ghosts) if (!g.eaten && (g.phase === "roam" || g.phase === "exit")) { g.fright = true; g.rev = true; }
      popup(ax, ay, "RECESS!", "#a8ecf2", 17);
      burst(ax, ay, "#a8ecf2", 12, 90);
      api.audio.sfx("jump");
      if (G.applesEaten === 2 && !G.notebook) G.notebook = { c: door.c, r: door.r - 3, ttl: 9 };
    } else {
      api.audio.sfx(G.facts % 2 ? "select" : "coin"); // waka-waka
    }
    if (G.facts === 0) startBell();
  }

  // ---- ghost brains ----
  const WAVES = [["scatter", 5], ["chase", 12], ["scatter", 5], ["chase", 15], ["scatter", 4.5], ["chase", 9999]];
  const waveMode = () => WAVES[G.wave][0];
  const elroy = () => { let k = 1; for (const [n, m] of tune.elroy) if (G.facts <= n) k = Math.max(k, m); return k; };

  function ghostTarget(g) {
    const pc = { c: P.fx, r: P.fy };
    const pd = P.dir || P.lastDir || L;
    const chase = waveMode() === "chase";
    switch (g.idx) {
      case 0: return chase || elroy() > 1 ? pc : SCATTER[0];                 // Hall Monitor: straight at you
      case 1: return chase ? { c: pc.c + pd.x * 2, r: pc.r + pd.y * 2 } : SCATTER[1]; // Math Teacher: ambush 2 ahead (mini-board scale)
      case 2: {                                                              // Librarian: mirror-flank via the monitor
        const red = ghosts[0];
        const px = pc.c + pd.x * 2, py = pc.r + pd.y * 2;
        return chase ? { c: px * 2 - red.fx, r: py * 2 - red.fy } : SCATTER[2];
      }
      default: {                                                             // Janitor: shy
        const d = Math.abs(pc.c - g.fx) + Math.abs(pc.r - g.fy);
        return chase && d > 8 ? pc : SCATTER[3];
      }
    }
  }
  function ghostSpeed(g) {
    if (g.eaten) return tune.eyes;
    if (g.phase === "pen" || g.phase === "exit") return 80;
    if (g.fright) return tune.fright;
    let s = tune.ghost;
    if (g.idx === 0) s *= elroy();
    if (inTunnelRow(g.fy) && (g.fx <= 2 || g.fx >= COLS - 3)) s *= tune.tunnelSlow;
    if (G.lives === 1) s *= tune.mercy; // last-recess mercy: survivable drama
    return s;
  }
  function ghostDecide(g, carried) {
    const opts = [];
    for (const d of TIE) {
      if (g.dir && d === opp(g.dir)) continue;
      if (corridorPass(g.fx + d.x, g.fy + d.y)) opts.push(d);
    }
    if (!opts.length) { if (g.dir && opp(g.dir)) opts.push(opp(g.dir)); else return; }
    const tgt = ghostTarget(g);
    let best = opts[0], bd;
    if (g.fright) {
      bd = -Infinity;
      for (const d of opts) {
        const nc = wrapC(g.fx + d.x), nr = g.fy + d.y;
        const dd = dist2(nc, nr, P.fx, P.fy) + hash(g.idx * 97 + Math.floor(G.t * 3)) * 6;
        if (dd > bd) { bd = dd; best = d; }
      }
    } else {
      bd = Infinity;
      for (const d of opts) {
        const nc = wrapC(g.fx + d.x), nr = g.fy + d.y;
        const dd = dist2(nc, nr, tgt.c, tgt.r);
        if (dd < bd) { bd = dd; best = d; }
      }
    }
    setTarget(g, g.fx + best.x, g.fy + best.y);
    g.prog = Math.min(carried, 0.9);
  }
  function buildEyesScript(g) {
    const path = bfs(g.fx, g.fy, (t) => t.c === doorOut.c && t.r === doorOut.r, corridorPass) || [];
    g.script = [...path, { c: door.c, r: door.r }, { c: door.c, r: penRow }, { done: 1 }];
    g.done = () => { g.phase = "pen"; g.eaten = false; g.fright = false; g.dir = null; g.wait = 0.8; };
  }
  function exitScript(g) {
    g.script = [
      { c: door.c, r: penRow }, { c: door.c, r: door.r }, { c: door.c, r: doorOut.r }, { done: 1 },
    ];
    g.done = () => { g.phase = "roam"; g.dir = null; };
  }
  function runScript(g, carried) {
    while (g.script.length) {
      const item = g.script.shift();
      if (item.done) { const f = g.done; g.done = null; if (f) f(); ghostDecide(g, carried); return; }
      if (item.c === g.fx && item.r === g.fy) continue;
      setTarget(g, item.c, item.r);
      g.prog = Math.min(carried, 0.9);
      return;
    }
    ghostDecide(g, carried);
  }
  function stepGhost(g, dt) {
    if (g.rev && g.tx != null) { doReverse(g); g.rev = false; }
    if (g.phase === "pen") {
      const pr = tune.progressRelease && tune.progressRelease[g.idx - 1];
      if (pr != null && G.facts <= pr) g.wait = Math.min(g.wait, 0.25); // progress-gated release
      g.wait -= dt;
      if (g.wait <= 0) { g.phase = "exit"; exitScript(g); }
      return;
    }
    if (g.phase === "roam" && g.wait > 0) { g.wait -= dt; return; } // spawn breath
    if (g.phase === "eaten" && !g.script) buildEyesScript(g);
    if (g.tx == null) {
      if (g.script && g.script.length) runScript(g, 0);
      else ghostDecide(g, 0);
      if (g.tx == null) return;
    }
    g.prog += (ghostSpeed(g) * dt) / T;
    if (g.prog >= 1) {
      const carried = Math.min(g.prog - 1, 0.9);
      g.fx = wrapC(g.tx); g.fy = g.ty; g.tx = null; g.prog = 0;
      if (g.script && g.script.length) runScript(g, carried);
      else if (g.phase === "roam" || g.phase === "exit") ghostDecide(g, carried);
    }
  }

  // ---- player ----
  function stepPlayer(dt) {
    const sp = tune.player * (G.fright > 0 ? 1.06 : 1);
    if (P.tx == null) {
      if (P.want && corridorPass(P.fx + P.want.x, P.fy + P.want.y)) { setTarget(P, P.fx + P.want.x, P.fy + P.want.y); P.lastDir = P.dir; }
      else return;
    }
    if (P.want && P.dir && P.want === opp(P.dir)) doReverse(P); // instant U-turn
    P.prog += (sp * dt) / T;
    if (P.prog >= 1) {
      const carried = Math.min(P.prog - 1, 0.9);
      P.fx = wrapC(P.tx); P.fy = P.ty; P.tx = null; P.prog = 0;
      let nd = null;
      if (P.want && corridorPass(P.fx + P.want.x, P.fy + P.want.y)) nd = P.want;
      else if (P.dir && corridorPass(P.fx + P.dir.x, P.fy + P.dir.y)) nd = P.dir;
      if (nd) { setTarget(P, P.fx + nd.x, P.fy + nd.y); P.lastDir = P.dir; P.prog = carried; BOT.t = 0; }
      else P.dir = null;
      eatAt(P.fx, P.fy);
    }
  }
  function readInput(input) {
    const held = [];
    if (input.up()) held.push(U);
    if (input.downKey()) held.push(D);
    if (input.left()) held.push(L);
    if (input.right()) held.push(R);
    if (!held.length) return;
    let w = held[held.length - 1];
    const codes = (d) => (d === U ? ["ArrowUp", "KeyW"] : d === D ? ["ArrowDown", "KeyS"] : d === L ? ["ArrowLeft", "KeyA"] : ["ArrowRight", "KeyD"]);
    for (const d of held) if (codes(d).some((c) => input.just(c))) { w = d; break; }
    P.want = w;
  }

  // ---- outcomes ----
  const Q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams("");
  const DBG = Q.has("debugMaze"), AP = Q.has("ap");
  const BOT = { on: false, t: 0 };
  const botHold = { until: 0 };
  function recordRun(won) {
    if (!BOT.on || typeof window === "undefined" || !window.__MAZE_RUNS__) return;
    window.__MAZE_RUNS__.push({ won, time: +G.t.toFixed(1), score: G.score, factsLeft: G.facts, ts: Date.now() });
  }
  function playerDie() {
    if (G.status !== "playing") return;
    G.status = "dying"; G.dying = 1.7; G.fright = 0;
    if (typeof window !== "undefined" && window.__MAZE_DEATHS__) window.__MAZE_DEATHS__.push({ t: +G.t.toFixed(1), facts: G.facts, lives: G.lives - 1 });
    const a = anchor(P);
    burst(a.x, a.y, GOLD, 18, 120);
    api.audio.sfx("crash");
    api.eng.shake(0.9);
  }
  function afterDeath() {
    G.lives--;
    api.hud({ right: hearts() });
    if (G.lives <= 0) {
      G.status = "lost";
      api.audio.sfx("lose");
      api.fail("Sent to detention — the staff caught you!");
      recordRun(false);
    } else {
      P = mkPlayer();
      buildGhosts(0.85); // dip back into the lounge, fuller re-release rhythm
      G.wave = 0; G.waveT = 0; G.fright = 0; G.chain = 0;
      G.status = "ready"; G.tReady = 1.3;
      if (G.notebook && G.notebook.ttl <= 0) G.notebook = null;
    }
  }
  function startBell() {
    G.status = "bell"; G.bell = 1.7;
    api.audio.sfx("win");
    for (let i = 0; i < 3; i++) burst(BW * (0.25 + 0.25 * i), BH * 0.3, [GOLD, "#3ddcff", "#ff3d9a", "#7de2a8"][i % 4], 16, 130);
    recordRun(true);
  }
  function eatGhost(g) {
    const val = 200 << Math.min(G.chain, 3);
    G.chain++;
    G.score += val;
    const a = anchor(g);
    popup(a.x, a.y - 8, "+" + val, ["#4dffb8", "#7dfcff", "#ffd23f", "#ff7ab8"][Math.min(G.chain - 1, 3)], 15);
    burst(a.x, a.y, g.spec.body, 14, 100);
    api.audio.sfx("coin");
    api.eng.shake(0.25);
    g.eaten = true; g.fright = false; g.phase = "eaten"; g.script = null; g.done = null;
  }

  // ---- autopilot (playtest bot, ?ap=1) ------------------------------------------
  // ETA-aware: multi-source BFS from all roaming staff gives a danger field;
  // the bot walks the cheapest fact route and detours when its next tile's
  // staff-ETA is too small. Fright window = hunt the pale staff for credit.
  function botStep(dt) {
    BOT.t -= dt;
    if (BOT.t > 0 && P.want) return; // pace the planner
    BOT.t = 0.1;
    if (G.t < botHold.until && P.want) return; // plan hysteresis — no flip-flopping
    botHold.until = G.t + 0.4;
    const threats = ghosts.filter((g) => !g.eaten && !g.fright && (g.phase === "roam" || g.phase === "exit"));
    // multi-source ETA (steps) from all staff
    const eta = new Map();
    {
      let q = [];
      for (const g of threats) { eta.set(g.fx + "," + g.fy, 0); q.push({ c: g.fx, r: g.fy }); }
      let d = 0;
      while (q.length) {
        const layer = q; q = [];
        d++;
        for (const n of layer) for (const dd of TIE) {
          const nc = wrapC(n.c + dd.x), nr = n.r + dd.y;
          const k = nc + "," + nr;
          if (eta.has(k) || !corridorPass(nc, nr)) continue;
          eta.set(k, d);
          q.push({ c: nc, r: nr });
        }
      }
    }
    const ev = (c, r) => (eta.has(wrapC(c) + "," + r) ? eta.get(wrapC(c) + "," + r) : 99);
    // threat proximity judged toroidally (issue #8): a staff member 2 tiles
    // away THROUGH the wrap tunnel must read as 2, not ~19 — this one value
    // drives the immediate-danger, apple-hunt and stranded gates below
    const near = threats.length ? Math.min(...threats.map((g) => wdx(g.fx, P.fx) + Math.abs(g.fy - P.fy))) : 99;
    // immediate danger: maximize staff-eta among neighbors (no hysteresis)
    if (near <= 2) {
      botHold.until = 0;
      let best = null, bv = -Infinity;
      for (const d of TIE) {
        const nc = wrapC(P.fx + d.x), nr = P.fy + d.y;
        if (!corridorPass(nc, nr)) continue;
        const v = ev(nc, nr);
        if (v > bv) { bv = v; best = d; }
      }
      if (best) { P.want = best; return; }
    }
    const setWant = (path) => {
      if (!path || !path.length) return false;
      const t0 = path[0];
      let dx = t0.c - P.fx, dy = t0.r - P.fy;
      if (dx > 1) dx = -1; else if (dx < -1) dx = 1;
      if (dy > 1) dy = -1; else if (dy < -1) dy = 1;
      const d0 = TIE.find((d) => d.x === dx && d.y === dy);
      // danger-tax route choice: stay on path unless a neighbor is clearly safer
      const alts = TIE.filter((d) => corridorPass(wrapC(P.fx + d.x), P.fy + d.y));
      if (!alts.length) return false;
      let best = d0 || alts[0], bv = -Infinity;
      for (const d of alts) {
        const nc = wrapC(P.fx + d.x), nr = P.fy + d.y;
        const e = ev(nc, nr);
        const v = e - (d === d0 ? 0.4 : 0) + hash(d.x * 31 + d.y * 17 + Math.floor(G.t * 2)) * 0.3;
        if (v > bv) { bv = v; best = d; }
      }
      P.want = best;
      botHold.until = G.t + 0.45; // hold the plan a beat before re-evaluating
      return true;
    };
    if (G.fright > 1.5) { // hunt pale staff for credit
      const fg = ghosts.filter((g) => g.fright && !g.eaten && (g.phase === "roam" || g.phase === "exit"));
      if (fg.length && setWant(bfs(P.fx, P.fy, (t) => fg.some((g) => g.fx === t.c && g.fy === t.r), corridorPass))) return;
    }
    // tunnel-entry guard (issue #8): don't route into the wrap tunnel while a
    // staff member is in or near it — that's the head-on death the bot used to
    // eat. The tunnel carries dots, so when no safe route exists the fact BFS
    // falls back to the unguarded pass below (fallback keeps tunnel dots
    // reachable — no facts-freeze), and the now wrap-aware immediate-danger
    // branch handles survival inside the tunnel.
    const tunnelHot = (c, r) => inTunnelRow(r) && threats.some((g) => wdx(g.fx, c) + Math.abs(g.fy - r) <= 5);
    const passSafe = (c, r) => corridorPass(c, r) && !tunnelHot(c, r);
    if (near >= 7) { // grab apples when not hunted
      if (setWant(bfs(P.fx, P.fy, (t) => { const d = dots[t.c + "," + t.r]; return d && d.apple && !d.got; }, passSafe))) return;
    }
    if (setWant(bfs(P.fx, P.fy, (t) => { const d = dots[t.c + "," + t.r]; return d && !d.got; }, passSafe))) return;
    if (setWant(bfs(P.fx, P.fy, (t) => { const d = dots[t.c + "," + t.r]; return d && !d.got; }, corridorPass))) return; // unguarded fallback: tunnel dots stay reachable
    // stranded: run from the nearest threat
    if (near <= 6) {
      let best = null, bv = -Infinity;
      for (const d of TIE) {
        const nc = wrapC(P.fx + d.x), nr = P.fy + d.y;
        if (!corridorPass(nc, nr)) continue;
        const v = ev(nc, nr);
        if (v > bv) { bv = v; best = d; }
      }
      if (best) { P.want = best; botHold.until = G.t + 0.3; }
    }
  }

  // ---- baked scenery (board + hallway ambience), painted once --------------------
  const BG = document.createElement("canvas"); BG.width = W; BG.height = H;
  (function bakeBG() {
    const g = BG.getContext("2d");
    const sky = st0.sky || ["#182a24", "#22392f", "#121d1a"];
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, sky[0]); lg.addColorStop(0.55, sky[1] || sky[0]); lg.addColorStop(1, sky[2] || sky[0]);
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    // chalk dust
    for (let i = 0; i < 90; i++) { g.globalAlpha = 0.03 + hash(i) * 0.05; g.fillStyle = "#fff"; g.fillRect(hash(i * 3) * W, hash(i * 7) * H, 2, 2); }
    g.globalAlpha = 1;
    // hallway walls (letterbox strips) with locker silhouettes
    for (const s of [{ x0: 0, x1: ox - 8 }, { x0: ox + BW + 8, x1: W }]) {
      g.fillStyle = "rgba(9,14,20,.55)"; g.fillRect(s.x0, 0, s.x1 - s.x0, H);
      for (let x = s.x0 + 8; x < s.x1 - 20; x += 34) {
        g.fillStyle = "rgba(52,72,108,.5)";
        rr(g, x, 90, 26, H - 180, 3); g.fill();
        g.strokeStyle = "rgba(14,20,34,.6)"; g.lineWidth = 1.2; g.stroke();
        g.strokeStyle = "rgba(10,16,28,.5)";
        for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + 6, 108 + i * 4); g.lineTo(x + 20, 108 + i * 4); g.stroke(); }
      }
      // pennant garland
      for (let x = s.x0 + 6; x < s.x1 - 14; x += 22) {
        const cols = ["#ffd23f", "#3ddcff", "#ff3d9a", "#7de2a8"];
        g.fillStyle = cols[Math.abs(Math.round(x / 22)) % 4]; g.globalAlpha = 0.75;
        g.beginPath(); g.moveTo(x, 26); g.lineTo(x + 14, 26); g.lineTo(x + 7, 42); g.closePath(); g.fill();
        g.globalAlpha = 1;
      }
    }
    // bulletin board on the right strip
    g.fillStyle = "#6b4a2a"; rr(g, W - 148, 120, 116, 150, 6); g.fill();
    g.strokeStyle = "#4a3018"; g.lineWidth = 3; g.stroke();
    for (let i = 0; i < 5; i++) {
      g.save();
      g.translate(W - 130 + (i % 2) * 52, 140 + Math.floor(i / 2) * 44);
      g.rotate((hash(i * 9) - 0.5) * 0.3);
      g.fillStyle = ["#fdf2d0", "#cfe6ff", "#ffd9ec"][i % 3];
      g.fillRect(0, 0, 34, 26);
      g.strokeStyle = "rgba(36,31,61,.5)"; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(4, 6 + k * 5); g.lineTo(30, 6 + k * 5); g.stroke(); }
      g.fillStyle = "#e6413f"; g.beginPath(); g.arc(17, 2, 2.4, 0, PI2); g.fill();
      g.restore();
    }
    // the board: wood frame + chalkboard backing
    g.fillStyle = "#8a5c33"; rr(g, ox - 16, oy - 16, BW + 32, BH + 32, 16); g.fill();
    g.strokeStyle = "#5f3d1e"; g.lineWidth = 4; g.stroke();
    g.fillStyle = "rgba(255,240,210,.18)"; rr(g, ox - 12, oy - 12, BW + 24, 5, 2); g.fill();
    g.fillStyle = "#20362c"; rr(g, ox - 6, oy - 6, BW + 12, BH + 12, 10); g.fill();
    // chalk doodles on the backing
    g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1.6;
    for (let i = 0; i < 16; i++) {
      const x = ox + hash(i * 11 + 2) * BW, y = oy + hash(i * 13 + 5) * BH;
      g.beginPath();
      if (i % 3 === 0) { g.arc(x, y, 5 + hash(i) * 4, 0, PI2); }
      else if (i % 3 === 1) { g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); }
      else { g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); }
      g.stroke();
    }
    // corridor floor + grout
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (wall[r][c]) continue;
      g.fillStyle = "rgba(64,96,80,.35)";
      g.fillRect(ox + c * T + 1, oy + r * T + 1, T - 2, T - 2);
    }
    // locker walls
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!wall[r][c]) continue;
      const x = ox + c * T, y = oy + r * T;
      const lg2 = g.createLinearGradient(x, y, x, y + T);
      lg2.addColorStop(0, "#5d7cb4"); lg2.addColorStop(1, "#3c5688");
      g.fillStyle = lg2;
      rr(g, x + 1.5, y + 1.5, T - 3, T - 3, 3); g.fill();
      g.strokeStyle = "#22304e"; g.lineWidth = 1.5; g.stroke();
      const jy = (hash(c * 31 + r * 17) - 0.5) * 2;
      g.strokeStyle = "rgba(16,24,44,.55)"; g.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(x + T * 0.22, y + 5.5 + jy + i * 3.2); g.lineTo(x + T * 0.56, y + 5.5 + jy + i * 3.2); g.stroke();
        g.beginPath(); g.moveTo(x + T * 0.22, y + T - 11 + jy + i * 3.2); g.lineTo(x + T * 0.56, y + T - 11 + jy + i * 3.2); g.stroke();
      }
      g.fillStyle = "rgba(255,210,63,.9)";
      g.beginPath(); g.arc(x + T - 6, y + T / 2, 1.8, 0, PI2); g.fill();
    }
    // teachers' lounge: warm wood interior + navy door + sign
    for (const t of interior) {
      g.fillStyle = "rgba(122,82,44,.85)";
      g.fillRect(ox + t.c * T + 2, oy + t.r * T + 2, T - 4, T - 4);
      g.strokeStyle = "rgba(60,40,20,.6)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(ox + t.c * T + 2, oy + t.r * T + T / 2); g.lineTo(ox + (t.c + 1) * T - 2, oy + t.r * T + T / 2); g.stroke();
    }
    if (door) {
      const dx = ox + door.c * T, dy = oy + door.r * T;
      g.fillStyle = "#2c3a66"; rr(g, dx + 3, dy + 2, T - 6, T - 3, 2); g.fill();
      g.strokeStyle = "#1a2544"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(dx + T - 8, dy + T / 2, 2, 0, PI2); g.fill();
      // hanging STAFF sign (mounted on the pen roof, above the door)
      const sx = dx + T / 2, sy = dy - T - 6;
      g.strokeStyle = "#d9c9a8"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(sx - 10, sy - 8); g.lineTo(sx - 10, sy - 3); g.moveTo(sx + 10, sy - 8); g.lineTo(sx + 10, sy - 3); g.stroke();
      g.fillStyle = "#8a5c33"; rr(g, sx - 21, sy - 3, 42, 13, 3); g.fill();
      g.strokeStyle = "#5f3d1e"; g.lineWidth = 1.6; g.stroke();
      g.strokeStyle = "rgba(255,240,210,.85)"; g.lineWidth = 1.4; g.lineCap = "round";
      g.beginPath(); g.moveTo(sx - 14, sy + 3); g.lineTo(sx - 4, sy + 3); g.moveTo(sx - 1, sy + 3); g.lineTo(sx + 13, sy + 3); g.stroke();
    }
    // tunnel pockets (dark) at open edge cells
    for (const r of tunnelRows) for (const c of [0, COLS - 1]) {
      g.fillStyle = "#05070a";
      rr(g, ox + c * T - 2, oy + r * T + 3, T + 4, T - 6, 6); g.fill();
    }
    // classroom clock (face only — hands tick live)
    g.fillStyle = "#f4efe2"; g.beginPath(); g.arc(W / 2, 32, 20, 0, PI2); g.fill();
    g.strokeStyle = "#5f3d1e"; g.lineWidth = 4; g.stroke();
    g.strokeStyle = "rgba(36,31,61,.7)"; g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI2;
      g.beginPath();
      g.moveTo(W / 2 + Math.cos(a) * 15, 32 + Math.sin(a) * 15);
      g.lineTo(W / 2 + Math.cos(a) * 18, 32 + Math.sin(a) * 18);
      g.stroke();
    }
  })();

  // vignette + faint scanlines (cabinet feel), baked once
  const VIG = document.createElement("canvas"); VIG.width = W; VIG.height = H;
  (function bakeVig() {
    const g = VIG.getContext("2d");
    const rg = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.85);
    rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,0,0,.4)");
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(0,0,0,.045)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  })();

  // ---- update -------------------------------------------------------------------
  function update(dt, input) {
    // thumb-carousel stomper antidote: reclaim the playtest hooks if some other
    // genre module's create() hijacked window.__TEST_API__ on this page
    if ((DBG || AP) && (!window.__TEST_API__ || window.__TEST_API__.__owner__ !== level.id)) installTestAPI();
    G.t += dt;
    tickFx(dt);

    if (G.status === "ready") {
      G.tReady -= dt;
      if (G.tReady <= 0) { G.status = "playing"; eatAt(P.fx, P.fy); if (AP) BOT.on = true; }
      api.hud({ mid: hudMid(), right: hearts() });
      return;
    }
    if (G.status === "dying") {
      G.dying -= dt;
      if (G.dying <= 0) afterDeath();
      return;
    }
    if (G.status === "bell") {
      G.bell -= dt;
      if (G.bell <= 0) { G.status = "won"; api.complete({ score: G.score, facts: totalFacts }); }
      return;
    }
    if (G.status !== "playing") return;

    if (BOT.on) botStep(dt); else readInput(input);
    stepPlayer(dt);
    for (const g of ghosts) stepGhost(g, dt);

    // scatter/chase waves (reversal on flip — classic signal)
    G.waveT += dt;
    if (G.waveT >= WAVES[G.wave][1]) {
      G.waveT = 0; G.wave = Math.min(G.wave + 1, WAVES.length - 1);
      for (const g of ghosts) if (g.phase === "roam" && !g.eaten) g.rev = true;
    }
    // RECESS timer
    if (G.fright > 0) {
      G.fright -= dt;
      if (G.fright <= 0) { G.fright = 0; G.chain = 0; for (const g of ghosts) g.fright = false; }
    }
    // collisions
    const pa = anchor(P);
    for (const g of ghosts) {
      if (g.eaten || g.phase === "pen") continue;
      const ga = anchor(g);
      if (dist2(pa.x, pa.y, ga.x, ga.y) < (T * 0.62) * (T * 0.62)) {
        if (g.fright) eatGhost(g);
        else { playerDie(); break; }
      }
    }
    // gold-star notebook bonus
    if (G.notebook) {
      const nb = G.notebook;
      nb.ttl -= dt;
      const nx = (nb.c + 0.5) * T, ny = (nb.r + 0.5) * T;
      if (nb.ttl <= 0) G.notebook = null;
      else if (dist2(pa.x, pa.y, nx, ny) < (T * 0.7) * (T * 0.7)) {
        G.score += 500;
        popup(nx, ny - 10, "GOLD STAR! +500", GOLD, 15);
        burst(nx, ny, GOLD, 14, 100);
        api.audio.sfx("coin");
        G.notebook = null;
      }
    }
    api.hud({ mid: hudMid(), right: hearts() });
  }

  // ---- draw -------------------------------------------------------------------
  function drawPlayer(ctx) {
    const a = anchor(P);
    const face = P.dir || P.lastDir || L;
    const moving = P.tx != null;
    const R = T * 0.52;
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(a.x, a.y + R * 0.85, R * 0.8, R * 0.28, 0, 0, PI2); ctx.fill();
    let ang = Math.atan2(face.y, face.x), m, scale = 1;
    if (G.status === "dying") {
      const q = clamp(1 - G.dying / 1.7, 0, 1);
      ang += q * 9;
      m = 0.12 + q * (Math.PI - 0.14);
      scale = 1 - q * 0.8;
    } else {
      const chomp = moving ? Math.abs(Math.sin(G.t * 15)) : 0.15 + 0.08 * Math.sin(G.t * 3);
      m = 0.12 + chomp * 0.58;
    }
    ctx.save();
    ctx.translate(a.x, a.y); ctx.rotate(ang); ctx.scale(scale, scale);
    const grd = ctx.createRadialGradient(-R * 0.2, -R * 0.3, R * 0.2, 0, 0, R);
    grd.addColorStop(0, "#ffe98d"); grd.addColorStop(0.6, GOLD); grd.addColorStop(1, "#e8a91f");
    ctx.fillStyle = grd; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, m, PI2 - m);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(R * 0.1, -R * 0.55, R * 0.22, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(R * 0.2, -R * 0.55, R * 0.1, 0, PI2); ctx.fill();
    ctx.restore();
    // mortarboard stays upright; tassel sways
    ctx.save();
    ctx.translate(a.x, a.y - R * 1.28 - (1 - scale) * 2);
    const sway = Math.sin(G.t * 2.4) * 2.2 * scale;
    ctx.strokeStyle = "#b8860b"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(R * 0.55 * scale, 0);
    ctx.quadraticCurveTo(R * 0.85 * scale + sway, R * 0.5 * scale, R * 0.7 * scale + sway, R * 0.95 * scale);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(R * 0.7 * scale + sway, R * 0.98 * scale, 2.4, 0, PI2); ctx.fill();
    ctx.fillStyle = "#26355f"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.42 * scale); ctx.lineTo(R * 0.95 * scale, 0);
    ctx.lineTo(0, R * 0.42 * scale); ctx.lineTo(-R * 0.95 * scale, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1a2544";
    rr(ctx, -R * 0.42 * scale, R * 0.18 * scale, R * 0.84 * scale, R * 0.34 * scale, 3); ctx.fill();
    ctx.restore();
  }

  function drawGhost(ctx, g) {
    const a = anchor(g);
    const bob = g.phase === "pen" || g.phase === "exit" ? Math.sin(G.t * 5 + g.bob) * 2.2 : 0;
    const x = a.x, y = a.y + bob;
    if (!g.eaten) {
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(x, a.y + T * 0.44, T * 0.36, T * 0.14, 0, 0, PI2); ctx.fill();
    }
    if (g.eaten) {
      const d = g.dir || U;
      for (const s of [-1, 1]) {
        ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(x + s * 5.5, y - 3, 4.4, 5.2, 0, 0, PI2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2c2a55";
        ctx.beginPath(); ctx.arc(x + s * 5.5 + d.x * 2, y - 3 + d.y * 2, 2.1, 0, PI2); ctx.fill();
      }
      return;
    }
    const fr = Math.floor(G.t * 6 + g.idx) % 2;
    let spr;
    if (g.fright) {
      const ending = G.fright < 2;
      spr = ending && Math.floor(G.t * 8) % 2 === 0 ? FRIGHT_FLASH[fr] : FRIGHT_SPRITE[fr];
    } else spr = GHOST_SPRITES[g.idx][fr];
    blit(ctx, spr, x, y, T * 1.1, { flip: g.dir && g.dir.x < 0 ? -1 : 1 });
  }

  function draw(ctx) {
    ctx.drawImage(BG, 0, 0);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath(); ctx.rect(0, 0, BW, BH); ctx.clip();

    // facts + apples
    for (const k in dots) {
      const d = dots[k];
      if (d.got) continue;
      const [c, r] = k.split(",").map(Number);
      const x = (c + 0.5) * T, y = (r + 0.5) * T;
      if (d.apple) {
        const pulse = 1 + 0.09 * Math.sin(G.t * 4 + c);
        ctx.save();
        const halo = ctx.createRadialGradient(x, y, 2, x, y, T * 0.9);
        halo.addColorStop(0, "rgba(255,90,78,.4)"); halo.addColorStop(1, "rgba(255,90,78,0)");
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(x, y, T * 0.9, 0, PI2); ctx.fill();
        ctx.translate(x, y); ctx.scale(pulse, pulse);
        ctx.drawImage(APPLE, -22, -22);
        ctx.restore();
      } else {
        ctx.fillStyle = CREAM;
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, PI2); ctx.fill();
      }
    }
    // gold-star notebook bonus
    if (G.notebook) {
      const nx = (G.notebook.c + 0.5) * T, ny = (G.notebook.r + 0.5) * T + Math.sin(G.t * 4) * 2.4;
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(Math.sin(G.t * 2.2) * 0.12);
      ctx.drawImage(NOTEBOOK, -26, -26);
      ctx.restore();
    }
    // tunnel chevrons (blink toward the wrap)
    for (const r of tunnelRows) {
      const on = Math.floor(G.t * 2.5) % 2 === 0;
      if (!on) continue;
      ctx.fillStyle = "rgba(255,210,63,.8)";
      for (const [c, dir] of [[0, 1], [COLS - 1, -1]]) {
        const x = (c + 0.5) * T - dir * 4, y = (r + 0.5) * T;
        ctx.beginPath();
        ctx.moveTo(x + dir * 4, y - 5); ctx.lineTo(x - dir * 3, y); ctx.lineTo(x + dir * 4, y + 5);
        ctx.lineTo(x - dir * 1, y + 5); ctx.lineTo(x - dir * 8, y); ctx.lineTo(x - dir * 1, y - 5);
        ctx.closePath(); ctx.fill();
      }
    }
    for (const g of ghosts) drawGhost(ctx, g);
    if (G.status !== "bell" || Math.floor(G.t * 8) % 2 === 0) drawPlayer(ctx);
    // popups + particles
    for (const p of G.popups) {
      const q = p.t / p.life;
      drawText(ctx, p.txt, p.x, p.y - 6 - q * 22, { size: p.size, color: p.color, alpha: 1 - q, shadow: "rgba(0,0,0,.5)" });
    }
    for (const p of G.parts) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, PI2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // banners
    const cxm = ox + BW / 2, cym = oy + BH / 2;
    if (G.status === "ready") {
      drawText(ctx, "READY!", cxm, cym - 12, { size: 34, color: GOLD, shadow: "rgba(0,0,0,.6)" });
      drawText(ctx, level.objective || "Munch every fact!", cxm, cym + 18, { size: 14, color: "#fdf2d0", alpha: 0.95 });
      drawText(ctx, "gold apples = RECESS power — chase the pale staff!", cxm, cym + 38, { size: 11, color: "#fdf2d0", alpha: 0.65 });
    } else if (G.status === "dying") {
      drawText(ctx, "BUSTED!", cxm, cym - 6, { size: 34, color: "#ff6b5e", shadow: "rgba(0,0,0,.6)" });
    } else if (G.status === "bell") {
      drawText(ctx, "THE BELL RANG!", cxm, cym - 12, { size: 32, color: GOLD, shadow: "rgba(0,0,0,.6)" });
      drawText(ctx, "A+ · EVERY FACT MUNCHED", cxm, cym + 16, { size: 14, color: "#fdf2d0" });
    }
    if (G.fright > 0 && G.status === "playing") {
      const blink = G.fright < 2 && Math.floor(G.t * 6) % 2 === 0;
      if (!blink) drawText(ctx, "RECESS!", cxm, oy - 22, { size: 20, color: "#a8ecf2", shadow: "rgba(0,0,0,.55)" });
    }
    // live clock hands
    ctx.strokeStyle = "#241f3d"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(W / 2, 32);
    ctx.lineTo(W / 2 + Math.cos(G.t * 0.8 - Math.PI / 2) * 12, 32 + Math.sin(G.t * 0.8 - Math.PI / 2) * 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, 32);
    ctx.lineTo(W / 2 + Math.cos(G.t * 0.06 - Math.PI / 2) * 8, 32 + Math.sin(G.t * 0.06 - Math.PI / 2) * 8); ctx.stroke();
    if (DBG) {
      drawText(ctx, `state ${G.status} · facts ${G.facts}/${totalFacts} · wave ${G.wave} ${waveMode()} · fright ${G.fright.toFixed(1)} · bot ${BOT.on ? "ON" : "off"}`,
        ox + 4, oy + BH + 24, { size: 11, color: "#9fd4bb", align: "left", alpha: 0.75 });
    }
    ctx.drawImage(VIG, 0, 0);
    seasonTint(ctx, 0.05);
  }

  // ---- test API (harness) ---------------------------------------------------------
  // NOTE: the shared shell's "thumb carousel" hot-imports every genre module
  // with a ?v= cache-buster and runs that module's create() ON THIS PAGE to
  // shoot level thumbnails — including other agents' genres (their create()
  // can rewrite window.__TEST_API__ with their OWN closures when ?debugMaze is
  // in the URL). So the hooks mount with an owner stamp, and whenever anything
  // stomps them, the update loop re-installs ours on the next frame.
  function installTestAPI() {
    window.__TEST_API__ = {
      __owner__: level.id,
      describe: () => "maze-studyhall genre · Study Hall Scramble · autopilot playtest hooks",
      snapshot: () => ({
        status: G.status, t: +G.t.toFixed(1), score: G.score, lives: G.lives,
        facts: G.facts, totalFacts, fright: +G.fright.toFixed(1), bot: BOT.on,
        player: { fx: P.fx, fy: P.fy, tx: P.tx, ty: P.ty, prog: +P.prog.toFixed(2) },
        board: { ox, oy, T, COLS, ROWS },
        ghosts: ghosts.map((g) => ({
          who: g.spec.key, phase: g.phase, fright: g.fright, eaten: g.eaten,
          fx: g.fx, fy: g.fy, tx: g.tx, ty: g.ty, prog: +g.prog.toFixed(2),
          a: anchor(g),
        })),
      }),
      botStart: () => { BOT.on = true; return true; },
      botStop: () => { BOT.on = false; return true; },
      // scenario hooks for deterministic verification of the rarely-hit branches
      debug: () => ({
        eatApple: (c, r) => { const d = dots[wrapC(c) + "," + r]; if (d && !d.got) { eatAt(wrapC(c), r); return true; } return false; },
        devour: (keep = 1) => { let kept = 0; for (const k in dots) { const d = dots[k]; if (d.got || d.apple) continue; if (kept < keep) { kept++; continue; } d.got = true; G.facts--; G.score += d.v; } return G.facts; },
        teleportGhost: (idx, c, r) => {
          const g = ghosts[idx]; if (!g) return false;
          g.fx = c; g.fy = r; g.tx = null; g.prog = 0; g.script = null; g.done = null;
          g.phase = "roam"; g.eaten = false; g.fright = false; g.rev = false; g.wait = 9999;
          return true;
        },
        ghostToPlayer: (idx) => { const g = ghosts[idx]; if (!g) return false; g.fx = P.fx; g.fy = P.fy; g.tx = null; g.prog = 0; g.script = null; g.done = null; g.phase = "roam"; return true; },
        freezePlayer: () => { P.tx = null; P.ty = null; P.prog = 0; P.want = null; return true; },
      }),
    };
    window.__MAZE_RUNS__ = window.__MAZE_RUNS__ || [];
    window.__MAZE_DEATHS__ = window.__MAZE_DEATHS__ || [];
  }
  if (DBG || AP) installTestAPI();

  freshState();
  return { update, draw };
}
