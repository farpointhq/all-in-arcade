// SLINGSHOT genre — "Slingshot Duck Season" · mark-abdallah-slingshot-duck-season
//
// Mark Abdallah's booth idea: Duck Hunt for the NES generation, mouse edition. The dog walks
// the grass, sniffs, and flushes a flight of ducks; the player grabs the pebble in the
// slingshot, drags it back (drag length = force, drag direction = angle) and lets fly.
// Three pebbles a take-off; each flight has a duck quota; fail it and the dog laughs.
// Fewer birds on screen early on — the "easier" knob Mark asked for (maxOnScreen per flight).
//
// All actors are Route A procedural pixel art (cell-rasterized, baked once, no emoji, no
// assets). Chip-tune SFX are synthesized locally on the shared AudioContext — audio.js is
// a shared file and stays untouched. ?debug=1 exposes window.__DUCK.read() + a DOM beacon.

import { W, H, clamp, hash, drawText, seasonTint, seasonNow } from "../core.js";

// ---------- cell-raster bakery (baked once per key, blitted at integer-ish scale) ----------
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
function blitCell(ctx, c, x, y, o = {}) {
  const cell = o.cell || 3, anchor = o.anchor || "center";
  const w = c.width * cell, h = c.height * cell;
  ctx.save();
  ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(o.flip, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, -w / 2, anchor === "bottom" ? -h : -h / 2, w, h);
  ctx.restore();
}
function stamp(g, cx, cy, rx, ry, col) { // pixel ellipse in cell space
  g.fillStyle = col;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) g.fillRect(x, y, 1, 1);
    }
}

// ---------- palette ----------
const P = {
  wood: "#a9743f", woodD: "#7c5233", woodL: "#c99a63",
  dogFur: "#d8a35c", dogDk: "#8a5a30", dogCream: "#f2e3c2", ink: "#1a1410",
  leafA: "#2f7a3d", leafB: "#3f9a4d", leafC: "#57b862",
  stone: "#9aa2a8", stoneD: "#6f777d", stoneL: "#c6cdd2",
  cloudW: "#ffffff", cloudS: "#dfeef7",
  mallard: "#2e7d3f", mallardL: "#46a35a",
  red: "#c23b2e", redL: "#e05a48",
  body: "#4a3626", wing: "#6b5138", belly: "#e9d9ac",
  bill: "#e8a13c", eye: "#141414",
};

// ---------- painters ----------
function paintDuck(g, red, pose) { // pose 0/1 wing up/down · 2 hit (belly-up, X eyes)
  const head = red ? P.red : P.mallard;
  const headL = red ? P.redL : P.mallardL;
  if (pose === 2) {
    stamp(g, 8.5, 6.8, 6.4, 3.2, P.belly);
    stamp(g, 8.5, 5.4, 5.0, 2.2, P.body);
    stamp(g, 3.2, 5.2, 2.6, 2.0, P.wing);
    stamp(g, 13.8, 5.2, 2.6, 2.0, P.wing);
    stamp(g, 12.0, 2.6, 2.2, 2.0, head);
    g.fillStyle = P.bill; g.fillRect(14.0, 2.2, 2.8, 1.4);
    g.fillStyle = P.eye;
    g.fillRect(11.2, 1.8, 1, 1); g.fillRect(12.6, 1.8, 1, 1); g.fillRect(11.9, 2.5, 1, 1);
    g.fillStyle = P.bill;
    g.fillRect(6, 11.4, 1, 1.4); g.fillRect(9, 11.4, 1, 1.4);
    return;
  }
  // tail
  g.fillStyle = P.wing;
  g.fillRect(1, 6, 3, 1); g.fillRect(2, 5, 2, 1); g.fillRect(2, 7, 2, 1);
  // body + belly
  stamp(g, 9, 7.4, 6.2, 3.0, P.body);
  stamp(g, 9.6, 8.8, 4.6, 1.7, P.belly);
  // head + neck
  stamp(g, 12.6, 3.4, 2.7, 2.5, head);
  stamp(g, 11.4, 4.8, 1.6, 1.8, head);
  g.fillStyle = headL; g.fillRect(11.8, 2.0, 1.4, 1);
  // bill + eye
  g.fillStyle = P.bill; g.fillRect(14.8, 3.0, 2.8, 1.5);
  g.fillStyle = P.eye; g.fillRect(13.0, 2.4, 1.1, 1.1);
  // wing flap
  if (pose === 0) {
    stamp(g, 6.2, 3.8, 3.6, 2.2, P.wing);
    stamp(g, 5.4, 2.2, 2.2, 1.4, P.wing);
  } else {
    stamp(g, 6.8, 9.6, 3.6, 2.0, P.wing);
    g.fillStyle = P.wing; g.fillRect(4.2, 10.6, 3, 1);
  }
}

