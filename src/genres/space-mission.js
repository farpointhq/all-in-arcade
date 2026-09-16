// SPACE-MISSION genre — "MDA Space Mission" · matt-mayer-mda-space-mission
// Matt Mayer (MDA Space) asked for a space game in three acts: build a satellite from mined
// resources (processors, antennas, microboards), get it to the rocket, launch it into space.
// Built as ONE booth level with a 3-phase state machine:
//   MINE → ASSEMBLE(anim) → CARRY → INTEGRATE(anim) → COUNTDOWN → BURN×3 → CLIMB → DEPLOY → won.
//
// KIOSK-FIRST RULES — no death anywhere: a dropped satellite is re-liftable, a missed burn
// window just retries (its green band shrinks each anomaly), so every first-time player
// reaches orbit. Carrying feels heavy, boulders bump the load off, the oscillating gauge
// gives the launch its timing skill.
//
// ART — Route A procedural pixel art, baked once per key, zero emoji, zero glyphs in
// level.json, zero runtime fetches (operator rule). HUD copy uses text-presentation glyphs
// only (✓ · ★).
//
// BOT — ?bot=1 boots an in-module autopilot (policy generates synthetic input, real keys
// ignored); flavors good / partial (one deliberate miss per burn window) / clumsy (never
// hops while carrying — eats every boulder bump). ?debug=1 exposes window.__MDA =
// { timeScale, state(), … } read-only. ?beats=1 appends one DOM tile per phase transition.

import { W, H, clamp, lerp, hash, drawText, seasonTint, seasonNow } from "../core.js";

export const meta = {
  name: "MDA Space Mission",
  controls: "← → marcher · ESPACE : sauter, puis ENGAGEZ chaque tir moteur · ?v3=1 : tenez immobile près d'une caisse pour charger, ESPACE décharge · EN: ←/→ walk · SPACE jump, then FIRE each burn — stand still near a crate to load, SPACE to unload",
};

// ---- palette (ALL IN brand tokens + regolith) -----------------------------------------
const C = {
  suit: "#e9edf5", suitDk: "#b9c2d4", suitShade: "#8a93ad", white: "#f4f7fd",
  visor: "#ffcf3e", visorHi: "#ffe9a8",
  cyan: "#3ddcff", violet: "#8a7cff", magenta: "#ff3d9a",
  gold: "#e8b64c", goldDk: "#c9972c",
  panel: "#22427c", panelLite: "#3a63b8",
  steel: "#9aa4b4", steelDk: "#5f6878", steelLt: "#d4dbe6",
  rock: "#7d8496", rockDk: "#565d6d", rockLt: "#a9b0bf",
  regolith: "#3a3e50", regolithDk: "#2b2e3c", regolithLit: "#4a4f63",
  engineBlue: "#2c3a5c",
  fire: "#ff7a2d", fireHot: "#ffd166", green: "#46f2b4", danger: "#ff6473",
};

const GROUND = 470; // feet line on the lunar deck

function P(g, x, y, w, h, col, u = 3) { g.fillStyle = col; g.fillRect(x * u, y * u, w * u, h * u); }

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

// ---------- painters (feet at canvas bottom) --------------------------------------------
function paintAstronaut(g, f) { // 12×15 cells, u3 → 36×45 ; f: 0 stand, 1/2 walk, 3 carry
  P(g, 0, 4, 2, 6, C.steelDk);            // backpack
  P(g, 0, 5, 1, 1, C.cyan);
  P(g, 0, 8, 1, 1, C.magenta);
  if (f === 0) { P(g, 4, 10, 2, 4, C.suitDk); P(g, 7, 10, 2, 4, C.suitDk); P(g, 3, 14, 3, 1, C.engineBlue); P(g, 7, 14, 3, 1, C.engineBlue); }
  else if (f === 1) { P(g, 3, 10, 2, 4, C.suitDk); P(g, 8, 12, 2, 2, C.suitDk); P(g, 2, 14, 3, 1, C.engineBlue); P(g, 7, 14, 3, 1, C.engineBlue); }
  else if (f === 2) { P(g, 7, 9, 2, 4, C.suitDk); P(g, 4, 12, 2, 2, C.suitDk); P(g, 2, 12, 3, 1, C.engineBlue); P(g, 8, 13, 2, 1, C.engineBlue); }
  else { P(g, 4, 10, 2, 4, C.suitDk); P(g, 7, 10, 2, 4, C.suitDk); P(g, 3, 14, 2, 1, C.engineBlue); P(g, 6, 14, 3, 1, C.engineBlue); }
  P(g, 2, 4, 8, 6, f === 2 ? C.suitShade : C.suit); // torso
  P(g, 2, 4, 8, 1, C.suitDk);
  P(g, 5, 6, 3, 1, C.cyan);
  P(g, 4, 8, 5, 1, C.suitDk);
  P(g, 3, 0, 8, 4, C.white);              // helmet
  P(g, 4, 1, 6, 2, C.visor);
  P(g, 4, 1, 3, 1, C.visorHi);
  if (f === 3) { P(g, 2, 1, 2, 4, C.suit); P(g, 10, 1, 2, 4, C.suit); }        // carry: arms up
  else if (f === 0) { P(g, 2, 6, 2, 3, C.suit); P(g, 8, 6, 2, 3, C.suit); }
  else if (f === 1) { P(g, 1, 6, 2, 2, C.suit); P(g, 11, 6, 1, 3, C.suit); }
  else { P(g, 2, 8, 2, 2, C.suit); P(g, 10, 4, 2, 2, C.suit); }
}

function paintSatBody(g) { // 22×12 cells, u4 → 88×48 (gold-foil bus, folded dish, attach ring)
  P(g, 2, 2, 18, 8, C.gold, 4);
  P(g, 2, 2, 18, 1, C.goldDk, 4);
  P(g, 2, 4, 18, 1, C.goldDk, 4);
  P(g, 2, 6, 18, 1, C.goldDk, 4);
  P(g, 8, 1, 6, 10, C.steelLt, 4);
  P(g, 9, 3, 4, 1, C.cyan, 4);
  P(g, 9, 5, 4, 1, C.engineBlue, 4);
  P(g, 9, 7, 4, 1, C.magenta, 4);
  P(g, 3, 10, 16, 1, C.violet, 4);
}

function paintSatWing(g) { // 9×6 cells, u4 → 36×24 (solar panel)
  P(g, 0, 0, 9, 6, C.panel, 4);
  P(g, 0, 0, 9, 1, C.panelLite, 4);
  P(g, 0, 3, 9, 1, C.panelLite, 4);
  P(g, 4, 0, 1, 6, C.panelLite, 4);
  P(g, 0, 5, 9, 1, C.engineBlue, 4);
}

function paintRocket(g) { // 22×44 cells, u4 → 88×176 (nose → fairing → booster → skirt)
  P(g, 9, 0, 4, 2, C.cyan, 4);
  P(g, 8, 2, 6, 3, C.white, 4);
  P(g, 7, 5, 8, 3, C.white, 4);
  P(g, 6, 8, 10, 14, C.white, 4);
  P(g, 6, 10, 10, 2, C.cyan, 4);
  P(g, 6, 13, 10, 2, C.engineBlue, 4);
  P(g, 5, 22, 12, 3, C.steel, 4);
  P(g, 5, 25, 12, 12, C.rockDk, 4);
  P(g, 3, 26, 2, 9, C.rockDk, 4);
  P(g, 17, 26, 2, 9, C.rockDk, 4);
  P(g, 4, 37, 14, 6, C.steelDk, 4);
  P(g, 4, 37, 14, 1, C.steel, 4);
}

