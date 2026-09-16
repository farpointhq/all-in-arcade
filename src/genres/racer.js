// RACER genre — Outrun-style pseudo-3D segment renderer, data-driven from level.json.
// Track: [{n, curve, hill}] segments; palms/traffic generated from level data;
// level PNG sprites (L02) with procedural Route A fallbacks — no emoji glyphs.
// Booth tuning (L02 Neon Coast GP): traffic AI keeps lane spacing + speed tiers,
// curve-warning signs, speed lines, loop-closed hills, capped sprite sizes, crash FX.
import { W, H, clamp, drawText, drawBackdrop, hash, fmtTime, sprite, blit } from "../core.js";

// Sprite helper: draws a transparent PNG (bottom-anchored at (x,y)) with rotation/flip.
// When the image cannot load, renders the given procedural painter instead —
// REMIX LEVELS NEVER SHOW AN EMOJI (operator rule: no emoji fallbacks, ever).
function drawSprite(ctx, im, x, yAtGround, h, opts = {}) {
  if (im && im.ok) {
    const aspect = im.width / im.height;
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.translate(x, yAtGround - (opts.sink || 0));
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.flip) ctx.scale(-1, 1);
    ctx.drawImage(im, (-h * aspect) / 2, -h, h * aspect, h);
    ctx.restore();
  } else if (opts.paint) {
    const key = opts.paintKey + "@" + Math.max(4, Math.round(h / 6) * 6);
    const c = sprite(key, Math.max(4, Math.round(h * (opts.paintAspect || 1))), (g, gw, gh) => opts.paint(g, gw, gh));
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.translate(x, yAtGround - (opts.sink || 0));
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.flip) ctx.scale(-1, 1);
    ctx.drawImage(c, -c.width / 2, -c.height);
    ctx.restore();
  }
}

// ---- procedural fallback painters (Route A: used only while a level PNG is missing)
const INK = "#10061f";
const FP = {
  // diamond warning roadsign: post + gold chevron (the curve telegraph, now real art)
  sign: (g, w, h) => {
    g.lineJoin = "round"; g.lineCap = "round";
    g.strokeStyle = "#6b5f4e";
    g.lineWidth = w * 0.075;
    g.beginPath(); g.moveTo(w * 0.5, h); g.lineTo(w * 0.5, h * 0.56); g.stroke();
    const cx = w * 0.5, cy = h * 0.34, r = w * 0.30;
    g.fillStyle = "#ffd23e"; g.strokeStyle = "#241a10"; g.lineWidth = w * 0.05;
    g.beginPath(); g.ellipse(cx, cy, r * 1.0, r * 0.95, 0, 0, Math.PI * 2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#241a10";
    g.beginPath();
    g.moveTo(cx - r * 0.34, cy + r * 0.22);
    g.lineTo(cx + r * 0.28, cy - r * 0.02);
    g.lineTo(cx - r * 0.44, cy - r * 0.24);
    g.closePath();
    g.fill();
  },
  palm: (g, w, h) => {
    g.lineCap = "round";
    const cw = w, baseY = h, th = h * 0.62;
    // trunk: curved golden-sand arc
    g.strokeStyle = "#a37037"; g.lineWidth = w * 0.09;
    g.beginPath(); g.moveTo(cw * 0.5, baseY);
    g.quadraticCurveTo(cw * 0.42, baseY - th * 0.55, cw * 0.56, baseY - th);
    g.stroke();
    // fronds: five arcs radiating from the crown
    const tx = cw * 0.56, ty = baseY - th;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.95 + (i / 4) * Math.PI * 1.05;
      g.strokeStyle = i % 2 ? "#2f8a53" : "#3aa463"; g.lineWidth = w * 0.055;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + Math.cos(a) * h * 0.22, ty + Math.sin(a) * h * 0.22, tx + Math.cos(a) * h * 0.34, ty - Math.sin(-a) * h * 0.10);
      g.stroke();
    }
  },
  // three lane-tier traffic silhouettes (rear view) — fast wedge / mid sedan / slow van
  cars: [
    (g, w, h) => drawCar(g, w, h, "#ff2d8f", 0.62, 0.30),
    (g, w, h) => drawCar(g, w, h, "#3ddcff", 0.72, 0.34),
    (g, w, h) => drawCar(g, w, h, "#6bffb0", 0.86, 0.42),
  ],
  player: (g, w, h) => drawCar(g, w, h, "#ffe066", 0.80, 0.34, true),
};
function drawCar(g, w, h, neon, widthF, heightF, isPlayer) {
  const cw = w * widthF, cx = w / 2, top = h * (1 - heightF);
  g.lineJoin = "round";
  // shadowed tires
  g.fillStyle = "#0c0416";
  for (const sx of [cx - cw * 0.4, cx + cw * 0.4]) {
    g.beginPath(); g.ellipse(sx, h * 0.96, w * 0.055, h * 0.045, 0, 0, Math.PI * 2); g.fill();
  }
  // body slab with cabin notch + tail-glow strip
  const grad = g.createLinearGradient(0, top, 0, h * 0.94);
  grad.addColorStop(0, isPlayer ? "#ff3d9a" : "#241242");
  grad.addColorStop(1, "#160a2e");
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(cx - cw / 2, top, cw, h * 0.94 - top, cw * 0.18);
  g.fill();
  g.strokeStyle = INK; g.lineWidth = w * 0.03; g.stroke();
  // rear window
  g.fillStyle = "rgba(190,220,255,.5)";
  g.beginPath(); g.roundRect(cx - cw * 0.30, top + (h * 0.94 - top) * 0.12, cw * 0.60, (h * 0.94 - top) * 0.36, cw * 0.10); g.fill();
  // taillights + neon glow line
  g.fillStyle = neon; g.shadowColor = neon; g.shadowBlur = w * 0.10;
  g.beginPath(); g.roundRect(cx - cw * 0.36, h * 0.82, cw * 0.22, h * 0.05, 3); g.fill();
  g.beginPath(); g.roundRect(cx + cw * 0.36 - cw * 0.22, h * 0.82, cw * 0.22, h * 0.05, 3); g.fill();
  g.shadowBlur = 0;
}