function paintDog(g, pose, frame) { // walk0/1 · sniff · laugh0/1 · grab
  const fur = P.dogFur, dk = P.dogDk, cr = P.dogCream;
  const bob = frame === 1 ? 1 : 0;
  if (pose === "laugh") {
    stamp(g, 10, 6 + bob, 6.5, 5.0, fur);
    stamp(g, 17, 4.5 + bob, 4.6, 4.0, fur);
    g.fillStyle = dk; g.fillRect(19, 2.6 + bob, 4, 2.6);
    g.fillStyle = cr; g.fillRect(19.6, 4.2 + bob, 2.6, 1);
    g.fillStyle = P.ink; g.fillRect(20.4, 1.6 + bob, 1.3, 1.3);
    g.fillStyle = P.ink;
    g.fillRect(16, 2.6 + bob, 1, 1); g.fillRect(17, 1.8 + bob, 1, 1); g.fillRect(18, 2.6 + bob, 1, 1);
    g.fillStyle = dk; g.fillRect(14.6, 0.4 + bob, 2.2, 3);
    g.fillStyle = cr; g.fillRect(6, 2 + bob, 2.4, 2.4); g.fillRect(9.4, 1.2 + bob, 2.4, 2.4);
    g.fillStyle = fur; g.fillRect(7, 11 + bob, 2.4, 7); g.fillRect(12, 11 + bob, 2.4, 7);
    g.fillStyle = dk; g.fillRect(2.4, 3 + bob, 2, 4);
    return;
  }
  if (pose === "grab") {
    stamp(g, 9, 10, 6.8, 4.4, fur);
    stamp(g, 15.6, 8, 4.4, 3.8, fur);
    g.fillStyle = P.ink; g.fillRect(18.4, 7, 1.3, 1.3);
    g.fillStyle = P.bill; g.fillRect(19.6, 8.2, 2.6, 1.4);
    g.fillStyle = P.ink; g.fillRect(15.2, 6.6, 1.2, 1.2);
    g.fillStyle = dk; g.fillRect(12.6, 4.6, 2.4, 3);
    g.fillStyle = cr; g.fillRect(4.4, 6.2, 2.6, 2.6);
    stamp(g, 5.6, 3.2, 2.6, 1.5, P.body);
    g.fillStyle = P.belly; g.fillRect(4.2, 1.8, 2.4, 1);
    g.fillStyle = fur; g.fillRect(7, 12, 2.4, 6); g.fillRect(12, 12, 2.4, 6);
    g.fillStyle = dk; g.fillRect(2, 6, 2, 3.4);
    return;
  }
  const sniff = pose === "sniff";
  stamp(g, 10, 9, 7.2, 4.6, fur);
  const hy = sniff ? 12.4 : 7.6;
  stamp(g, 17.4, hy, 4.6, 4.0, fur);
  g.fillStyle = P.ink; g.fillRect(20.8, hy + (sniff ? 1.4 : -0.8), 1.4, 1.4);
  g.fillStyle = P.bill; g.fillRect(21.4, hy + (sniff ? 0 : 1), 2.6, 1.4);
  g.fillStyle = P.ink; g.fillRect(16.2, hy - 1.6, 1.2, 1.2);
  g.fillStyle = dk; g.fillRect(14.4, hy - 4.6, 2.6, 4.2);
  g.fillStyle = fur;
  if (pose === "walk") {
    if (frame === 0) { g.fillRect(6, 13, 2.4, 6); g.fillRect(13, 13.6, 2.4, 5.4); }
    else { g.fillRect(6, 13.6, 2.4, 5.4); g.fillRect(13, 13, 2.4, 6); }
    g.fillRect(9.4, 13.4, 2.4, 5.6);
  } else {
    g.fillRect(6, 13.2, 2.4, 5.8); g.fillRect(13, 13.2, 2.4, 5.8);
    if (sniff) { g.fillStyle = cr; g.fillRect(15, 15.4, 2.2, 2.2); }
  }
  g.fillStyle = dk;
  if (sniff) g.fillRect(2.6, 8, 2, 4); else g.fillRect(2.2, 4.4, 2, 4.4);
  g.fillStyle = "#b23a2f"; g.fillRect(14.2, sniff ? 10.4 : 10, 2.2, 3.2);
}

function paintSling(g) {
  g.fillStyle = P.woodD; g.fillRect(5.5, 10, 3, 14);
  g.fillStyle = P.wood; g.fillRect(6, 10, 2, 13);
  g.fillStyle = P.wood;
  g.fillRect(2, 2, 2.4, 9); g.fillRect(9.6, 2, 2.4, 9);
  g.fillRect(3.4, 6, 2, 4); g.fillRect(8.6, 6, 2, 4);
  g.fillStyle = P.woodL;
  g.fillRect(2.6, 3, 1, 6); g.fillRect(10.2, 3, 1, 6);
  g.fillStyle = P.ink;
  g.fillRect(1.6, 1.2, 3.2, 1.4); g.fillRect(9.2, 1.2, 3.2, 1.4);
  g.fillStyle = P.leafB;
  g.fillRect(3, 22, 3, 2); g.fillRect(8, 22, 3, 2);
}
function paintTree(g) {
  g.fillStyle = P.woodD; g.fillRect(11, 18, 4, 14);
  g.fillStyle = P.wood; g.fillRect(12, 18, 2, 13);
  g.fillStyle = P.woodD; g.fillRect(8, 20, 4, 1.6); g.fillRect(14, 22, 4, 1.6);
  stamp(g, 13, 9, 10, 7.4, P.leafA);
  stamp(g, 9, 7, 6, 5, P.leafB);
  stamp(g, 17, 6.6, 6.4, 5.2, P.leafB);
  stamp(g, 13, 4, 5.4, 4.2, P.leafC);
  g.fillStyle = P.leafC; g.fillRect(7, 4, 2, 1.4); g.fillRect(19, 3, 2, 1.4);
}
function paintBush(g) {
  stamp(g, 6, 7, 5.4, 3.6, P.leafA);
  stamp(g, 14, 7, 5.6, 3.8, P.leafB);
  stamp(g, 10, 5, 5.2, 4.2, P.leafB);
  stamp(g, 10, 3.4, 3, 2.4, P.leafC);
  g.fillStyle = P.leafA; g.fillRect(2, 9.4, 16, 1.6);
}
function paintCloud(g) {
  stamp(g, 6, 5.6, 4.6, 2.8, P.cloudW);
  stamp(g, 12, 4.4, 5.4, 3.4, P.cloudW);
  stamp(g, 18, 5.8, 4.4, 2.6, P.cloudW);
  g.fillStyle = P.cloudS; g.fillRect(4, 7.4, 16, 1.6);
}
function paintPebble(g) {
  stamp(g, 3, 3, 2.6, 2.4, P.stone);
  g.fillStyle = P.stoneL; g.fillRect(2, 2, 1.4, 1.2);
  g.fillStyle = P.stoneD; g.fillRect(4, 4.2, 1.4, 1.2);
}

