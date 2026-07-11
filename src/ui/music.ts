// Generative lo-fi loop — Balatro-adjacent: warm minor-seventh chords, vinyl
// crackle, sidechained pad, swung keys. Layer gains crossfade with game phase
// (menu / playing / boss / shop). Seeded per run, never touching run.rng.
//
// Authored-track drop-in (public/music/, .mp3 or .ogg):
//   theme.mp3 ... theme4.mp3           — rotate with crossfades during play
//   shop.mp3                           — fades in for the Night Market
//   boss.mp3 ... boss4.mp3             — one rolled at random per boss blind
// Any file may be absent: missing phase tracks fall back to filtering the
// theme; zero theme files fall back to the generative layers below.
// Suno prompt that matches the intended feel:
//   "lo-fi hip hop instrumental, 84 BPM, A minor, warm dusty vinyl crackle,
//    mellow Rhodes electric piano voicing jazzy minor seventh chords
//    (Am7 Fmaj7 Cmaj7 Em7), soft muted boom-bap drums with lazily swung
//    hi-hats, deep round sub bass, sparse wistful music-box melody, dreamlike
//    Alice in Wonderland whimsy, gentle tape saturation and wow/flutter, cozy
//    late-night chess café, seamless loop, no vocals, no risers, consistent
//    energy throughout"
// Generate ~2 min, trim to a clean loop point, export as OGG.

import { next, nextInt, seedFromString } from "../engine/rng";
import { ensureCtx, musicBus, musicEnabled, onPrefsChange } from "./audio";

export type MusicPhase = "menu" | "playing" | "boss" | "shop";

const BPM = 84;
const BEAT = 60 / BPM;
const STEP = BEAT / 4; // 16th note
const SWING = 0.07; // delay on off-8ths
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// Three 8-bar progressions (2 bars per chord), root first.
const PROGRESSIONS: number[][][] = [
  [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 64]], // Am7 F C G6
  [[57, 60, 64, 67], [50, 53, 57, 60], [53, 57, 60, 64], [52, 55, 59, 62]], // Am7 Dm7 F Em7
  [[57, 60, 64, 67], [52, 55, 59, 62], [53, 57, 60, 64], [55, 59, 62, 64]], // Am7 Em7 F G6
];
const BOSS_COLOR_CHORD = [52, 56, 59, 62, 65]; // E7♭9
const MELODY_POOL = [57, 60, 62, 64, 67, 69, 72, 76]; // A minor pentatonic colors

const PHASE_MIX: Record<MusicPhase, { pad: number; bass: number; keys: number; perc: number; cutoff: number }> = {
  menu: { pad: 0.9, bass: 0, keys: 0, perc: 0, cutoff: 700 },
  playing: { pad: 1, bass: 1, keys: 0.8, perc: 0, cutoff: 900 },
  boss: { pad: 1, bass: 1, keys: 0.7, perc: 1, cutoff: 500 },
  shop: { pad: 0.9, bass: 0.7, keys: 1, perc: 0, cutoff: 750 },
};

