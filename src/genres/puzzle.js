// PUZZLE genre — grid Sokoban. Push every crate onto a glowing target.
// data.rows: '#' wall · '.' target · 'o' crate · '@' player · ' ' floor ('O' crate-on-target, '+' player-on-target).
import { W, H, hash, drawText, drawBackdrop, sprite, blit } from "../core.js";

// ---- Route A actor art (hand-drawn canvas sprites; no emoji anywhere) --------
const INK = "#12233d", PI2 = Math.PI * 2;

function rr(g, x, y, w, h, rad) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, rad); return; }
  g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
  g.lineTo(x + rad, y + h); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
}

function starPath(g, cx, cy, outer, inner, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? inner : outer;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

// glass crate: pale ice panel, bevel sheen, ink outline — readable on pale floors
const CRATE = sprite("q-crate", 112, (g, w, h) => {
  const m = w * 0.08, S = w - m * 2, R = w * 0.14;
  const grad = g.createLinearGradient(0, m, 0, m + S);
  grad.addColorStop(0, "#eaf8ff"); grad.addColorStop(0.5, "#c2e7fb"); grad.addColorStop(1, "#8fc2e6");
  g.lineJoin = "round"; g.strokeStyle = INK; g.lineWidth = w * 0.05;
  g.fillStyle = grad;
  rr(g, m, m, S, S, R); g.fill(); g.stroke();
  g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = w * 0.032;
  rr(g, m + S * 0.10, m + S * 0.10, S * 0.8, S * 0.10, R * 0.5); g.stroke();
  g.fillStyle = "rgba(255,255,255,.4)";
  g.beginPath();
  g.moveTo(m + S * 0.16, m + S);
  g.lineTo(m + S * 0.52, m);
  g.lineTo(m + S * 0.72, m);
  g.lineTo(m + S * 0.36, m + S);
  g.closePath(); g.fill();
  g.fillStyle = INK;
  for (const [rx, ry] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) {
    g.beginPath(); g.arc(m + S * rx, m + S * ry, w * 0.032, 0, PI2); g.fill();
  }
});

// the packer: little hauler pushing crates — beanie, parka, boots, push arms
const PORTER = sprite("q-porter", 72, (g, w, h) => {
  const cx = w * 0.5, ft = h - 4;
  g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = INK; g.lineWidth = w * 0.05;
  g.fillStyle = "#4d3423";
  g.beginPath(); g.ellipse(cx - w * 0.14, ft - h * 0.055, w * 0.13, h * 0.06, 0, 0, PI2); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(cx + w * 0.15, ft - h * 0.05, w * 0.13, h * 0.06, 0, 0, PI2); g.fill(); g.stroke();
  const bg = g.createLinearGradient(0, ft - h * 0.62, 0, ft);
  bg.addColorStop(0, "#ffe08e"); bg.addColorStop(1, "#e08b2d");
  g.fillStyle = bg;
  rr(g, cx - w * 0.14, ft - h * 0.58, w * 0.28, h * 0.47, h * 0.14); g.fill(); g.stroke();
  g.fillStyle = "#ff5f6d";
  g.beginPath(); g.arc(cx + w * 0.02, ft - h * 0.72, h * 0.12, 0, PI2); g.fill(); g.stroke();
  g.fillStyle = "#fff";
  g.beginPath(); g.arc(cx + w * 0.02, ft - h * 0.86, h * 0.032, 0, PI2); g.fill();
  g.fillStyle = INK;
  g.beginPath(); g.arc(cx + w * 0.05, ft - h * 0.72, h * 0.014, 0, PI2); g.fill();
  g.beginPath(); g.arc(cx + w * 0.10, ft - h * 0.72, h * 0.014, 0, PI2); g.fill();
  g.fillStyle = "rgba(23,52,84,.2)";
  g.beginPath(); g.ellipse(cx + w * 0.09, ft - h * 0.60, h * 0.035, h * 0.02, 0, 0, PI2); g.fill();
  g.beginPath(); g.moveTo(cx - w * 0.10, ft - h * 0.42); g.lineTo(cx + w * 0.30, ft - h * 0.52); g.stroke();
});

export const meta = {
  name: "Puzzle",
  controls: "← ↑ → ↓ push crates · Z undo · R restart",
};

export function create(level, api) {
  const st = level.style || {};
  const rows = level.data.rows;
  const rowsN = rows.length;
  const cols = Math.max(...rows.map((r) => r.length));
  const T = Math.min(76, Math.floor((H * 0.78) / rowsN), Math.floor((W * 0.6) / cols));

  let walls, targets, crates, player, moves, pushes, status, winTimer, undoStack, anim;
  let queued = null, heldCd = 0, fx = [], hintT = 0;
  let t = 0;

  const dirOf = (l, r, u, dn) => (l && { dx: -1, dy: 0 }) || (r && { dx: 1, dy: 0 }) || (u && { dx: 0, dy: -1 }) || (dn && { dx: 0, dy: 1 }) || null;
  const dirsJust = (input) => dirOf(
    input.just("ArrowLeft") || input.just("KeyA"), input.just("ArrowRight") || input.just("KeyD"),
    input.just("ArrowUp") || input.just("KeyW"), input.just("ArrowDown") || input.just("KeyS"));
  const held = (input) => dirOf(input.left(), input.right(), input.up(), input.downKey());

  function reset() {
    walls = new Set(); targets = new Set(); crates = []; player = null;
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < cols; rx++) {
        const ch = row[rx] || " ";
        if (ch === "#") walls.add(rx + "," + ry);
        if (ch === "." || ch === "*" || ch === "+") targets.add(rx + "," + ry);
        if (ch === "o" || ch === "*") crates.push({ x: rx, y: ry });
        if (ch === "@" || ch === "+") player = { x: rx, y: ry };
      }
    });
    moves = 0; pushes = 0; status = "playing"; winTimer = 0; undoStack = []; anim = null; queued = null; fx = []; hintT = 0;
    api.hud({ mid: `CRATES 0/${crates.length} placed`, right: "0 moves" });
  }
  reset();

  const wallAt = (x, y) => walls.has(x + "," + y);
  const crateAt = (x, y) => crates.findIndex((c) => c.x === x && c.y === y);

  function tryMove(dx, dy) {
    const nx = player.x + dx, ny = player.y + dy;
    if (wallAt(nx, ny)) return;
    const ci = crateAt(nx, ny);
    const rec = { px: player.x, py: player.y, crate: -1, cx: 0, cy: 0 };
    if (ci >= 0) {
      const bx = nx + dx, by = ny + dy;
      if (wallAt(bx, by) || crateAt(bx, by) >= 0) { api.audio.sfx("hit"); api.eng.shake(0.15); return; }
      rec.crate = ci; rec.cx = nx; rec.cy = ny;
      const wasOn = targets.has(nx + "," + ny);
      crates[ci].x = bx; crates[ci].y = by;
      if (targets.has(bx + "," + by) && !wasOn) { api.audio.sfx("coin"); landFx(bx, by, 6); }
      pushes++;
      api.audio.sfx("push");
    }
    undoStack.push(rec);
    player.x = nx; player.y = ny;
    moves++;
    anim = { dur: 0.13, p: 0, dx, dy, box: rec.crate, px: rec.px, py: rec.py, cx: rec.crate >= 0 ? rec.cx : nx, cy: rec.crate >= 0 ? rec.cy : ny };

    // win check
    const allOn = crates.every((c) => targets.has(c.x + "," + c.y));
    if (allOn && status === "playing") {
      status = "cleared";
      api.audio.sfx("win");
      for (const c of crates) landFx(c.x, c.y, 14, true);
    }
    hud();
  }

  function undo() {
    const r = undoStack.pop();
    if (!r) return;
    if (r.crate >= 0) { crates[r.crate].x = r.cx; crates[r.crate].y = r.cy; }
    player.x = r.px; player.y = r.py;
    moves++;
    api.audio.sfx("select");
    if (status === "cleared") status = "playing";
    hud();
  }

  const cornered = (x, y) => (wallAt(x - 1, y) || wallAt(x + 1, y)) && (wallAt(x, y - 1) || wallAt(x, y + 1));
  function landFx(x, y, n, big = false) {
    const seed = (x * 731 + y * 8693 + Math.floor(t * 61)) >>> 0;
    for (let i = 0; i < n; i++) {
      const a = hash(seed + i) * Math.PI * 2;
      const sp = (big ? 70 : 28) + hash(seed + i * 3) * (big ? 110 : 46);
      fx.push({ x: (x + 0.5) * T, y: (y + 0.5) * T, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (big ? 38 : 8), age: 0, life: big ? 0.95 : 0.5, star: hash(seed + i * 7) > 0.45 });
    }
  }

  function hud() {
    const on = crates.filter((c) => targets.has(c.x + "," + c.y)).length;
    api.hud({ mid: `CRATES ${on}/${crates.length} placed`, right: `${moves} moves · ${pushes} pushes` });
  }

  function update(dt, input) {
    if (status === "lost") return;
    t += dt;
    if (anim) { anim.p = Math.min(1, (anim.p + dt / anim.dur) * 1); if (anim.p >= 1) anim = null; }
    for (const p of fx) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 110 * dt; }
    fx = fx.filter((p) => p.age < p.life);
    heldCd = Math.max(0, heldCd - dt);

    if (status === "cleared") {
      winTimer += dt;
      if (winTimer > 0.85) { status = "won"; api.complete({ moves, pushes }); }
      return;
    }
    if (api.eng.input.just("KeyZ")) { undo(); return; }
    if (api.eng.input.just("KeyR")) { reset(); return; }

    // stuck-crate assist (only while playing, only after a beat — informative, never nagging)
    hintT = crates.some((c) => !targets.has(c.x + "," + c.y) && cornered(c.x, c.y)) ? hintT + dt : 0;

    if (anim) { // slide in flight — buffer the last pressed direction, play it right after landing
      if (input.anyJust()) queued = dirsJust(input) || queued;
      return;
    }
    const d = dirsJust(input) || queued || (heldCd <= 0 && held(input)) || null;
    queued = null;
    if (d) { tryMove(d.dx, d.dy); heldCd = 0.02; }
  }

  function draw(ctx) {
    drawBackdrop(ctx, st, t, 0.5, t);
    const ox = (W - cols * T) / 2, oy = (H - rowsN * T) / 2 + 10;
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    const covered = new Set(crates.map((c) => c.x + "," + c.y));

    for (let rx = 0; rx < cols; rx++) {
      for (let ry = 0; ry < rowsN; ry++) {
        const x = ox + rx * T, y = oy + ry * T;
        if (walls.has(rx + "," + ry)) {
          ctx.fillStyle = st.wall || "#6b8fb3";
          rounded(ctx, x + 1, y + 1, T - 2, T - 2, 10);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.14)";
          rounded(ctx, x + 4, y + 4, T - 8, 8, 5); ctx.fill();
          continue;
        }
        ctx.fillStyle = ((rx + ry) % 2 ? st.floor : "rgba(23,52,84,.09)") || st.floor || "#cfe9ff";
        rounded(ctx, x + 1, y + 1, T - 2, T - 2, 10);
        ctx.fill();
        if (targets.has(rx + "," + ry)) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 4 + rx + ry);
          if (covered.has(rx + "," + ry)) {
            // occupied pad: bright soft pool under the crate
            const g = ctx.createRadialGradient(x + T / 2, y + T / 2, 2, x + T / 2, y + T / 2, T * 0.5);
            g.addColorStop(0, "rgba(140,224,255,.5)");
            g.addColorStop(1, "rgba(140,224,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, T * 0.5, 0, Math.PI * 2); ctx.fill();
          } else {
            // empty pad: inward-pulsing ring
            ctx.strokeStyle = st.target || "#7be3ff";
            ctx.globalAlpha = 0.35 + pulse * 0.45;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, T * 0.3, T * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    // animated positions
    const animP = anim ? (1 - Math.pow(1 - anim.p, 3)) : 1;
    for (let ci = 0; ci < crates.length; ci++) {
      const c = crates[ci];
      let x = c.x, y = c.y;
      if (anim && anim.crate === ci) {
        x = anim.cx + (c.x - anim.cx) * animP;
        y = anim.cy + (c.y - anim.cy) * animP;
      }
      const on = targets.has(c.x + "," + c.y);
      if (on) {
        const g = ctx.createRadialGradient(ox + (x + 0.5) * T, oy + (y + 0.5) * T, 2, ox + (x + 0.5) * T, oy + (y + 0.5) * T, T * 0.58);
        g.addColorStop(0, "rgba(140,224,255,.45)");
        g.addColorStop(1, "rgba(140,224,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ox + (x + 0.5) * T, oy + (y + 0.5) * T, T * 0.58, 0, Math.PI * 2); ctx.fill();
      }
      drawGlyphTile(ctx, ox + x * T, oy + y * T, T, "rgba(23,52,84,.28)");
      blit(ctx, CRATE, ox + (x + 0.5) * T, oy + (y + 0.5) * T, T * 0.80, { rot: anim && anim.crate === ci ? Math.sin(anim.p * Math.PI) * 0.06 : 0 });
      if (on) {
        // locked-in star pip above the corner — no emoji overlays anymore
        ctx.fillStyle = "#ffb61f";
        starPath(ctx, ox + (x + 0.80) * T, oy + (y + 0.16) * T, T * 0.09, T * 0.038);
        ctx.fill();
      }
    }
    let px = player.x, py = player.y;
    if (anim) {
      px = anim.px + (player.x - anim.px) * animP;
      py = anim.py + (player.y - anim.py) * animP;
    }
        ctx.fillStyle = "rgba(23,52,84,.30)";
        ctx.beginPath(); ctx.ellipse(ox + (px + 0.5) * T, oy + (py + 0.5) * T + T * 0.18, T * 0.30, T * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        blit(ctx, PORTER, ox + (px + 0.5) * T, oy + (py + 0.42) * T, T * 0.62, { rot: anim ? ((player.x - anim.px) || (player.y - anim.py)) * -0.08 : 0 });

    // sparkle particles (landing + win burst)
    for (const p of fx) {
      const k = 1 - p.age / p.life;
      if (p.star) {
        // tiny painted sparkle (Route A)
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, k));
        ctx.fillStyle = "#ffe98d";
        starPath(ctx, p.x, p.y, 4.4 + 4.4 * k, 1.7 + 1.7 * k);
        ctx.fill();
        ctx.restore();
      }
      else {
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // gentle assist for cornered crates — appears after a beat, never nags
    if (status === "playing" && hintT > 2.5) {
      const a = Math.min(1, (hintT - 2.5) / 0.5) * (0.6 + 0.3 * Math.sin(t * 3));
        drawText(ctx, "Cornered crate? Z to undo · R to restart", W / 2, H - 14, { size: 14, color: "#fff", alpha: a, shadow: "rgba(0,0,0,.75)" });
    }

    if (t < 3.4) drawText(ctx, level.objective || "", W / 2, H - 34, { size: 18, color: "#fff", alpha: t > 2.8 ? (3.4 - t) / 0.6 : 1, shadow: "rgba(0,0,0,.8)" });
    if (crates.length === 0) { status = "lost"; api.fail(`${level.id} has no crates — level data error`); }
  }

  function drawGlyphTile(ctx, x, y, T, color) {
    // soft ice-tray shadow that keeps pale emoji crates readable on pale floors
    ctx.fillStyle = color;
    rounded(ctx, x + T * 0.16, y + T * 0.28, T * 0.68, T * 0.55, T * 0.14);
    ctx.fill();
  }

  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
    }
    ctx.closePath();
  }

  return { update, draw, status: () => status, debug: () => ({ player, crates: crates.map((c) => [c.x, c.y]), moves, pushes, undoDepth: undoStack.length, fxCount: fx.length }) };
}
