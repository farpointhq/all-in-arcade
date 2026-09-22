#!/usr/bin/env node
// save-corrupt — issue #9 unit matrix: corrupt-payload × Save.load().
//
// The repo deliberately has NO package.json, so plain `import "./save.js"` would
// resolve as CJS (no "type":"module") and explode. This file is ESM (.mjs), but
// the imported target (src/save.js) is not — so we read its source and import it
// through a data: URL, which Node (v20.x, verified 20.18.3) always treats as ESM.
// The module only touches `localStorage` at call time, so a stub on globalThis
// is enough. IF A FUTURE NODE BREAKS DATA-URL IMPORTS, either add
// `{"type":"module"}` package.json at the repo root or inline-copy the module
// source here — the payload matrix below is the contract either way.
//
// Run:  node tools/tests/save-corrupt.mjs        (<1s, no browser, exit≠0 on fail)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "..", "src", "save.js");
const source = readFileSync(SRC, "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const { Save } = mod;

const KEY = "allin-arcade-save-v1";

function makeStorage(seed) {
  const store = new Map();
  if (seed !== undefined) store.set(KEY, seed);
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// ---- shape/type assertions -------------------------------------------------
const isPlainObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

function assertFreshShape(d, label, fail) {
  const eq = (a, b, what) => { if (a !== b) fail(`${label}: ${what} = ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  if (!isPlainObj(d)) return fail(`${label}: data is not a plain object`);
  eq(d.version, 1, "version");
  if (!isFiniteNum(d.createdAt)) fail(`${label}: createdAt not a finite number`);
  if (!isPlainObj(d.completed)) return fail(`${label}: completed is not a plain object`);
  if (!isPlainObj(d.settings)) return fail(`${label}: settings is not a plain object`);
  if (!isFiniteNum(d.settings.volume)) fail(`${label}: settings.volume not a finite number`);
  eq(typeof d.settings.muted, "boolean", "typeof settings.muted");
  eq(typeof d.settings.musicOn, "boolean", "typeof settings.musicOn");
  eq(typeof d.settings.sfxOn, "boolean", "typeof settings.sfxOn");
  if (!isFiniteNum(d.lives)) fail(`${label}: lives not a finite number`);
  eq(typeof d.livesEnabled, "boolean", "typeof livesEnabled");
}

// ---- the matrix (plan Test Strategy, rows a–h) ------------------------------
// Each case: [label, seeded payload, extra(d, fail)]
const CASES = [
  ["a: invalid JSON -> fresh()", "{oops", (d, f) => {
    assertFreshShape(d, "a", f);
    if (Save.completedCount() !== 0) f(`a: completedCount = ${Save.completedCount()} ≠ 0`);
  }],
  ["b: THE REPRO settings:'x' -> defaults, progress kept-empty", '{"version":1,"settings":"x"}', (d, f) => {
    assertFreshShape(d, "b", f);
    if (d.settings.volume !== 1) f(`b: volume = ${JSON.stringify(d.settings.volume)} ≠ 1`);
    if (Save.completedCount() !== 0) f(`b: completedCount = ${Save.completedCount()} ≠ 0`);
  }],
  ["c: completed:'yes' lives:'many' -> repaired", '{"version":1,"completed":"yes","lives":"many"}', (d, f) => {
    assertFreshShape(d, "c", f);
    if (Save.completedCount() !== 0) f(`c: completedCount = ${Save.completedCount()} ≠ 0`);
    if (d.lives !== 3) f(`c: lives = ${JSON.stringify(d.lives)} ≠ 3`);
  }],
  ["d: version 2 -> fresh() (version gate)", '{"version":2,"completed":{"L01":1}}', (d, f) => {
    assertFreshShape(d, "d", f);
    if (Save.hasProgress()) f("d: hasProgress() true on a fresh save");
  }],
  ["e: VALID fields preserved (no over-nuking)", '{"version":1,"completed":{"L01":123},"lives":5,"settings":{"volume":0.4}}', (d, f) => {
    assertFreshShape(d, "e", f);
    if (Save.completedCount() !== 1) f(`e: completedCount = ${Save.completedCount()} ≠ 1 (progress wiped!)`);
    if (!Save.isComplete("L01")) f("e: isComplete('L01') false (progress wiped!)");
    if (d.lives !== 5) f(`e: lives = ${JSON.stringify(d.lives)} ≠ 5 (progress wiped!)`);
    if (d.settings.volume !== 0.4) f(`e: volume = ${JSON.stringify(d.settings.volume)} ≠ 0.4 (progress wiped!)`);
  }],
  ["f(null): null payload -> fresh()", "null", (d, f) => assertFreshShape(d, "f(null)", f)],
  ["f(empty): empty string -> fresh()", "", (d, f) => assertFreshShape(d, "f(empty)", f)],
  ["f(num): bare number -> fresh()", "5", (d, f) => assertFreshShape(d, "f(num)", f)],
  ["f(arr): bare array -> fresh()", "[1,2]", (d, f) => assertFreshShape(d, "f(arr)", f)],
  ["g: volume 7 clamped, muted 'yes' repaired", '{"version":1,"settings":{"volume":7,"muted":"yes"}}', (d, f) => {
    assertFreshShape(d, "g", f);
    if (d.settings.volume !== 1) f(`g: volume = ${JSON.stringify(d.settings.volume)} ≠ 1 (clamped)`);
    if (d.settings.muted !== false) f(`g: muted = ${JSON.stringify(d.settings.muted)} ≠ false`);
  }],
  ["h: lives 99 clamped, livesEnabled 0 repaired", '{"version":1,"lives":99,"livesEnabled":0}', (d, f) => {
    assertFreshShape(d, "h", f);
    if (d.lives !== 9) f(`h: lives = ${JSON.stringify(d.lives)} ≠ 9 (clamped)`);
    if (d.livesEnabled !== true) f(`h: livesEnabled = ${JSON.stringify(d.livesEnabled)} ≠ true`);
  }],
];

// ---- edge cases from the plan's Test Strategy ------------------------------
const EDGES = [
  ["i: reset() after corrupt load writes a valid fresh save", '{"version":1,"settings":"x"}', (d, f) => {
    Save.reset();
    const again = Save.load(); // re-reads the key the reset just wrote
    assertFreshShape(again, "i", f);
    if (Save.completedCount() !== 0) f(`i: completedCount after reset = ${Save.completedCount()} ≠ 0`);
  }],
  ["j: localStorage throwing on access -> fresh(), no throw", undefined, (d, f) => {
    globalThis.localStorage = {
      getItem: () => { throw new Error("SecurityError: blocked"); },
      setItem: () => { throw new Error("SecurityError: blocked"); },
    };
    try {
      const reloaded = Save.load();
      assertFreshShape(reloaded, "j", f);
    } catch (e) {
      f(`j: load() threw on hostile storage: ${e.message}`);
    }
    return "restore"; // put a sane stub back before the smoke calls
  }],
];

// ---- runner -----------------------------------------------------------------
let pass = 0, total = 0;
const failures = [];

function runCase(label, seed, extra) {
  total++;
  const caseFailures = [];
  const fail = (msg) => caseFailures.push(msg);
  globalThis.localStorage = makeStorage(seed); // fresh stub per case (j replaces its own)
  let d = null;
  try {
    try {
      d = Save.load();
    } catch (e) {
      caseFailures.push(`${label}: load() THREW: ${e.message}`);
      return report();
    }
    if (extra) {
      const flag = extra(d, fail);
      if (flag === "restore") globalThis.localStorage = makeStorage();
    }
    // smoke: post-load the public surface must be safe to call (plan: isComplete,
    // hasProgress, gain, spend smoke-called without throw)
    try {
      Save.isComplete("smoke");
      Save.hasProgress();
      Save.gain(1);
      Save.spend(1);
    } catch (e) {
      caseFailures.push(`${label}: smoke call THREW: ${e.message}`);
    }
  } catch (e) {
    caseFailures.push(`${label}: harness error: ${e.message}`);
  }
  function report() {
    if (caseFailures.length === 0) { pass++; console.log(`[PASS] ${label}`); }
    else { failures.push(label); console.log(`[FAIL] ${label}`); for (const m of caseFailures) console.log(`       ${m}`); }
  }
  report();
}

console.log("save-corrupt: corrupt-payload matrix against src/save.js Save.load()");
for (const [label, seed, extra] of CASES) runCase(label, seed, extra);
for (const [label, seed, extra] of EDGES) runCase(label, seed, extra);

console.log(`=== save-corrupt: ${pass}/${total} passed ===`);
if (failures.length > 0) {
  console.error(`save-corrupt: FAILURES: ${failures.join(" | ")}`);
  process.exit(1);
}