// soft contact shadow under a sprite (grounds everything on the road/ground)
function spriteShadow(ctx, x, y, w, alpha = 0.4) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#07021a";
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, w * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const SEG_LEN = 6;            // world units per segment
const ROAD_W = 60;            // road half-width in world units (10× SEG_LEN, like classic Outrun demos)
const CAM_D = 0.84;           // camera depth (1/tan(fov/2))
const CAM_H = 30;             // camera height above road
const DRAW = 88;              // segments drawn ahead
const CURVE_K = 0.0045;       // level curve units → lateral bend
const HILL_K = 0.34;          // level hill units → elevation amplitude
const HORIZON_Y = H * 0.52;
const MAX_SPEED = 94;
const LANE = [-0.55, 0, 0.55];// traffic lanes (offset in road half-widths): left=fast, right=slow
const CAR_CRUISE = [44, 34, 25]; // base cruise speed per lane tier (fast lane is left)
const CAR_GAP = 24;           // min same-lane follow gap (world units) — no crawl-blobs
const SPRITE_CAP = 130;       // max decor px size (whoosh past camera, no full-screen emoji)
const CAR_CAP = 78;           // max traffic px size

export const meta = {
  name: "Racer",
  controls: "↑ accelerate · ← → steer · ↓ brake · dodge traffic · reach the finish",
};

