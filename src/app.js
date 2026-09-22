// App orchestration: screens ⇄ engine scenes, save flow, audio, kiosk submits.
import { Save } from "./save.js";
import { Audio } from "./audio.js";
import { Levels, authorLabel } from "./levels.js";
import { W, H, createEngine, drawBackdrop } from "./core.js";
import { UI } from "./ui.js";
import * as Platformer from "./genres/platformer.js";
import * as Racer from "./genres/racer.js";
import * as Puzzle from "./genres/puzzle.js";
import * as Shooter from "./genres/shooter.js";
import * as Maze from "./genres/maze.js";
import * as MazeStudyHall from "./genres/maze-studyhall.js";

const GENRES = { platformer: Platformer, racer: Racer, puzzle: Puzzle, shooter: Shooter, maze: Maze, "maze-studyhall": MazeStudyHall };
const $ = (s) => document.querySelector(s);

let eng; // main engine instance

const App = {
  levels: [],
  activeLevel: null,
  plat: null,
  playIndex: -1,
  resultShown: false,

  // ---- boot ------------------------------------------------------------------
  async boot() {
    console.info("%cALL IN ARCADE booting…", "color:#7dfcff;font-weight:bold");
    Save.load();
    UI.init(this);

    window.addEventListener("error", (e) => {
      const f = $("#fatal");
      f.style.display = "flex";
      f.innerHTML = "Something broke in the booth game.<br><br>Find the Fabric agent in chat and say: <b>booth game is erroring</b><br><span style='opacity:.6'>" + (e.message || "") + "</span>";
    });

    eng = createEngine($("#stage"));
    eng.setScene(attract);

    await this.refreshData();

    // first user gesture unlocks audio
    const unlock = () => {
      if (!Audio._started) {
        Audio.ensure();
        // in a playtest boot (?level=…) the level mood was queued pre-gesture — don't fight it with the title
        if (!new URLSearchParams(location.search).get("level")) Audio.playMusic("title");
        Audio._started = true;
      }
      UI.applyAudioState(); // persisted mute/volume take effect once audio is live
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    // private playtest entry: /?level=<id> boots straight into that level
    const bootLvl = new URLSearchParams(location.search).get("level");
    if (bootLvl) {
      console.info("playtest boot → " + bootLvl);
      this.startLevel(bootLvl);
    } else {
      UI.show("title");
      this.startThumbs(); // title carousel of real level screenshots, built lazily
    }
    console.info("✓ ready");
  },

  async refreshData() {
    try {
      this.levels = await Levels.refresh();
    } catch (e) {
      console.error("level scan failed", e);
      UI.toast("Couldn't read levels — check that serve.py is running.", 5000);
      return;
    }
    Save.load();
    UI.updateTitleStats(this.levels);
    UI.renderLevelCards(this.levels, Save);
    UI.renderCredits(this.levels);
    UI.initThumbStrip(this.levels); // build the strip (cached snapshots or placeholders)
    this.startThumbs(); // lazy snapshot pipeline (guarded — runs once per boot)
  },

  // ---- helpers ------------------------------------------------------------------
  index(id) { return this.levels.findIndex((l) => l.id === id); },
  firstIncomplete() {
    const i = this.levels.findIndex((l) => !Save.isComplete(l.id));
    return i === -1 ? null : i;
  },

  // ---- routing ------------------------------------------------------------------
  action(name, arg) {
    switch (name) {
      case "new": {
        Save.reset();
        UI.toast("Fresh save — let's build a run!");
        this.startIndex(0);
        break;
      }
      case "continue": {
        const fi = this.firstIncomplete();
        if (fi === null || !this.levels[fi]) {
          UI.toast("Everything's cleared! Pick any level to replay.");
          UI.show("levels");
          break;
        }
        this.startIndex(fi);
        break;
      }
      case "levels":
        this.refreshData().then(() => UI.show("levels"));
        break;
      case "kiosk":
        UI.show("kiosk");
        break;
      case "sound":
        UI.show("sound");
        break;
      case "credits":
        UI.show("credits");
        break;
      case "back-title":
        this.refreshData(); // cheap; keeps stats fresh
        UI.show("title");
        break;
      case "refresh":
        this.refreshData().then(() => UI.toast("↻ Scanned the level drive again."));
        break;
      case "play-index":
        this.startIndex(arg);
        break;
      case "resume":
        UI.show(""); // close overlays
        eng.paused = false;
        break;
      case "restart":
        if (this.activeLevel) this.startLevel(this.activeLevel.id);
        break;
      case "pause-levels":
        eng.paused = false;
        Audio.playMusic("title");
        UI.hudOn(false);
        eng.setScene(attract);
        this.activeLevel = null;   // the run is over — menus must not "resume" it
        this.resultShown = false;
        this.refreshData().then(() => UI.show("levels"));
        break;
      case "pause-quit":
        eng.paused = false;
        Audio.playMusic("title");
        UI.hudOn(false);
        eng.setScene(attract);
        this.activeLevel = null;   // same: without this, ESC on menus re-paused the old level
        this.resultShown = false;
        UI.show("title");
        break;
      case "result-primary": {
        const p = $("#resultPrimary");
        const a = UI._resultPrimaryAct;
        if (a === "next") this.startIndex(this.playIndex + 1 < this.levels.length ? this.playIndex + 1 : -1);
        else if (a === "retry") this.action("restart");
        else if (a === "credits") UI.show("credits");
        break;
      }
      default:
        console.warn("unknown action", name);
    }
  },

  // ---- level lifecycle ------------------------------------------------------------
  startIndex(i) {
    if (i < 0 || i >= this.levels.length) {
      eng.setScene(attract);
      Audio.playMusic("title");
      UI.hudOn(false);
      UI.show("title");
      return;
    }
    this.startLevel(this.levels[i].id);
  },

  async startLevel(id) {
    // forgiving booth: never dead-end — refill a spent bank before a level boots
    if (Save.data.livesEnabled && (Save.data.lives ?? 3) <= 0) {
      Save.data.lives = 3;
      Save.save();
      UI.toast("Out of hearts — refilled to 3", 2600);
    }
    let lvl;
    try {
      lvl = await Levels.loadFull(id);
    } catch (e) {
      UI.toast("Level " + id + " failed to load: " + e.message, 6000);
      return;
    }
    this.activeLevel = lvl;
    this.playIndex = this.index(id);
    this.resultShown = false;

    let mod = GENRES[lvl.genre];
    if (!mod) {
      // a parallel booth agent may have just dropped a brand-new genre in — load on sight
      try {
        mod = await import(`./genres/${lvl.genre}.js`);
        GENRES[lvl.genre] = mod;
      } catch (e) {
        console.warn("genre module missing:", lvl.genre, e);
      }
    }
    if (!mod) {
      UI.toast(`Genre "${lvl.genre}" isn't built yet — falling back to platformer. Tell the Fabric agent!`, 5000);
    }
    const genreMod = mod || Platformer;
    const api = {
      eng,
      audio: Audio,
      hud: (patch) => UI.setHUD(patch),
      complete: (payload) => this.onWin(payload, lvl),
      fail: (msg) => this.onLoss(lvl, msg),
      lives: livesBank, // published before the genre module is created
    };
    UI.setHUD({ mid: "", right: "" });
    playScene.exit?.(); // drain the previous level FIRST — teardown must precede the next create()
    try {
      playScene.plat = genreMod.create(lvl, api);
    } catch (e) {
      console.error("genre create failed", e);
      UI.toast("Level code error: " + e.message, 6000);
      return;
    }
    eng.setScene(playScene);
    UI.setLevelHead(lvl);
    UI.setHint(genreMod.meta.controls);
    UI.hudOn(true);
    this.refreshLives(); // paint the cross-level bank into the left HUD slot
    eng.paused = false;
    Audio.playMusic(lvl.style?.music || "upbeat");
    UI.show(""); // no overlay — pure play state
  },

  onWin(payload, lvl) {
    if (this.resultShown) return;
    this.resultShown = true;
    Save.markComplete(lvl.id);
    const authors = authorLabel(lvl);
    const isLast = this.playIndex >= this.levels.length - 1;
    UI.showResult({
      won: true,
      subText: `"${lvl.title}" — dreamed up by ${authors}` + (lvl.prompt ? ` · “${trim(lvl.prompt, 90)}”` : ""),
      primaryLabel: isLast ? "Roll Credits (Enter)" : "Next Level (Enter)",
      primaryAct: isLast ? "credits" : "next",
    });
    setTimeout(() => Audio.playMusic("title"), 900);
  },

  onLoss(lvl, msg) {
    if (this.resultShown) return;
    this.resultShown = true;
    let livesText = "";
    if (Save.data.livesEnabled && Save.spend(1)) {
      const remaining = Save.data.lives ?? 0;
      this.refreshLives();
      livesText = ` · ♥ lost — ${remaining} remaining`;
    }
    UI.showResult({
      won: false,
      subText: (msg ? msg + " — " : "") + `"${lvl.title}" by ${authorLabel(lvl)}` + livesText + " · ESC to level select",
      primaryLabel: "Retry (Enter)",
      primaryAct: "retry",
    });
  },

  // ---- lives HUD (cross-level bank, left slot) ----------------------------
  refreshLives() {
    const n = Save.data.livesEnabled ? (Save.data.lives ?? 3) : null;
    UI.paintLives(n);
  },

  // ---- title thumbnail carousel -------------------------------------------
  thumbStamp() {
    return JSON.stringify(this.levels.map((l) => ({ id: l.id, g: l.genre })));
  },

  startThumbs() {
    if (this._thumbsStarted) return;
    this._thumbsStarted = true;
    // private playtest pages (?level=…) never shoot thumbnails: the lazy
    // genre hot-imports re-run create() on modules OUTSIDE the active scene
    // and can stomp window.__TEST_API__ mid-playtest (shared-file guard,
    // 2026-09-16 — the normal title flow below is untouched).
    if (new URLSearchParams(location.search).has("level")) return;
    this.generateThumbs();
  },

  async generateThumbs() {
    const stamp = this.thumbStamp();
    try { if (localStorage.getItem("allin-thumb-stamp") === stamp) return; } catch (e) {}
    window.__THUMBS__ = { total: this.levels.length, done: 0, ok: 0, failed: [] };
    for (const lvl of this.levels) {
      try {
        const url = await this.renderThumb(lvl);
        if (url) {
          try { localStorage.setItem("allin-thumb-" + lvl.id, url); } catch (e) {}
          UI.updateThumb(lvl.id, url);
          window.__THUMBS__.ok++;
        } else {
          window.__THUMBS__.failed.push(lvl.id);
        }
      } catch (e) {
        window.__THUMBS__.failed.push(lvl.id);
      }
      window.__THUMBS__.done++;
      if (new URLSearchParams(location.search).has("beacon")) {
        document.title = "thumbs:" + JSON.stringify(window.__THUMBS__);
      }
      await new Promise((r) => setTimeout(r, 200)); // stagger — title stays responsive
    }
    try { localStorage.setItem("allin-thumb-stamp", stamp); } catch (e) {}
  },

  // import a genre module once per boot with a cache-buster so a parallel booth
  // agent's latest edits are used for the snapshot (reused for duplicate genres).
  async _thumbModFor(genre) {
    if (!this._thumbModuleCache) this._thumbModuleCache = {};
    if (!this._thumbModuleCache[genre]) {
      this._thumbModuleCache[genre] = await import(`./genres/${genre}.js?v=${Date.now()}`);
    }
    return this._thumbModuleCache[genre];
  },

  async renderThumb(lvl) {
    const full = await Levels.loadFull(lvl.id).catch(() => lvl);
    const genre = full.genre || lvl.genre;
    let mod;
    try { mod = await this._thumbModFor(genre); } catch (e) { return null; }
    if (!mod || typeof mod.create !== "function") return null;

    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, 960, 540);
    const neutralInput = {
      down: () => false, just: () => false, left: () => false, right: () => false,
      up: () => false, downKey: () => false, jumpJust: () => false, anyJust: () => false,
      endFrame: () => {},
    };
    const snapApi = {
      eng: { shake() {}, flash: 0, input: neutralInput },
      // unlocked=false keeps module-local audio synthesis inert (no AudioContext)
      audio: { ensure() { return null; }, unlocked: false, sfx() {}, setVolume() {}, playMusic() {}, stopMusic() {} },
      hud() {}, complete() {}, fail() {},
      lives: { get: () => 3, spend: () => true, gain: () => true, enabled: true },
    };

    let plat;
    try { plat = mod.create(full, snapApi); } catch (e) { return null; }
    if (!plat || typeof plat.draw !== "function") return null;
    try {
      const steps = 60 + ((lvl.id.length * 17) % 61); // 60..120 fixed steps
      for (let i = 0; i < steps; i++) if (typeof plat.update === "function") plat.update(1 / 60, neutralInput);
      plat.draw(ctx);
    } catch (e) { return null; }
    try { plat.exit?.(); } catch (e) {} // out-of-scene instance — adopt the teardown contract (issue #19)
    try { return canvas.toDataURL("image/jpeg", 0.55); } catch (e) { return null; }
  },

  // keyboard routing for overlays
  key(e) {
    const has = (id) => $(id).classList.contains("active");
    if (has("#screen-levels")) {
      // keyboard scrolling for the booth: ↑/↓ one card, PgUp/PgDn a page, Home/End ends
      const grid = $("#levelGrid");
      if (grid && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(e.code)) {
        e.preventDefault();
        const cardStep = () => { const c = grid.querySelector(".levelCard"); return (c ? c.offsetHeight : 76) + 12; };
        if (e.code === "Home") grid.scrollTo({ top: 0, behavior: "smooth" });
        else if (e.code === "End") grid.scrollTo({ top: grid.scrollHeight, behavior: "smooth" });
        else {
          const dir = e.code === "ArrowDown" || e.code === "PageDown" ? 1 : -1;
          const amt = e.code === "ArrowDown" || e.code === "ArrowUp" ? cardStep() : grid.clientHeight * 0.82;
          grid.scrollBy({ top: dir * amt, behavior: "smooth" });
        }
        return;
      }
    }
    if (e.code === "Escape") {
      if (has("#screen-pause")) { this.action("resume"); return; }
      if (this.playing()) { this.openPause(); return; }
      if (has("#screen-result")) { this.action("levels"); }
      else if (has("#screen-levels") || has("#screen-credits") || has("#screen-kiosk") || has("#screen-sound")) {
        this.action("back-title");
      }
    }
    if (e.code === "Enter" && has("#screen-result")) {
      $("#resultPrimary").click();
    }
  },

  playing() {
    return this.activeLevel && !this.resultShown && $("#screen-title").classList.contains("active") === false;
  },
  openPause() {
    eng.paused = true;
    $("#pauseSub").textContent = this.activeLevel ? `${this.activeLevel.id} — ${this.activeLevel.title} · ${authorLabel(this.activeLevel)}` : "";
    UI.show("pause");
  },
};

