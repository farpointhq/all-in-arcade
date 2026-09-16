// STAR-RACER genre — pseudo-3D "Death Star trench run."
//
// Simone Hummel's idea: "A galactic Star Wars theme, space shuttle racing game. The goal is to
// defeat the Death Star by collecting items, or something?" We answer the "or something?" by
// making the items the win verb: every star collected charges a proton torpedo. Collect the
// quota (data.itemsRequired), survive the trench (data.waves / data.debris), and at the end the
// battle station looms — align the shuttle with its port and press SPACE to fire. Without enough
// stars the port's defense turns you away (you're told the deficit). Reach the hull without a
// successful shot and the run ends — retry is always about the port.
//
// Rendered like the racer genre (segment projector) but the road is a trench: corridor floor plus
// two wall faces, curved by segment data. All sprites procedural (Route A), zero assets, no emoji.
import { W, H, clamp, drawText, drawBackdrop, hash, fmtTime } from "../core.js";

const SEG_LEN = 6;          // world units per segment (matches racer.js)
const ROAD_W = 74;          // corridor half-width in world units
const CAM_D = 0.84;         // camera depth (1/tan(fov/2))
const CAM_H = 12;           // camera height — low, we're flying INSIDE the trench
const DRAW = 88;            // segments drawn ahead
const CURVE_K = 0.0042;     // level curve -> lateral bend (gentler than racer: corridor feel)
const HILL_K = 0.34;        // level hill -> elevation amplitude
const HORIZON_Y = H * 0.40; // lots of sky for the Death Star + stars (we fly low)
const BOSS_RANGE = 0.13;    // fraction of track that is the final approach (the port shot)
const TORPEDO_SPEED = 900;  // world units/s once fired

