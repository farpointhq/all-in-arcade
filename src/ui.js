// DOM chrome: screens, HUD, level cards, credits, kiosk form, toasts.
import { authorLabel } from "./levels.js";
import { SEASONS } from "./core.js";
import { Save } from "./save.js";
import { Audio } from "./audio.js";

const genreName = { platformer: "PLATFORMER", racer: "RACER", puzzle: "PUZZLE", shooter: "SHOOTER", maze: "MAZE", "maze-studyhall": "MAZE" };
// per-genre accent palettes for the placeholder carousel tiles (gradient + title text)
const GENRE_PAL = {
  platformer: "61,220,255", racer: "138,124,255", puzzle: "255,61,154",
  shooter: "124,245,200", "star-racer": "255,211,110", maze: "255,210,63",
  "maze-studyhall": "255,210,63", survival: "255,100,88", slingshot: "124,245,200",
  "space-mission": "120,190,255",
};
const BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const $ = (s) => document.querySelector(s);

export const UI = {
  init(app) {
    this.app = app;
    this.HUD = {
      root: $("#hud"),
      t: $("#hudLeft .t"),
      a: $("#hudLeft .a"),
      lives: $("#hudLeft .lives"),
      mid: $("#hudMid"),
      right: $("#hudRight"),
      hint: $("#hudHint"),
    };
    document.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", (e) => { e.preventDefault(); app.action(b.dataset.act); }));

    $("#kioskForm").addEventListener("submit", (e) => { e.preventDefault(); this.submitKiosk(app); });

    // offline backlog re-flush triggers (issue #17): boot is wired in app.js;
    // here we catch connectivity/visibility changes while the booth is live
    window.addEventListener("online", () => this.flushPendingQueue());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.flushPendingQueue();
    });
    $("#resultPrimary").addEventListener("click", () => app.action("result-primary"));
    $("#resultSecondary").addEventListener("click", () => app.action("levels"));
    $("#muteBtn")?.addEventListener("click", () => this.toggleMute());
    $("#btnMusic")?.addEventListener("click", () =>
      this.setAudioFlag("musicOn", !(Save.data.settings.musicOn ?? true)));
    $("#btnSfx")?.addEventListener("click", () =>
      this.setAudioFlag("sfxOn", !(Save.data.settings.sfxOn ?? true)));
    $("#volRange")?.addEventListener("input", (e) => {
      const v = Number(e.target.value) / 100;
      Save.data.settings.volume = v;
      if (v > 0) Save.data.settings.muted = false;
      Save.save();
      Audio.setVolume(v);
      this.applyAudioState();
    });
    this.applyAudioState(); // reflect persisted mute state (no-op until audio unlocks)

    // title menu keyboard nav (↑/↓ + Enter)
    this.menuIdx = 0;
    window.addEventListener("keydown", (e) => {
      const onTitle = $("#screen-title").classList.contains("active");
      const btns = $("#titleMenu").querySelectorAll("button");
      if (!onTitle) return;
      if (e.code === "ArrowDown" || e.code === "KeyS") { this.menuIdx = (this.menuIdx + 1) % btns.length; this.paintMenu(btns); e.preventDefault(); }
      else if (e.code === "ArrowUp" || e.code === "KeyW") { this.menuIdx = (this.menuIdx + btns.length - 1) % btns.length; this.paintMenu(btns); e.preventDefault(); }
      else if (e.code === "Enter" && this.menuIdx >= 0) { btns[this.menuIdx].click(); }
    });
    this.menuIdx = 5; // default hover on Contribute — the star of the booth

    // season chip — the GLOBAL season switcher (drives mechanic multipliers)
    this._season = localStorage.getItem('allin-season');
    if (!SEASONS[this._season]) {
      const m = new Date().getMonth();
      this._season = (m >= 2 && m <= 4) ? 'spring' : (m >= 5 && m <= 7) ? 'summer'
                   : (m >= 8 && m <= 10) ? 'autumn' : 'winter';
    }
    window.ALLIN_SEASON = this._season;
    $('#seasonChip').addEventListener('click', () => {
      const order = ['spring', 'summer', 'autumn', 'winter'];
      this._season = order[(order.indexOf(window.ALLIN_SEASON) + 1) % order.length];
      window.ALLIN_SEASON = this._season;
      localStorage.setItem('allin-season', this._season);
      this.paintSeason();
      this.toast(`Season switched → ${SEASONS[this._season].label} — the same level now plays differently!`, 3200);
    });
    this.paintSeason();
  },

  paintSeason() {
    const s = SEASONS[window.ALLIN_SEASON] || SEASONS.autumn;
    const chip = $('#seasonChip');
    chip.textContent = s.label;
    chip.style.color = s.chip || "#3ddcff";
  },

  // ---- mute / volume -------------------------------------------------------
  applyAudioState() {
    const muted = Save.data.settings?.muted;
    // apply the PERSISTED music/sfx switches at every boot + change (the audio module's
    // own defaults are ON; without this, a saved music=off is ignored until first click)
    Audio.setMusicOn(Save.data.settings?.musicOn ?? true);
    Audio.setSfxOn(Save.data.settings?.sfxOn ?? true);
    Audio.setVolume(muted ? 0 : (Save.data.settings?.volume ?? 1)); // no-op until audio is unlocked
    const btn = $("#muteBtn");
    if (btn) { btn.classList.toggle("muted", !!muted); btn.setAttribute("aria-pressed", muted ? "true" : "false"); }
    this.paintSound();
  },
  paintSound() {
    const m = Save.data.settings?.musicOn ?? true, s = Save.data.settings?.sfxOn ?? true;
    const bm = $("#btnMusic"), bs = $("#btnSfx"), vr = $("#volRange"), vv = $("#volVal");
    if (bm) { bm.textContent = m ? "ON" : "OFF"; bm.classList.toggle("primary", m); }
    if (bs) { bs.textContent = s ? "ON" : "OFF"; bs.classList.toggle("primary", s); }
    if (vr) vr.value = Math.round((Save.data.settings?.volume ?? 1) * 100);
    if (vv) vv.textContent = (Save.data.settings?.muted ? "(muted)" : Math.round((Save.data.settings?.volume ?? 1) * 100) + "%");
  },
  setAudioFlag(key, on) {
    Save.data.settings[key] = on;
    Save.save();
    if (key === "musicOn") Audio.setMusicOn(on);
    else Audio.setSfxOn(on);
    this.applyAudioState();
    this.toast(on ? (key === "musicOn" ? "Music on" : "Sound FX on") : (key === "musicOn" ? "Music off" : "Sound FX off"), 1400);
  },
  toggleMute() {
    Save.data.settings.muted = !Save.data.settings.muted;
    Save.save();
    this.applyAudioState();
    this.toast(Save.data.settings.muted ? "Sound muted" : "Sound on", 1600);
  },

  paintMenu(btns) {
    btns.forEach((b, i) => b.classList.toggle("sel", i === this.menuIdx));
  },

  show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
    // the level-screenshot carousel only shows on the title/levels screens (behind menus)
    const strip = $("#thumbWrap");
    if (strip) strip.classList.toggle("show", name === "title" || name === "levels");
    if (name === "kiosk") setTimeout(() => $("#kFirst")?.focus(), 60);
  },

  // ---- HUD ------------------------------------------------------------------
  hudOn(on) { this.HUD.root.classList.toggle("on", !!on); },
  setLevelHead(level, blurb) {
    const head = level.id.toUpperCase() + " · " + (level.title || "").toUpperCase() +
      (level.status === "draft" ? "  ▌TEST BUILD" : "");
    this.HUD.t.textContent = head;
    this.HUD.t.title = head; // full string survives the slot cap (issue #15 A)
    this.HUD.a.textContent = blurb || authorLabel(level);
    this.HUD.a.title = this.HUD.a.textContent;
  },
  setHint(text) { this.HUD.hint.textContent = text || ""; },
  setHUD(patch) {
    if (patch.mid !== undefined) {
      this.HUD.mid.textContent = patch.mid;
      this.HUD.mid.title = patch.mid; // full string survives the slot cap (issue #15 A)
    }
    if (patch.right !== undefined) {
      this.HUD.right.textContent = patch.right;
      this.HUD.right.title = patch.right;
      // pure ♥-runs get the readable hearts style; ★ scores and mixed payloads don't (issue #15 C)
      this.HUD.right.classList.toggle("hearts", /^♥+$/.test(patch.right));
    }
  },
  // cross-level lives bank → #hudLeft (the meta bank; genres draw their own hearts elsewhere)
  paintLives(count) {
    const el = this.HUD.lives;
    if (!el) return;
    if (count === null || count === undefined) { el.classList.add("hidden"); el.textContent = ""; return; }
    el.classList.remove("hidden");
    el.innerHTML = `<span class="lh">♥ ×${count}</span><span class="lc">LIVES</span>`;
  },

  // ---- toast ----------------------------------------------------------------
  toast(msg, ms = 2600) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove("show"), ms);
  },

  // ---- title stats ------------------------------------------------------------
  updateTitleStats(levels) {
    const builders = new Set();
    for (const l of levels) for (const a of l.authors || []) builders.add(a.name || a.username || "?");
    const n = levels.length, b = builders.size;
    $("#titleStats").textContent =
      `${n} LEVEL${n === 1 ? "" : "S"} · ${b} BUILDER${b === 1 ? "" : "S"} · A FABRIC PRODUCTION`.toUpperCase();
    // hasProgress() reads the SANITIZED in-memory save (issue #9) — re-reading
    // localStorage directly here bypassed the repair and could enable Continue
    // off a corrupt/truthy completed value.
    const hasProgress = Save.hasProgress();
    $("#btnContinue").disabled = !hasProgress;
    // level medallions — real vector sigils, one per live level (DOM layer)
    const SIGILS = {
      platformer: '<path d="M6 15a4 4 0 0 1 .6-7.9A5 5 0 0 1 16.4 9 3.5 3.5 0 0 1 16 15Z"/>',
      racer: '<path d="M5 4v16"/><path d="M5 5h12v7H5Z"/><path d="M11 9h6"/>',
      puzzle: '<rect x="5" y="5" width="12" height="12" rx="2"/><path d="M5 11h12M11 5v12"/>',
      shooter: '<path d="M12 4 6 18l6-3 6 3Z"/>',
      "star-racer": '<path d="M12 4v12M6.8 10 12 16l5.2-6M6 18h12"/>',
      maze: '<path d="M5 5h14v14H5Z"/><path d="M5 12h7v7"/><path d="M12 5v3"/>',
      "maze-studyhall": '<path d="M5 5h14v14H5Z"/><path d="M5 12h7v7"/><path d="M12 5v3"/>',
    };
    const ACCENT = { platformer: "61,220,255", racer: "138,124,255", puzzle: "255,61,154", shooter: "124,245,200", "star-racer": "255,211,110", maze: "255,210,63", "maze-studyhall": "255,210,63" };
    const medals = $("#titleMedals");
    medals.textContent = "";
    for (const l of levels.slice(0, 6)) {
      const d = document.createElement("div");
      d.className = "medal";
      d.title = `${l.title} · ${l.genre}`;
      d.style.borderColor = `rgba(${ACCENT[l.genre] || "255,255,255"},.45)`;
      d.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SIGILS[l.genre] || SIGILS.shooter}</svg>`;
      medals.appendChild(d);
    }
  },

  // ---- level select ----------------------------------------------------------
  renderLevelCards(levels, save) {
    this._levels = levels;
    const grid = $("#levelGrid");
    grid.textContent = "";
    levels.forEach((l, i) => {
      const card = document.createElement("button");
      card.className = "levelCard";
      const num = document.createElement("div"); num.className = "num";
      num.textContent = String(i + 1).padStart(2, "0");
      const mid = document.createElement("div");
      const tt = document.createElement("div"); tt.className = "tt"; tt.textContent = l.title || l.id;
      const mt = document.createElement("div");
      mt.className = "mt";
      const demo = l.demo || l.sample ? " · demo seed" : "";
      mt.textContent = `${genreName[l.genre] || (l.genre || "custom").toUpperCase()} · by ${authorLabel(l)}${demo}`;
      mid.append(tt, mt);
      const badge = document.createElement("div"); badge.className = "badge";
      badge.textContent = save.isComplete(l.id) ? "✓ CLEARED" : genreName[l.genre] || "▶ PLAY";
      card.append(num, mid, badge);
      card.addEventListener("click", () => this.app.action("play-index", i));
      grid.appendChild(card);
    });
    const sub = document.querySelector("#screen-levels .panel-header .sub");
    if (sub) sub.textContent = `${levels.length} level${levels.length === 1 ? "" : "s"} · every one dreamed up by a human`;
    if (!this._scrollWired) {
      this._scrollWired = true;
      $("#levelGrid").addEventListener("scroll", () => this.updateLevelScroll());
      window.addEventListener("resize", () => this.updateLevelScroll());
    }
    requestAnimationFrame(() => this.updateLevelScroll());
  },

  // level select scrolls once the grid outgrows the panel — fade + hint + scrollbar
  updateLevelScroll() {
    const grid = $("#levelGrid");
    if (!grid) return;
    const scrollable = grid.scrollHeight > grid.clientHeight + 8;
    const atEnd = !scrollable || grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 12;
    grid.classList.toggle("scrollable", scrollable);
    grid.classList.toggle("at-end", atEnd);
    const hint = $("#levelScrollHint");
    if (hint) hint.classList.toggle("show", scrollable && !atEnd);
  },

  // ---- credits ---------------------------------------------------------------
  renderCredits(levels) {
    const inner = $("#creditsInner");
    inner.textContent = "";
    const add = (node) => { inner.appendChild(node); return node; };
    const section = (role, title, who, small) => {
      const wrap = document.createElement("div"); wrap.className = "cSection";
      if (role) { const r = document.createElement("div"); r.className = "cRole"; r.textContent = role; wrap.appendChild(r); }
      if (title) { const ti = document.createElement("div"); ti.className = "cTitle"; ti.textContent = title; wrap.appendChild(ti); }
      const w = document.createElement("div"); w.className = "cWho" + (small ? " small" : ""); w.textContent = who;
      wrap.appendChild(w);
      return wrap;
    };
    const divider = () => { const d = document.createElement("div"); d.className = "cDivider"; return d; };

    // header
    const head = document.createElement('div'); head.className = 'cSection';
    const big = document.createElement('div'); big.className = 'cBig'; big.textContent = 'ALL IN ARCADE';
    const sub = document.createElement('div'); sub.className = 'cThanks'; sub.textContent = 'BUILT LIVE · LEVEL BY LEVEL · BY THE ATTENDEES OF THIS CONFERENCE';
    head.appendChild(big); head.appendChild(sub);
    add(head);
    add(divider());

    levels.forEach((l) => {
      add(section(`LEVEL ${l.id || ""}`.trim(), (l.title || "").toUpperCase(), authorLabel(l).toUpperCase()));
      if (l.remixOf) {
        const r = document.createElement("div");
        r.className = "cWho small"; r.style.textAlign = "center";
        r.textContent = `· remix of ${String(l.remixOf).toUpperCase()} ·`;
        add(r);
      }
      add(divider());
    });
    [["GAME ENGINE", "FABRIC"], ["LEVEL FORGE", "FABRIC"], ["AUDIO & MUSIC", "FABRIC"], ["UI & VISUAL FX", "FABRIC"], ["BOOTH OPS", "THE ALL IN CREW"], ["SPECIAL THANKS", "EVERY ATTENDEE WHO DREAMED A LEVEL"]]
      .forEach(([role, who]) => { add(section(role, null, who)); add(divider()); });

    // duplicate for seamless loop
    inner.innerHTML += inner.innerHTML;
  },

  // ---- title screenshot carousel -------------------------------------------
  // Two identical copies of the level tiles slide left→right (CSS marquee); the
  // tiles are real 960×540 gameplay snapshots (data URLs) cached in localStorage,
  // falling back to a per-genre palette placeholder (gradient + title text).
  initThumbStrip(levels) {
    const track = $("#thumbTrack");
    if (!track) return;
    this._thumbLevels = levels;
    track.textContent = "";
    const tiles = levels.map((l) => this.thumbTile(l));
    const copy = tiles.map((t) => t.cloneNode(true)); // duplicate for a seamless loop
    tiles.forEach((t) => track.appendChild(t));
    copy.forEach((t) => track.appendChild(t));
    const span = 264 + 18; // tile width + gap
    const dur = Math.max(40, (levels.length * span) / 26); // ~26 px/s marquee
    track.style.animationDuration = dur.toFixed(1) + "s";
  },
  thumbTile(l) {
    const d = document.createElement("div");
    d.className = "thumbTile";
    d.dataset.id = l.id;
    const pal = GENRE_PAL[l.genre] || "61,220,255";
    d.style.background = `linear-gradient(135deg, rgba(${pal},.20), rgba(${pal},.42) 55%, rgba(10,13,24,.94))`;
    const img = document.createElement("img");
    img.className = "thumbImg";
    img.alt = l.title || l.id;
    img.src = localStorage.getItem("allin-thumb-" + l.id) || BLANK_GIF;
    const cap = document.createElement("div");
    cap.className = "thumbCap";
    cap.textContent = l.title || l.id;
    d.append(img, cap);
    return d;
  },
  updateThumb(id, dataURL) {
    document.querySelectorAll(`#thumbTrack .thumbTile[data-id="${id}"]`).forEach((t) => {
      const img = t.querySelector(".thumbImg");
      if (img) img.src = dataURL;
    });
  },

  // ---- kiosk -----------------------------------------------------------------
  async submitKiosk() {
    const payload = {
      name: [$("#kFirst").value.trim(), $("#kLast").value.trim()].filter(Boolean).join(" "),
      first: $("#kFirst").value.trim(), last: $("#kLast").value.trim(),
      email: $("#kEmail").value.trim(),
      username: $("#kHandle").value.trim(),
      genre: $("#kGenre").value,
      prompt: $("#kPrompt").value.trim(),
    };
    const status = $("#kioskStatus");
    status.textContent = "Transmitting…";
    status.classList.remove("err");
    try {
      const r = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.status === 413) {
        // the server can never accept this body — queueing it would plant a
        // poison pill that every future flush would retry forever
        status.textContent = "Idea too long — trim it a bit and send again";
        status.classList.add("err");
        return;
      }
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "server said no");
      status.textContent = "✓ Received! Your idea is in the build queue — watch it come alive on this screen.";
      this.toast(`Logged for ${payload.name}! The Fabric agent will start building soon.`, 4000);
      this.flushPendingQueue(); // a success means the server is back — drain any backlog
      this.app.action("back-title");
    } catch (e) {
      if (this.queuePending(payload)) {
        status.textContent = "Booth server not reachable — your idea was saved on this machine. Flag the Fabric agent!";
      } else {
        status.textContent = "Couldn't send — flag the Fabric agent and just tell them your idea directly!";
      }
    }
  },

  // ---- offline idea queue (issue #17) ----------------------------------------
  // Ideas captured while the booth server is down land in localStorage
  // ["allin-pending"] and are re-flushed on boot / window online / visibility
  // / after any successful direct submit. Records keep their original ts and
  // replay:true so the agent can dedupe the rare crash-mid-flush duplicate.
  queuePending(payload) {
    try {
      const q = JSON.parse(localStorage.getItem("allin-pending") || "[]");
      q.push({
        ts: new Date().toISOString(),
        id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
        replay: true,
        ...payload,
      });
      while (q.length > 50) q.shift(); // cap the queue — oldest dropped
      localStorage.setItem("allin-pending", JSON.stringify(q));
      return true;
    } catch {
      return false; // storage full/broken — caller shows the tell-the-agent fallback
    }
  },

  async flushPendingQueue() {
    if (this._flushing) return; // re-entrancy guard: boot/online/visible can collide
    this._flushing = true;
    let delivered = 0;
    try {
      for (;;) {
        let q = [];
        try { q = JSON.parse(localStorage.getItem("allin-pending") || "[]"); } catch { break; }
        if (!Array.isArray(q) || !q.length) break;
        const rec = q[0];
        let r = null;
        try {
          r = await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rec),
          });
        } catch { break; } // server still down — stop, leave the rest queued
        if (r.status === 413) {
          // oversized backlog record: the server can never accept it — drop forever
          console.warn("[kiosk] dropped an oversized queued idea (413)");
          this._pendingRemove(rec.id);
          continue;
        }
        if (!r.ok) break; // 5xx or odd status — keep the record for the next trigger
        let j = null;
        try { j = await r.json(); } catch { /* non-JSON error page from a proxy */ }
        if (!j || !j.ok) break;
        this._pendingRemove(rec.id); // removed immediately after ITS success
        delivered++;
      }
    } finally {
      this._flushing = false;
    }
    if (delivered > 0) this.toast(`✓ Delivered ${delivered} saved idea${delivered === 1 ? "" : "s"}`);
  },

  _pendingRemove(id) {
    try {
      const q = JSON.parse(localStorage.getItem("allin-pending") || "[]");
      const i = q.findIndex((r) => r.id === id);
      if (i >= 0) {
        q.splice(i, 1);
        localStorage.setItem("allin-pending", JSON.stringify(q));
      }
    } catch { /* queue unreadable — leave as-is */ }
  },

  // ---- result / pause ----------------------------------------------------------
  showResult({ won, subText, primaryLabel, primaryAct }) {
    const t = $("#resultTitle");
    t.textContent = won ? "LEVEL CLEAR!" : "TRY AGAIN";
    t.classList.toggle("lost", !won);
    t.classList.toggle("win-badge", won);
    $("#resultSub").textContent = subText;
    const p = $("#resultPrimary");
    p.textContent = primaryLabel;
    p.dataset.act = primaryAct;
    // rebind (data-act listener from init is on the button via app.action lookup — use direct call)
    this._resultPrimaryAct = primaryAct;
    this.show("result");
  },
};
