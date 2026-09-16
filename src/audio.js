// All-chiptune audio engine: WebAudio synthesis, zero asset files.
// Mood presets drive a small step sequencer; SFX are one-shot synthesised blips.
// Conference-safe: works offline, first user gesture unlocks it.

let ac = null; // shared AudioContext
let master, musicBus, sfxBus;
let mood = null;
let timer = null;
let musicOn = true, sfxOn = true;
let lastMood = "title";
let pendingMood = null; // blocked pre-gesture mood; ensure() replays it on first gesture
let step = 0;
let nextTime = 0;
let noiseBuf = null;

const MOODS = {
  title: {
    bpm: 92, root: 220, bassWave: "triangle", leadWave: "square",
    bass: [0, null, 7, null, 0, null, 10, null, 0, null, 7, null, -5, null, 5, null],
    lead: [24, null, 19, 22, 24, null, 19, 22, 24, 27, null, 26, 24, 22, 19, 15],
    kick: false, hat: true,
  },
  upbeat: {
    bpm: 126, root: 261.63, bassWave: "triangle", leadWave: "square",
    bass: [0, 0, 12, 0, 0, 0, 9, 0, 5, 0, 12, 0, 7, 0, 9, 10],
    lead: [24, 27, 31, null, 24, 31, 27, null, 34, 31, 27, 31, 29, null, 27, null],
    kick: true, hat: true,
  },
  drive: {
    bpm: 128, root: 174.61, bassWave: "sawtooth", leadWave: "square",
    bass: [0, 0, null, 0, 0, 0, 10, 0, 0, 0, null, 0, 7, 0, 10, 12],
    lead: [22, null, 26, 27, 29, null, 27, 26, 24, null, 22, 19, 22, null, 26, null],
    kick: true, hat: true,
  },
  chill: {
    bpm: 74, root: 196, bassWave: "sine", leadWave: "sine",
    bass: [0, null, null, null, -5, null, null, null, -7, null, null, null, 5, null, null, null],
    lead: [null, 24, null, 19, null, 22, null, null, 24, null, null, 19, null, null, null, null],
    kick: false, hat: false,
  },
  tense: {
    bpm: 108, root: 146.83, bassWave: "sawtooth", leadWave: "square",
    bass: [0, null, 0, 0, 0, 0, -2, 0, 0, 0, 0, -2, 0, 0, 3, -2],
    lead: [19, 20, null, 19, 15, null, 12, null, 19, 20, null, 22, 19, 20, null, null],
    kick: true, hat: true,
  },
  // dread: tritone bass couplet, slow 96 bpm, sparse dissonant lead.
  apocalypse: {
    bpm: 96, root: 110, bassWave: "sawtooth", leadWave: "square",
    bass: [0, null, null, 6, 0, null, null, 6, 0, null, null, 6, 0, null, 7, 6],
    lead: [12, null, null, 18, null, null, 15, null, 12, null, null, 6, null, null, 18, null],
    kick: false, hat: true,
  },
  // boss: driving 140 bpm, punched accents on the beat.
  boss: {
    bpm: 140, root: 130.81, bassWave: "sawtooth", leadWave: "square",
    bass: [0, 0, null, 0, 0, null, 0, 0, 5, 0, null, 0, 8, null, 7, 0],
    lead: [0, 12, null, 12, 10, null, 12, null, 5, null, 8, null, 12, null, 10, null],
    kick: true, hat: true,
  },
  // space: ethereal pads + slow arp, no drums (a soft hat shimmer only).
  space: {
    bpm: 76, root: 220, bassWave: "sine", leadWave: "sine",
    bass: [0, null, null, null, null, null, null, 7, null, null, null, null, 5, null, null, null],
    lead: [12, null, null, 19, null, null, 24, null, 16, null, null, 12, null, null, 19, null],
    kick: false, hat: true,
  },
  // dungeon: dark minor fanfare, bell-like triangle bass.
  dungeon: {
    bpm: 100, root: 98, bassWave: "triangle", leadWave: "sawtooth",
    bass: [0, null, null, 0, null, null, 3, null, 5, null, null, 0, null, null, 3, null],
    lead: [12, null, 8, null, 12, null, 15, null, 12, null, 8, null, 7, null, 15, null],
    kick: false, hat: true,
  },
  // chase: bouncy maze-chase energy (Pac-Man / study-hall / duck variety).
  chase: {
    bpm: 132, root: 174.61, bassWave: "triangle", leadWave: "square",
    bass: [0, 0, null, 0, 0, null, 0, null, 5, 0, null, 0, 7, null, 0, null],
    lead: [12, null, 15, null, 12, null, 7, null, 12, null, 15, null, 17, null, 15, null],
    kick: true, hat: true,
  },
};