// ---- procedural sprite layer ----------------------------------------------------------------------------
// No asset files (booth rule): every sprite is drawn once to an offscreen canvas and blitted per frame.
const SPRITES = new Map();
function sprite(size, key, drawFn) {
  const k = key + "@" + Math.round(size);
  let c = SPRITES.get(k);
  if (!c) {
    const pad = Math.ceil(size * 0.6);
    c = document.createElement("canvas");
    c.width = Math.ceil(size) + pad * 2; c.height = Math.ceil(size) + pad * 2;
    drawFn(c.getContext("2d"), c.width / 2, c.height / 2, size);
    SPRITES.set(k, c);
  }
  return c;
}
function blit(ctx, cnv, x, y, rot = 0, alpha = 1) {
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.drawImage(cnv, -cnv.width / 2, -cnv.height / 2);
  ctx.restore();
}
// shuttle, nose-toward-horizon: white fuselage, swept wings, cyan engine wash
function paintShuttle(g, cx, cy, s, banking = false) {
  // engine flares
  g.fillStyle = "rgba(125,252,255,.8)";
  g.beginPath(); g.moveTo(cx - s * 0.10, cy + s * 0.30); g.quadraticCurveTo(cx, cy + s * 0.80, cx + s * 0.08, cy + s * 0.30); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,.85)";
  g.beginPath(); g.moveTo(cx - s * 0.045, cy + s * 0.30); g.lineTo(cx, cy + s * 0.52); g.lineTo(cx + s * 0.04, cy + s * 0.30); g.closePath(); g.fill();
  // swept wings (banking frames flare slightly more)
  const bank = banking ? 1.12 : 1.0;
  g.fillStyle = "#9fb0c9";
  g.beginPath(); g.moveTo(cx - s * 0.05, cy - s * 0.02); g.lineTo(cx - s * 0.46 * bank, cy + s * 0.40); g.lineTo(cx - s * 0.05, cy + s * 0.34); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx + s * 0.05, cy - s * 0.02); g.lineTo(cx + s * 0.46 * bank, cy + s * 0.40); g.lineTo(cx + s * 0.05, cy + s * 0.34); g.closePath(); g.fill();
  // wingtip lights
  g.fillStyle = "#7dfcff"; g.beginPath(); g.arc(cx - s * 0.42 * bank, cy + s * 0.37, s * 0.035, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + s * 0.42 * bank, cy + s * 0.40, s * 0.035, 0, Math.PI * 2); g.fill();
  // fuselage
  g.fillStyle = "#eef3fb";
  g.beginPath();
  g.moveTo(cx, cy - s * 0.52);
  g.quadraticCurveTo(cx + s * 0.10, cy, cx + s * 0.088, cy + s * 0.30);
  g.lineTo(cx - s * 0.088, cy + s * 0.30);
  g.quadraticCurveTo(cx - s * 0.10, cy, cx, cy - s * 0.52);
  g.closePath(); g.fill();
  // canopy
  g.fillStyle = "#274e77";
  g.beginPath(); g.ellipse(cx, cy - s * 0.05, s * 0.052, s * 0.11, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,.35)";
  g.beginPath(); g.ellipse(cx - s * 0.014, cy - s * 0.075, s * 0.018, s * 0.045, 0, 0, Math.PI * 2); g.fill();
  // engines
  g.fillStyle = "#3a4657";
  g.fillRect(cx - s * 0.062, cy + s * 0.24, s * 0.124, s * 0.10);
}
// interceptor: spherical cockpit + twin panels (generic — homage in silhouette only)
function paintFighter(g, cx, cy, s) {
  g.fillStyle = "#2c3341";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + side * s * 0.14, cy - s * 0.42);
    g.lineTo(cx + side * s * 0.50, cy - s * 0.24);
    g.lineTo(cx + side * s * 0.50, cy + s * 0.24);
    g.lineTo(cx + side * s * 0.14, cy + s * 0.42);
    g.closePath(); g.fill();
  }
  g.fillStyle = "#454f61";
  g.fillRect(cx - s * 0.085, cy - s * 0.10, s * 0.17, s * 0.2);
  g.beginPath(); g.arc(cx, cy, s * 0.30, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,.3)";
  g.beginPath(); g.arc(cx - s * 0.09, cy - s * 0.09, s * 0.11, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ff5252";
  g.beginPath(); g.arc(cx, cy + s * 0.05, s * 0.048, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(125,252,255,.9)";
  g.fillRect(cx - s * 0.03, cy + s * 0.40, s * 0.06, s * 0.16);
}
function paintRock(seed) {
  return (g, cx, cy, s) => {
    const n = 7 + (seed % 3);
    g.fillStyle = seed % 2 ? "#6b5a4e" : "#5d4f45";
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seed * 0.7;
      const rr = s * (0.30 + 0.11 * Math.sin(seed * 5 + i * 1.7));
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.92;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fill();
    g.fillStyle = "rgba(0,0,0,.25)";
    g.beginPath(); g.arc(cx + s * 0.08, cy + s * 0.09, s * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(40,32,26,.5)";
    g.beginPath(); g.arc(cx - s * 0.07, cy - s * 0.04, s * 0.07, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx + s * 0.05, cy + s * 0.02, s * 0.05, 0, Math.PI * 2); g.fill();
  };
}
function paintBolt(g, cx, cy, s) {
  const grd = g.createLinearGradient(cx - s * 0.5, cy, cx + s * 0.5, cy);
  grd.addColorStop(0, "rgba(125,252,255,0)"); grd.addColorStop(0.55, "#7dfcff"); grd.addColorStop(1, "#eaffff");
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(cx, cy, s * 0.5, s * 0.16, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,.9)";
  g.beginPath(); g.ellipse(cx + s * 0.34, cy, s * 0.12, s * 0.09, 0, 0, Math.PI * 2); g.fill();
}
function paintStar(g, cx, cy, s) {
  const five = 5;
  const glow = g.createRadialGradient(cx, cy, s * 0.05, cx, cy, s * 0.52);
  glow.addColorStop(0, "rgba(255,230,150,.85)");
  glow.addColorStop(1, "rgba(255,230,150,0)");
  g.fillStyle = glow;
  g.beginPath(); g.arc(cx, cy, s * 0.52, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffd23e";
  g.beginPath();
  for (let i = 0; i < five * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / five;
    const rr = i % 2 === 0 ? s * 0.42 : s * 0.17;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,.75)";
  g.beginPath(); g.ellipse(cx, cy - s * 0.05, s * 0.07, s * 0.10, -0.5, 0, Math.PI * 2); g.fill();
}

export const meta = {
  name: "Star Racer",
  controls: "← → / A D steer · collect stars to charge the torpedo · SPACE fires it at the port",
};

export function create(level, api) {
  const st = level.style || {};
  const D = level.data || {};
  const speedCfg = D.speed || { base: 46, max: 96 };
  const itemsRequired = D.itemsRequired || 5;
  const portSize = D.boss?.portSize || 0.24;

  // ---- build the trench (same segment contract as racer) ----
  const segs = [];
  {
    let y = 0;
    for (const s of D.segments || [{ n: 120, curve: 0, hill: 0 }]) {
      const dy = ((s.hill || 0) * HILL_K) / Math.max(1, s.n);
      for (let i = 0; i < s.n; i++) { y += dy; segs.push({ curve: s.curve || 0, y }); }
    }
  }
  const N = segs.length;
  const total = N * SEG_LEN;

  // ---- level objects (level.json is the source of truth; z is 0..1 of the track) ----
  const items = (D.items || []).map((it) => ({ z: it.z * total, x: it.x, got: false }));
  const debris = (D.debris || []).map((ob) => ({ z: ob.z * total, x: ob.x }));
  const fighters = [];
  for (const w of D.waves || []) {
    for (let i = 0; i < (w.n || 3); i++) {
      fighters.push({
        z: w.z * total + i * (w.spacing || 14) * SEG_LEN,
        baseX: clamp((w.x || 0) + (hash(i * 7 + Math.round(w.z * 100)) - 0.5) * 0.8, -0.9, 0.9),
        wob: 1.1 + hash(i * 13 + Math.round(w.z * 100)) * 1.3,
        ph: hash(i * 29 + Math.round(w.z * 100)) * 6.283,
        a: 0.16 + hash(i * 47 + Math.round(w.z * 100)) * 0.18, // homing strength
        x: 0,
      });
    }
  }

  // ---- state ----
  let position = 0, speed = 0, playerX = 0, steerVis = 0;
  let hearts = D.lives || 3;
  let status = "playing", t = 0, runT = 0, inv = 0;
  const INV_TIME = 1.5;
  let countdown = 2.2, goGlow = 0;
  let got = 0, armed = false, launched = false;
  let bossPhase = false, portX = 0, fireCd = 0, missT = 0;
  const FAST = clamp(parseFloat(new URLSearchParams(location.search).get("fast") || "1") || 1, 1, 12); // ?fast=N: compressed-time smoke testing
  const torpedoes = []; // { z, x, on }
  const bursts = [];    // screen-space sparkle particles
  let prevPosition = 0;

  function setHud(txt) {
    let mid = txt || `★ ${got}/${itemsRequired} to arm the torpedo`;
    if (bossPhase && armed && !launched) mid = txt || "TORPEDO LOCKED — fire into the port!";
    if (bossPhase && !armed) mid = txt || `★ ${got}/${itemsRequired} — torpedo offline`;
    api.hud({ mid, right: "♥".repeat(Math.max(0, hearts)) });
  }

  function burst(x, y, color, n = 10, spd = 110) {
    for (let i = 0; i < n; i++) {
      const a = hash(i + bursts.length * 13) * 6.283;
      const v = spd * (0.4 + hash(i * 3 + bursts.length * 29) * 0.8);
      bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.45 + hash(i + bursts.length * 7) * 0.35, c: color });
    }
  }

  function hurt(fromX) {
    if (inv > 0 || status !== "playing") return;
    hearts--;
    inv = INV_TIME;
    api.audio.sfx("crash");
    api.eng.shake(1);
    playerX = clamp(playerX + (playerX < fromX ? -0.35 : 0.35), -1, 1); // knock away
    if (hearts <= 0) {
      status = "lost";
      api.audio.sfx("lose");
      api.fail("Shot down in the trench — steer between the debris and keep the stars coming.");
    }
    setHud();
  }

  function fire() {
    if (!bossPhase || launched) return;
    if (!armed) { api.audio.sfx("select"); return; }
    if (fireCd > 0) return;
    if (Math.abs(playerX - portX) <= portSize) {
      launched = true;
      torpedoes.push({ z: position, x: playerX, on: true });
      api.audio.sfx("shoot");
    } else {
      fireCd = 0.4;
      missT = 0.9;
      api.audio.sfx("hit");
      api.eng.shake(0.3);
    }
    }

  function update(dt, input) {
    if (status !== "playing") return;
    dt *= FAST; // compressed-time smoke testing hook (?fast=N — playtest URLs only)
    t += dt;
    inv = Math.max(0, inv - dt);
    fireCd = Math.max(0, fireCd - dt);
    missT = Math.max(0, missT - dt);
    goGlow = Math.max(0, goGlow - dt);

    if (countdown > 0) {
      countdown -= dt;
      if (countdown <= 0) { api.audio.sfx("select"); goGlow = 1.1; }
      setHud();
      return;
    }
    runT += dt;

    // ---- speed: cruise ramps over the run; the boss approach slows to a deliberate pace ----
    prevPosition = position;
    const target = bossPhase ? 34 : speedCfg.base + (speedCfg.max - speedCfg.base) * clamp(runT / 16, 0, 1);
    speed += (target - speed) * Math.min(1, dt * (bossPhase ? 1.6 : 2.2));

    // ---- steering ----
    const steer = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
    steerVis = steer;
    const pct = clamp(speed / speedCfg.max, 0, 1);
    playerX += steer * dt * 1.6 * (0.4 + pct);
    const seg = segs[Math.floor(position / SEG_LEN) % N];
    playerX -= (bossPhase ? 0 : seg.curve) * CURVE_K * dt * pct * 2.4; // mild centrifugal
    playerX = clamp(playerX, -1, 1);

    if (!launched) position += speed * dt;

    // ---- collect stars (swept cross-plane check: correct at any dt incl. ?fast runs) ----
    for (const it of items) {
      if (it.got) continue;
      const inWindow = it.z >= prevPosition - SEG_LEN * 1.2 && it.z <= position + SEG_LEN * 3.2;
      if (inWindow && Math.abs(it.x - playerX) < 0.38) {
        it.got = true; got++;
        armed = got >= itemsRequired;
        api.audio.sfx("coin");
        burst(W / 2 + it.x * 120, H * 0.6, "#ffe066", 9, 90);
        setHud();
      }
    }

    // ---- debris collisions (swept cross-plane at the near plane) ----
    if (inv <= 0) {
      for (const b of debris) {
        const inWindow = b.z >= prevPosition - SEG_LEN && b.z <= position + SEG_LEN * 1.6;
        if (inWindow && Math.abs(b.x - playerX) < 0.22) { hurt(b.x); break; }
      }
    }

    // ---- fighters: hold position, swerve; home gently while FAR, ballistic when near (dodgeable) ----
    for (const f of fighters) {
      const rel = f.z - position;
      if (rel < -SEG_LEN * 4 || rel > SEG_LEN * 90) continue;
      if (rel > 220) { // homing disengages once close — late corrections would be unfair
        f.baseX += (playerX - f.baseX) * f.a * dt * 0.9;
        f.baseX = clamp(f.baseX, -1.05, 1.05);
      }
      f.x = clamp(f.baseX + Math.sin(t * f.wob + f.ph) * 0.22, -1.1, 1.1);
      if (inv <= 0 && rel > -SEG_LEN * 4 && rel < SEG_LEN * 2.2 && Math.abs(f.x - playerX) < 0.24) hurt(f.x);
    }

    // ---- the boss gate: last stretch is the station approach ----
    if (!bossPhase && position >= total * (1 - BOSS_RANGE)) { bossPhase = true; api.audio.sfx("select"); }
    if (bossPhase) {
      const tn = clamp((position - total * (1 - BOSS_RANGE)) / (total * BOSS_RANGE), 0, 1);
      portX = Math.sin(tn * 3.1) * 0.62 * (1 - tn * 0.3);
      if (input.jumpJust()) fire();
    }

    // ---- hull: reached the station without a fired torpedo ----
    if (status === "playing" && !launched && position >= total - 4) {
      status = "lost";
      api.audio.sfx("lose");
      api.fail(armed
        ? "Slid past the port and burned on the hull — line up with the port, then SPACE."
        : `The port's defense turned you away — you were ${itemsRequired - got} stars short of a torpedo.`);
      return;
    }

    // ---- torpedo flight → port → boom → win ----
    for (const ty of torpedoes) {
      if (!ty.on) continue;
      ty.z += TORPEDO_SPEED * dt;
      if (ty.z >= total) {
        ty.on = false;
        api.audio.sfx("boom");
        api.eng.shake(1.5);
        api.eng.flash = 0.7;
        status = "won";
        burst(W / 2, HORIZON_Y - 20, "#ffd9a0", 24, 260);
        burst(W / 2, HORIZON_Y - 20, "#7dfcff", 18, 200);
        api.audio.sfx("win");
        api.complete({ items: got, total: items.length });
      }
    }

    setHud(missT > 0 ? "MISS — track the glowing port and fire again!" : undefined);
  }

  // ---- projection (same math family as racer.js) ----
  function project(lateral, worldY, dz, camY) {
    const scale = CAM_D / Math.max(dz, 0.8);
    return {
      scale,
      x: W / 2 + scale * lateral * (W / 2),
      y: HORIZON_Y - scale * (worldY - camY) * (H * 1.1),
      w: scale * ROAD_W * (W / 2),
    };
  }

  // 4-point quad by explicit corners (a=bottom-left, b=bottom-right, c=top-right, d=top-left)
  function quad(ctx, ax, ay, bx, by, cx, cy, dx, dy, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
    ctx.closePath(); ctx.fill();
  }

  function clampS(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function draw(ctx) {
    drawBackdrop(ctx, st, t, HORIZON_Y / H, 0);

    const baseIdx = Math.floor(position / SEG_LEN) % N;
    const baseFrac = (position % SEG_LEN) / SEG_LEN;
    const camY = CAM_H + segs[baseIdx].y;
    const playerXw = playerX * ROAD_W;

    // ---- the Death Star ahead at the horizon (behind the trench) ----
    const pre = clamp(position / total, 0, 1);
    const bossQ = bossPhase ? clamp((position - total * (1 - BOSS_RANGE)) / (total * BOSS_RANGE), 0, 1) : 0;
    const r = clamp(30 + 300 * pre * pre + 320 * Math.pow(bossQ, 1.3), 30, H * 0.55);
    const sx = W / 2, sy = HORIZON_Y - 30;
    {
      const alpha = clamp(0.25 + pre * 1.3, 0.3, 1);
      const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.12, sx, sy, r);
      g.addColorStop(0, "#3d4658"); g.addColorStop(0.75, "#20273a"); g.addColorStop(1, "#10131f");
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      // meridian groove — reads as "battle station"
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = "#9fb4d8"; ctx.lineWidth = Math.max(1.5, r * 0.02);
      ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.42, r * 0.97, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // the port: the ONE glowing opening — the highest-contrast thing during the approach
      if (r > 40 || bossPhase) {
        const portR = Math.max(8, r * 0.24);
        const px = sx + portX * r * 0.55;
        const py = sy + r * 0.16;
        const pg = ctx.createRadialGradient(px, py, portR * 0.15, px, py, portR);
        pg.addColorStop(0, armed ? "#c8ffff" : "#ffe9a8");
        pg.addColorStop(0.65, "#1d3550"); pg.addColorStop(1, "#0a0d18");
        // halo pulse so the port is unmistakable through the whole approach
        const halo = 0.75 + 0.25 * Math.sin(t * 4);
        ctx.save();
        ctx.globalAlpha = alpha * halo;
        ctx.beginPath(); ctx.arc(px, py, portR * 1.45, 0, Math.PI * 2);
        ctx.fillStyle = armed ? "rgba(125,252,255,0.18)" : "rgba(255,224,102,0.18)";
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(px, py, portR, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
        ctx.strokeStyle = armed ? "#7dfcff" : "#ffe066"; ctx.lineWidth = Math.max(2, portR * 0.14);
        ctx.beginPath(); ctx.arc(px, py, portR, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    // ---- project the trench ----
    const rows = [];
    let x = 0, dx = -(segs[baseIdx].curve * CURVE_K * baseFrac);
    for (let n = 0; n < DRAW; n++) {
      const i = (baseIdx + n) % N;
      const dz1 = n * SEG_LEN + (1 - baseFrac) * SEG_LEN;
      const p1 = project(x - playerXw, segs[i].y, dz1, camY);
      const p2 = project(x + dx - playerXw, segs[(i + 1) % N].y, dz1 + SEG_LEN, camY);
      x += dx; dx += segs[i].curve * CURVE_K;
      rows.push({ i, p1, p2 });
    }

    const floor = "#16233a", floorDark = "#101a2c";
    const wallA = "#2a3b57", wallB = "#1e2c44";
    const edge = st.accent || "#7dfcff";
    const fogC = st.sky?.[1] || "#0d1033";

    for (let dI = DRAW - 1; dI >= 1; dI--) {
      const { i, p1, p2 } = rows[dI];
      if (p2.y >= p1.y) continue;
      const band = i % 6 < 3;
      const yTop = p2.y, yBot = p1.y, wallH = p1.w * 0.62;

      // floor strip across the full band, then walls over it
      ctx.fillStyle = band ? floor : floorDark;
      ctx.fillRect(0, yTop, W, yBot - yTop + 1);
      // wall faces: vertical slabs from the floor edge up by the row's perspective height
      const h1 = p1.w * 0.62, h2 = p2.w * 0.62;
      quad(ctx, p1.x - p1.w, yBot, p2.x - p2.w, yTop, p2.x - p2.w, yTop - h2, p1.x - p1.w, yBot - h1, band ? wallA : wallB);
      quad(ctx, p1.x + p1.w, yBot, p2.x + p2.w, yTop, p2.x + p2.w, yTop - h2, p1.x + p1.w, yBot - h1, band ? wallA : wallB);
      // glowing wall-top edges
      ctx.strokeStyle = edge; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p1.x - p1.w, p1.y - wallH); ctx.lineTo(p2.x - p2.w, p2.y - wallH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p1.x + p1.w, p1.y - wallH); ctx.lineTo(p2.x + p2.w, p2.y - wallH); ctx.stroke();
      ctx.globalAlpha = 1;

      // center speed dashes
      if (i % 6 < 2 && dI > 2) {
        ctx.fillStyle = "rgba(255,255,255,.35)";
        ctx.fillRect(p1.x - 1, yBot - (yBot - yTop) * 0.2, 2, (yBot - yTop) * 0.2);
      }
      // trench beacon pods (light homage, both walls, staggered) — warm glow discs
      if (i % 21 === 0 && dI > 4) {
        for (const bxp of [p1.x - p1.w + p1.w * 0.1, p1.x + p1.w - p1.w * 0.1]) {
          const byy = p1.y - wallH * 0.5, podR = Math.max(4, p1.w * 0.13);
          const pg = ctx.createRadialGradient(bxp, byy, 1, bxp, byy, podR * 2.4);
          pg.addColorStop(0, "rgba(255,244,180,.95)");
          pg.addColorStop(0.45, "rgba(255,220,120,.32)");
          pg.addColorStop(1, "rgba(255,220,120,0)");
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(bxp, byy, podR * 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ffe9a1";
          ctx.beginPath(); ctx.arc(bxp, byy, podR * 0.62, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // fog toward horizon
      const fogA = Math.min(0.82, 0.6 * Math.pow(1 - dI / DRAW, 2.4));
      if (fogA > 0.02) {
        ctx.globalAlpha = fogA; ctx.fillStyle = fogC;
        ctx.fillRect(0, yTop, W, yBot - yTop + 1);
        ctx.globalAlpha = 1;
      }

      // items (procedural star pickup, drawn after fog — readable ≥2s out)
      for (const it of items) {
        if (it.got) continue;
        if (Math.floor(it.z / SEG_LEN) % N !== i) continue;
        const pulse = 0.92 + 0.1 * Math.sin(t * 4 + it.z);
        blit(ctx, sprite(clampS(p1.w * 0.46, 14, 64), "star", paintStar), p1.x + it.x * p1.w, p1.y - p1.w * 0.26);
      }
      // debris (procedural rock, seed-variants)
      for (const b of debris) {
        if (Math.floor(b.z / SEG_LEN) % N !== i) continue;
        const seed = Math.floor(b.z / SEG_LEN) % 3;
        blit(ctx, sprite(clampS(p1.w * 0.72, 22, 120), "rock" + seed, paintRock(seed)), p1.x + b.x * p1.w, p1.y - p1.w * 0.38, Math.sin(t * 1.6 + b.z) * 0.2);
      }
      // fighters (procedural interceptor sprite)
      for (const f of fighters) {
        if (Math.floor(f.z / SEG_LEN) % N !== i) continue;
        if (f.z - position < -SEG_LEN * 3) continue;
        blit(ctx, sprite(clampS(p1.w * 0.78, 24, 110), "fighter", paintFighter), p1.x + f.x * p1.w, p1.y - p1.w * 0.36, Math.sin(t * 3 + f.ph) * 0.18);
      }
    }

    // ---- torpedo streaks (procedural proton bolt, launched from the ship plane) ----
    for (const ty of torpedoes) {
      if (!ty.on) continue;
      const rel = clamp((ty.z - position) / (total - position), 0, 1);
      const yFrom = H - 84, yTo = HORIZON_Y - 26;
      blit(ctx, sprite(16, "bolt", paintBolt), W / 2 + ty.x * 30 * (1 - rel), yFrom + (yTo - yFrom) * rel, 0);
    }

    // ---- player shuttle: racer-convention anchor — lane 0 is screen center; objects in YOUR lane already land there ----
    const bounce = 2 + Math.min(3, speed * 0.05);
    const blink = inv > 0 && Math.floor(t * 14) % 2 === 0;
    const px = W / 2 + clamp(playerX, -1.1, 1.1) * 30;
    const py = H - 70 - bounce;
    // player shuttle (procedural, 2-frame bank; dims to a ghost while invulnerable)
    const frame = steerVis !== 0 ? "bank" : "idle";
    blit(ctx, sprite(86, "shuttle-" + frame, (g, cx, cy, s) => paintShuttle(g, cx, cy, s, frame === "bank")), px, py, clamp(steerVis * 0.14, -0.14, 0.14), blink ? 0.3 : 1);

    // ---- bursts (screen-space; keep animating even post-result) ----
    for (const p of bursts) {
      p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.vy += 60 * 0.016; p.life -= 0.016;
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // ---- overlays ----
    drawText(ctx, fmtTime(runT), W - 18, 64, { size: 18, color: "#fff", align: "right" });
    if (countdown > 0) {
      drawText(ctx, countdown > 0.9 ? "READY" : "GO!", W / 2, H * 0.30, { size: 64, color: "#ffe066", shadow: "rgba(0,0,0,.6)" });
    } else if (goGlow > 0) {
      drawText(ctx, "GO!", W / 2, H * 0.30, { size: goGlow > 0.6 ? 64 : 38, color: "#ffe066", alpha: goGlow, shadow: "rgba(0,0,0,.6)" });
    }
    if (bossPhase && status === "playing" && countdown <= 0) {
      drawText(ctx, armed ? "TORPEDO LOCKED — FIRE!" : `Collect ${itemsRequired - got} more stars to arm the torpedo`,
        W / 2, H * 0.52, { size: 26, color: armed ? "#7dfcff" : "#ffe066", shadow: "rgba(0,0,0,.8)" });
    }
    if (runT < 3.4) {
      drawText(ctx, level.objective || "", W / 2, H * 0.42, { size: 20, color: "#fff", alpha: runT > 2.6 ? (3.4 - runT) / 0.8 : 1, shadow: "rgba(0,0,0,.8)" });
    }
  }

  // read-only debug hook for agent playtesting — exists only when the URL carries ?debug=1
  if ((typeof location !== "undefined") && new URLSearchParams(location.search).get("debug") === "1") {
    window.__SR = {
      read: () => ({
        position, total, speed, playerX, got, armed, hearts, status, portX, launched, bossPhase, runT, curves: segs.map((s) => s.curve),
        items: items.map((i) => ({ z: i.z, x: i.x, got: i.got })),
        debris: debris.map((d) => ({ z: d.z, x: d.x })),
        fighters: fighters.map((f) => ({ z: f.z, x: f.x })),
      }),
    };
  }

  return { update, draw, status: () => status };
}
