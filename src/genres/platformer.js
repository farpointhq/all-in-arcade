// PLATFORMER genre — tile-based, data-driven, Route A procedural art only.
// (operator rule 2026-09-17: actors are hand-drawn canvas sprites — no emoji,
// no emoji fallbacks ever). Physics/logic untouched by the art pass.
import { W, H, clamp, drawCloud, drawText, drawBackdrop, SEASONS, seasonNow, seasonTint, sprite, blit } from "../core.js";

const T = 40; // tile size

// ---- Route A actor art (hand-drawn canvas sprites; no emoji, no files) -------
// Level 1 sits on the event-photo gradient, so every actor carries a deep-ink
// outline (beats BOTH the azure and rose bands) with a soft glow rim. Crimson
// mushroom runner + gold star coins keep the requested SMB-cloud identity.
const INK = "#1d1433";
const PI2 = Math.PI * 2;

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

// hero, baked at 72px: cream-stem face body + crimson spotted cap. `run` = stride.
function paintHero(g, w, h, run) {
  const cx = w / 2, ft = h - 5;
  g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = INK; g.lineWidth = 3;
  const fo = run ? 6 : 2;
  // feet
  g.fillStyle = "#94341f";
  g.beginPath(); g.ellipse(cx - 8 - fo * 0.5, ft - 2.5, 7.6, 4.6, 0, 0, PI2); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(cx + 8 + fo * 0.5, ft - 2.5, 7.6, 4.6, 0, 0, PI2); g.fill(); g.stroke();
  // stem
  const sg = g.createLinearGradient(0, ft - 46, 0, ft);
  sg.addColorStop(0, "#fff8e9"); sg.addColorStop(0.74, "#ffeccb"); sg.addColorStop(1, "#eed2a2");
  g.fillStyle = sg;
  rr(g, cx - 11.5, ft - 44, 23, 42, 10); g.fill(); g.stroke();
  // face
  g.fillStyle = INK;
  g.beginPath(); g.arc(cx - 4.6, ft - 30, 2.5, 0, PI2); g.fill();
  g.beginPath(); g.arc(cx + 5.4, ft - 30, 2.5, 0, PI2); g.fill();
  g.fillStyle = "#fff";
  g.beginPath(); g.arc(cx - 3.9, ft - 31.1, 0.9, 0, PI2); g.fill();
  g.beginPath(); g.arc(cx + 6.1, ft - 31.1, 0.9, 0, PI2); g.fill();
  g.fillStyle = "rgba(255,141,110,.5)";
  g.beginPath(); g.arc(cx - 8.8, ft - 24, 2.9, 0, PI2); g.fill();
  g.beginPath(); g.arc(cx + 9.6, ft - 24, 2.9, 0, PI2); g.fill();
  g.lineWidth = 2.3;
  g.beginPath(); g.arc(cx, ft - 28, 4.8, 0.22 * Math.PI, 0.78 * Math.PI); g.stroke();
  // cap: crimson dome, cream underside rim, spotted, ink-outlined
  const capG = g.createLinearGradient(0, ft - 70, 0, ft - 38);
  capG.addColorStop(0, "#ff8a6b"); capG.addColorStop(0.55, "#ef4a38"); capG.addColorStop(1, "#c22724");
  g.fillStyle = capG; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 27, ft - 40);
  g.bezierCurveTo(cx - 27, ft - 66, cx + 27, ft - 66, cx + 27, ft - 40);
  g.quadraticCurveTo(cx, ft - 33, cx - 27, ft - 40);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#ffe8bd";
  g.beginPath(); g.ellipse(cx, ft - 37.5, 14, 3.4, 0, 0, PI2); g.fill();
  g.fillStyle = "#fff4e0";
  for (const [ox, oy, r] of [[-15, -8, 5.2], [4, -14, 6.2], [16, -7, 4.4]]) {
    g.beginPath(); g.ellipse(cx + ox, ft - 47 + oy * 0.5, r, r * 0.82, 0.2, 0, PI2); g.fill();
  }
  g.fillStyle = "rgba(255,255,255,.55)";
  g.beginPath(); g.ellipse(cx - 13, ft - 57, 5.4, 2.6, -0.5, 0, PI2); g.fill();
}