// ---------- genre ----------
export const meta = {
  name: "Slingshot Duck Season",
  controls: "MOUSE — grab the pebble in the slingshot, drag back (force + angle), release to fire. 3 pebbles a take-off. Clear each flight's duck quota.",
};

export function create(level, api) {
  const st = level.style || {};
  const D = level.data || {};
  const flightsCfg = (D.flights && D.flights.length ? D.flights : [
    { ducks: 3, maxOnScreen: 1, speed: 150, pass: 2 },
    { ducks: 5, maxOnScreen: 2, speed: 175, pass: 3 },
    { ducks: 6, maxOnScreen: 2, speed: 205, pass: 4, reds: 2 },
  ]);
  const PEB = D.pebbles || 3;
  const qs = new URLSearchParams(location.search);
  const FAST = clamp(parseFloat(qs.get("fast") || "1") || 1, 1, 12);
  const DEBUG = qs.get("debug") === "1";

  // ---- scene geometry ----
  const GROUND = 392;
  const FORK = { x: 133, y: 322 };
  const MAXPULL = 118;
  const GRAV = 980;
  const BUSH = { x: 470 };

  // ---- state ----
  let status = "playing";
  let t = 0, runT = 0;
  let flight = 0, cfg = flightsCfg[0];
  let phase = "intro";          // intro | play | tally | laugh
  let phaseT = 0;
  let queue = 0, flightTotal = 0, flightHits = 0, pass = 0;
  let ducksTotal = 0, hitsTotal = 0, shotsUsed = 0;
  let pebbles = PEB, pebbleLoaded = true, reloadT = 0;
  let score = 0;
  let redsLeft = 0;
  let fleeT = 0, fleeArmed = false, groupGap = 0;
  let lastSeason = seasonNow().id;

  const ducks = [];   // {x,y,vx,vy,baseY,amp,wf,ph,speed,red,mode,vt,spin,deadT}
  const pebs = [];    // {x,y,vx,vy,age,bounced,dead,hits}
  const parts = [];   // {x,y,vx,vy,life,c,s,g}
  const floats = [];  // {x,y,txt,life,c}
  const weather = [];
  let mouse = { x: FORK.x, y: FORK.y, inside: false };
  let drag = { on: false, id: null };
  let creakT = 0;
  const dog = { mode: "walk", x: -70, t: 0, frame: 0, grabX: 0, duckRef: null };

  function seedWeather() {
    weather.length = 0;
    if (lastSeason === "summer") return;
    for (let i = 0; i < 26; i++)
      weather.push({ x: hash(i * 3 + 1) * W, y: hash(i * 7 + 2) * H, v: 26 + hash(i * 11) * 40, ph: hash(i * 13) * 6.3, s: 1 + hash(i * 17) * 2 });
  }
  seedWeather();

  // ---- chip-sfx (local synth; shared audio.js untouched) ----
  let ac = null, bus = null, nbuf = null;
  function initAudio() {
    if (ac || !api.audio.unlocked) return;
    try {
      ac = api.audio.ensure();
      if (!ac) return;
      bus = ac.createGain(); bus.gain.value = 0.5; bus.connect(ac.destination);
      nbuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (_) { ac = null; }
  }
  function tone(f0, f1, t0, dur, wave, vol) {
    if (!ac || ac.state !== "running") return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = wave;
    const T = ac.currentTime + t0;
    o.frequency.setValueAtTime(Math.max(1, f0), T);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), T + dur);
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(vol, T + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, T + dur);
    o.connect(g); g.connect(bus);
    o.start(T); o.stop(T + dur + 0.03);
  }
  function hiss(t0, dur, f, vol) {
    if (!ac || ac.state !== "running") return;
    const src = ac.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 0.8;
    const g = ac.createGain();
    const T = ac.currentTime + t0;
    g.gain.setValueAtTime(vol, T);
    g.gain.exponentialRampToValueAtTime(0.0001, T + dur);
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.start(T); src.stop(T + dur + 0.02);
  }
  const sfxCounts = { whistle: 0, quack: 0, twang: 0, whack: 0, fall: 0, plop: 0, laugh: 0, passJingle: 0, flee: 0, creak: 0 };
  function laughPair(f, t0) { // one nasal "huk-huk" pair — original synth, Duck-Hunt-shaped rhythm
    tone(f, f * 0.74, t0, 0.085, "square", 0.12);
    tone(f * 0.5, f * 0.4, t0, 0.09, "sawtooth", 0.05);
    tone(f * 0.88, f * 0.62, t0 + 0.095, 0.075, "square", 0.10);
    tone(f * 0.46, f * 0.34, t0 + 0.095, 0.08, "sawtooth", 0.04);
    hiss(t0, 0.03, 1400, 0.03);
  }
  const sfx = {
    whistle() { sfxCounts.whistle++; tone(700, 1500, 0, 0.30, "sine", 0.15); tone(1050, 2250, 0.06, 0.22, "sine", 0.09); },
    quack() { sfxCounts.quack++; tone(430, 300, 0, 0.09, "square", 0.13); tone(360, 250, 0.11, 0.08, "square", 0.11); },
    flee() { sfxCounts.flee++; tone(520, 900, 0, 0.10, "square", 0.09); tone(700, 1150, 0.12, 0.12, "square", 0.09); },
    creak(k) { sfxCounts.creak++; hiss(0, 0.05, 500 + k * 1600, 0.05); },
    twang(k) { sfxCounts.twang++; tone(180, 90, 0, 0.07, "square", 0.15); tone(240 + k * 520, 130, 0, 0.10, "sawtooth", 0.07); hiss(0, 0.04, 2400, 0.05); },
    whack() { sfxCounts.whack++; hiss(0, 0.07, 900, 0.2); tone(160, 70, 0, 0.10, "square", 0.18); },
    fall() { sfxCounts.fall++; tone(1300, 320, 0, 0.5, "sine", 0.08); },
    plop() { sfxCounts.plop++; hiss(0, 0.08, 300, 0.14); tone(110, 60, 0, 0.1, "sine", 0.13); },
    laugh() {
      sfxCounts.laugh++;
      for (let pass = 0; pass < 2; pass++) {
        const sc = 1 - pass * 0.14;
        for (let i = 0; i < 3; i++) laughPair((540 - i * 55) * sc, pass * 0.72 + i * 0.19);
      }
    },
    passJingle() { sfxCounts.passJingle++; [523, 659, 784].forEach((f, i) => tone(f, f, i * 0.09, 0.12, "square", 0.11)); },
  };

  // ---- pointer ----
  const CV = document.getElementById("stage");
  if (CV) {
    CV.style.cursor = "crosshair";
    CV.style.touchAction = "none";
  }
  function toVir(e) {
    if (!CV) return { x: 0, y: 0 };
    const r = CV.getBoundingClientRect();
    const dw = CV.width || 1, dh = CV.height || 1;
    const s = Math.min(dw / W, dh / H);
    const ox = (dw - W * s) / 2, oy = (dh - H * s) / 2;
    return {
      x: ((e.clientX - r.left) * (dw / r.width) - ox) / s,
      y: ((e.clientY - r.top) * (dh / r.height) - oy) / s,
    };
  }
  function pouchPos() {
    if (!drag.on) return { x: FORK.x, y: FORK.y };
    let dx = mouse.x - FORK.x, dy = mouse.y - FORK.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > MAXPULL) { dx = dx / d * MAXPULL; dy = dy / d * MAXPULL; }
    return { x: FORK.x + dx, y: FORK.y + dy };
  }
  function pouchVec() {
    const p = pouchPos();
    const dx = FORK.x - p.x, dy = FORK.y - p.y;
    return { dx, dy, len: Math.hypot(dx, dy) };
  }
  function firePebble(pull) {
    const k = clamp(pull.len / MAXPULL, 0.18, 1);
    const sp = 240 + k * 1320;
    const dirx = pull.dx / (pull.len || 1), diry = pull.dy / (pull.len || 1);
    pebs.push({ x: FORK.x, y: FORK.y, vx: dirx * sp, vy: diry * sp, age: 0, bounced: false, dead: false, hits: 0 });
    pebbles--; shotsUsed++; pebbleLoaded = false; reloadT = 0.5;
    sfx.twang(k);
  }
  if (CV) {
    CV.onpointerdown = (e) => {
      const p = toVir(e);
      mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
      if (phase === "intro") { phaseT = 99; return; }
      if (phase !== "play" || !pebbleLoaded || pebbles <= 0) return;
      const dx = p.x - FORK.x, dy = p.y - FORK.y;
      if (dx * dx + dy * dy < 64 * 64) { // generous grab — booth hands
        drag.on = true; drag.id = e.pointerId;
        try { CV.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
        creakT = 0;
      }
    };
    CV.onpointermove = (e) => {
      const p = toVir(e);
      mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
    };
    const up = (e) => {
      if (!drag.on || e.pointerId !== drag.id) return;
      const pull = pouchVec(); // read BEFORE leaving the drag state — pouchPos() depends on it
      drag.on = false;
      if (pull.len < 14) return; // fizzle — pebble stays in the pouch
      firePebble(pull);
    };
    CV.onpointerup = up;
    CV.onpointercancel = up;
  }

  // ---- spawning / flight flow ----
  function startFlight(i) {
    flight = i; cfg = flightsCfg[i];
    queue = cfg.ducks; flightTotal = cfg.ducks;
    flightHits = 0;
    pass = cfg.pass || Math.ceil(cfg.ducks * 0.6);
    redsLeft = cfg.reds || 0;
    pebbles = PEB; pebbleLoaded = true; fleeT = 0; fleeArmed = false; groupGap = 0;
    ducks.length = 0; pebs.length = 0;
    phase = "intro"; phaseT = 0;
    dog.mode = "walk"; dog.x = -70; dog.t = 0; dog.duckRef = null;
  }
  function releaseGroup() {
    const group = Math.min(cfg.maxOnScreen || 1, queue);
    queue -= group;
    for (let i = 0; i < group; i++) spawnDuck(i);
    pebbles = PEB; pebbleLoaded = true;
    sfx.quack();
  }
  function spawnDuck(i) {
    const red = redsLeft > 0 && (flightTotal - queue + i) % 2 === 1;
    if (red) redsLeft--;
    const speed = cfg.speed * (red ? 1.5 : 1) * (0.9 + hash(ducksTotal * 7) * 0.25);
    ducks.push({
      x: BUSH.x - 10 - i * 30, y: GROUND - 30,
      vx: 60, vy: -230,
      baseY: 96 + hash(ducksTotal * 3 + flight) * 210,
      amp: 16 + hash(ducksTotal * 5) * 14,
      wf: 5 + hash(ducksTotal * 11) * 3,
      ph: hash(ducksTotal * 13) * 6.3,
      speed, red, mode: "rise", vt: 0, spin: 0, deadT: 0,
    });
    ducksTotal++;
  }
  function fleeSurvivors() {
    let any = false;
    for (const d of ducks) {
      if (d.mode === "rise" || d.mode === "fly") { d.mode = "flee"; d.vt = 0; any = true; }
    }
    if (any) sfx.flee();
  }
  function nextFlightOrWin() {
    if (flight + 1 < flightsCfg.length) startFlight(flight + 1);
    else {
      status = "won";
      api.eng.flash = 0.5;
      api.audio.sfx("win");
      api.complete({ flights: flightsCfg.length, ducks: ducksTotal, hits: hitsTotal, shots: shotsUsed, score });
    }
  }

  // ---- particles ----
  function feathers(x, y, red) {
    for (let i = 0; i < 9; i++) {
      const a = hash(i * 3 + ducksTotal) * 6.28;
      parts.push({ x, y, vx: Math.cos(a) * (40 + hash(i) * 80), vy: Math.sin(a) * 60 - 40, life: 0.5 + hash(i * 7) * 0.3, c: i % 3 ? P.belly : (red ? P.red : P.wing), s: 3, g: 160 });
    }
  }
  function dust(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = hash(i * 11 + 5) * 6.28;
      parts.push({ x, y, vx: Math.cos(a) * 50, vy: -Math.abs(Math.sin(a)) * 60, life: 0.35, c: "#cbb98a", s: 2, g: 300 });
    }
  }

  // ---- debug ----
  let beacon = null, beaconT = 0;
  function snapshot() {
    return {
      status, phase, flight, runT,
      ducksOnScreen: ducks.filter((d) => d.mode === "rise" || d.mode === "fly").length,
      liveDucks: ducks.filter((d) => d.mode !== "flee" && d.mode !== "gone" && d.mode !== "held").length,
      queue, flightTotal, flightHits, pass,
      pebbles, pebbleLoaded, dragging: drag.on,
      score, hitsTotal, ducksTotal, dog: dog.mode,
      sfx: sfxCounts,
      ducks: ducks.filter((d) => d.mode === "rise" || d.mode === "fly").slice(0, 3).map((d) => ({
        x: Math.round(d.x), y: Math.round(d.y),
        vx: Math.round(d.speed),
        vy: Math.round(d.mode === "rise" ? d.vy : Math.cos(t * d.wf * 0.4 + d.ph) * d.amp * d.wf * 0.4),
        red: d.red,
      })),
    };
  }
  if (DEBUG) {
    const old = document.getElementById("duckBeacon");
    if (old) old.remove();
    beacon = document.createElement("div");
    beacon.id = "duckBeacon";
    beacon.style.cssText = "position:fixed;left:4px;top:2px;z-index:9999;font:10px/1.25 monospace;color:#7dfcff;background:rgba(0,0,0,.55);padding:2px 4px;pointer-events:none;white-space:pre;";
    document.body.appendChild(beacon);
    window.__DUCK = { read: snapshot };
  }

  // ---- hud ----
  let lastHud = "";
  function setHud(mid, right) {
    const key = mid + "|" + right;
    if (key === lastHud) return;
    lastHud = key;
    api.hud({ mid, right });
  }

  // ---- update ----
  function update(dt, input) {
    if (status !== "playing") return;
    dt *= FAST;
    t += dt;
    initAudio();

    const s = seasonNow().id;
    if (s !== lastSeason) { lastSeason = s; seedWeather(); }
    weatherTick(dt);
    partsTick(dt);

    if (phase === "intro") {
      phaseT += dt;
      if (dog.mode === "walk") {
        dog.x += 220 * dt;
        dog.t += dt;
        dog.frame = Math.floor(dog.t * 6) % 2;
        if (dog.x >= 326 || phaseT > 90) { dog.x = 326; dog.mode = "sniff"; dog.t = 0; }
      } else {
        dog.t += dt;
        if (dog.t > 1.05 || phaseT > 90) {
          sfx.whistle();
          dog.mode = "hide"; // ducks up, dog ducks down — grabs/laughs re-show him
          phase = "play"; phaseT = 0; runT = 0;
          releaseGroup();
        }
      }
    } else if (phase === "play") {
      runT += dt;
      phaseT += dt;
      ducksTick(dt);
      pebsTick(dt);
      progressTick(dt);
      if (drag.on) {
        creakT -= dt;
        if (creakT <= 0) { sfx.creak(pouchVec().len / MAXPULL); creakT = 0.09; }
      }
    } else if (phase === "tally") {
      phaseT += dt;
      ducksTick(dt);
      pebsTick(dt);
      if (phaseT > 1.15) nextFlightOrWin();
    } else if (phase === "laugh") {
      phaseT += dt;
      dog.t += dt;
      ducksTick(dt);
      if (phaseT > 2.35) { // two full laugh passes, then the verdict
        status = "lost";
        api.audio.sfx("lose");
        api.fail("The dog is howling — flight " + (flight + 1) + " needed " + pass + " hits, you landed " + flightHits + ".");
      }
    }

    // dog grab anim (any phase)
    if (dog.mode === "grab") {
      dog.t += dt;
      if (dog.t > 0.85) {
        dog.mode = "hide";
        if (dog.duckRef) {
          const i = ducks.indexOf(dog.duckRef);
          if (i >= 0) ducks.splice(i, 1);
          dog.duckRef = null;
        }
      }
    }

    let mid;
    if (phase === "intro") mid = "FLIGHT " + (flight + 1) + "/" + flightsCfg.length + " — the dog hunts...";
    else if (phase === "tally") mid = "FLIGHT PASSED — " + flightHits + "/" + flightTotal + " ducks";
    else if (phase === "laugh") mid = "The dog laughs...";
    else mid = "FLIGHT " + (flight + 1) + "/" + flightsCfg.length + " · ✓ " + hitsTotal + " · AMMO " + Math.max(0, pebbles); // issue #15 E: ♥ is reserved for lives — pebbles get a plain word
    setHud(mid, "★ " + score);

    if (DEBUG && beacon) {
      beaconT -= dt;
      if (beaconT <= 0) { beacon.textContent = JSON.stringify(snapshot()); beaconT = 0.12; }
    }
  }

  function ducksTick(dt) {
    for (const d of ducks) {
      d.vt += dt;
      if (d.mode === "rise") {
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.vy += 140 * dt; d.vx += (d.speed - d.vx) * dt * 2.2;
        if (d.y <= d.baseY || d.vy >= -10) d.mode = "fly";
      } else if (d.mode === "fly") {
        d.x += d.speed * dt;
        d.y = d.baseY + Math.sin(t * d.wf * 0.4 + d.ph) * d.amp;
        if (d.x > W + 40) d.mode = "gone";
      } else if (d.mode === "flee") {
        d.x += d.speed * 1.4 * dt; d.y -= 260 * dt;
        if (d.y < -50 || d.x > W + 40) d.mode = "gone";
      } else if (d.mode === "dead") {
        d.spin += dt * 6;
        if (d.vt < 0.26) { d.y += d.vy * dt; d.vy = -150; }
        else { d.vy += GRAV * dt; d.y += d.vy * dt; d.x += 30 * dt; }
        if (d.y >= GROUND - 6) {
          d.y = GROUND - 6; d.mode = "down"; d.deadT = 0;
          sfx.plop(); dust(d.x, GROUND - 4);
        }
      } else if (d.mode === "down") {
        d.deadT += dt;
        if (d.deadT > 0.55 && dog.mode === "hide") {
          d.mode = "held";
          dog.mode = "grab"; dog.grabX = d.x; dog.t = 0; dog.duckRef = d;
        }
      }
    }
    for (let i = ducks.length - 1; i >= 0; i--) if (ducks[i].mode === "gone") ducks.splice(i, 1);
  }

  function pebsTick(dt) {
    for (const pb of pebs) {
      if (pb.dead) continue;
      pb.age += dt;
      pb.vy += GRAV * dt;
      pb.x += pb.vx * dt; pb.y += pb.vy * dt;
      // hits — generous r=30 (booth-forgiving)
      for (const d of ducks) {
        if (d.mode !== "rise" && d.mode !== "fly") continue;
        const dx = d.x - pb.x, dy = d.y - pb.y;
        if (dx * dx + dy * dy < 30 * 30) {
          d.mode = "dead"; d.vt = 0; d.vy = -150; d.spin = 0;
          pb.hits++; flightHits++; hitsTotal++;
          sfx.whack(); sfx.quack(); sfx.fall();
          api.eng.shake(0.5);
          feathers(d.x, d.y, d.red);
          const base = d.red ? 800 : 500;
          const bonus = (pb.hits - 1) * 250;
          score += base + bonus;
          floats.push({ x: d.x, y: d.y - 20, txt: "+" + (base + bonus), life: 0.9, c: "#ffd23e" });
          break;
        }
      }
      if (!pb.bounced && pb.y >= GROUND - 2) {
        pb.bounced = true; pb.y = GROUND - 2;
        pb.vy *= -0.32; pb.vx *= 0.55;
        dust(pb.x, GROUND - 2); sfx.plop();
        if (Math.abs(pb.vy) < 60) pb.dead = true;
      }
      if (pb.x < -30 || pb.x > W + 30 || pb.age > 4) pb.dead = true;
    }
    for (let i = pebs.length - 1; i >= 0; i--) if (pebs[i].dead) pebs.splice(i, 1);
  }

  function progressTick(dt) {
    if (!pebbleLoaded) {
      reloadT -= dt;
      if (reloadT <= 0 && pebbles > 0) pebbleLoaded = true;
    }
    const alive = ducks.some((d) => d.mode === "rise" || d.mode === "fly" || d.mode === "dead" || d.mode === "down");
    const pending = pebs.some((pb) => !pb.dead);

    if (!alive && !pending && fleeT <= 0) {
      if (queue > 0) {
        if (groupGap <= 0) groupGap = 0.5;
        groupGap -= dt;
        if (groupGap <= 0) releaseGroup();
        return;
      }
      // flight over — quota check
      if (flightHits >= pass) {
        phase = "tally"; phaseT = 0;
        sfx.passJingle();
      } else {
        phase = "laugh"; phaseT = 0;
        dog.mode = "laugh"; dog.t = 0;
        sfx.laugh();
      }
      return;
    }
    if (pebbles <= 0 && !pebbleLoaded && !pending && !fleeArmed) { fleeArmed = true; fleeT = 0.8; }
    if (fleeArmed && fleeT > 0) {
      fleeT -= dt;
      if (fleeT <= 0) { fleeSurvivors(); fleeArmed = false; }
    }
  }

  function weatherTick(dt) {
    for (const f of weather) {
      f.y += f.v * dt;
      f.x += Math.sin(t * 1.2 + f.ph) * 14 * dt;
      if (f.y > H + 6) { f.y = -6; f.x = hash(f.ph * 997 + Math.floor(t * 2)) * W; }
    }
  }
  function partsTick(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt; f.y -= 26 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  // ---- draw ----
  function drawSky(ctx) {
    const sky = st.sky || ["#4fa8e8", "#7fc9f2", "#cfeeff"];
    const grd = ctx.createLinearGradient(0, 0, 0, GROUND);
    grd.addColorStop(0, sky[0]);
    grd.addColorStop(0.62, sky[1] || sky[0]);
    grd.addColorStop(1, sky[2] || sky[0]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, GROUND);
    // blocky NES sun
    const sx = 856, sy = 78;
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(sx - 8, sy - 14, 16, 28); ctx.fillRect(sx - 14, sy - 8, 28, 16);
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.fillRect(sx - 6, sy - 10, 10, 5);
    // drifting blocky clouds
    const clouds = [[150, 70, 3], [420, 46, 2.4], [700, 96, 2.6], [260, 120, 2]];
    const cc = bake("cloud", 24, 9, paintCloud);
    for (let i = 0; i < clouds.length; i++) {
      const [cx, cy, cs] = clouds[i];
      const x = ((cx + t * (4 + i * 1.5)) % (W + 120)) - 60;
      blitCell(ctx, cc, x, cy, { cell: cs });
    }
  }
  function drawGround(ctx) {
    // far bank + treeline bumps
    ctx.fillStyle = "#2f6a33";
    ctx.fillRect(0, GROUND - 14, W, 14);
    ctx.fillStyle = "#3f7d3a";
    for (let x = 0; x < W; x += 26) ctx.fillRect(x + (x % 52), GROUND - 22, 14, 8);
    // grass
    ctx.fillStyle = st.ground || "#5a9e46";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, GROUND, W, 5);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = GROUND + 8; y < H; y += 22) ctx.fillRect(0, y, W, 11);
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    for (let i = 0; i < 40; i++) {
      const x = hash(i * 5 + 3) * W, y = GROUND + 10 + hash(i * 9 + 1) * (H - GROUND - 16);
      ctx.fillRect(x, y, 3, 2); ctx.fillRect(x + 1, y - 2, 3, 2);
    }
  }
  function drawDuck(ctx, d) {
    const key = d.red ? "duckR" : "duck";
    if (d.mode === "dead" || d.mode === "down") {
      const c = bake(key + ":2", 18, 13, (g) => paintDuck(g, d.red, 2));
      blitCell(ctx, c, d.x, d.y, { cell: 2, rot: d.mode === "dead" ? Math.min(Math.PI, d.spin) : 0 });
    } else if (d.mode === "held") {
      // drawn by the dog's grab pose
    } else {
      const f = d.mode === "flee" ? (Math.floor(d.vt * 12) % 2) : (Math.floor(d.vt * 6) % 2);
      const c = bake(key + ":" + f, 18, 13, (g) => paintDuck(g, d.red, f));
      blitCell(ctx, c, d.x, d.y, { cell: 2 });
    }
  }
  function drawDog(ctx) {
    if (dog.mode === "hide") return;
    const x = dog.mode === "grab" ? dog.grabX : dog.x;
    let key;
    if (dog.mode === "walk") key = "dog:walk" + (Math.floor(dog.t * 6) % 2);
    else if (dog.mode === "sniff") key = "dog:sniff";
    else if (dog.mode === "laugh") key = "dog:laugh" + (Math.floor(dog.t * 4) % 2);
    else key = "dog:grab";
    const poses = { walk: "walk", sniff: "sniff", laugh: "laugh", grab: "grab" };
    const c = bake(key, 26, 20, (g) => paintDog(g, poses[dog.mode] || "walk", key.endsWith("1") ? 1 : 0));
    blitCell(ctx, c, x, GROUND + 14, { cell: 4, anchor: "bottom" });
    if (dog.mode === "laugh") { // rising HA HA HA bubbles near the dog
      for (let i = 0; i < 3; i++) {
        const ph = (phaseT * 0.9 + i * 0.33) % 1;
        drawText(ctx, "HA", x - 34 + i * 34, 330 - ph * 52, { size: 22, color: "#ffe9a8", alpha: 1 - ph, shadow: "rgba(0,0,0,.65)" });
      }
    }
  }
  function drawSling(ctx) {
    const sling = bake("sling", 14, 24, paintSling);
    blitCell(ctx, sling, FORK.x, GROUND + 16, { cell: 4, anchor: "bottom" });
    const loading = pebbleLoaded || drag.on;
    if (!loading) return;
    const p = pouchPos();
    ctx.strokeStyle = "#5a3b1e"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(FORK.x - 15, FORK.y - 2); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(FORK.x + 15, FORK.y - 2); ctx.lineTo(p.x, p.y); ctx.stroke();
    blitCell(ctx, bake("pebble", 6, 6, paintPebble), p.x, p.y, { cell: 2.4 });
    if (drag.on) {
      const pull = pouchVec();
      const k = clamp(pull.len / MAXPULL, 0.18, 1);
      const sp = 240 + k * 1320;
      let vx = pull.dx / (pull.len || 1) * sp, vy = pull.dy / (pull.len || 1) * sp;
      let px = p.x, py = p.y;
      ctx.fillStyle = "#ffffff";
      const step = 0.055;
      for (let i = 0; i < 9; i++) {
        vy += GRAV * step; px += vx * step; py += vy * step;
        ctx.globalAlpha = 0.4 * (1 - i / 9);
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawBanners(ctx) {
    if (phase === "intro") {
      const a = clamp(phaseT * 2.2, 0, 1);
      drawText(ctx, "FLIGHT " + (flight + 1), W / 2, 128, { size: 52, color: "#ffffff", shadow: "rgba(0,0,0,.55)", alpha: a });
      drawText(ctx, cfg.ducks + " DUCKS · QUOTA " + pass + " · 3 PEBBLES A TAKE-OFF", W / 2, 168, { size: 20, color: "#ffe9a8", shadow: "rgba(0,0,0,.6)", alpha: a });
    } else if (phase === "tally") {
      drawText(ctx, "PASSED  ✓  " + flightHits + "/" + flightTotal, W / 2, 140, { size: 44, color: "#8fe89a", shadow: "rgba(0,0,0,.6)" });
    } else if (phase === "laugh") {
      // audio + HA bubbles carry the joke now (drawDog paints them) — no banner
    }
    if (flight === 0 && hitsTotal === 0 && phase === "play") {
      const a = 0.55 + 0.25 * Math.sin(t * 3);
      drawText(ctx, "GRAB THE PEBBLE · DRAG BACK · RELEASE", FORK.x + 230, GROUND + 42, { size: 16, color: "#ffffff", alpha: a, shadow: "rgba(0,0,0,.7)" });
    }
    if (runT < 3.6 && phase === "play" && flight === 0) {
      drawText(ctx, level.objective || "", W / 2, H - 24, { size: 17, color: "#fff", alpha: runT > 2.8 ? (3.6 - runT) / 0.8 : 1, shadow: "rgba(0,0,0,.8)" });
    }
  }

  function draw(ctx) {
    ctx.imageSmoothingEnabled = false;
    drawSky(ctx);
    drawGround(ctx);
    blitCell(ctx, bake("tree", 26, 32, paintTree), 92, GROUND, { cell: 4, anchor: "bottom" });
    blitCell(ctx, bake("bush", 20, 11, paintBush), BUSH.x, GROUND + 6, { cell: 4, anchor: "bottom" });
    for (const d of ducks) drawDuck(ctx, d);
    const pbC = bake("pebble", 6, 6, paintPebble);
    for (const pb of pebs) {
      if (pb.dead) continue;
      blitCell(ctx, pbC, pb.x, pb.y, { cell: 2.2, rot: Math.atan2(pb.vy, pb.vx) });
    }
    drawDog(ctx);
    drawSling(ctx);
    // particles
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    // season weather
    if (lastSeason !== "summer") {
      const col = lastSeason === "winter" ? "#ffffff" : lastSeason === "autumn" ? "#e89544" : "#f6c6de";
      ctx.fillStyle = col;
      for (const f of weather) ctx.fillRect(f.x, f.y, f.s, f.s + (lastSeason === "autumn" ? 1 : 0));
    }
    // score floats
    for (const f of floats) {
      drawText(ctx, f.txt, f.x, f.y, { size: 15, color: f.c, alpha: clamp(f.life * 1.6, 0, 1), shadow: "rgba(0,0,0,.7)" });
    }
    drawBanners(ctx);
    // cursor reticle
    if (mouse.inside && phase === "play") {
      ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, drag.on ? 13 : 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
    }
    // NES scanlines
    ctx.fillStyle = "rgba(8,10,24,0.06)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    seasonTint(ctx, 0.06);
  }

  startFlight(0);
  return { update, draw, status: () => status };
}