interface Layers {
  engine: GainNode; // everything except stings — faded on stop
  crackle: GainNode;
  pad: GainNode;
  padDuck: GainNode;
  padFilter: BiquadFilterNode;
  bass: GainNode;
  keys: GainNode;
  perc: GainNode;
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextStepTime = 0;
let phase: MusicPhase = "menu";
let rngState = seedFromString("blunderland:music");
let progression = PROGRESSIONS[0];
let melodyIdx = 3;
let layers: Layers | null = null;
let padVoices: { gain: GainNode; oscs: OscillatorNode[] } | null = null;
let lastChordKey = -1;
interface AuthoredSet {
  themes: AudioBuffer[];
  shop: AudioBuffer | null;
  bosses: AudioBuffer[];
}
interface ActiveTrack {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}
let authoredSet: AuthoredSet | null = null;
let authoredProbe: Promise<AuthoredSet | null> | null = null;
let themeTrack: ActiveTrack | null = null;
let phaseTrack: ActiveTrack | null = null;
let rotateTimer: ReturnType<typeof setTimeout> | null = null;
let themeOrder: number[] = [];
let themeCursor = 0;
const THEME_XFADE = 1.5; // seconds of overlap between rotating themes
const PHASE_XFADE = 0.8;
let bossPick: AudioBuffer | null = null; // this boss blind's rolled track
let lastBossIdx = -1;

function rand(): number {
  const [v, s] = next(rngState);
  rngState = s;
  return v;
}

export function setSeed(seed: number): void {
  rngState = seedFromString(String(seed) + ":music");
  let idx: number;
  [idx, rngState] = nextInt(rngState, PROGRESSIONS.length);
  progression = PROGRESSIONS[idx];
  melodyIdx = 3;
}

async function fetchTrack(base: string): Promise<AudioBuffer | null> {
  for (const ext of ["mp3", "ogg"]) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}music/${base}.${ext}`);
      if (!res.ok || !res.headers.get("content-type")?.startsWith("audio")) continue;
      const ac = ensureCtx();
      if (!ac) return null;
      return await ac.decodeAudioData(await res.arrayBuffer());
    } catch {
      /* try the next format */
    }
  }
  return null;
}

function probeAuthored(): Promise<AuthoredSet | null> {
  authoredProbe ??= (async () => {
    const [t1, t2, t3, t4, shop, b1, b2, b3, b4] = await Promise.all([
      fetchTrack("theme"),
      fetchTrack("theme2"),
      fetchTrack("theme3"),
      fetchTrack("theme4"),
      fetchTrack("shop"),
      fetchTrack("boss"),
      fetchTrack("boss2"),
      fetchTrack("boss3"),
      fetchTrack("boss4"),
    ]);
    const themes = [t1, t2, t3, t4].filter((b): b is AudioBuffer => b !== null);
    if (themes.length === 0) return null;
    return {
      themes,
      shop,
      bosses: [b1, b2, b3, b4].filter((b): b is AudioBuffer => b !== null),
    };
  })();
  return authoredProbe;
}

// ---- authored playback: theme rotation + phase tracks ----

function makeTrack(
  ac: AudioContext,
  buffer: AudioBuffer,
  opts: { loop: boolean; gain: number; cutoff: number; fadeIn: number },
): ActiveTrack {
  const bus = musicBus()!;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.loop = opts.loop;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.cutoff;
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(opts.gain, ac.currentTime, Math.max(0.01, opts.fadeIn / 3));
  src.connect(filter).connect(gain).connect(bus);
  src.start();
  return { src, gain, filter };
}

function releaseTrack(ac: AudioContext, track: ActiveTrack, fade: number): void {
  track.gain.gain.setTargetAtTime(0, ac.currentTime, Math.max(0.01, fade / 3));
  setTimeout(() => {
    try {
      track.src.stop();
      track.gain.disconnect();
    } catch {
      /* already gone */
    }
  }, fade * 1000 + 400);
}

/** Shuffled rotation, reshuffled per cycle, never the same track twice in a
 * row. Cosmetic randomness only — the run's rng is never touched. */
function nextThemeIndex(count: number): number {
  if (themeCursor >= themeOrder.length) {
    const last = themeOrder[themeOrder.length - 1];
    do {
      themeOrder = [...Array(count).keys()].sort(() => Math.random() - 0.5);
    } while (count > 1 && themeOrder[0] === last);
    themeCursor = 0;
  }
  return themeOrder[themeCursor++];
}

function playNextTheme(ac: AudioContext): void {
  const set = authoredSet;
  if (!set || !running) return;
  const buffer = set.themes[nextThemeIndex(set.themes.length)];
  const map = AUTHORED_MIX[phase];
  const phaseHasTrack =
    (phase === "shop" && set.shop) || (phase === "boss" && set.bosses.length > 0);
  const old = themeTrack;
  themeTrack = makeTrack(ac, buffer, {
    loop: false,
    gain: phaseHasTrack ? 0 : map.gain, // stay silent under a phase track
    cutoff: map.cutoff,
    fadeIn: THEME_XFADE,
  });
  if (old) releaseTrack(ac, old, THEME_XFADE);
  if (rotateTimer) clearTimeout(rotateTimer);
  rotateTimer = setTimeout(
    () => playNextTheme(ac),
    Math.max(1000, (buffer.duration - THEME_XFADE) * 1000),
  );
}

/** Engage/release the dedicated shop/boss track for the current phase. */
function updateAuthoredPhase(ac: AudioContext): void {
  const set = authoredSet;
  if (!set) return;
  // Each boss blind rolls its own track from the pool; the roll holds until
  // the boss ends, then clears so the next boss rolls fresh. Cosmetic
  // randomness only — the run's rng is never touched.
  if (phase === "boss" && set.bosses.length > 0) {
    if (!bossPick) {
      let idx = Math.floor(Math.random() * set.bosses.length);
      if (set.bosses.length > 1 && idx === lastBossIdx) {
        idx = (idx + 1) % set.bosses.length;
      }
      lastBossIdx = idx;
      bossPick = set.bosses[idx];
    }
  } else {
    bossPick = null;
  }
  const want = phase === "shop" ? set.shop : phase === "boss" ? bossPick : null;
  const t = ac.currentTime;
  if (want) {
    if (phaseTrack?.src.buffer !== want) {
      if (phaseTrack) releaseTrack(ac, phaseTrack, PHASE_XFADE);
      phaseTrack = makeTrack(ac, want, {
        loop: true,
        gain: phase === "boss" ? 0.72 : 0.6,
        cutoff: 16000,
        fadeIn: PHASE_XFADE,
      });
    }
    themeTrack?.gain.gain.setTargetAtTime(0, t, PHASE_XFADE / 3);
    return;
  }
  if (phaseTrack) {
    releaseTrack(ac, phaseTrack, PHASE_XFADE);
    phaseTrack = null;
  }
  // No dedicated track: the theme carries the phase via gain + lowpass.
  const map = AUTHORED_MIX[phase];
  themeTrack?.gain.gain.setTargetAtTime(map.gain, t, 0.6);
  themeTrack?.filter.frequency.setTargetAtTime(map.cutoff, t, 0.6);
}

function buildLayers(ac: AudioContext): Layers {
  const bus = musicBus()!;
  const engine = ac.createGain();
  engine.connect(bus);

  // Vinyl crackle: looped sparse-spike noise through a soft bandpass.
  const crackle = ac.createGain();
  crackle.gain.value = 1;
  const len = Math.floor(2 * ac.sampleRate);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.04;
  for (let i = 0; i < 22; i++) {
    const at = Math.floor(Math.random() * len);
    data[at] = (Math.random() * 2 - 1) * 0.6;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1000;
  bp.Q.value = 0.5;
  const cg = ac.createGain();
  cg.gain.value = 0.3;
  src.connect(bp).connect(cg).connect(crackle).connect(engine);
  src.start();

  const padFilter = ac.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = PHASE_MIX[phase].cutoff;
  const padDuck = ac.createGain();
  const pad = ac.createGain();
  padFilter.connect(padDuck).connect(pad).connect(engine);

  const bass = ac.createGain();
  bass.connect(engine);
  const keys = ac.createGain();
  keys.connect(engine);
  const perc = ac.createGain();
  perc.connect(engine);

  const mix = PHASE_MIX[phase];
  pad.gain.value = mix.pad;
  bass.gain.value = mix.bass;
  keys.gain.value = mix.keys;
  perc.gain.value = mix.perc;

  return { engine, crackle, pad, padDuck, padFilter, bass, keys, perc };
}

function playChord(ac: AudioContext, at: number, chord: number[]) {
  if (!layers) return;
  // Release the previous chord.
  if (padVoices) {
    const old = padVoices;
    old.gain.gain.setTargetAtTime(0, at, 0.6);
    for (const o of old.oscs) o.stop(at + 2);
  }
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.setTargetAtTime(0.05, at, 0.5);
  gain.connect(layers.padFilter);
  const shift = phase === "boss" ? -12 : 0;
  const oscs: OscillatorNode[] = [];
  for (const m of chord) {
    for (const cents of [-7, 7]) {
      const osc = ac.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = midiHz(m + shift);
      osc.detune.value = cents;
      osc.connect(gain);
      osc.start(at);
      oscs.push(osc);
    }
  }
  padVoices = { gain, oscs };
}

function pluck(ac: AudioContext, out: GainNode, at: number, freq: number, gain: number) {
  const osc = ac.createOscillator();
  const lp = ac.createBiquadFilter();
  const g = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2000, at);
  lp.frequency.exponentialRampToValueAtTime(400, at + 0.3);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
  osc.connect(lp).connect(g).connect(out);
  osc.start(at);
  osc.stop(at + 0.55);
}

function kick(ac: AudioContext, at: number) {
  if (!layers) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.09);
  g.gain.setValueAtTime(0.25, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  osc.connect(g).connect(layers.perc);
  osc.start(at);
  osc.stop(at + 0.3);
  // Sidechain: duck the pad under each kick.
  layers.padDuck.gain.setValueAtTime(0.55, at);
  layers.padDuck.gain.setTargetAtTime(1, at + 0.05, 0.12);
}

function hat(ac: AudioContext, at: number, accent: boolean) {
  if (!layers) return;
  const len = Math.floor(0.05 * ac.sampleRate);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  const g = ac.createGain();
  g.gain.value = accent ? 0.03 : 0.018;
  src.connect(hp).connect(g).connect(layers.perc);
  src.start(at);
}

function scheduleStep(ac: AudioContext, s: number, t: number) {
  if (!layers) return;
  const stepInBar = s % 16;
  const bar = Math.floor(s / 16) % 8;
  const chordIdx = Math.floor(bar / 2);
  let chord = progression[chordIdx];
  if (phase === "boss" && chordIdx === 3) chord = BOSS_COLOR_CHORD;

  const swung = stepInBar % 4 === 2 ? t + SWING : t;

  // Chord changes on the downbeat of every other bar.
  const chordKey = Math.floor(s / 32);
  if (stepInBar === 0 && bar % 2 === 0 && chordKey !== lastChordKey) {
    lastChordKey = chordKey;
    playChord(ac, t, chord);
  }

  // Bass: root on beats 1 and 3, occasional pickup into the next chord.
  if (stepInBar === 0 || stepInBar === 8) {
    pluckBass(ac, t, midiHz(chord[0] - 12));
  } else if (stepInBar === 14 && bar % 2 === 1 && rand() < 0.35) {
    const nextChord = progression[(chordIdx + 1) % 4];
    pluckBass(ac, swung, midiHz(nextChord[0] - 12));
  }

  // Keys: sparse swung arp, random walk over chord tones + pentatonic colors.
  if (stepInBar % 2 === 0) {
    const density = phase === "shop" ? 0.45 : 0.3;
    if (rand() < density) {
      const pool = [...chord.map((m) => m + 12), ...MELODY_POOL];
      melodyIdx = Math.max(0, Math.min(pool.length - 1, melodyIdx + (Math.floor(rand() * 5) - 2)));
      pluck(ac, layers.keys, swung, midiHz(pool[melodyIdx]), 0.045);
    }
  }

  // Percussion (audible only when the perc layer is up, i.e. boss).
  if (stepInBar === 0 || stepInBar === 8) kick(ac, t);
  else if (stepInBar === 14 && rand() < 0.25) kick(ac, swung);
  if (stepInBar % 4 === 2 && rand() >= 0.2) hat(ac, swung, stepInBar % 8 === 6);
}

function pluckBass(ac: AudioContext, at: number, freq: number) {
  if (!layers) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.09, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  osc.connect(g).connect(layers.bass);
  osc.start(at);
  osc.stop(at + 0.6);
}

function tick() {
  const ac = ensureCtx();
  if (!ac || !running) return;
  while (nextStepTime < ac.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(ac, step, nextStepTime);
    step++;
    nextStepTime += STEP;
  }
}

function startScheduler(ac: AudioContext) {
  step = 0;
  lastChordKey = -1;
  nextStepTime = ac.currentTime + 0.1;
  timer = setInterval(tick, LOOKAHEAD_MS);
}

const AUTHORED_MIX: Record<MusicPhase, { gain: number; cutoff: number }> = {
  menu: { gain: 0.4, cutoff: 1800 },
  playing: { gain: 0.6, cutoff: 12000 },
  boss: { gain: 0.72, cutoff: 16000 },
  shop: { gain: 0.45, cutoff: 2500 },
};

export function start(): void {
  if (running || !musicEnabled()) return;
  const ac = ensureCtx();
  if (!ac) return;
  running = true;
  void probeAuthored().then((set) => {
    if (!running) return;
    authoredSet = set;
    if (set) {
      playNextTheme(ac);
      updateAuthoredPhase(ac);
    } else {
      layers = buildLayers(ac);
      startScheduler(ac);
    }
  });
}

export function stop(fadeMs = 800): void {
  if (!running) return;
  running = false;
  const ac = ensureCtx();
  const fade = fadeMs / 1000;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (ac && layers) {
    const l = layers;
    l.engine.gain.setTargetAtTime(0, ac.currentTime, fade / 3);
    const old = padVoices;
    setTimeout(() => {
      old?.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      try {
        l.engine.disconnect();
      } catch {
        /* already gone */
      }
    }, fadeMs + 300);
  }
  if (rotateTimer) {
    clearTimeout(rotateTimer);
    rotateTimer = null;
  }
  if (ac) {
    if (themeTrack) releaseTrack(ac, themeTrack, fade);
    if (phaseTrack) releaseTrack(ac, phaseTrack, fade);
  }
  layers = null;
  padVoices = null;
  themeTrack = null;
  phaseTrack = null;
  bossPick = null;
}

export function setPhase(p: MusicPhase): void {
  phase = p;
  const ac = ensureCtx();
  if (!ac) return;
  if (themeTrack || phaseTrack) {
    updateAuthoredPhase(ac);
    return;
  }
  if (!layers) return;
  const mix = PHASE_MIX[p];
  const t = ac.currentTime;
  layers.pad.gain.setTargetAtTime(mix.pad, t, 0.6);
  layers.bass.gain.setTargetAtTime(mix.bass, t, 0.6);
  layers.keys.gain.setTargetAtTime(mix.keys, t, 0.6);
  layers.perc.gain.setTargetAtTime(mix.perc, t, 0.6);
  layers.padFilter.frequency.setTargetAtTime(mix.cutoff, t, 0.6);
}

export function sting(kind: "win" | "lose"): void {
  const ac = ensureCtx();
  const bus = musicBus();
  if (!ac || !bus || !musicEnabled()) {
    stop(400);
    return;
  }
  stop(1200);
  const t = ac.currentTime + 0.2;
  const notes =
    kind === "win" ? [440, 554.37, 659.25, 880] : [440, 392, 329.63, 261.63];
  notes.forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.05, t + i * 0.13);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.13 + (kind === "win" ? 0.5 : 0.4));
    osc.connect(g).connect(bus);
    osc.start(t + i * 0.13);
    osc.stop(t + i * 0.13 + 0.55);
  });
  if (kind === "lose") {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t + 0.55);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.75);
    g.gain.setValueAtTime(0.08, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    osc.connect(g).connect(bus);
    osc.start(t + 0.55);
    osc.stop(t + 1);
  }
}

// Volume-0 / mute: stop the scheduler entirely (no silent CPU churn); restart
// when music becomes audible again.
let wantedPhase: MusicPhase | null = null;
onPrefsChange(() => {
  if (!musicEnabled()) {
    if (running) {
      wantedPhase = phase;
      stop(200);
    }
  } else if (!running && wantedPhase !== null) {
    phase = wantedPhase;
    wantedPhase = null;
    start();
  }
});

// Background tabs throttle setInterval — pause cleanly and re-baseline on return.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!running) return;
    if (document.hidden) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    } else if (!timer && layers) {
      const ac = ensureCtx();
      if (!ac) return;
      nextStepTime = ac.currentTime + 0.1;
      timer = setInterval(tick, LOOKAHEAD_MS);
    }
  });
}

export const music = { start, stop, setPhase, setSeed, sting };