// ---- cross-level lives bank (published to every level as api.lives) -----------
// Contract (game modules are written against this):
//   api.lives = { get(): number, spend(n?): boolean, gain(n?): boolean, enabled: boolean }
//   - get()   → current bank count
//   - spend(n=1) → deduct + persist; returns true if a heart was spent (false when
//                  disabled or the bank is empty)
//   - gain(n=1)  → add + persist (caps at 9); returns true if it added (false when disabled)
//   - enabled    → whether the bank is active for this run
// Both mutators refresh the left HUD lives slot so a pickup updates the bank live.
const livesBank = {
  get() { return Save.data.lives ?? 3; },
  spend(n = 1) { const ok = Save.spend(n); if (ok) App.refreshLives(); return ok; },
  gain(n = 1) { const ok = Save.gain(n); if (ok) App.refreshLives(); return ok; },
  get enabled() { return Boolean(Save.data.livesEnabled); },
};

// ---- attract scene (animated background behind the menus) ----------------------
const attract = {
  enter() {},
  update() {},
  draw(ctx) {
    drawBackdrop(
      ctx,
      { backdrop: "allin", sky: ["#05060d", "#0b1030", "#101c3a"] },
      eng.t, 0.55, eng.t * 2,
    );
    // ambience only — typography & medallions live in the DOM layer, which now
    // shares the same 16:9 frame as the letterboxed canvas (no layer collisions)
  },
};

// ---- play scene (wraps whichever genre module the level uses) --------------------
const playScene = {
  plat: null,
  enter() {},
  // teardown contract (issue #19): on every level change run the genre's
  // exit() (optional — genres may stay closure-only) and drop the instance
  // so timers/seams/caches it registered can be reclaimed.
  exit() { this.plat?.exit?.(); this.plat = null; },
  update(dt, input, engref) { this.plat?.update(dt, input); },
  draw(ctx, engref) { this.plat?.draw(ctx); },
};

function trim(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ---- go ---------------------------------------------------------------------------
window.addEventListener("keydown", (e) => App.key(e));
App.boot();
