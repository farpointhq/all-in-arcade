// Engine core: fixed 960×540 virtual resolution, RAF loop, input, shared draw helpers.
// Genres are renderer modules — this file stays genre-agnostic on purpose (3D can plug in later).
export const W = 960;
export const H = 540;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const fmtTime = (s) => {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

// ---- All In site art (attract backdrop) ---------------------------------------
// The real banner gradient from allinevent.ai ("gredient-bg.jpg", operator-
// approved rip 2026-09-17 — see assets/CREDITS.md). drawBackdrop's "allin"
// preset paints it cover-style once loaded; until then (or if the file is
// missing, e.g. mirror checkouts) the procedural aurora washes stay the
// fallback, so the start screen never goes black.
const HERO_BG = new Image();
HERO_BG.crossOrigin = "anonymous"; // keeps the canvas untainted (rig serves ACAO:*)
HERO_BG.src = "assets/backdrops/allin-gredient-bg.jpg";
const heroOk = () => HERO_BG.complete && HERO_BG.naturalWidth > 0;

// deterministic pseudo-random (stable across frames — no flicker)
export function hash(i) {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 13; x = (x * 1274126177) >>> 0;
  return ((x ^ x >>> 16) >>> 0) / 4294967295;
}

// ---- seasons --------------------------------------------------------------
// One global season drives mechanic multipliers across the whole game.
// The UI chip (index.html #seasonChip, painted by ui.js) stores the pick in
// localStorage and mirrors it onto window.ALLIN_SEASON; genres read it live.
export const SEASONS = {
  winter:  { id: "winter",  label: "HIVER",     melt: 0.35, tint: "150,190,255", chip: "#9ecbff" },
  spring:  { id: "spring",  label: "PRINTEMPS", melt: 1.0,  tint: "150,255,200", chip: "#7de2a8" },
  summer:  { id: "summer",  label: "ÉTÉ",       melt: 1.9,  tint: "255,190,110", chip: "#ffb15e" },
  autumn:  { id: "autumn",  label: "AUTOMNE",   melt: 1.0,  tint: "255,170,90",  chip: "#ffaa5a"  },
};
export function seasonNow() {
  return SEASONS[window.ALLIN_SEASON] || SEASONS.autumn;
}
// very light full-screen wash so the current season is visible everywhere
export function seasonTint(ctx, alpha = 0.075) {
  const s = seasonNow();
  ctx.save();
  ctx.fillStyle = `rgba(${s.tint},${alpha})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// (drawEmoji removed 2026-09-17 — operator rule: real art, no emoji fallbacks, ever.
// Actors/props are procedural Route A sprites via sprite()/blit(); HUD uses text glyphs
// like ★/♥ which render as text presentation, never as an emoji.)

export function drawText(ctx, text, x, y, { size = 20, color = "#fff", weight = "bold", align = "center", base = "middle", font = '"Trebuchet MS","Avenir Next",sans-serif', alpha = 1, shadow } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = size * 0.35; }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Bilingual on-canvas text for the EN-first / FR-secondary booth convention.
// Splits on "FR:" — the EN head renders exactly like drawText, and the FR tail
// renders one line below at size−2 / alpha×0.6 (drawText never wraps, so a
// combined EN+FR line would overflow the 960px canvas). Strings without an
// "FR:" marker render exactly as today — single-language text is unaffected.
export function drawBilingualText(ctx, text, x, y, opts = {}) {
  const str = String(text || "");
  const fr = str.indexOf("FR:");
  if (fr === -1) return drawText(ctx, str, x, y, opts);
  const size = opts.size ?? 20;
  drawText(ctx, str.slice(0, fr).replace(/\s+$/, ""), x, y, opts);
  drawText(ctx, str.slice(fr), x, y + size + 4, { ...opts, size: Math.max(10, size - 2), alpha: (opts.alpha ?? 1) * 0.6 });
}

// Fluffy hand-drawn cloud (no asset files): (cx,y) = top-centre, w = width.
export function drawCloud(ctx, cx, y, w) {
  const h = Math.max(10, w * 0.22);
  const puffs = [[0.05, 0.55], [0.2, 0.95], [0.38, 0.72], [0.58, 1.0], [0.76, 0.78], [0.93, 0.5]];
  const base = y + h;
  for (const [f, s] of puffs) {
    const r = h * s, px = cx - w / 2 + f * w, py = base - r * 0.55;
    ctx.beginPath();
    ctx.arc(px + r, py, r, Math.PI * 2, 0);
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.arc(px - r, py, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, base - h * 0.2, w * 0.5, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

// ---- Route A procedural sprite bakery (operator rule: real art, no emoji) -----
// Genres own their painters; this tiny bakery bakes each painter once to an
// offscreen canvas (fixed base size) and callers blit it at any size. No asset
// files, no emoji, no network — crisp at every scale on the letterboxed canvas.
const BAKED = new Map();
export function sprite(key, size, paint) {
  let c = BAKED.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(size));
    c.height = Math.max(2, Math.round(size));
    paint(c.getContext("2d"), c.width, c.height);
    BAKED.set(key, c);
  }
  return c;
}
// centre-anchored blit at a requested pixel height (`h`), with the transform set
// every genre needs (rotation, flip for facing, alpha for i-frames / fading)
export function blit(ctx, c, x, y, h, { rot = 0, alpha = 1, flip = 1 } = {}) {
  const s = h / c.height;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip !== 1) ctx.scale(flip, 1);
  ctx.drawImage(c, (-c.width * s) / 2, (-c.height * s) / 2, c.width * s, c.height * s);
  ctx.restore();
}

// Backdrop presets shared by genres. horizon: fraction of H where ground/sky split (0..1).
export function drawBackdrop(ctx, style, t, horizon = 0.62, scroll = 0) {
  const sky = style?.sky || ["#101024", "#1c1c3c"];
  const preset = style?.backdrop || "space";
  const hy = H * horizon;
  const grad = ctx.createLinearGradient(0, 0, 0, Math.max(hy + 40, H));
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(Math.min(0.99, sky.length > 2 ? 0.6 : 1), sky[1] || sky[0]);
  if (sky[2]) grad.addColorStop(1, sky[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (preset === "synthwave") {
    // retro sun with slits
    const cx = W * 0.64, cy = hy - 78;
    const sg = ctx.createRadialGradient(cx, cy, 8, cx, cy, 105);
    sg.addColorStop(0, "#ffd36e"); sg.addColorStop(0.55, "#ff7a2d"); sg.addColorStop(1, "#ff2d95");
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, 100, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = 0.9; ctx.fillStyle = sg;
    ctx.fillRect(cx - 110, cy - 110, 220, 220);
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 5; i++) {
      const yy = cy + 8 + i * 16 + ((t * 12) % 16);
      ctx.fillRect(cx - 110, yy, 220, 3 + i * 1.6);
    }
    ctx.restore();
    // neon grid floor below horizon
    const [c1, c2] = style?.grid || ["#ff2d95", "#00e5ff"];
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = c1; ctx.lineWidth = 1.4;
    for (let i = 0; i < 15; i++) {
      const p = (i + ((t * 0.9) % 1)) / 15;
      const y = hy + Math.pow(p, 2.2) * (H - hy);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = c2; ctx.globalAlpha = 0.25;
    for (let i = -7; i <= 7; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 40, hy);
      ctx.lineTo(W / 2 + i * 240, H);
      ctx.stroke();
    }
    ctx.restore();
  } else if (preset === "allin") {
    // All In landing energy, no grids/scanlines. Once approved site art is in,
    // the washes become a soft breathing tint over it rather than the whole look.
    const hasHero = heroOk();
    if (hasHero) {
      const hw = HERO_BG.naturalWidth, hh = HERO_BG.naturalHeight;
      const s = Math.max(W / hw, H / hh);
      const dw = hw * s, dh = hh * s;
      ctx.drawImage(HERO_BG, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    // smooth premium gradient washes — All In landing-page energy, no grids/scanlines
    const A = style?.accent || "#3ddcff";
    const B = style?.accent2 || "#8a7cff";
    const C = style?.accent3 || "#ff3d9a";
    // three large soft aurora blobs, slowly breathing
    const blobs = [
      { fx: 0.18, fy: 0.24, col: A, r: W * 0.42, ph: 0.00 },
      { fx: 0.68, fy: 0.30, col: B, r: W * 0.52, ph: 2.1 },
      { fx: 0.47, fy: 0.78, col: C, r: W * 0.46, ph: 4.4 },
    ];
    ctx.save();
    ctx.globalAlpha = hasHero ? 0.28 : 1;
    for (const b of blobs) {
      const breathe = 0.82 + 0.18 * Math.sin(t * 0.18 + b.ph);
      const x = W * b.fx + Math.sin(t * 0.07 + b.ph) * 26;
      const y = H * b.fy + Math.cos(t * 0.05 + b.ph) * 18;
      const g = ctx.createRadialGradient(x, y, 1, x, y, b.r * breathe);
      g.addColorStop(0, `${b.col}2e`);
      g.addColorStop(0.5, `${b.col}14`);
      g.addColorStop(1, `${b.col}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    if (!hasHero) {
      // faint grade dots: barely-there constellations (fallback path only —
      // the photo already brings its own grain)
      ctx.save();
      for (let i = 0; i < 34; i++) {
        const x = (hash(i * 3 + 1) * W + t * (3 + (i % 7))) % W;
        const y = hash(i * 5 + 2) * H * 0.86;
        ctx.globalAlpha = 0.05 + hash(i + 9) * 0.10 + 0.04 * Math.sin(t + i);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(x, y, 0.9 + hash(i) * 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // gentle bottom vignette so menus stay readable
    const vg = ctx.createLinearGradient(0, H * 0.55, 0, H);
    vg.addColorStop(0, "rgba(4,6,14,0)"); vg.addColorStop(1, "rgba(4,6,14,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  } else if (preset === "hills") {
    // sun + drifting clouds + 3 parallax hill layers
    ctx.save();
    const sg = ctx.createRadialGradient(W * 0.2, H * 0.2, 10, W * 0.2, H * 0.2, 90);
    sg.addColorStop(0, "#fff7c9"); sg.addColorStop(1, "rgba(255,247,201,0)");
    ctx.fillStyle = sg; ctx.fillRect(W * 0.2 - 100, H * 0.2 - 100, 200, 200);
    ctx.restore();
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 4; i++) {
      const x = ((hash(i * 7 + 3) * W + t * (8 + i * 4)) % (W + 160)) - 80;
      const y = H * (0.12 + hash(i) * 0.14);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(x, y, 46 + hash(i + 9) * 26, 15 + hash(i + 4) * 9, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 34, y + 4, 30, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const layers = [
      { y: hy - 30, amp: 26, col: style?.hillFar || "#a9df9f", sp: 12, off: 0 },
      { y: hy + 26, amp: 34, col: style?.hillNear || "#5cb85c", sp: 30, off: 40 },
      { y: hy + 86, amp: 40, col: style?.hillNear || "#5cb85c", sp: 60, off: 90 },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) {
        const u = (x + scroll * L.sp) * 0.011;
        const y = L.y - (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + L.off) * 0.4) * L.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
  } else if (preset === "clouds") {
    // Super-Mario-brothers sky: sun glow + parallax cloud banks
    ctx.save();
    const fg = ctx.createRadialGradient(W * 0.78, H * 0.16, 6, W * 0.78, H * 0.16, 120);
    fg.addColorStop(0, "rgba(255,255,255,.95)");
    fg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(W * 0.78 - 130, H * 0.16 - 130, 260, 260);
    ctx.restore();
    for (const layer of [
      { off: 3, n: 5, y0: 0.05, spread: 0.13, w0: 150, sp: 12, alpha: 0.5 },
      { off: 11, n: 4, y0: 0.22, spread: 0.15, w0: 260, sp: 26, alpha: 0.75 },
      { off: 23, n: 2, y0: 0.36, spread: 0.1, w0: 190, sp: 44, alpha: 0.95 },
    ]) {
      const span = W + 340;
      for (let i = 0; i < layer.n; i++) {
        let u = (hash(i * 17 + layer.off) * span + t * layer.sp - scroll * layer.sp * 0.5) % span;
        if (u < 0) u += span;
        ctx.globalAlpha = layer.alpha * (0.8 + hash(i + 41) * 0.2);
        drawCloud(ctx, u - 170, H * (layer.y0 + hash(i * 7 + layer.off) * layer.spread) - 40, layer.w0 + hash(i + 5) * 90);
        ctx.globalAlpha = 1;
      }
    }
  } else if (preset === "ice") {
    ctx.save();
    for (let i = 0; i < 2; i++) { // aurora ribbons
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = i ? "#7be3ff" : "#b18cff";
      ctx.beginPath();
      ctx.moveTo(0, H * 0.2);
      for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * (0.16 + i * 0.07) + Math.sin(x * 0.01 + t * (0.5 + i * 0.2)) * 36);
      ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.8; ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 70; i++) {
      const x = hash(i) * W;
      const y = (hash(i + 50) * H + t * (14 + hash(i + 7) * 26)) % H;
      ctx.fillRect(x, y, 2 + hash(i + 3) * 2, 2 + hash(i + 3) * 2);
    }
    ctx.restore();
  } else { // space (default)
    ctx.save();
    for (let i = 0; i < 110; i++) {
      const x = hash(i) * W, y = hash(i + 100) * hy;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (1 + hash(i + 9) * 2) + i));
      ctx.globalAlpha = tw;
      ctx.fillStyle = i % 9 === 0 ? (style?.accent || "#7dfcff") : "#ffffff";
      ctx.fillRect(x, y, i % 13 === 0 ? 2.5 : 1.6, i % 13 === 0 ? 2.5 : 1.6);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#7a2bbf";
    ctx.beginPath(); ctx.ellipse(W * 0.72, hy * 0.4, 190, 90, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#00b4d8";
    ctx.beginPath(); ctx.ellipse(W * 0.25, hy * 0.7, 150, 70, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ---- input -----------------------------------------------------------------
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyR", "Enter", "Escape"]);

function createInput(target) {
  const downSet = new Set();
  const justSet = new Set();
  window.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) justSet.add(e.code);
    downSet.add(e.code);
  });
  window.addEventListener("keyup", (e) => downSet.delete(e.code));
  window.addEventListener("blur", () => downSet.clear());
  return {
    down: (c) => downSet.has(c),
    just: (c) => justSet.has(c),
    left: () => downSet.has("ArrowLeft") || downSet.has("KeyA"),
    right: () => downSet.has("ArrowRight") || downSet.has("KeyD"),
    up: () => downSet.has("ArrowUp") || downSet.has("KeyW"),
    downKey: () => downSet.has("ArrowDown") || downSet.has("KeyS"),
    jumpJust: () => justSet.has("Space") || justSet.has("ArrowUp") || justSet.has("KeyW"),
    anyJust: () => justSet.size > 0,
    endFrame: () => justSet.clear(),
  };
}

// ---- engine ----------------------------------------------------------------
export function createEngine(canvas) {
  const ctx = canvas.getContext("2d");
  const eng = {
    W, H, t: 0, scene: null, paused: false, shakeK: 0,
    input: createInput(canvas),
    setScene(scene, params) {
      eng.scene?.exit?.();
      eng.scene = scene;
      scene.enter?.(params, eng);
    },
    shake(k = 1) { eng.shakeK = Math.max(eng.shakeK, k); },
  };

  let last = performance.now();
  let cssW = 0, cssH = 0, lastDpr = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    eng.t += dt;

    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cw !== cssW || ch !== cssH || dpr !== lastDpr) {
      cssW = cw; cssH = ch; lastDpr = dpr;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
    }
    const s = Math.min(canvas.width / W, canvas.height / H);
    const ox = (canvas.width - W * s) / 2;
    const oy = (canvas.height - H * s) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    if (eng.shakeK > 0) {
      const k = eng.shakeK * 10;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      eng.shakeK = Math.max(0, eng.shakeK - dt * 2.2);
    }

    if (eng.scene) {
      if (!eng.paused) eng.scene.update?.(dt, eng.input, eng);
      eng.scene.draw?.(ctx, eng);
    }

    ctx.restore();

    // fade flash for hits / transitions
    if (eng.flash && eng.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, eng.flash);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      eng.flash = Math.max(0, eng.flash - dt * 2.5);
    }

    eng.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return eng;
}
