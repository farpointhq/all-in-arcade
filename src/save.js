// Persistent booth save: level completion + settings.
// localStorage — no server dependency, survives refresh. Versioned for safety.
// STORAGE IS HOSTILE INPUT (issue #9): parallel agents/tests write the key
// directly, power cuts truncate writes, foreign schemas show up from older
// booths. Every field must survive a wrong-typed value — load() sanitizes per
// field (so one corrupt field never costs the player their other progress),
// and the whole post-parse phase is wrapped as a last resort.
const KEY = "allin-arcade-save-v1";

function fresh() {
  return {
    version: 1, createdAt: Date.now(), completed: {},
    lives: 3, livesEnabled: true,
    settings: { volume: 1, muted: false, musicOn: true, sfxOn: true },
  };
}

const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

// clampNum(v, lo, hi, dflt) — keep v only if it's a finite number in range,
// clamped into [lo, hi]; anything else (string, NaN, missing) → dflt.
function clampNum(v, lo, hi, dflt) {
  if (typeof v !== "number" || !Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, v));
}

// sanitize(data) — type-repair every field independently. Valid fields pass
// through untouched (progress is never over-nuked); wrong-typed fields get
// their default. Returns a NEW object, so unknown junk keys are dropped too.
function sanitize(data) {
  if (!isPlainObject(data) || data.version !== 1) return fresh();
  const s = isPlainObject(data.settings) ? data.settings : {};
  return {
    version: 1,
    createdAt: clampNum(data.createdAt, -Infinity, Infinity, Date.now()),
    completed: isPlainObject(data.completed) ? data.completed : {},
    lives: clampNum(data.lives, 0, 9, 3), // 9 = the gain() cap
    livesEnabled: typeof data.livesEnabled === "boolean" ? data.livesEnabled : true,
    settings: {
      volume: clampNum(s.volume, 0, 1, 1),
      muted: typeof s.muted === "boolean" ? s.muted : false,
      musicOn: typeof s.musicOn === "boolean" ? s.musicOn : true,
      sfxOn: typeof s.sfxOn === "boolean" ? s.sfxOn : true,
    },
  };
}

export const Save = {
  data: null,

  load() {
    try {
      this.data = JSON.parse(localStorage.getItem(KEY) || "null") || fresh();
    } catch {
      this.data = fresh();
    }
    // migration shim — NO version bump on purpose. New fields are added with
    // optional `??=` inits so an existing v1 save picks them up untouched.
    // The whole post-parse phase (sanitize + shim) is guarded: a throw here
    // used to black-screen the booth BEFORE the #fatal handler existed
    // (issue #9) — now the last resort is a fresh save, never a dead boot.
    try {
      this.data = sanitize(this.data); // per-field repair, progress preserved
      if (this.data.version !== 1) this.data = fresh();
      this.data.completed ||= {};
      this.data.settings ||= { volume: 1 };
      this.data.settings.volume ??= 1;
      this.data.settings.muted ??= false;
      this.data.settings.musicOn ??= true;
      this.data.settings.sfxOn ??= true;
      this.data.lives ??= 3;
      this.data.livesEnabled ??= true;
    } catch {
      this.data = fresh();
    }
    return this.data;
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn("save failed", e);
    }
  },

  markComplete(id) {
    this.data.completed[id] = Date.now();
    this.save();
  },

  isComplete(id) {
    return Boolean(this.data.completed[id]);
  },

  completedCount() {
    return Object.keys(this.data.completed).length;
  },

  hasProgress() {
    return this.completedCount() > 0;
  },

  // ---- cross-level lives bank --------------------------------------------
  // The meta bank carries across every level. gain() is called by game modules
  // on a pickup (api.lives.gain()); spend() is called by the app on a fail. Both
  // persist immediately and respect livesEnabled. gain caps at 9.
  gain(n = 1) {
    if (!this.data.livesEnabled) return false;
    this.data.lives = Math.min(9, (this.data.lives ?? 3) + n);
    this.save();
    return true;
  },

  spend(n = 1) {
    if (!this.data.livesEnabled) return false;
    if ((this.data.lives ?? 3) < n) return false;
    this.data.lives = (this.data.lives ?? 3) - n;
    this.save();
    return true;
  },

  reset() {
    this.data = fresh();
    this.save();
  },
};
