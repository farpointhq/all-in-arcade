// Persistent booth save: level completion + settings.
// localStorage — no server dependency, survives refresh. Versioned for safety.
const KEY = "allin-arcade-save-v1";

function fresh() {
  return {
    version: 1, createdAt: Date.now(), completed: {},
    lives: 3, livesEnabled: true,
    settings: { volume: 1, muted: false, musicOn: true, sfxOn: true },
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
    if (this.data.version !== 1) this.data = fresh();
    this.data.completed ||= {};
    this.data.settings ||= { volume: 1 };
    this.data.settings.volume ??= 1;
    this.data.settings.muted ??= false;
    this.data.settings.musicOn ??= true;
    this.data.settings.sfxOn ??= true;
    this.data.lives ??= 3;
    this.data.livesEnabled ??= true;
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