// File-backed moods (downloaded loops, licenses + authors in assets/audio/CREDITS.md).
// playMusic prefers the real track for a mood and falls back to the synth if the
// file is missing/fails — so the game still works with assets/ absent.
const MUSIC_FILES = {
  title: "assets/audio/title.mp3",
  upbeat: "assets/audio/upbeat.mp3",
  drive: "assets/audio/drive.mp3",
  chase: "assets/audio/chase.mp3",
  chill: "assets/audio/chill.mp3",
  dungeon: "assets/audio/dungeon.mp3",
  apocalypse: "assets/audio/apocalypse.mp3",
  boss: "assets/audio/boss.mp3",
  space: "assets/audio/space.ogg",
};
const fileEls = {};
let fileKey = null;

function stopFile() {
  if (fileKey && fileEls[fileKey]) {
    const el = fileEls[fileKey];
    try { el.pause(); el.currentTime = 0; } catch (e) {}
  }
  fileKey = null;
}

function ensure() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.42;
    musicBus.connect(master);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.6;
    sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") ac.resume();
  // first real gesture: restart anything that was blocked by the autoplay policy
  if (pendingMood) {
    const k = pendingMood;
    pendingMood = null;
    Audio.playMusic(k);
  }
  return ac;
}

export const Audio = {
  get unlocked() { return Boolean(ac); },
  ensure,
  setVolume(v) {
    if (master) master.gain.value = Math.max(0, Math.min(1, v));
  },

  // ---- music ---------------------------------------------------------------
  playMusic(name) {
    const key = MOODS[name] ? name : "title";
    lastMood = key;
    if (timer) { clearInterval(timer); timer = null; }
    if (fileKey !== key) stopFile();
    if (!musicOn) { mood = null; return; }
    if (MUSIC_FILES[key] && this._startFile(key)) { mood = null; return; }
    mood = MOODS[key] || MOODS.title; // synthesised fallback (or 'tense' — no file)
    ensure();
    if (!ac) return; // pre-gesture; the pointer unlock in ensure() resumes us
    step = 0;
    nextTime = ac.currentTime + 0.06;
    timer = setInterval(pump, 60);
  },
  _startFile(key) {
    let el = fileEls[key];
    if (!el) {
      try { el = new (window.Audio || window.HTMLAudioElement)(MUSIC_FILES[key]); } catch (e) { return false; }
      el.loop = true; el.preload = "auto";
      el.addEventListener("error", () => { fileEls[key] = null; if (fileKey === key) { stopFile(); Audio.playMusic(key); } }, { once: true });
      el.style.display = "none";
      document.body.appendChild(el);
      fileEls[key] = el;
    }
    fileKey = key;
    // route through the music bus when WebAudio is live (gives duckMusic + volumes);
    // before the first gesture the element simply plays at native volume (1).
    if (master && !el.__src) {
      try { el.__src = ac.createMediaElementSource(el); el.__src.connect(musicBus); } catch (e) {}
    }
    const p = el.play();
    if (p && p.catch) p.catch(() => {
      // browser autoplay law: remember the mood; App's first-gesture unlock (ensure()) replays it
      pendingMood = key;
    });
    return true;
  },
  setMusicOn(v) {
    const was = musicOn;
    musicOn = !!v;
    if (!musicOn) { mood = null; stopFile(); if (timer) { clearInterval(timer); timer = null; } return; }
    if (!was) this.playMusic(lastMood); // only coming back from OFF — never fight a queued mood
  },
  setSfxOn(v) { sfxOn = !!v; },
  stopMusic() {
    if (timer) { clearInterval(timer); timer = null; }
    stopFile();
    mood = null;
  },

  // ---- sfx -----------------------------------------------------------------
  sfx(name) {
    if (!sfxOn) return; // options-menu toggle: skip synthesis entirely
    ensure();
    // blip: schedule on the moment the call actually runs (never in the past), then
    // decay to silence over `dur`. `when` is an optional offset in seconds, so notes
    // produced via setTimeout land on their own timeline instead of collapsing back
    // to the sfx() call time (the old code set frequency/start at t+dur and ignored
    // `when`, which made coin/win notes fire simultaneously).
    const blip = (freqAt, dur, wave, gain, when = 0) => {
      const start = ac.currentTime + when;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(freqAt(0), start);
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(sfxBus);
      o.start(start); o.stop(start + dur + 0.02);
      return { o, g };
    };
    switch (name) {
      case "coin": {
        blip(() => 988, 0.07, "square", 0.25);
        setTimeout(() => blip(() => 1319, 0.1, "square", 0.25), 60);
        break;
      }
      case "jump":
        sweep(340, 760, 0.12, "sine", 0.3);
        break;
      case "hit":
        noise(0.16, 0.5, 500);
        blip(() => 95, 0.14, "square", 0.4);
        break;
      case "crash":
        noise(0.4, 0.55, 220);
        sweep(180, 40, 0.35, "sawtooth", 0.4);
        break;
      case "win": {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          setTimeout(() => blip(() => f, 0.16, "square", 0.3), i * 110));
        break;
      }
      case "lose":
        sweep(440, 90, 0.55, "sawtooth", 0.35);
        break;
      case "select":
        blip(() => 660, 0.05, "square", 0.2);
        break;
      case "push":
        noise(0.06, 0.18, 900);
        break;
      case "shoot":
        sweep(880, 220, 0.08, "square", 0.16);
        break;
      case "boom":
        noise(0.25, 0.5, 300);
        break;
      case "powerup":
        // brightness rising chime — ascending major arpeggio.
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
          setTimeout(() => blip(() => f, 0.09, "square", 0.2), i * 50));
        break;
      case "1up":
        // unmistakably celebratory 5-note rising jingle.
        [659.25, 783.99, 987.77, 1318.5, 1567.98].forEach((f, i) =>
          setTimeout(() => blip(() => f, 0.1, "square", 0.24), i * 85));
        break;
      case "alarm":
        // telegraph pulses — alternating two-tone beeps.
        [0, 190, 380, 570, 760].forEach((ms, i) =>
          setTimeout(() => blip(() => (i % 2 ? 745 : 520), 0.1, "square", 0.26), ms));
        break;
      case "blast":
        // deeper boom variant.
        noise(0.42, 0.58, 110);
        sweep(110, 28, 0.42, "sawtooth", 0.5);
        break;
      case "hover":
        // short thrust sweep noise.
        noise(0.13, 0.16, 750);
        sweep(220, 640, 0.15, "sine", 0.1);
        break;
      case "bossRoar":
        // low LFO growl.
        {
          const o = ac.createOscillator(), g = ac.createGain();
          const lfo = ac.createOscillator(), lg = ac.createGain();
          o.type = "sawtooth"; o.frequency.setValueAtTime(72, ac.currentTime);
          lfo.type = "sine"; lfo.frequency.setValueAtTime(11, ac.currentTime);
          lg.gain.setValueAtTime(22, ac.currentTime);
          lfo.connect(lg).connect(o.frequency);
          g.gain.setValueAtTime(0.0001, ac.currentTime);
          g.gain.linearRampToValueAtTime(0.42, ac.currentTime + 0.09);
          g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.95);
          o.connect(g).connect(sfxBus);
          o.start(ac.currentTime); o.stop(ac.currentTime + 1.0);
          lfo.start(ac.currentTime); lfo.stop(ac.currentTime + 1.0);
        }
        break;
      case "splash":
        // watery noise burst — lowpass filter beach-ball splash.
        {
          const src = ac.createBufferSource(); src.buffer = noiseBuf;
          const f = ac.createBiquadFilter(); f.type = "lowpass";
          f.frequency.setValueAtTime(2600, ac.currentTime);
          f.frequency.exponentialRampToValueAtTime(320, ac.currentTime + 0.3);
          const g = ac.createGain();
          g.gain.setValueAtTime(0.35, ac.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.42);
          src.connect(f).connect(g).connect(sfxBus);
          src.start(); src.stop(ac.currentTime + 0.44);
        }
        break;
      case "carousel":
        // very quiet soft tick for UI.
        blip(() => 880, 0.03, "square", 0.05);
        break;
      case "radioStatic":
        // bandpass crackle, plus a couple of short pops.
        noise(0.3, 0.12, 1700);
        setTimeout(() => noise(0.05, 0.08, 2200), 70);
        setTimeout(() => noise(0.04, 0.06, 1400), 180);
        break;
      case "tunnelEcho":
        // short blip + decaying echoes.
        blip(() => 440, 0.08, "sine", 0.2);
        setTimeout(() => blip(() => 440, 0.06, "sine", 0.1), 130);
        setTimeout(() => blip(() => 440, 0.05, "sine", 0.05), 260);
        break;
    }
  },

  // ---- duck / stinger -------------------------------------------------------
  // Temporarily lower the music bus then restore it, for moment-of-emphasis
  // beats before a big SFX (conference-safe: it never pushes past the music level).
  duckMusic(ms) {
    if (!musicBus) return;
    const bus = musicBus.gain;
    const now = ac.currentTime;
    const dur = Math.max(0.05, (ms || 300) / 1000);
    const base = 0.42;
    bus.cancelScheduledValues(now);
    bus.setValueAtTime(bus.value, now);
    bus.linearRampToValueAtTime(base * 0.35, now + 0.04);
    bus.linearRampToValueAtTime(base, now + dur);
  },
  // Short emphatic one-shot on a dramatic beat: play the SFX and duck the music.
  stinger(name) {
    this.sfx(name);
    this.duckMusic(500);
  },
};

