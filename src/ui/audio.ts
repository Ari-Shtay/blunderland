// Shared audio core: one AudioContext, master → sfx/music buses, and
// persisted volume preferences. Everything is lazy and best-effort — audio
// failures must never break the game.

export interface AudioPrefs {
  muted: boolean;
  music: number; // 0..1
  sfx: number; // 0..1
}

const KEY = "blunderland:audio:v1";
const DEFAULTS: AudioPrefs = { muted: false, music: 0.7, sfx: 0.8 };

let prefs: AudioPrefs = load();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBusNode: GainNode | null = null;
let musicBusNode: GainNode | null = null;
const listeners = new Set<(p: AudioPrefs) => void>();

function load(): AudioPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioPrefs>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function applyGains() {
  if (!ctx || !master || !sfxBusNode || !musicBusNode) return;
  master.gain.value = prefs.muted ? 0 : 1;
  sfxBusNode.gain.value = prefs.sfx;
  musicBusNode.gain.value = prefs.music;
}

/** Create (or resume) the context. Call from inside a user gesture at least once. */
export function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      sfxBusNode = ctx.createGain();
      musicBusNode = ctx.createGain();
      sfxBusNode.connect(master);
      musicBusNode.connect(master);
      master.connect(ctx.destination);
      applyGains();
    }
    if (ctx.state === "suspended" && !prefs.muted) void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function sfxBus(): GainNode | null {
  ensureCtx();
  return sfxBusNode;
}

export function musicBus(): GainNode | null {
  ensureCtx();
  return musicBusNode;
}

export function getPrefs(): AudioPrefs {
  return prefs;
}

export function sfxEnabled(): boolean {
  return !prefs.muted && prefs.sfx > 0;
}

export function musicEnabled(): boolean {
  return !prefs.muted && prefs.music > 0;
}

export function updatePrefs(patch: Partial<AudioPrefs>): AudioPrefs {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  applyGains();
  if (ctx) {
    // Suspend the whole context while muted — silence AND zero battery drain.
    if (prefs.muted) void ctx.suspend();
    else void ctx.resume();
  }
  listeners.forEach((l) => l(prefs));
  return prefs;
}

export function onPrefsChange(cb: (p: AudioPrefs) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