// ========================================================================================
export function create(level, api) {
  const st = level.style || {};
  const data = level.data || {};

  // ---- tuning (level.json is source of truth; these are safe defaults) ------------------
  const reqs = Object.assign({ cpu: 3, ant: 3, micro: 3 }, data.reqs || {});
  const MINER_T = data.minerTime ?? 1.25;
  const MINER_R = data.minerRange ?? 52;
  const WALK = data.walk ?? 220;
  const CWALK = Math.round(WALK * (data.carrySlow ?? 0.78));
  const JUMP_V = data.jumpV ?? -760;
  const GRAV = data.grav ?? 1900;
  const BAYX = data.bayX ?? 120;
  const PADX = data.padX ?? 842;
  const ROCKS = (data.rocks || []).map((r) => ({ x: r.x, w: r.w, h: r.h }));
  const DEP = (data.deposits || []).map((d) => ({ x: d.x, kind: d.kind, done: false, prog: 0 }));
  const COUNT_T = data.countdown ?? 4.5;
  const WIN = data.windows || [
    { label: "IGNITION", alt: 0, per: 2.4, band: 0.2 },
    { label: "STAGE SEP", alt: 0.34, per: 2.0, band: 0.16 },
    { label: "ORBIT INSERT", alt: 0.74, per: 1.6, band: 0.12 },
  ];
  const SHRINK = data.missShrink ?? 0.72;

  // ---- flags -----------------------------------------------------------------------------
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : { get: () => null };
  const BOT = q.get("bot") === "1";
  const BEATS = q.get("beats") === "1";
  const FLAVOR = q.get("flavor") || "good";
  const DBG = BOT || q.get("debug") === "1";

  // ---- v3 "Mission Architect" Phase 1 (?v3=1) — desk → procurement → bench → physics launch
  // Issue #1: contracts, mass budget, crate stat-tags, live readouts, TWR-scaled gauge,
  // margins. No death anywhere; legacy 3-phase flow stays the default until sims pass.
  const V3D = data.v3 || { catalog: [], launchers: [], contracts: [] };
  const V3 = q.get("v3") !== "0" && V3D.catalog.length > 0; // v3 default (flipped after M6 sims green on 2026-09-17); legacy flow: ?v3=0
  const CATALOG = V3D.catalog.map((p) => ({ ...p }));
  const LAUNCHERS = V3D.launchers.map((l) => ({ ...l }));
  const CONTRACTS = V3D.contracts.map((c) => ({ ...c }));
  const CRATE_X = [150, 205, 260, 315, 410, 470, 520, 570, 640, 700, 750, 805];
  const LOAD_T = 0.9, UNLOAD_T = 0.55, DESKX = Math.max(46, BAYX - 74);

  // ---- state ------------------------------------------------------------------------------
  let t = 0, status = "playing", phase = V3 ? "desk" : "mine";
  const trace = [];
  const res = { cpu: 0, ant: 0, micro: 0 };
  const pl = { x: V3 ? DESKX : 118, y: GROUND, vy: 0, vx: 0, face: 1, onGround: true, buf: 0, coyote: 0 };
  let carrying = false;
  const sat = { x: BAYX + 70 };
  let asmT = 0, intT = 0, cdT = 0, cdTick = 0, depT = 0;
  let winIdx = -1, alt = 0, altT = 0, thrust = false;
  const gauge = { on: false, per: 2, band: 0.2, c: 0.5, m: 0, t0: 0 };
  let anomalies = 0, dropCd = 0, bumpedOnce = false, drops = 0;
  const missedTried = [false, false, false];
  let parts = [], pops = [];
  let bannerT = 3.6, b2T = 0, b2a = "", b2b = "";
  let lastHud = "";

  // ---- v3 state ------------------------------------------------------------------------------
  const cart = { ids: [], mass: 0 };
  const crates = V3 ? CATALOG.map((p, i) => ({ ...p, x: CRATE_X[i % CRATE_X.length], cart: false, prog: 0 })) : [];
  const ship = { contract: null, launcher: null, kg: 0, gen: 0, draw: 0, kwNet: 0, mbps: 0, twr: 0, dv: 0, cg: 0, wob: 0, stiff: 0, att: 0 };
  let deskStep = 0, cIdx = 0, lIdx = 0, deskL = false, deskR = false;
  let benchT = 0, botI = 0, overPopup = false, strainShown = false, cdStarted = false, v3Result = null;
  const V3PLAN = {
    good:    { li: 1, crates: ["frameL", "optical", "solarL", "engC", "batt"] },
    partial: { li: 1, crates: ["frameL", "sar", "solarM", "engC"] },
    clumsy:  { li: 2, crates: ["frameH", "engC", "solarM", "batt", "rw", "ka"] },
  };

  const rocketBaseY = GROUND - 14;
  const shipBottom = () => rocketBaseY - alt * 700;

  function popup(x, y, txt, col, size = 15) { pops.push({ x, y, txt, col, size, t: 1.1 }); }
  function setBanner2(a, b) { b2T = 3; b2a = a; b2b = b; }
  function setPhase(tag) {
    if (tag === phase) return;
    phase = tag;
    trace.push(tag + "@" + t.toFixed(1));
    if (BEATS && typeof document !== "undefined") snap(tag);
  }
  function snap(tag) {
    let host = document.getElementById("beats");
    if (!host) { host = document.createElement("div"); host.id = "beats"; document.body.appendChild(host); }
    const cv = document.createElement("canvas");
    cv.width = 440; cv.height = 247;
    const g = cv.getContext("2d");
    g.scale(440 / W, 247 / H);
    draw(g);
    const img = document.createElement("img");
    img.src = cv.toDataURL("image/jpeg", 0.72);
    img.dataset.tag = tag;
    host.appendChild(img);
  }

  // ---- update -------------------------------------------------------------------------------
  function update(dt, input) {
    t += dt;
    dropCd = Math.max(0, dropCd - dt);
    bannerT = Math.max(0, bannerT - dt);
    b2T = Math.max(0, b2T - dt);
    if (BOT) { botThink(); input = BOT_IN; }
    fx(dt);
    if (status !== "playing") return;

    const moving = phase === "mine" || phase === "carry" || phase === "shop";
    if (moving) {
      const dir = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
      pl.vx = dir * (carrying ? CWALK : walkSpeed());
      if (dir) pl.face = dir;
      pl.x = clamp(pl.x + pl.vx * dt, 26, W - 26);
      // jump (buffered + coyote)
      pl.buf = Math.max(0, pl.buf - dt);
      pl.coyote = pl.onGround ? 0.09 : Math.max(0, pl.coyote - dt);
      if (input.jumpJust()) pl.buf = 0.12;
      if (pl.buf > 0 && pl.coyote > 0) {
        pl.vy = JUMP_V; pl.onGround = false; pl.coyote = 0; pl.buf = 0;
        api.audio.sfx("jump");
      }
      const prevY = pl.y;
      if (!pl.onGround) { pl.vy += GRAV * dt; pl.y += pl.vy * dt; }
      // support: ground or boulder tops
      let sup = GROUND;
      for (const r of ROCKS) {
        if (pl.x + 13 > r.x && pl.x - 13 < r.x + r.w) {
          const top = GROUND - r.h;
          if (pl.y <= top + 8) sup = Math.min(sup, top);
        }
      }
      if (!pl.onGround) {
        if (pl.vy >= 0 && pl.y >= sup && prevY <= sup + 16) { pl.y = sup; pl.vy = 0; pl.onGround = true; }
      } else if (pl.y > sup + 1 || pl.y < sup - 1) {
        pl.onGround = false; pl.vy = Math.max(pl.vy, 0); // walked off an edge
      }
      // side bumps
      for (const r of ROCKS) {
        const top = GROUND - r.h;
        if (pl.x + 13 > r.x && pl.x - 13 < r.x + r.w && pl.y > top + 10) {
          pl.x = pl.x < r.x + r.w / 2 ? r.x - 17 : r.x + r.w + 17;
          if (carrying && dropCd <= 0) {
            carrying = false; sat.x = pl.x; dropCd = 1.6; bumpedOnce = true; drops++;
            api.audio.sfx("hit");
            popup(pl.x, GROUND - 78, "Satellite dropped — reprenez-le ✓", C.danger);
          }
        }
      }
    } else {
      pl.vx = 0;
    }

    if (V3 && phase === "desk") deskStep2(input);
    else if (V3 && phase === "shop") shopStep(dt);
    else if (V3 && phase === "bench") benchStep(dt);
    else if (phase === "mine") {
      let near = null, nd = 1e9;
      for (const d of DEP) {
        if (d.done) continue;
        const dd = Math.abs(pl.x - d.x);
        if (dd < nd) { nd = dd; near = d; }
      }
      for (const d of DEP) {
        if (d !== near || nd > MINER_R || !pl.onGround || pl.vx !== 0) continue;
        d.prog += dt;
        if (Math.random() < 0.25) {
          const col = d.kind === "cpu" ? C.cyan : d.kind === "ant" ? C.violet : C.magenta;
          parts.push({ x: d.x + (Math.random() - 0.5) * 30, y: GROUND - 12, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 60, g: 220, t: 0.3, col });
        }
        if (d.prog >= MINER_T) {
          d.done = true; res[d.kind]++;
          api.audio.sfx("coin");
          popup(d.x, GROUND - 88, "+ " + d.kind.toUpperCase() + " ✓", C.green);
        }
      }
      let total = 0, got = 0;
      for (const k in reqs) { total += reqs[k]; got += res[k]; }
      if (got >= total) { setPhase("assemble"); asmT = 0; }
    } else if (phase === "assemble") {
      asmT += dt;
      if (Math.random() < 0.3) parts.push({ x: BAYX + 70 + (Math.random() - 0.5) * 90, y: GROUND - 40, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, g: 120, t: 0.5, col: C.violet });
      if (asmT >= 1.6) {
        sat.x = BAYX + 70;
        setPhase("carry");
        setBanner2("PHASE 2 — CARRY THE SATELLITE", "Transportez le satellite vers la fusée — mind the boulders");
        api.audio.sfx("select");
      }
    } else if (phase === "carry") {
      if (!carrying && Math.abs(pl.x - sat.x) < 44) {
        carrying = true;
        api.audio.sfx("push");
        popup(sat.x, GROUND - 96, "SATELLITE PRÊT ✓", C.green);
      }
      if (carrying && Math.abs(pl.x - PADX) < 50) { setPhase("integrate"); intT = 0; }
    } else if (phase === "integrate") {
      cdStarted = false;
      intT += dt;
      if (intT >= 1.2) { setPhase("countdown"); cdT = COUNT_T; cdTick = 5; }
    } else if (phase === "countdown") {
      if (V3 && !cdStarted) {
        cdStarted = true;
        if (ship.twr <= 0) setBanner2("ADD CHEMICAL PROPULSION ✓", "L'ionique seul ne soulève pas — moteur chimique requis / ion alone cannot lift off");
      }
      cdT -= dt;
      const c = Math.ceil(cdT);
      if (c !== cdTick && c > 0) { cdTick = c; api.audio.sfx("select"); }
      if (cdT <= 0) {
        openWindow(0);
        setBanner2("PHASE 3 — LAUNCH / LANCEMENT", "Zone verte : ESPACE / SPACE ✓");
      }
    } else if (phase === "burn") {
      burnStep(dt, input);
    } else if (phase === "deploy") {
      depT += dt;
      alt = Math.min(alt + 0.3 * dt, 1.25);
      if (depT > 3.6 && status === "playing") {
        status = "won";
        api.audio.sfx("win");
        const brief = { time: +t.toFixed(1), anomalies, payload: "MDA-1" };
        if (V3) {
          const deb = debriefStars();
          v3Result = deb;
          brief.sat = { contract: ship.contract && ship.contract.id, launcher: ship.launcher && ship.launcher.id, kg: ship.kg, twr: +ship.twr.toFixed(2), dvKms: +ship.dv.toFixed(2), kwNet: +ship.kwNet.toFixed(2), mbps: Math.round(ship.mbps), loaded: [...cart.ids] };
          brief.stars = deb.stars;
          brief.margins = deb.margins;
          if (deb.stars >= 4 && api.lives && api.lives.gain) api.lives.gain(1);
        }
        api.complete(brief);
      }
    }
    hud();
  }

  function openWindow(i) {
    winIdx = i;
    const w = WIN[i];
    const perEff = V3 ? clamp(w.per * clamp(ship.twr, 0.45, 3.2), 0.5, 7) : w.per;
    gauge.on = true; gauge.per = perEff; gauge.band = w.band;
    gauge.c = 0.26 + hash(Math.floor(t * 7) + i * 31) * 0.48;
    gauge.t0 = t;
    altT = w.alt;
    if (V3 && i === 0 && ship.twr < 1.02 && !strainShown) {
      strainShown = true;
      anomalies++;
      setBanner2("TWR " + ship.twr.toFixed(2) + " — MOTEUR EN PEINE / STRAIN", "Le train ralentit, anomalie comptée — jamais mortel ✓");
      api.audio.sfx("alarm");
      popup(W / 2, GROUND - 210, "TWR < 1.02 — STRAIN ✓", C.danger);
    }
    setPhase("burn");
  }

  function burnStep(dt, input) {
    if (!gauge.on) {
      thrust = true;
      const rate = (altT >= 1 ? 0.3 : 0.16) * (V3 ? clamp(ship.twr / 2.2, 0.33, 1.5) : 1);
      alt = Math.min(alt + rate * dt, altT);
      api.eng.shake(0.16);
      if (Math.random() < 0.7) parts.push({
        x: PADX + (Math.random() - 0.5) * 30 - (PADX - PADX) * 0, // exhaust stays under the ship
        y: shipBottom() + 8, vx: (Math.random() - 0.5) * 90, vy: 220 + Math.random() * 180, g: 0, t: 0.35,
        col: Math.random() < 0.5 ? C.fire : C.fireHot,
      });
      if (alt >= altT - 0.001) {
        thrust = false;
        if (winIdx < WIN.length - 1) openWindow(winIdx + 1);
        else { setPhase("deploy"); depT = 0; }
      }
      return;
    }
    gauge.m = 0.5 + 0.5 * Math.sin((2 * Math.PI * (t - gauge.t0)) / gauge.per);
    if (input.jumpJust()) {
      if (Math.abs(gauge.m - gauge.c) <= gauge.band / 2) {
        gauge.on = false;
        api.audio.sfx("boom"); api.eng.shake(0.6);
        for (let i = 0; i < 24; i++) parts.push({ x: PADX, y: shipBottom(), vx: (Math.random() - 0.5) * 300, vy: 100 + Math.random() * 260, g: 60, t: 0.5, col: i % 2 ? C.fire : C.fireHot });
        altT = winIdx < WIN.length - 1 ? WIN[winIdx + 1].alt : 1.0;
        if (winIdx === 1) {
          parts.push({ x: PADX, y: shipBottom() - 30, vx: -120, vy: -30, g: 160, t: 1.3, col: C.steel });
          parts.push({ x: PADX, y: shipBottom() - 30, vx: 140, vy: -10, g: 160, t: 1.3, col: C.rockDk });
        }
      } else {
        anomalies++;
        api.audio.sfx("crash"); api.eng.shake(0.35);
        gauge.band = Math.max(0.08, gauge.band * SHRINK);
        gauge.c = 0.26 + hash(Math.floor(t * 13) + anomalies * 17) * 0.48;
        popup(W / 2, H - 160, "ANOMALIE — ZONE DÉCALÉE", C.danger);
      }
    }
  }

  // ---- bot (in-module autopilot; ?bot=1) -----------------------------------------------------
  const BOT_IN = {
    l: false, r: false, j: false, js: new Set(),
    left() { return this.l; }, right() { return this.r; },
    up() { return false; }, downKey() { return false; },
    down(c) { return this.js.has(c); }, just(c) { return this.js.has(c); },
    jumpJust() { return this.j || this.js.has("Space"); },
    anyJust() { return this.j || this.js.size > 0; },
    endFrame() { this.js.clear(); this.j = false; },
  };
  function botHop(B) { // hop any boulder face ahead of the current walk direction
    const dir = B.r ? 1 : B.l ? -1 : 0;
    if (!dir) return;
    for (const r of ROCKS) {
      if (Math.abs(pl.y - (GROUND - r.h)) < 2) continue; // standing on this rock's top — not a wall
      const front = dir > 0 ? r.x - (pl.x + 13) : (pl.x - 13) - (r.x + r.w);
      const mayHop = FLAVOR !== "clumsy" || !carrying || bumpedOnce;
      if (front > -26 && front < 64 && pl.onGround && mayHop) { B.j = true; break; }
    }
  }
  function botThink() {
    const B = BOT_IN;
    B.l = false; B.r = false; B.j = false; B.js.clear();
    if (V3 && phase === "desk") {
      const wantL = (V3PLAN[FLAVOR] || V3PLAN.good).li;
      if (deskStep === 0) {
        if (cIdx !== 0 && t > 0.4 && Math.floor(t * 2) % 2 === 0) B.r = true;
        else if (t > 2.2 && cIdx === 0) B.j = true;
      } else {
        if (lIdx !== wantL && t > 2.8 && Math.floor(t * 4) % 4 < 2) B.r = true;
        else if (t > 3.4 && lIdx === wantL) B.j = true;
      }
    } else if (V3 && phase === "shop") {
      const plan = (V3PLAN[FLAVOR] || V3PLAN.good).crates;
      while (botI < plan.length) {
        const nxt = crates.find((k) => k.id === plan[botI]);
        if (nxt && nxt.cart) botI++; else break;
      }
      if (botI < plan.length) {
        const c = crates.find((k) => k.id === plan[botI]);
        const dx = c.x - pl.x;
        if (Math.abs(dx) >= 16) { if (dx > 0) B.r = true; else B.l = true; }
      } else if (pl.x > BAYX + 20) B.l = true;
    } else if (V3 && phase === "bench") {
      // stand still and watch the readouts build
    } else if (phase === "mine") {
      let near = null, nd = 1e9;
      for (const d of DEP) {
        if (d.done) continue;
        const dd = Math.abs(pl.x - d.x);
        if (dd < nd) { nd = dd; near = d; }
      }
      if (near) {
        if (nd > 16) { if (pl.x < near.x) B.r = true; else B.l = true; }
      }
    } else if (phase === "carry") {
      if (!carrying) { if (pl.x < sat.x - 10) B.r = true; else if (pl.x > sat.x + 10) B.l = true; }
      else {
        B.r = true;
      }
    } else if (phase === "burn" && gauge.on) {
      // predictive: same formula burnStep will use this frame — zero one-frame staleness
      const mP = 0.5 + 0.5 * Math.sin((2 * Math.PI * (t - gauge.t0)) / gauge.per);
      const dd = Math.abs(mP - gauge.c);
      const miss = FLAVOR === "partial" && !missedTried[winIdx];
      if (miss ? dd > gauge.band : dd <= gauge.band * 0.3) {
        if (miss) missedTried[winIdx] = true;
        B.js.add("Space");
      }
    }
    botHop(B);
  }

  // ---- hud -----------------------------------------------------------------------------------
  function hud() {
    const phMap = { desk: "1", shop: "1", bench: "1", mine: "1", assemble: "1", carry: "2", integrate: "2", countdown: "3", burn: "3", deploy: "3" };
    let right = "PHASE " + (phMap[phase] || "1") + "/3";
    if (anomalies > 0) right += " · ANOMALY " + anomalies;
    let mid = "";
    if (V3 && phase === "desk") mid = "CONTRAT + LANCEUR — ESPACE pour confirmer ✓";
    else if (V3 && phase === "shop") mid = "CHAR " + Math.round(cart.mass) + (ship.launcher ? "/" + ship.launcher.capKg : "") + " kg — immobile = charger · SPACE décharger";
    else if (V3 && phase === "bench") mid = "READOUTS — TWR · Δv · kW · Mbps · CG";
    else if (phase === "mine") mid = "CPU " + res.cpu + "/" + reqs.cpu + " · ANT " + res.ant + "/" + reqs.ant + " · µBD " + res.micro + "/" + reqs.micro;
    else if (phase === "assemble") mid = "ASSEMBLING…";
    else if (phase === "carry") mid = carrying ? "SATELLITE → ROCKET" : "RAMASSEZ LE SATELLITE / PICK IT UP";
    else if (phase === "integrate") mid = "INTEGRATION…";
    else if (phase === "countdown") mid = "T-" + Math.max(0, Math.ceil(cdT));
    else if (phase === "burn") mid = gauge.on ? "BURN " + (winIdx + 1) + "/3 — " + WIN[winIdx].label : "ALT " + Math.round(alt * 100) + "%";
    else if (phase === "deploy") mid = "PAYLOAD DEPLOY…";
    const key = mid + "|" + right;
    if (key !== lastHud) { lastHud = key; api.hud({ mid, right }); }
  }

  // ---- draw -----------------------------------------------------------------------------------
  function draw(ctx) {
    const off = alt * 1500;
    drawSpace(ctx);
    if (alt < 1.05) {
      drawGround(ctx, off);
      drawBay(ctx, off);
      drawPad(ctx, off);
      if (V3 && phase !== "mine") drawCrates(ctx, off); else drawDeposits(ctx, off);
      drawRocks(ctx, off);
      drawRocket(ctx);
      drawPlayer(ctx, off);
      drawSatellite(ctx);
    }
    drawParts(ctx);
    drawPops(ctx);
    if (phase === "countdown") drawCount(ctx);
    if (gauge.on) drawGauge(ctx);
    drawBanners(ctx);
    if (V3 && phase === "desk") drawDesk(ctx);
    if (V3 && phase === "bench") drawReadouts(ctx);
    if (phase === "deploy") drawDeploy(ctx);
    seasonTint(ctx);
  }

  function drawSpace(ctx) {
    const k = clamp(alt * 1.15, 0, 1);
    const sky = st.sky || ["#05040f", "#0a0e24", "#12183a"];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky[0]);
    g.addColorStop(0.6, sky[1] || sky[0]);
    g.addColorStop(1, sky[2] || sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sa = 0.35 + 0.65 * k;
    for (let i = 0; i < 110; i++) {
      const x = hash(i * 3 + 1) * W, y = hash(i * 7 + 2) * H * 0.9;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + hash(i + 9) * 2) + i * 1.7));
      ctx.globalAlpha = sa * tw;
      ctx.fillStyle = i % 11 === 0 ? (st.accent || C.cyan) : "#ffffff";
      ctx.fillRect(x, y, i % 13 === 0 ? 2.4 : 1.6, i % 13 === 0 ? 2.4 : 1.6);
    }
    ctx.globalAlpha = 1;
    if (alt > 0.5) {
      const cy = H + 900 - (alt - 0.5) * 2400, cx = W * 0.78, r = 680;
      const og = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.2, cx, cy, r);
      og.addColorStop(0, "#2e86d8"); og.addColorStop(0.75, "#1b5fb0"); og.addColorStop(1, "#123c78");
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = "#dff0fa";
      for (let i = 0; i < 7; i++) {
        const a = hash(i * 5 + 3) * Math.PI * 2, rr = r * (0.35 + hash(i + 11) * 0.5);
        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 34 + hash(i + 5) * 50, 10 + hash(i * 3) * 10, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(140,220,255,.55)"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawGround(ctx, off) {
    const g = ctx.createLinearGradient(0, GROUND + off, 0, H + off);
    g.addColorStop(0, C.regolithLit); g.addColorStop(0.25, C.regolith); g.addColorStop(1, C.regolithDk);
    ctx.fillStyle = g; ctx.fillRect(0, GROUND + off, W, H + 80 - GROUND);
    ctx.fillStyle = "rgba(180,200,255,.25)"; ctx.fillRect(0, GROUND + off, W, 2);
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 11 + 3) * W, y = GROUND + off + 8 + hash(i * 5 + 7) * (H - GROUND);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = hash(i) > 0.5 ? "#2f3342" : "#4a5068";
      ctx.fillRect(x, y, 2 + hash(i * 3) * 3, 2);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const x = 90 + i * 190 + hash(i * 17) * 80;
      ctx.fillStyle = "rgba(20,23,34,.5)";
      ctx.beginPath(); ctx.ellipse(x, GROUND + off + 34 + hash(i) * 20, 26 + hash(i * 7) * 16, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBay(ctx, off) {
    const x = BAYX, gy = GROUND + off;
    ctx.save();
    const lg = ctx.createRadialGradient(x, gy - 60, 8, x, gy - 60, 120);
    lg.addColorStop(0, "rgba(138,124,255,.22)"); lg.addColorStop(1, "rgba(138,124,255,0)");
    ctx.fillStyle = lg; ctx.fillRect(x - 120, gy - 180, 240, 190);
    ctx.restore();
    ctx.fillStyle = C.engineBlue; ctx.fillRect(x - 70, gy - 10, 120, 10);
    ctx.fillStyle = C.steelDk; ctx.fillRect(x - 70, gy - 12, 120, 3);
    ctx.fillRect(x - 58, gy - 120, 8, 108);
    ctx.fillStyle = C.steel; ctx.fillRect(x - 58, gy - 120, 70, 8);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? C.violet : "#2c3a5c"; ctx.fillRect(x - 70 + i * 20, gy - 15, 10, 4); }
    drawText(ctx, "INTEGRATION", x, gy - 140, { size: 12, color: C.violet });
    drawText(ctx, "BAY", x, gy - 156, { size: 12, color: C.violet });
  }

  function drawPad(ctx, off) {
    const x = PADX, gy = GROUND + off;
    ctx.fillStyle = "#232838"; ctx.fillRect(x - 54, gy - 14, 108, 14);
    ctx.fillStyle = C.steelDk; ctx.fillRect(x - 54, gy - 16, 108, 3);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? C.danger : "#3a2430"; ctx.fillRect(x - 50 + i * 20, gy - 18, 12, 3); }
    ctx.fillStyle = C.steelDk;
    ctx.fillRect(x - 84, gy - 150, 8, 136);
    ctx.fillRect(x - 60, gy - 150, 8, 136);
    ctx.fillStyle = C.steel;
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 84, gy - 146 + i * 28, 32, 3);
    ctx.fillStyle = C.danger;
    ctx.fillRect(x - 84, gy - 158, 8, 6); ctx.fillRect(x - 60, gy - 158, 8, 6);
  }

  function drawRocket(ctx) {
    if (phase === "deploy" || alt > 1.1) return;
    const img = bake("rocket", 88, 176, paintRocket);
    const by = shipBottom() + (gauge.on ? Math.sin(t * 7) * 1.2 : 0);
    ctx.save();
    ctx.translate(PADX, by);
    const fl = thrust ? 1 : gauge.on ? 0.22 : 0;
    if (fl > 0) {
      const fh = 26 + Math.sin(t * 40) * 9;
      ctx.fillStyle = C.fire;
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(0, fh * (1 + fl * 1.8)); ctx.lineTo(15, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.fireHot;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, fh * 0.7); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill();
    }
    ctx.drawImage(img, -44, -176);
    drawText(ctx, "MDA", 0, -104, { size: 13, color: C.panel });
    ctx.restore();
  }

  function drawSatellite(ctx) {
    if (phase === "mine" || phase === "deploy") return;
    if (V3 && (phase === "desk" || phase === "shop")) return;
    const body = bake("satBody", 88, 48, paintSatBody);
    const wing = bake("satWing", 36, 24, paintSatWing);
    const comp = (x, y, kw, alpha, scale) => {
      ctx.save();
      ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
      ctx.drawImage(wing, -44 - 36 * kw, -12, 36 * kw, 24);
      ctx.drawImage(wing, 44, -12, 36 * kw, 24);
      ctx.drawImage(body, -44, -24);
      ctx.restore();
    };
    if (V3 && phase === "bench") {
      // ghost bus integration with spin-test wobble ∝ CG
      const k = clamp(benchT / 2.3, 0, 1);
      ctx.save();
      ctx.translate(BAYX + 70, GROUND - 38 - k * 4);
      ctx.rotate(Math.sin(benchT * 9) * ship.wob * 0.4);
      const gk = 0.5 + 0.5 * k;
      ctx.scale(gk, gk);
      const wk = ship.gen > 0 ? 1 : 0.55;
      ctx.drawImage(wing, -44 - 36 * wk, -12, 36 * wk, 24);
      ctx.drawImage(wing, 44, -12, 36 * wk, 24);
      ctx.drawImage(body, -44, -24);
      ctx.restore();
    } else if (phase === "assemble") {
      const k = clamp(asmT / 1.6, 0, 1);
      comp(BAYX + 70, GROUND - 38 - k * 4, 1, k, 0.4 + 0.6 * k);
    } else if (phase === "integrate") {
      const k = clamp(intT / 1.2, 0, 1);
      comp(lerp(sat.x, PADX, k), lerp(GROUND - 70, shipBottom() - 190, k), 1, 1 - k * 0.4, 0.9 - 0.15 * k);
    } else if (phase === "countdown" || phase === "burn") {
      // inside the fairing
    } else if (carrying) {
      comp(pl.x, pl.y - 76 + Math.sin(t * 9) * 2, 1, 1, 0.8);
    } else {
      comp(sat.x, GROUND - 38 + Math.sin(t * 3) * 1.5, 1, 1, 1);
    }
  }

  function drawDeposits(ctx, off) {
    for (const d of DEP) {
      const x = d.x, y = GROUND + off;
      ctx.fillStyle = d.done ? "#33384a" : C.regolithLit;
      ctx.beginPath(); ctx.ellipse(x, y - 2, 26, 10, 0, Math.PI, 0); ctx.fill();
      const col = d.kind === "cpu" ? C.cyan : d.kind === "ant" ? C.violet : C.magenta;
      if (d.done) continue;
      const bob = Math.sin(t * 3 + d.x) * 2;
      ctx.save();
      ctx.translate(x, y - 16 + bob);
      ctx.fillStyle = col;
      if (d.kind === "cpu") {
        ctx.fillRect(-8, -8, 16, 10);
        ctx.fillStyle = "#0d2b33"; ctx.fillRect(-5, -5, 10, 4);
        ctx.fillStyle = col;
        ctx.fillRect(-6, 2, 2, 3); ctx.fillRect(-2, 2, 2, 3); ctx.fillRect(2, 2, 2, 3);
      } else if (d.kind === "ant") {
        ctx.beginPath(); ctx.arc(0, 2, 8, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#0d2b33"; ctx.fillRect(-1, 0, 2, 7);
        ctx.fillStyle = col; ctx.fillRect(-4, -2, 8, 2);
      } else {
        ctx.fillRect(-9, -5, 18, 10);
        ctx.fillStyle = "#330a1e"; ctx.fillRect(-6, -2, 12, 4);
        ctx.fillStyle = col; ctx.fillRect(-9, -8, 18, 2);
      }
      ctx.restore();
      if (d.prog > 0) {
        ctx.strokeStyle = C.green; ctx.lineWidth = 4; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(x, y - 14, 20, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * clamp(d.prog / MINER_T, 0, 1)); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawRocks(ctx, off) {
    for (const r of ROCKS) {
      const cx = r.x + r.w / 2, y = GROUND + off;
      ctx.fillStyle = C.rockDk;
      ctx.beginPath(); ctx.ellipse(cx, y, r.w / 2, r.h, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = C.rock;
      ctx.beginPath(); ctx.ellipse(cx - r.w * 0.12, y - r.h * 0.3, r.w * 0.3, r.h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.rockLt;
      ctx.beginPath(); ctx.ellipse(cx + r.w * 0.2, y - r.h * 0.45, r.w * 0.13, r.h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPlayer(ctx, off) {
    if (off > H) return;
    const f = carrying ? 3 : (!pl.onGround ? 2 : (Math.abs(pl.vx) > 10 ? 1 + (Math.floor(t * 9) % 2) : 0));
    const img = bake("ast" + f, 36, 45, (g) => paintAstronaut(g, f));
    ctx.save();
    ctx.translate(pl.x, pl.y + off + (pl.onGround && Math.abs(pl.vx) > 10 ? Math.sin(t * 22) * 1.5 : 0));
    ctx.scale(pl.face, 1);
    ctx.drawImage(img, -18, -45);
    if (V3 && cart.mass > 0 && (phase === "shop" || phase === "bench")) {
      ctx.fillStyle = C.steelDk; ctx.fillRect(-46, -20, 13, 9);
      ctx.fillStyle = C.gold; ctx.fillRect(-46, -29, 13, 9);
    }
    ctx.restore();
  }

  function fx(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.t -= dt; }
    parts = parts.filter((p) => p.t > 0);
    for (const p of pops) { p.y -= 26 * dt; p.t -= dt; }
    pops = pops.filter((p) => p.t > 0);
  }
  function drawParts(ctx) {
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.t * 2, 0, 1);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
  function drawPops(ctx) {
    for (const p of pops) {
      ctx.globalAlpha = clamp(p.t, 0, 1);
      drawText(ctx, p.txt, p.x, p.y, { size: p.size, color: p.col, shadow: "#05060f" });
    }
    ctx.globalAlpha = 1;
  }

  function drawCount(ctx) {
    const c = Math.max(0, Math.ceil(cdT));
    ctx.save(); ctx.globalAlpha = 0.92;
    drawText(ctx, "T-MINUS", PADX, GROUND - 262, { size: 15, color: "#9aa4c6" });
    drawText(ctx, c > 0 ? String(c) : "GO", PADX, GROUND - 206, { size: 62, color: C.cyan, shadow: "#05060f" });
    ctx.restore();
  }

  function drawGauge(ctx) {
    const w = 430, x0 = W / 2 - w / 2, y0 = H - 92;
    ctx.fillStyle = "rgba(5,8,18,.72)"; ctx.fillRect(x0 - 14, y0 - 36, w + 28, 66);
    ctx.fillStyle = "#131a2c"; ctx.fillRect(x0, y0, w, 18);
    ctx.fillStyle = "rgba(70,242,180,.85)";
    ctx.fillRect(x0 + (gauge.c - gauge.band / 2) * w, y0 - 2, gauge.band * w, 22);
    for (let i = 0; i <= 10; i++) { ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(x0 + (i * w) / 10, y0 - 6, 2, 30); }
    const mx = x0 + gauge.m * w;
    ctx.fillStyle = C.cyan;
    ctx.beginPath(); ctx.moveTo(mx, y0 - 12); ctx.lineTo(mx - 7, y0 - 24); ctx.lineTo(mx + 7, y0 - 24); ctx.closePath(); ctx.fill();
    drawText(ctx, "BURN " + (winIdx + 1) + "/3 — " + WIN[winIdx].label, W / 2, y0 - 48, { size: 17, color: "#fff", shadow: C.cyan });
    drawText(ctx, "ESPACE / SPACE — fire when the marker is in the green zone ✓", W / 2, y0 + 36, { size: 11, color: "#9aa4c6" });
  }

  function drawBanners(ctx) {
    if (bannerT > 0) {
      ctx.save(); ctx.globalAlpha = clamp(bannerT / 0.8, 0, 1);
      ctx.fillStyle = "rgba(5,6,15,.55)"; ctx.fillRect(0, 138, W, 134);
      drawText(ctx, "MDA SPACE MISSION", W / 2, 188, { size: 36, color: "#fff", shadow: C.cyan });
      drawText(ctx, V3 ? "Contract desk — pick the mission, load under the mass cap · Choisissez le contrat, chargez sous la masse" : "Phase 1 — mine the parts, assemble the satellite · Phase 1 — minez les composants, assemblez le satellite", W / 2, 230, { size: 14, color: "rgba(216,228,255,.9)" });
      drawText(ctx, "← → marcher · ESPACE sauter — puis engagez chaque tir moteur", W / 2, 254, { size: 12, color: "rgba(216,228,255,.6)" });
      ctx.restore();
    }
    if (b2T > 0) {
      ctx.save(); ctx.globalAlpha = clamp(b2T / 0.7, 0, 1);
      ctx.fillStyle = "rgba(5,6,15,.55)"; ctx.fillRect(0, 148, W, 112);
      drawText(ctx, b2a, W / 2, 192, { size: 30, color: "#fff", shadow: C.violet });
      drawText(ctx, b2b, W / 2, 232, { size: 14, color: "rgba(216,228,255,.85)" });
      ctx.restore();
    }
  }

  function drawDeploy(ctx) {
    const sy = lerp(300, 208, clamp(depT / 1.4, 0, 1));
    const x = W / 2;
    const body = bake("satBody", 88, 48, paintSatBody);
    const wing = bake("satWing", 36, 24, paintSatWing);
    if (depT < 0.3) {
      ctx.save(); ctx.globalAlpha = 1 - depT / 0.3;
      ctx.fillStyle = C.fireHot;
      ctx.beginPath(); ctx.arc(x, sy + 30, 26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const kw = clamp((depT - 0.9) / 1.1, 0, 1);
    ctx.drawImage(wing, x - 44 - 36 * kw, sy - 12, 36 * kw, 24);
    ctx.drawImage(wing, x + 44, sy - 12, 36 * kw, 24);
    ctx.drawImage(body, x - 44, sy - 24);
    if (depT > 1.9) {
      const dk = clamp((depT - 1.9) / 0.8, 0, 1);
      ctx.fillStyle = C.steelLt;
      ctx.beginPath(); ctx.arc(x + 16, sy - 24 - 8 * dk, 8 * dk, Math.PI, 0); ctx.fill();
    }
    if (Math.random() < 0.4) parts.push({ x: x + (Math.random() - 0.5) * 160, y: sy + (Math.random() - 0.5) * 60, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, g: 0, t: 0.6, col: C.cyan });
    if (depT > 2.3) {
      ctx.save(); ctx.globalAlpha = clamp((depT - 2.3) / 0.5, 0, 1);
      ctx.fillStyle = "rgba(5,8,20,.7)"; ctx.fillRect(W / 2 - 285, H / 2 - 80, 570, 172);
      drawText(ctx, "MISSION COMPLETE ✓", W / 2, H / 2 - 40, { size: 32, color: "#fff", shadow: C.green });
      drawText(ctx, "MDA SPACE — satellite en orbite / satellite in orbit", W / 2, H / 2 - 6, { size: 15, color: "rgba(216,228,255,.9)" });
      drawText(ctx, "time " + t.toFixed(1) + " s · anomalies " + anomalies, W / 2, H / 2 + 16, { size: 13, color: "#9aa4c6" });
      if (V3 && v3Result) {
        const capL = ship.launcher ? ship.launcher.capKg : 0;
        drawText(ctx, ship.contract.en + " · " + ship.launcher.en + " · " + ship.kg + " kg — ★ " + v3Result.stars + "/4", W / 2, H / 2 + 40, { size: 14.5, color: C.gold, shadow: "#05060f" });
        drawText(ctx, "marge Δv " + v3Result.margins.dvLeft.toFixed(2) + " km/s · réserve " + v3Result.margins.headroom.toFixed(2) + " kW · " + Math.max(0, Math.round(capL - ship.kg)) + " kg non dépensés / unspent", W / 2, H / 2 + 62, { size: 11.5, color: "#9aa4c6" });
      }
      ctx.restore();
    }
  }

  // ===== v3 Phase 1 machinery (?v3=1) ========================================================
  function classColor(p) {
    if (p.gen || p.storeKwh) return C.gold;
    if (p.mbps || p.res) return C.cyan;
    if (p.thrustN !== undefined) return p.launchThrust ? C.fire : C.violet;
    if (p.stiff) return C.steelLt;
    if (p.attitude) return C.violet;
    return C.magenta;
  }
  function walkSpeed() {
    if (!V3) return carrying ? CWALK : WALK;
    if (carrying || phase === "carry") return CWALK;
    const cap = ship.launcher ? ship.launcher.capKg : 950;
    if (cart.mass <= 0) return WALK;
    const base = lerp(WALK * 0.94, WALK * 0.5, clamp(cart.mass / cap, 0, 1));
    if (cart.mass > cap && !overPopup) {
      overPopup = true;
      popup(W / 2, GROUND - 170, "SURCHARGE — marche ralentie / overload slow ✓", C.danger);
      api.audio.sfx("hit");
    }
    return cart.mass > cap ? Math.round(base * 0.62) : Math.round(base);
  }
  function computeShip() {
    const items = cart.ids.map((id) => CATALOG.find((p) => p.id === id)).filter(Boolean);
    ship.kg = items.reduce((a, p) => a + (p.mass || 0), 0);
    ship.gen = items.reduce((a, p) => a + (p.gen || 0), 0);
    ship.draw = items.reduce((a, p) => a + (p.kw || 0), 0);
    const store = items.reduce((a, p) => a + (p.storeKwh || 0), 0);
    ship.kwNet = ship.gen - ship.draw + (store > 0 ? store * 0.6 : 0);
    ship.mbps = items.reduce((a, p) => a + (p.mbps || 0), 0);
    const thN = items.reduce((a, p) => a + (p.thrustN || 0), 0);
    ship.twr = thN > 0 ? thN / (Math.max(ship.kg, 1) * 9.81) : 0;
    ship.dv = items.reduce((a, p) => a + (p.dvKeff ? p.dvKeff * Math.log(Math.max(ship.kg, 2) / Math.max(2, ship.kg - (p.fuel || 0))) : 0), 0);
    let cgS = 0;
    items.forEach((p, i) => { cgS += (i % 2 ? 1 : -1) * (p.mass || 0); });
    ship.cg = Math.abs(cgS) / Math.max(ship.kg, 1);
    const fr = items.find((p) => p.stiff);
    ship.stiff = fr ? fr.stiff : 0;
    ship.att = items.reduce((a, p) => a + (p.attitude || 0), 0);
    ship.wob = clamp(ship.cg * 1.5 - ship.stiff * 0.12 - ship.att * 0.34, 0, 1);
  }
  function deskStep2(input) {
    const L = input.left(), R = input.right();
    if (deskStep === 0) {
      if (R && !deskR) { cIdx = (cIdx + 1) % Math.max(1, CONTRACTS.length); api.audio.sfx("select"); }
      if (L && !deskL) cIdx = (cIdx + Math.max(1, CONTRACTS.length) - 1) % Math.max(1, CONTRACTS.length);
    } else {
      if (R && !deskR) { lIdx = (lIdx + 1) % Math.max(1, LAUNCHERS.length); api.audio.sfx("select"); }
      if (L && !deskL) lIdx = (lIdx + Math.max(1, LAUNCHERS.length) - 1) % Math.max(1, LAUNCHERS.length);
    }
    deskL = L; deskR = R;
    if (input.jumpJust()) {
      if (deskStep === 0) { deskStep = 1; api.audio.sfx("coin"); }
      else if (ship.contract == null) {
        ship.contract = CONTRACTS[cIdx] || null;
        ship.launcher = LAUNCHERS[lIdx] || null;
        api.audio.sfx("powerup");
        setBanner2("CONTRAT VERROUILLÉ — " + (ship.contract && ship.contract.en) + " · " + (ship.launcher && ship.launcher.en), "Chargez les caisses sous " + (ship.launcher ? ship.launcher.capKg : 0) + " kg puis revenez au hangar ✓");
        setPhase("shop");
      }
    }
  }
  function shopStep(dt) {
    for (const c of crates) {
      const near = pl.onGround && Math.abs(pl.x - c.x) < 24 && Math.abs(pl.vx) < 3;
      if (!near) { c.prog = 0; continue; }
      c.prog += dt;
      if (Math.random() < 0.3) parts.push({ x: c.x + (Math.random() - 0.5) * 26, y: GROUND - 16, vx: (Math.random() - 0.5) * 40, vy: -70 - Math.random() * 60, g: 200, t: 0.3, col: classColor(c) });
      if (c.prog >= (c.cart ? UNLOAD_T : LOAD_T)) {
        c.prog = 0;
        if (!c.cart) { c.cart = true; cart.ids.push(c.id); cart.mass += c.mass; api.audio.sfx("coin"); popup(c.x, GROUND - 92, "+ " + c.name + " ✓", C.green); }
        else { c.cart = false; cart.ids = cart.ids.filter((i2) => i2 !== c.id); cart.mass = Math.max(0, cart.mass - c.mass); api.audio.sfx("hit"); popup(c.x, GROUND - 92, "− " + c.name, C.danger); }
        computeShip();
      }
    }
    if (cart.mass > 0 && pl.x < BAYX + 34 && pl.onGround) {
      computeShip();
      benchT = 0;
      setBanner2("BANC D'ASSEMBLAGE — lectures directes", "TWR · Δv · kW · Mbps · CG — spin test after / essai de rotation ✓");
      setPhase("bench");
    }
  }
  function benchStep(dt) {
    benchT += dt;
    if (benchT < 1.0 && Math.random() < 0.45) parts.push({ x: BAYX + 70 + (Math.random() - 0.5) * 90, y: GROUND - 40, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, g: 120, t: 0.5, col: C.violet });
    if (benchT >= 2.3) {
      sat.x = BAYX + 70;
      setBanner2("PHASE 2 — CARRY / TRANSPORT", "Balancez la masse — attention aux rochers ✓");
      api.audio.sfx("select");
      setPhase("carry");
    }
  }
  function evalKpi(k) {
    const has = (id) => cart.ids.indexOf(id) !== -1;
    let v = 0;
    if (k.stat === "kw") v = ship.kwNet;
    else if (k.stat === "mbps") v = ship.mbps;
    else if (k.stat === "dv") v = ship.dv;
    else if (k.stat === "attitude") v = ship.att;
    else if (k.stat === "res") v = (has("optical") ? (has("batt") ? 9 : 5) : 0) + (has("sar") ? 4 : 0);
    return v >= k.min;
  }
  function debriefStars() {
    if (!ship.contract || !ship.launcher) return { stars: 0, margins: { unspent: 0, headroom: +Math.max(0, ship.kwNet).toFixed(2), dvLeft: +ship.dv.toFixed(2) } };
    const kpis = ship.contract.kpis || [];
    let met = 0;
    for (const k of kpis) if (evalKpi(k)) met++;
    const cap = ship.launcher.capKg;
    const unspent = Math.max(0, cap - ship.kg) / cap;
    const unspentStar = unspent >= 0.15 ? 1 : 0;
    const headStar = ship.kwNet >= 1.2 ? 1 : 0;
    const dvKpi = kpis.find((k) => k.stat === "dv");
    const margins = {
      unspent: +(unspent * 100).toFixed(0),
      headroom: +Math.max(0, ship.kwNet).toFixed(2),
      dvLeft: +(Math.max(0, ship.dv - (dvKpi ? dvKpi.min : 0))).toFixed(2),
    };
    return { stars: met + unspentStar + headStar, margins };
  }

  function drawDesk(ctx) {
    const x = DESKX, gy = GROUND;
    ctx.fillStyle = C.engineBlue; ctx.fillRect(x - 22, gy - 36, 44, 36);
    ctx.fillStyle = C.steelDk; ctx.fillRect(x - 26, gy - 40, 52, 5);
    const px = 150, py = 132, pw = 380, ph = 244;
    ctx.fillStyle = "rgba(5,8,20,.84)"; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = C.violet; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, ph);
    drawText(ctx, "BUREAU DES CONTRATS · MISSION DESK", px + pw / 2, py + 24, { size: 15, color: C.cyan, shadow: "#05060f" });
    if (deskStep === 0) {
      CONTRACTS.forEach((cc, i) => {
        const ry = py + 58 + i * 50;
        const sel = i === cIdx;
        if (sel) { ctx.fillStyle = "rgba(61,220,255,.14)"; ctx.fillRect(px + 10, ry - 18, pw - 20, 38); }
        drawText(ctx, sel ? "▶ " : "  ", px + 26, ry - 4, { size: 13, color: C.cyan });
        drawText(ctx, cc.en + " · " + cc.fr, px + 52, ry - 4, { size: 15, color: "#fff", shadow: "#05060f" });
        drawText(ctx, cc.descEn + "  ·  " + cc.descFr, px + 26, ry + 16, { size: 10, color: "#9aa4c6" });
      });
      drawText(ctx, "← → choisir · ESPACE confirmer ✓", px + pw / 2, py + ph - 14, { size: 11, color: "#9aa4c6" });
    } else {
      LAUNCHERS.forEach((lc, i) => {
        const ry = py + 62 + i * 52;
        const sel = i === lIdx;
        if (sel) { ctx.fillStyle = "rgba(61,220,255,.14)"; ctx.fillRect(px + 10, ry - 20, pw - 20, 40); }
        drawText(ctx, sel ? "▶ " : "  ", px + 28, ry - 2, { size: 14, color: C.cyan });
        drawText(ctx, lc.en, px + 56, ry - 2, { size: 16, color: "#fff", shadow: "#05060f" });
        drawText(ctx, lc.tagEn + " · " + lc.tagFr, px + 56, ry + 20, { size: 10, color: "#9aa4c6" });
      });
      drawText(ctx, "← → choisir · ESPACE verrouille le budget de masse ✓", px + pw / 2, py + ph - 14, { size: 11, color: "#9aa4c6" });
    }
  }
  function drawCrates(ctx, off) {
    for (const c of crates) {
      const x = c.x, y = GROUND + off;
      if (c.cart) {
        ctx.fillStyle = "rgba(70,242,180,.4)"; ctx.beginPath(); ctx.ellipse(x, y - 2, 22, 8, 0, Math.PI, 0); ctx.fill();
        continue;
      }
      const bob = Math.sin(t * 3 + x) * 1.5;
      const near = Math.abs(pl.x - c.x) < 66;
      ctx.fillStyle = "#1a1f30"; ctx.fillRect(x - 14, y - 22 + bob, 28, 20);
      ctx.fillStyle = classColor(c); ctx.fillRect(x - 12, y - 20 + bob, 24, 16);
      ctx.fillStyle = "#0d1018"; ctx.fillRect(x - 8, y - 14 + bob, 18, 6);
      if (near) drawText(ctx, c.tagEn + " · " + c.tagFr, x, y - 56 + bob, { size: 9, color: "#d4dbe6", shadow: "#05060f" });
      if (c.prog > 0) {
        ctx.strokeStyle = c.cart ? C.danger : C.green; ctx.lineWidth = 4; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(x, y - 14, 18, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * clamp(c.prog / (c.cart ? UNLOAD_T : LOAD_T), 0, 1)); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  function drawReadouts(ctx) {
    const px = 150, py = 268, pw = 380, ph = 132;
    ctx.save();
    ctx.fillStyle = "rgba(5,8,20,.8)"; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = C.violet; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, ph);
    const rows = [
      "MASSE " + ship.kg + (ship.launcher ? "/" + ship.launcher.capKg : "") + " kg · mass",
      "TWR " + ship.twr.toFixed(2) + (ship.twr < 1.02 ? "  ⚠ peine/strain" : "  ✓"),
      "Δv " + ship.dv.toFixed(2) + " km/s",
      "ALIM " + (ship.kwNet >= 0 ? "+" : "") + ship.kwNet.toFixed(2) + " kW " + (ship.kwNet >= 0 ? "✓" : "⚠"),
      "DONNÉES " + Math.round(ship.mbps) + " Mbps · CG ±" + ship.cg.toFixed(2) + " · wob " + Math.round(ship.wob * 100) + "%",
    ];
    rows.forEach((r, i) => {
      const ry = py + 30 + i * 21;
      if (ry < py + ph - 14) drawText(ctx, r, px + 18, ry, { size: 12, color: i === 1 && ship.twr < 1.02 ? C.danger : "#d4dbe6", shadow: "#05060f" });
    });
    drawText(ctx, "essai de rotation — CG décentré = balancement ✓ / spin test (no death)", px + 18, py + ph + 2, { size: 10, color: "#9aa4c6" });
    ctx.restore();
  }

  // ---- debug hook + compression wrapper --------------------------------------------------------
  if (DBG && typeof window !== "undefined") {
    window.__MDA = {
      timeScale: 1,
      state() {
        return {
          t: +t.toFixed(2), phase, status, season: seasonNow().id,
          res: { ...res }, anomalies, drops, alt: +alt.toFixed(3),
          gauge: { on: gauge.on, m: +gauge.m.toFixed(3), c: +gauge.c.toFixed(3), band: +gauge.band.toFixed(3), win: winIdx },
          player: { x: Math.round(pl.x), y: Math.round(pl.y), carrying },
          sat: { x: Math.round(sat.x) }, trace,
          v3: V3 ? { contract: ship.contract && ship.contract.id, launcher: ship.launcher && ship.launcher.id, kg: ship.kg, twr: +ship.twr.toFixed(3), dvKms: +ship.dv.toFixed(3), kwNet: +ship.kwNet.toFixed(2), mbps: +ship.mbps.toFixed(2), cg: +ship.cg.toFixed(3), wob: +ship.wob.toFixed(3), deskStep, cIdx, lIdx, cart: [...cart.ids], stars: v3Result && v3Result.stars } : null,
        };
      },
    };
  }
  const rawUpdate = update;
  update = function (dt, input) {
    const ts = (DBG && typeof window !== "undefined" && window.__MDA) ? window.__MDA.timeScale : 1;
    rawUpdate(dt * ts, input);
    if (BOT) BOT_IN.endFrame();
  };

  return { update, draw, status: () => status };
}