export function create(level, api) {
  const st = level.style || {};

  // ---- sprite set: transparent PNGs from level style; emoji fallback until loaded ----
  const SPR = st.sprites || {};
  const imgCache = new Map();
  const loadImg = (src) => {
    if (!src) return null;
    let im = imgCache.get(src);
    if (!im) {
      im = new Image();
      im.onload = () => (im.ok = true);
      im.onerror = () => (im.bad = true);
      im.src = src;
      imgCache.set(src, im);
    }
    return im;
  };
  const SPRITES = {
    player: loadImg(SPR.player),
    palm: loadImg(SPR.palm),
    signL: loadImg(SPR.signLeft),
    signR: loadImg(SPR.signRight),
    lane: [loadImg(SPR.trafficFast), loadImg(SPR.trafficMid), loadImg(SPR.trafficSlow)],
  };

  // ---- build track (hills close the loop: elevation returns to 0 at the seam) ----
  const blocks = level.data.segments || [{ n: 120, curve: 0, hill: 0 }];
  const hillSum = blocks.reduce((a, b) => a + (b.hill || 0), 0);
  const pad = hillSum / Math.max(1, blocks.length); // spread correction over all blocks
  const segs = [];
  {
    let y = 0;
    for (const s of blocks) {
      const dy = (((s.hill || 0) - pad) * HILL_K) / Math.max(1, s.n);
      for (let i = 0; i < s.n; i++) {
        y += dy;
        segs.push({ curve: s.curve || 0, y });
      }
    }
  }
  const N = segs.length;
  const total = N * SEG_LEN;
  const palmEvery = level.data.palmEvery || 9;
  const signEvery = level.data.signEvery || 37;

    // telegraph hard curves: warning sign well before every hard block start (rubric: ≥1.5s
    // readable at top speed ⇒ 24 segments back ≈ 1.6 s at 94 u/s)
    const warns = new Map(); // segIdx -> side
    {
      let acc = 0;
      for (const b of blocks) {
        if (Math.abs(b.curve || 0) >= 15) {
          const at = (acc - 24 + N) % N;
          warns.set(at, (b.curve || 0) > 0 ? 1 : -1);
        }
        acc += b.n;
      }
    }

  const decorAt = (i) => {
    if (warns.has(i)) return { kind: "sign", spr: warns.get(i) > 0 ? SPRITES.signR : SPRITES.signL, paint: FP.sign, paintKey: "r-sign", side: warns.get(i), off: 1.5, bigness: 0.26, cap: SPRITE_CAP };
    if (i % palmEvery === 0) return { kind: "palm", spr: SPRITES.palm, paint: FP.palm, paintKey: "r-palm", side: hash(i * 3) < 0.5 ? -1 : 1, off: 1.55 + hash(i) * 0.9, bigness: 0.38, cap: SPRITE_CAP, flip: hash(i * 7) < 0.5 };
    if (i % signEvery === 0) return { kind: "sign", spr: SPRITES.signR, paint: FP.sign, paintKey: "r-sign", side: 1, off: 1.4, bigness: 0.22, cap: SPRITE_CAP };
    return null;
  };

  // ---- traffic: lane-tiered speeds, evenly spread, spaced apart, never at the start ----
  const cars = [];
  {
    const count = level.data.trafficCount || 6;
    for (let i = 0; i < count; i++) {
      const lane = i % 3;
      const jitter = 0.85 + hash(i + 5) * 0.3;
      cars.push({
        lane,
        offset: LANE[lane],
        cruise: CAR_CRUISE[lane] * jitter,
        speed: CAR_CRUISE[lane] * jitter,
        spr: SPRITES.lane[lane], // fast lane = wedge · mid = sedan · slow = van
        paint: FP.cars[lane],   // procedural twin (Route A) when the level PNG is missing
        paintKey: ["r-car-fast", "r-car-mid", "r-car-slow"][lane],
      });
    }
    // deterministic spread: even slots with jitter on SAFE stretches — cars never start
    // inside the launch pad or in a hard-corner telegraph zone (turn-in stays curve drama)
    {
      const hardStarts = [];
      {
        let sacc = 0;
        for (const b of blocks) {
          if (Math.abs(b.curve || 0) >= 15) hardStarts.push(sacc * SEG_LEN);
          sacc += b.n;
        }
      }
      const ped = 30 * SEG_LEN; // launch pad kept clear
      const forbidden = (z) => hardStarts.some((h) => {
        let d = z - h;
        if (d < -total / 2) d += total;
        if (d > total / 2) d -= total;
        return d > -90 && d < 50;
      });
      const step = Math.max(120, (total - ped - 60) / cars.length);
      cars.forEach((c, i) => {
        let z = (ped + 20 + i * step + hash(i + 11) * step * 0.45) % total;
        let guard = 0;
        while (forbidden(z) && guard++ < 40) z = (z + step * 0.5) % total; // walk out of ambush zones
        c.z = z;
      });
    }
  }

  // ---- state ----
  let position = 0, speed = 0, playerX = 0;
  let lives = level.data.lives || 3;
  let status = "playing", t = 0, countdown = 2.4, runT = 0, inv = 0, goGlow = 0, steerVis = 0;
  let crashTxt = 0, offroadShake = 0;
  const dust = []; // off-road / crash particles {x, y, vx, vy, life, size}

  function crash() {
    if (inv > 0) return;
    lives--;
    inv = 1.6;
    speed = Math.min(speed, 20);
    crashTxt = 0.7;
    api.audio.sfx("crash");
    api.eng.shake(1.2);
    api.eng.flash = 0.55;
    const px = W / 2 + clamp(playerX, -2.2, 2.2) * 14;
    for (let i = 0; i < 14; i++) {
      dust.push({ x: px + (hash(i * 7 + t * 61 | 0) - 0.5) * 40, y: H - 60, vx: (hash(i * 13) - 0.5) * 160, vy: -40 - hash(i * 3) * 90, life: 0.5 + hash(i) * 0.3, size: 5 + hash(i * 5) * 7 });
    }
    api.hud({ right: "♥".repeat(Math.max(0, lives)) });
    if (lives <= 0) { status = "lost"; api.audio.sfx("lose"); api.fail(); }
  }

  function update(dt, input) {
    if (status !== "playing") return;
    t += dt;
    inv = Math.max(0, inv - dt);
    goGlow = Math.max(0, goGlow - dt);
    crashTxt = Math.max(0, crashTxt - dt);

    if (countdown > 0) {
      countdown -= dt;
      if (countdown <= 0) { api.audio.sfx("win"); goGlow = 1.1; }
      api.hud({ mid: countdown > 0.9 ? "READY…" : "GO!", right: "♥".repeat(lives) });
      return;
    }
    runT += dt;

    // ---- throttle ----
    if (input.up()) speed += 66 * dt;
    else if (input.downKey()) speed -= 130 * dt;
    else speed -= 15 * dt;
    speed = clamp(speed, 0, MAX_SPEED);

    const baseIdx = Math.floor(position / SEG_LEN) % N;
    const seg = segs[baseIdx];
    const pct = speed / MAX_SPEED;
    const steer = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
    steerVis = steer;
    const offroad = Math.abs(playerX) > 1.12;

    // ---- steering: authority scales with speed; reduced grip off-road ----
    const authority = offroad ? 0.72 : 1;
    playerX += steer * dt * 2.05 * (0.2 + pct) * authority;
    playerX -= seg.curve * CURVE_K * dt * pct * 7; // centrifugal drift in corners
    playerX = clamp(playerX, -2, 2);

    // ---- off-road: drag instead of a hard switch (shudder + dust) ----
    if (offroad && speed > 26) {
      speed = Math.max(26, speed - 90 * dt);
      offroadShake = 1;
      if (Math.floor(t * 18) % 2 === 0) {
        const px = W / 2 + clamp(playerX, -2.2, 2.2) * 14 + (playerX > 0 ? 26 : -26);
        dust.push({ x: px, y: H - 52, vx: (playerX > 0 ? 60 : -60) + (hash((t * 97) | 0) - 0.5) * 60, vy: -30 - hash((t * 53) | 0) * 50, life: 0.4, size: 6 + hash((t * 31) | 0) * 7 });
      }
    } else offroadShake = Math.max(0, offroadShake - dt * 3);
    if (offroadShake > 0 && offroad) api.eng.shake(0.12);

    position += speed * dt;
    if (position >= total) {
      status = "won";
      api.audio.sfx("win");
      api.complete({ time: runT });
      return;
    }

    // ---- traffic AI: keep same-lane gaps (no crawl-blobs), cruise back to tier speed ----
    for (const car of cars) {
      let blocked = false;
      for (const other of cars) {
        if (other === car || other.lane !== car.lane) continue;
        let ahead = other.z - car.z;
        if (ahead < -total / 2) ahead += total;
        if (ahead > total / 2) ahead -= total;
        if (ahead > 0 && ahead < CAR_GAP) { blocked = true; car.speed = Math.min(car.speed, other.speed - 4); break; }
      }
      if (!blocked) car.speed = Math.min(car.cruise, car.speed + 26 * dt);
      car.z = (car.z + car.speed * dt) % total;
    }

    // ---- collisions (forgiving hitbox; telegraphed windows) ----
    for (const car of cars) {
      let rel = car.z - position;
      if (rel < -total / 2) rel += total;
      if (rel > total / 2) rel -= total;
      if (inv <= 0 && Math.abs(rel) < SEG_LEN * 0.7 && Math.abs(car.offset - playerX) < 0.4) crash();
    }

    // dust lifecycle
    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) dust.splice(i, 1);
    }

    api.hud({ mid: `${Math.round(speed * 2.4)} mph`, right: "♥".repeat(Math.max(0, lives)) });
  }

  function draw(ctx) {
    drawBackdrop(ctx, st, t, HORIZON_Y / H, t * 6);

    // ---- coast sky extras (racer-owned): twinkling stars + parallax ridge silhouettes ----
    if (st.backdrop === "synthwave") {
      for (let i = 0; i < 42; i++) {
        const sx = hash(i * 3 + 2) * W;
        const sy = hash(i * 5 + 1) * HORIZON_Y * 0.8;
        const a = 0.12 + 0.4 * Math.abs(Math.sin(t * (0.4 + hash(i) * 1.4) + i));
        ctx.globalAlpha = a;
        ctx.fillStyle = i % 5 ? "#cfe8ff" : "#ffd7f0";
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
      const pxOff = -playerX * 26;
      const samples = (amp, par) => {
        const pts = [];
        for (let x = 0; x <= W + 34; x += 34) {
          const wx = (x - pxOff * par) / W * 13.7;
          const f = Math.floor(wx), fr = wx - f;
          const s = fr * fr * (3 - 2 * fr);
          const h = hash(f * 7 + 4) * (1 - s) + hash((f + 1) * 7 + 4) * s;
          pts.push([x, HORIZON_Y - amp * (0.35 + h * 0.75)]);
        }
        return pts;
      };
      const paint = (pts, col, rim) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], HORIZON_Y + 2);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.lineTo(pts[pts.length - 1][0], HORIZON_Y + 2);
        ctx.closePath();
        ctx.fill();
        if (rim) {
          ctx.strokeStyle = rim; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.4;
          ctx.beginPath();
          for (const [x, y] of pts) (x === pts[0][0] ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      };
      paint(samples(30, 1), "rgba(53,17,86,0.95)", "rgba(255,45,149,0.9)");
      paint(samples(46, 1.9), "rgba(26,9,50,1)", null);
    }

    const camZ = position;
    const baseIdx = Math.floor(position / SEG_LEN) % N;
    const baseFrac = (position % SEG_LEN) / SEG_LEN;
    const camY = CAM_H + segs[baseIdx].y;
    const playerXw = playerX * ROAD_W;

    // ---- project pass (near→far, accumulate curve) ----
    const rows = [];
    let x = 0, dx = -(segs[baseIdx].curve * CURVE_K * baseFrac);
    for (let n = 0; n < DRAW; n++) {
      const i = (baseIdx + n) % N;
      const seg = segs[i];
      const dz1 = n * SEG_LEN + (1 - baseFrac) * SEG_LEN;
      const lat1 = x - playerXw;
      const lat2 = x + dx - playerXw;
      const p1 = project(lat1, seg.y, dz1, camY);
      const p2 = project(lat2, segs[(i + 1) % N].y, dz1 + SEG_LEN, camY);
      x += dx;
      dx += seg.curve * CURVE_K;
      rows.push({ i, p1, p2 });
    }
    // ---- draw pass (far→near) ----
    const offroad = st.offroad || "#160a2e";
    const roadA = st.roadLight || "#2e1652";
    const roadB = st.roadDark || "#241242";
    const rumble = st.rumble || "#ff2d95";
    const fogC = st.sky ? st.sky[1] : "#0d1033";

    for (let d = DRAW - 1; d >= 1; d--) {
      const { i, p1, p2 } = rows[d];
      if (p2.y >= p1.y) continue; // behind/occluded on hill crests
      const band = i % 6 < 3;
      const yTop = p2.y, yBot = p1.y;
      const depth = 1 - d / DRAW; // 0 far … 1 near

      // ground strip
      ctx.fillStyle = band ? (st.groundA || st.offroad || "#160a2e") : (offroad);
      ctx.fillRect(0, yTop, W, yBot - yTop + 1);

      // rumble strips
      quad(ctx, p1.x - p1.w * 1.14, yBot, p1.x - p1.w * 0.96, p2.x - p2.w * 0.96, yTop, p2.x - p2.w * 1.14, band ? "#f3f0ff" : rumble);
      quad(ctx, p1.x + p1.w * 0.96, yBot, p1.x + p1.w * 1.14, p2.x + p2.w * 1.14, yTop, p2.x + p2.w * 0.96, band ? "#f3f0ff" : rumble);

      // road
      quad(ctx, p1.x - p1.w, yBot, p1.x + p1.w, p2.x + p2.w, yTop, p2.x - p2.w, band ? roadA : roadB);

      // lane dashes
      if (i % 6 < 2) {
        quad(ctx, p1.x - p1.w * 0.016, yBot, p1.x + p1.w * 0.016, p2.x + p2.w * 0.016, yTop, p2.x - p2.w * 0.016, "rgba(255,255,255,.75)");
        quad(ctx, p1.x - p1.w * 0.1, yBot, p1.x - p1.w * 0.068, p2.x - p2.w * 0.068, yTop, p2.x - p2.w * 0.1, "rgba(255,255,255,.5)");
        quad(ctx, p1.x + p1.w * 0.068, yBot, p1.x + p1.w * 0.1, p2.x + p2.w * 0.1, yTop, p2.x + p2.w * 0.068, "rgba(255,255,255,.5)");
      }

      // FINISH: long checkered corridor + banner (readable for the final seconds)
      if (i >= N - 16) {
        const cols = 8;
        for (let c = 0; c < cols; c++) {
          const f0 = -1 + (2 * c) / cols, f1 = -1 + (2 * (c + 1)) / cols;
          const chk = (c + i) % 2 ? "#111118" : "#e8e8e8";
          quad(ctx, p1.x + f0 * p1.w, yBot, p1.x + f1 * p1.w, p2.x + f1 * p2.w, yTop, p2.x + f0 * p2.w, chk);
        }
        if (i === N - 2) drawText(ctx, "FINISH", clamp(p1.x, 90, W - 90), Math.min(yTop, HORIZON_Y) - 10, { size: 15 + depth * 12, color: "#ffe066", shadow: "rgba(0,0,0,.7)" });
      }

      // fog toward the horizon (also fades sprites in, so nothing pops)
      const fogA = Math.min(0.82, 0.6 * Math.pow(1 - d / DRAW, 2.4));
      if (fogA > 0.02) {
        ctx.globalAlpha = fogA;
        ctx.fillStyle = fogC;
        ctx.fillRect(0, yTop, W, yBot - yTop + 1);
        ctx.globalAlpha = 1;
      }
      const spriteAlpha = clamp(1 - fogA / 0.8, 0, 1); // sprites fade with depth, never pop

      // decor sprite for this segment (size-capped: whoosh past camera, no screen nuke)
      const dec = decorAt(i);
      if (dec) {
        const size = Math.min(p1.w * dec.bigness, dec.cap);
        const dx = p1.x + dec.side * dec.off * p1.w;
        if (p1.y > -size && p1.y - size / 2 < H + size) {
          spriteShadow(ctx, dx, p1.y, size * 0.55, spriteAlpha * 0.5);
          drawSprite(ctx, dec.spr, dx, p1.y, size, { alpha: spriteAlpha, flip: dec.flip, rot: dec.side * -0.05, paint: dec.paint, paintKey: dec.paintKey });
        }
      }

      // traffic on this segment (lane-tier sprite, banks slightly with the road)
      for (const car of cars) {
        if (Math.floor(car.z / SEG_LEN) % N !== i) continue;
        const size = Math.min(p1.w * 0.3, CAR_CAP);
        const cx = p1.x + car.offset * p1.w;
        spriteShadow(ctx, cx, p1.y, size * 0.85, spriteAlpha * 0.45);
        const bank = clamp(segs[i].curve * CURVE_K * 3.0, -0.2, 0.2);
        drawSprite(ctx, car.spr, cx, p1.y, size, { alpha: spriteAlpha, rot: bank, paint: car.paint, paintKey: car.paintKey });
      }
    }

    // ---- speed lines: radial streaks near the screen edges, stronger with speed ----
    if (speed > MAX_SPEED * 0.4) {
      const k = (speed / MAX_SPEED - 0.4) / 0.6; // 0..1
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineCap = "round";
      for (let i = 0; i < 16; i++) {
        const ph = (t * (2.2 + k * 3.4) + hash(i * 7) * 3) % 1;
        const side = i % 2 ? 1 : -1;
        const ex = W / 2 + side * (W * 0.36 + hash(i + 3) * W * 0.14);
        const ey = HORIZON_Y + hash(i + 11) * (H - HORIZON_Y) * 0.8;
        const vx = (ex - W / 2), vy = (ey - HORIZON_Y);
        const vlen = Math.hypot(vx, vy) || 1;
        const len = 40 + k * 110 + hash(i + 5) * 30;
        const a = k * (0.16 + hash(i + 17) * 0.2);
        ctx.globalAlpha = a;
        ctx.lineWidth = 2 + hash(i + 23) * 2.6;
        ctx.beginPath();
        ctx.moveTo(ex - (vx / vlen) * len * ph, ey - (vy / vlen) * len * ph);
        ctx.lineTo(ex - (vx / vlen) * len * ph - (vx / vlen) * len, ey - (vy / vlen) * len * ph - (vy / vlen) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- particles (off-road dust / crash debris) ----
    for (const p of dust) {
      ctx.globalAlpha = Math.min(1, p.life * 2.4) * 0.8;
      ctx.fillStyle = "#c9a67a";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- player car: sprite with underglow + contact shadow; bank into steering and curves ----
    const segNow = segs[baseIdx];
    const lean = clamp(steerVis * 0.13 + segNow.curve * CURVE_K * (speed / MAX_SPEED) * 3.2, -0.34, 0.34);
    const bounce = 2 + Math.min(3, speed * 0.05) + offroadShake * 2.5;
    const px = W / 2 + clamp(playerX, -2.2, 2.2) * 14;
    const blink = inv > 0 && Math.floor(t * 14) % 2 === 0;
    const py = H - 52 - bounce;
    // magenta underglow (neon supercar vibe)
    const ug = ctx.createRadialGradient(px, py + 4, 4, px, py + 4, 52);
    ug.addColorStop(0, "rgba(255,45,149,0.5)");
    ug.addColorStop(1, "rgba(255,45,149,0)");
    ctx.fillStyle = ug;
    ctx.fillRect(px - 56, py - 20, 112, 36);
    spriteShadow(ctx, px, py, 100, 0.5);
    drawSprite(ctx, SPRITES.player, px, py, 78, { rot: lean, alpha: blink ? 0.35 : 1, paint: FP.player, paintKey: "r-player" });
    if (crashTxt > 0) drawText(ctx, "CRASH!", px, H - 120, { size: 26, color: "#ff5d5d", alpha: Math.min(1, crashTxt * 2), shadow: "rgba(0,0,0,.8)" });

    // countdown
    if (countdown > 0) {
      drawText(ctx, countdown > 0.9 ? "READY" : "GO!", W / 2, H * 0.4, { size: 64, color: "#ffe066", shadow: "rgba(0,0,0,.6)" });
    } else if (goGlow > 0) {
      drawText(ctx, "GO!", W / 2, H * 0.4, { size: goGlow > 0.6 ? 64 : 38, color: "#ffe066", alpha: goGlow, shadow: "rgba(0,0,0,.6)" });
    }
    drawText(ctx, ` ${fmtTime(runT)}`, W - 18, 64, { size: 18, color: "#fff", align: "right" });

    if (runT < 3.2) drawText(ctx, level.objective || "", W / 2, 468, { size: 18, color: "#fff", alpha: runT > 2.6 ? (3.2 - runT) / 0.6 : 1, shadow: "rgba(0,0,0,.8)" });
  }

  function project(lateral, worldY, dz, camY) {
    const scale = CAM_D / Math.max(dz, 0.8);
    return {
      scale,
      x: W / 2 + scale * lateral * (W / 2),
      y: HORIZON_Y - scale * (worldY - camY) * (H * 1.1),
      w: scale * ROAD_W * (W / 2),
    };
  }

  function quad(ctx, x1, yBot, xb, x2, yTop, xc, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, yBot);
    ctx.lineTo(xb, yTop);
    ctx.lineTo(xc, yTop);
    ctx.lineTo(x2, yBot);
    ctx.closePath();
    ctx.fill();
  }

  // dev hook: lets the booth agent robot-race the level and read live telemetry
  if (typeof window !== "undefined") {
    window.RACER_DEBUG = {
      get status() { return status; },
      get position() { return position; },
      get speed() { return speed; },
      get playerX() { return playerX; },
      get runT() { return runT; },
      get lives() { return lives; },
      get total() { return total; },
      curveAt(z) { return segs[Math.floor(z / SEG_LEN) % N].curve; },
      seek(z) { position = clamp(z, 0, total - 1); speed = 70; },
      cars,
    };
  }

  return { update, draw, status: () => status };
}