// tiny helpers
function sweep(f0, f1, dur, wave, gain) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ac.currentTime + dur);
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(sfxBus);
  o.start(); o.stop(ac.currentTime + dur + 0.02);
}
function noise(dur, gain, hp) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = hp;
  f.Q.value = 0.7;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(); src.stop(ac.currentTime + dur + 0.02);
}

// music step pump (lookahead scheduler)
function pump() {
  if (!mood) return;
  const stepDur = 60 / mood.bpm / 4; // 16th notes
  while (nextTime < ac.currentTime + 0.22) {
    scheduleStep(step % 16, nextTime, stepDur);
    nextTime += stepDur;
    step++;
  }
}
function scheduleStep(i, t, dur) {
  const m = mood;
  const hz = (semi) => m.root * Math.pow(2, semi / 12);
  const tone = (freq, when, len, wave, gain, bus) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = wave;
    o.frequency.value = freq;
    o.connect(g).connect(bus);
    o.start(when); o.stop(when + len);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
  };
  const b = m.bass[i % m.bass.length];
  if (b !== null && b !== undefined) tone(hz(b), t, dur * 0.95, m.bassWave, 0.16, musicBus);
  const l = m.lead[i % m.lead.length];
  if (l !== null && l !== undefined) tone(hz(l), t, dur * 0.7, m.leadWave, 0.1, musicBus);
  if (m.kick && i % 4 === 0) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(musicBus);
    o.start(t); o.stop(t + 0.11);
  }
  if (m.hat && i % 2 === 1) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 6000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(musicBus);
    src.start(t); src.stop(t + 0.06);
  }
}