const HERO_IDLE = sprite("p-hero-idle", 72, (g, w, h) => paintHero(g, w, h, false));
const HERO_RUN = sprite("p-hero-run", 72, (g, w, h) => paintHero(g, w, h, true));

// gold star collectible: glow rim + ink outline, reads on azure AND rose bands
const STAR_COIN = sprite("p-coin", 96, (g, w, h) => {
  const cx = w / 2, cy = h / 2, R = w * 0.4;
  const glow = g.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.3);
  glow.addColorStop(0, "rgba(255,231,120,.95)"); glow.addColorStop(0.6, "rgba(255,214,110,.25)"); glow.addColorStop(1, "rgba(255,214,110,0)");
  g.fillStyle = glow;
  g.beginPath(); g.arc(cx, cy, R * 1.3, 0, PI2); g.fill();
  const sg = g.createLinearGradient(0, cy - R, 0, cy + R);
  sg.addColorStop(0, "#ffe98d"); sg.addColorStop(0.55, "#ffc933"); sg.addColorStop(1, "#f0941b");
  g.fillStyle = sg; g.lineJoin = "round"; g.strokeStyle = INK; g.lineWidth = Math.max(3, w * 0.05);
  starPath(g, cx, cy, R, R * 0.42); g.fill(); g.stroke();
  g.fillStyle = "rgba(255,255,255,.85)";
  g.beginPath(); g.ellipse(cx - R * 0.16, cy - R * 0.24, R * 0.14, R * 0.2, -0.5, 0, PI2); g.fill();
});

// snow pickup (seasons mechanic): six-arm crystal with cool glow
const SNOW_CRYSTAL = sprite("p-snow", 96, (g, w, h) => {
  const cx = w / 2, cy = h / 2, R = w * 0.38;
  const glow = g.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.3);
  glow.addColorStop(0, "rgba(214,240,255,.95)"); glow.addColorStop(1, "rgba(214,240,255,0)");
  g.fillStyle = glow;
  g.beginPath(); g.arc(cx, cy, R * 1.3, 0, PI2); g.fill();
  g.strokeStyle = "#eef8ff"; g.lineWidth = w * 0.072; g.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    g.save(); g.translate(cx, cy); g.rotate((i * Math.PI) / 3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R); g.stroke();
    g.beginPath(); g.moveTo(0, -R * 0.58); g.lineTo(-R * 0.26, -R * 0.8); g.moveTo(0, -R * 0.58); g.lineTo(R * 0.26, -R * 0.8); g.stroke();
    g.beginPath(); g.moveTo(0, -R * 0.30); g.lineTo(-R * 0.15, -R * 0.44); g.moveTo(0, -R * 0.30); g.lineTo(R * 0.15, -R * 0.42); g.stroke();
    g.restore();
  }
  g.fillStyle = "#ffffff";
  g.beginPath(); g.arc(cx, cy, w * 0.055, 0, PI2); g.fill();
});

// waving gold pennant drawn live (cheap path ops) — replaces the goal glyph
function drawFlagCloth(ctx, x, y, t) {
  const W1 = 40, H1 = 22, N = 10;
  ctx.save();
  ctx.beginPath();
  const wave = (p) => Math.sin(t * 3.4 + p * 3.4) * 3.4 * (0.25 + p);
  for (let i = 0; i <= N; i++) {
    const p = i / N;
    i ? ctx.lineTo(x + p * W1, y + wave(p)) : ctx.moveTo(x + p * W1, y + wave(p));
  }
  for (let i = N; i >= 0; i--) {
    const p = i / N;
    ctx.lineTo(x + p * W1, y + H1 + wave(p));
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y, x + W1, y + H1);
  g.addColorStop(0, "#ffe27a"); g.addColorStop(1, "#ffb31e");
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.92)";
  starPath(ctx, x + W1 * 0.62, y + H1 * 0.52, 6.4, 2.7); ctx.fill();
  ctx.restore();
}

export const meta = {
  name: "Platformer",
  controls: "← → / A D move · SPACE / ↑ jump · reach the flag",
};

