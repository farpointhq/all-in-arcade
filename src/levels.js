// Level data access: manifest + per-level JSON resolution.
// Primary mode: booth server (/api/levels merges manifest + on-disk level JSON).
// Fallback mode: plain static hosting with per-file fetches.

export const Levels = {
  manifest: null,
  list: [], // [{id,title,genre,authors,brief,...}]

  async refresh() {
    try {
      const r = await fetch("/api/levels", { cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      const data = await r.json();
      this.list = data.levels || [];
      this.manifest = { schema: data.schema || 1, levels: this.list.map((l) => ({ id: l.id })) };
    } catch (e) {
      // static-hosting fallback
      const m = await (await fetch("levels/manifest.json", { cache: "no-store" })).json();
      this.manifest = m;
      const out = [];
      for (const entry of m.levels || []) {
        if (entry.enabled === false) continue;
        try {
          const j = await (await fetch(`levels/${entry.id}/level.json`, { cache: "no-store" })).json();
          out.push({ id: entry.id, ...j });
        } catch {
          out.push({ id: entry.id, title: entry.id, missing: true });
        }
      }
      this.list = out;
    }
    return this.list;
  },

  byId(id) {
    return this.list.find((l) => l.id === id);
  },

  async loadFull(id) {
    const r = await fetch(`levels/${id}/level.json`, { cache: "no-store" });
    if (!r.ok) throw new Error(`level ${id} not found (HTTP ${r.status})`);
    const j = await r.json();
    j._dir = `levels/${id}`;
    return j;
  },
};

// "original by Ada (@ada) · remixed by Grace" — usernames are optional in submissions.
export function authorLabel(level) {
  const parts = [];
  const orig = (level.authors || []).filter((a) => a.kind !== "remix");
  const remx = (level.authors || []).filter((a) => a.kind === "remix");
  if (orig.length) parts.push(orig.map(person).join(" + "));
  if (remx.length) parts.push("remixed by " + remx.map(person).join(" + "));
  return parts.join(" · ");
}

function person(a) {
  const un = a.username && a.username !== a.name ? ` (@${a.username})` : "";
  return (a.name || "anonymous") + un;
}

export const GENRES_DIR = { platformer: 1, racer: 1, puzzle: 1, shooter: 1 };