export function create(level, api) {
  const rows = level.data.rows;
  const cols = Math.max(...rows.map((r) => r.length));
  const worldW = cols * T, worldH = rows.length * T;
  const st = level.style || {};

  // parse tiles
  const solid = [], oneway = [], spikes = [], coins = [], snow = [];
  let spawn = { x: T * 1.5, y: T * 2 }, goal = { x: worldW - T * 2, y: T * 2 };
  rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) {
      const ch = row[c] || ".";
      const x = c * T, y = r * T;
      if (ch === "#") solid.push([c, r]);
      else if (ch === "=") oneway.push([c, r]);
      else if (ch === "^") spikes.push({ x: x + 5, y: y + 16, w: T - 10, h: T - 16 });
      else if (ch === "o") coins.push({ x: x + T / 2, y: y + T / 2, got: false });
      else if (ch === "%") snow.push({ x: x + T / 2, y: y + T / 2, got: false });
      else if (ch === "P") spawn = { x: x + T / 2, y: y + T / 2 };
      else if (ch === "G") goal = { x: x + T / 2, y: y + T };
    }
  });
  const solidSet = new Set(solid.map(([c, r]) => c + "," + r));
  const onewaySet = new Set(oneway.map(([c, r]) => c + "," + r));
  // group one-way cells into horizontal runs (one art blob per platform strip)
  const runs = [];
  for (const crr of oneway.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const prev = runs[runs.length - 1];
    if (prev && prev.r === crr[1] && prev.c1 === crr[0] - 1) prev.c1 = crr[0];
    else runs.push({ r: crr[1], c0: crr[0], c1: crr[0] });
  }

  const P = {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0, w: 24, h: 32,
    onGround: false, coyote: 0, buffer: 0, face: 1,
  };
  let hearts = 3, inv = 0, camX = 0, status = "playing", t = 0;

  // ---- snowball mechanic (Nicolas's season levels) -------------------------
  // melt = (0.008 + sun*0.045) × seasonMultiplier each second; snow adds
  // +0.07 (coins +0.055); below 34% the snowball is gone. style knobs:
  // mech:"snowball" | ballStart | sunHeight | sunClock | season (local override)
  const MECH = st.mech === "snowball";
  const seasonMul = st.season && SEASONS[st.season] ? SEASONS[st.season].melt : seasonNow().melt;
  let melt = st.ballStart ?? 0.62, sun = st.sunHeight ?? 0.35, sunRise = st.sunClock ?? 0.05;

  function tileAt(cx, cy) {
    const key = Math.floor(cx / T) + "," + Math.floor(cy / T);
    return { s: solidSet.has(key), o: onewaySet.has(key) };
  }

  function hurt(fromX) {
    if (inv > 0) return;
    hearts--;
    inv = 1.2;
    api.audio.sfx("hit");
    api.eng.shake(0.7);
    api.hud({ right: "♥".repeat(Math.max(0, hearts)) });
    if (hearts <= 0) { status = "lost"; api.audio.sfx("lose"); api.fail(); }
    else { P.vy = -7; P.vx = (P.x < fromX ? -1 : 1) * 3; }
  }

  function respawn() {
    hearts--;
    api.hud({ right: "♥".repeat(Math.max(0, hearts)) });
    if (hearts <= 0) { status = "lost"; api.audio.sfx("lose"); api.fail(); return; }
    P.x = spawn.x; P.y = spawn.y; P.vx = 0; P.vy = 0; inv = 1.2;
  }

  function update(dt, input) {
    if (status !== "playing") return;
    t += dt;
    inv = Math.max(0, inv - dt);
    const dtf = dt * 60; // frame-normalized

    // horizontal
    const ax = 0.55 * dtf;
    if (input.left()) { P.vx -= ax; P.face = -1; }
    if (input.right()) { P.vx += ax; P.face = 1; }
    if (!input.left() && !input.right()) P.vx *= P.onGround ? 0.8 : 0.95;
    P.vx = clamp(P.vx, -3.6, 3.6);

    // jump (coyote + buffer)
    P.coyote = P.onGround ? 0.09 : Math.max(0, P.coyote - dt);
    P.buffer = input.jumpJust() ? 0.12 : Math.max(0, P.buffer - dt);
    if (P.buffer > 0 && P.coyote > 0) {
      P.vy = -(MECH ? 11.6 + melt * 1.4 : 12.4); P.coyote = 0; P.buffer = 0;
      api.audio.sfx("jump");
    }
    // variable jump height: releasing jump early cuts the arc
    if (P.vy < -4 && !input.up() && !input.downKey()) P.vy = -4;
    P.vy += 0.55 * dtf;
    P.vy = Math.min(P.vy, 14);

    // move + collide X
    P.x += P.vx * dtf;
    for (const [c, r] of [...solid]) {
      const tx = c * T, ty = r * T;
      if (P.x + P.w / 2 > tx && P.x - P.w / 2 < tx + T && P.y + P.h / 2 > ty && P.y - P.h / 2 < ty + T) {
        P.x = P.vx > 0 ? tx - P.w / 2 : tx + T + P.w / 2;
        P.vx = 0;
      }
    }
    P.x = clamp(P.x, P.w / 2, worldW - P.w / 2);

    // move + collide Y
    const prevFeet = P.y + P.h / 2;
    P.y += P.vy * dtf;
    P.onGround = false;
    const checkCols = new Set();
    for (let cx = Math.floor((P.x - P.w / 2) / T); cx <= Math.floor((P.x + P.w / 2) / T); cx++) checkCols.add(cx);
    for (const c of checkCols) {
      for (const r of [Math.floor((P.y - P.h / 2) / T), Math.floor((P.y + P.h / 2) / T)]) {
        const isS = solidSet.has(c + "," + r);
        const isO = onewaySet.has(c + "," + r);
        if (!isS && !isO) continue;
        const ty = r * T;
        if (isO && (P.vy < 0 || prevFeet > ty + 4)) continue;
        if (P.x + P.w / 2 > c * T && P.x - P.w / 2 < c * T + T && P.y + P.h / 2 > ty && P.y - P.h / 2 < ty + T) {
          if (P.vy > 0) { P.y = ty - P.h / 2; P.onGround = true; }
          else P.y = ty + T + P.h / 2;
          P.vy = 0;
        }
      }
    }

    // hazards
    if (P.y > worldH + 160) { respawn(); return; }
    if (inv <= 0) for (const s of spikes) {
      if (P.x + P.w / 2 > s.x && P.x - P.w / 2 < s.x + s.w && P.y + P.h / 2 > s.y && P.y - P.h / 2 < s.y + s.h) { hurt(s.x); break; }
    }
    if (status !== "playing") return;

    // coins
    for (const c of coins) {
      if (!c.got && Math.abs(P.x - c.x) < 26 && Math.abs(P.y - c.y) < 30) {
        c.got = true;
        api.audio.sfx("coin");
        if (MECH) melt = clamp(melt + 0.055, 0, 1.35);
      }
    }
    const gotCount = coins.filter((c) => c.got).length;
    for (const s of snow) {
      if (!s.got && Math.abs(P.x - s.x) < 24 && Math.abs(P.y - s.y) < 26) {
        s.got = true;
        api.audio.sfx("coin");
        if (MECH) melt = clamp(melt + 0.07, 0, 1.35);
      }
    }
    if (MECH) {
      sun = clamp(sun + dt * sunRise, 0, 1);
      const meltRate = (0.008 + sun * 0.045) * seasonMul;
      melt = clamp(melt - meltRate * dt, 0, 1.35);
      if (melt <= 0.34) {
        status = "lost"; api.audio.sfx("lose");
        api.fail("La boule de neige a fondu !");
        return;
      }
    }

    // goal
    if (Math.abs(P.x - goal.x) < 26 && P.y > goal.y - 90 && P.y < goal.y + 10) {
      status = "won";
      api.audio.sfx("win");
      api.complete({ coins: gotCount, total: coins.length });
      return;
    }

    // camera + hud
    camX = clamp(P.x - W * 0.42, 0, Math.max(0, worldW - W));
    api.hud({ mid: `★ ${gotCount}/${coins.length}` + (MECH ? ` · BALL ${Math.round(melt * 100)}%` : ""), right: "♥".repeat(Math.max(0, hearts)) });
  }

  function draw(ctx) {
    drawBackdrop(ctx, st, t, 0.6, camX);
    if (MECH) {
      // the living sun: rises as the level ages, brightness shows the melt pressure
      // (procedural: layered radial glow + slowly wheeling rays — no emoji sun)
      const sy = H * (0.08 + (1 - sun) * 0.3), sx = W * 0.85, sr = 34 + sun * 22;
      const sg = ctx.createRadialGradient(sx, sy, 3, sx, sy, sr * 1.7);
      sg.addColorStop(0, "rgba(255,246,205,.95)");
      sg.addColorStop(0.5, "rgba(255,222,140,.5)");
      sg.addColorStop(1, "rgba(255,214,110,0)");
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff3bd";
      ctx.beginPath(); ctx.arc(sx, sy, sr * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,238,168,.6)"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.25, rr2 = sr + 5 + 3 * Math.sin(t * 2 + i);
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * (sr + 2), sy + Math.sin(a) * (sr + 2));
        ctx.lineTo(sx + Math.cos(a) * rr2, sy + Math.sin(a) * rr2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(-camX, 0);

    const c0 = Math.floor(camX / T) - 1, c1 = c0 + Math.ceil(W / T) + 3;
    for (const [c, r] of solid) {
      if (c < c0 || c > c1) continue;
      const x = c * T, y = r * T;
      ctx.fillStyle = st.ground || "#8a5a2b";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = st.grass || "#3fae4a";
      ctx.fillRect(x, y, T, 9);
    }
    for (const run of runs) {
      if (run.c1 < c0 || run.c0 > c1) continue;
      const x0 = run.c0 * T, x1 = (run.c1 + 1) * T;
      if (st.platform === "cloud") {
        drawCloud(ctx, (x0 + x1) / 2, run.r * T - 6, x1 - x0 + 10);
      } else {
        ctx.fillStyle = st.accent || "#ffd23e";
        ctx.fillRect(x0, run.r * T + 2, x1 - x0, 10);
        ctx.fillStyle = "rgba(255,255,255,.4)";
        ctx.fillRect(x0, run.r * T + 2, x1 - x0, 3);
      }
    }
    for (const s of spikes) {
      // gold gradient spike with ink outline (contrast on the photo band)
      const sg = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
      sg.addColorStop(0, "#ffe484"); sg.addColorStop(1, "#ff9d2d");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + s.h); ctx.lineTo(s.x + s.w / 2, s.y); ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    }
    for (const c of coins) {
      if (c.got) continue;
      const s = 26 + Math.sin(t * 5 + c.x) * 4;
      blit(ctx, STAR_COIN, c.x, c.y, s, { rot: Math.sin(t * 4 + c.x * 0.7) * 0.22 });
    }
    for (const s of snow) {
      if (s.got) continue;
      const w = 24 + Math.sin(t * 4 + s.x) * 3;
      blit(ctx, SNOW_CRYSTAL, s.x, s.y, w, { rot: t * 0.5 + s.x * 0.1 });
    }
    // goal flag — ink-outlined waving pennant replaces the old goal glyph
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(goal.x - 2, goal.y - 78, 4, 78);
    drawFlagCloth(ctx, goal.x + 3, goal.y - 77, t);
    drawText(ctx, level.title, goal.x, goal.y - 96, { size: 15, color: st.accent || "#fff" });

    // player
    if (inv <= 0 || Math.floor(t * 14) % 2 === 0) {
      const lean = clamp(P.vx * 0.06, -0.18, 0.18);
      if (MECH) {
        const R = 11 + melt * 13;
        const g = ctx.createRadialGradient(P.x - R * 0.3, P.y - R * 0.3, R * 0.25, P.x, P.y, R);
        g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#cfe4ff");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(P.x, P.y, R, 0, Math.PI * 2); ctx.fill();
      } else {
        // hero: baked mushroom-runner, contact shadow, run/idle frames, facing flip
        const moving = Math.abs(P.vx) > 0.5 && P.onGround;
        const hero = moving && Math.floor(t * 9) % 2 === 1 ? HERO_RUN : HERO_IDLE;
        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = "#10122e";
        ctx.beginPath(); ctx.ellipse(P.x, P.y + 18, 13, 4.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        blit(ctx, hero, P.x, P.y, 40, { rot: lean, flip: P.face === -1 ? -1 : 1 });
      }
    }
    ctx.restore();
    seasonTint(ctx);

    if (t < 3.2) drawText(ctx, level.objective || "", W / 2, 468, { size: 20, color: "#fff", alpha: t > 2.6 ? (3.2 - t) / 0.6 : 1, shadow: "rgba(0,0,0,.8)" });
  }

  return { update, draw, status: () => status };
}
