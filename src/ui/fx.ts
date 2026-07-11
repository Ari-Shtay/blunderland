// Juice orchestration: replays a ScoreEvent script with staggered timing,
// plus a tiny WebAudio synth for blips. All fire-and-forget, cancel-safe.

import type { ScoreEvent, Square } from "../engine/types";

export interface Popup {
  id: number;
  text: string;
  flavor: "chips" | "mult" | "xmult" | "money" | "shatter" | "promote" | "retrigger" | "exhaust";
  sq?: Square;
  source?: string;
}

export interface FxHandlers {
  popup: (p: Popup) => void;
  /** Live chips/mult tally as the script replays. */
  tally: (chips: number, mult: number) => void;
  total: (amount: number, big: boolean) => void;
  jokerFire: (source: string) => void;
  done: () => void;
}

let popupId = 1;
const STEP_MS = 210;

/** Replays events with stagger. Returns a cancel function. */
export function replayScore(events: ScoreEvent[], h: FxHandlers): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let chips = 0;
  let mult = 1;
  let step = 0;

  const at = (fn: () => void) => {
    timers.push(setTimeout(fn, step * STEP_MS));
    step++;
  };

  for (const e of events) {
    switch (e.kind) {
      case "chips": {
        const amount = e.amount;
        const sq = e.sq;
        const source = e.source;
        at(() => {
          chips += amount;
          h.popup({ id: popupId++, text: `+${amount}`, flavor: "chips", sq, source });
          h.tally(chips, mult);
          h.jokerFire(source);
          blip(440 + chips * 2, 0.05, "triangle");
        });
        break;
      }
      case "mult": {
        const { amount, source } = e;
        at(() => {
          mult += amount;
          h.popup({ id: popupId++, text: `+${amount} Mult`, flavor: "mult", source });
          h.tally(chips, mult);
          h.jokerFire(source);
          blip(220 + mult * 12, 0.06, "sawtooth");
        });
        break;
      }
      case "xmult": {
        const { amount, source } = e;
        at(() => {
          mult *= amount;
          h.popup({ id: popupId++, text: `×${amount} Mult`, flavor: "xmult", source });
          h.tally(chips, mult);
          h.jokerFire(source);
          blip(160 + mult * 10, 0.09, "sawtooth");
        });
        break;
      }
      case "money": {
        const { amount, source } = e;
        at(() => {
          const text = amount >= 0 ? `+$${amount}` : `-$${-amount}`;
          h.popup({ id: popupId++, text, flavor: "money", source });
          h.jokerFire(source);
          blip(amount >= 0 ? 880 : 240, 0.05, "square");
        });
        break;
      }
      case "retrigger": {
        const { source } = e;
        at(() => {
          h.popup({ id: popupId++, text: "AGAIN!", flavor: "retrigger", source });
          h.jokerFire(source);
          blip(660, 0.08, "square");
        });
        break;
      }
      case "shatter": {
        const { source } = e;
        at(() => {
          h.popup({ id: popupId++, text: "SHATTERED", flavor: "shatter", source });
          crashNoise();
        });
        break;
      }
      case "promote": {
        const { sq } = e;
        at(() => {
          h.popup({ id: popupId++, text: "PROMOTED!", flavor: "promote", sq });
          sfx.promoteFanfare();
        });
        break;
      }
      case "exhaust": {
        const { sq } = e;
        at(() => {
          h.popup({ id: popupId++, text: "spent", flavor: "exhaust", sq });
          blip(150, 0.05, "sine", 0.02);
        });
        break;
      }
      case "total": {
        const { amount } = e;
        at(() => {
          h.total(amount, amount >= 300);
          thud(amount >= 300 ? 70 : 110);
        });
        break;
      }
    }
  }
  at(() => h.done());

  return () => timers.forEach(clearTimeout);
}

/** Animated number count-up; returns a cancel function. */
export function countUp(
  from: number,
  to: number,
  ms: number,
  onFrame: (v: number) => void,
): () => void {
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    onFrame(Math.round(from + (to - from) * eased));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// ---- tiny synth (all voices are per-note nodes routed through the sfx bus) ----

import { sfxBus, sfxEnabled } from "./audio";

/** The sfx bus, or null when sfx are muted/off. */
function bus(): GainNode | null {
  if (!sfxEnabled()) return null;
  return sfxBus();
}

/** Simple one-shot oscillator note. */
function tone(
  b: GainNode,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  endFreq?: number,
) {
  const ac = b.context as AudioContext;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.min(freq, 4000), at);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), at + dur);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(b);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Band-passed noise burst (clicks, shuffles, hats). */
function noiseBurst(b: GainNode, at: number, dur: number, bandHz: number, gain: number) {
  const ac = b.context as AudioContext;
  const len = Math.max(1, Math.floor(dur * ac.sampleRate));
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  const bp = ac.createBiquadFilter();
  const g = ac.createGain();
  bp.type = "bandpass";
  bp.frequency.value = bandHz;
  g.gain.value = gain;
  src.buffer = buffer;
  src.connect(bp).connect(g).connect(b);
  src.start(at);
}

export function blip(freq: number, dur = 0.06, type: OscillatorType = "triangle", gain = 0.035) {
  const b = bus();
  if (!b) return;
  tone(b, (b.context as AudioContext).currentTime, Math.min(freq, 2200), dur, type, gain);
}

function thud(freq: number) {
  const b = bus();
  if (!b) return;
  const t = (b.context as AudioContext).currentTime;
  tone(b, t, freq * 2, 0.22, "sine", 0.09, freq);
}

function crashNoise() {
  const b = bus();
  if (!b) return;
  noiseBurst(b, (b.context as AudioContext).currentTime, 0.25, 1800, 0.05);
}

/** Named one-shot effects, wired to game actions in app.tsx. */
export const sfx = {
  /** Soft wooden click — selecting a piece. */
  select() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    tone(b, t, 190, 0.03, "triangle", 0.05);
    noiseBurst(b, t, 0.015, 900, 0.025);
  },
  /** Landing thock; captures add a chip clink. */
  land(capture: boolean) {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    tone(b, t, 300, 0.08, "sine", 0.07, 150);
    if (capture) {
      tone(b, t + 0.02, 1250, 0.06, "square", 0.018);
      tone(b, t + 0.02, 1870, 0.06, "square", 0.014);
    }
  },
  /** Rising arp — a pawn is crowned. */
  promoteFanfare() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(b, t + i * 0.085, f, 0.14, "triangle", 0.04);
    });
    tone(b, t + 0.36, 2637, 0.3, "sine", 0.015);
  },
  /** Low dissonant swell — a boss blind begins. */
  bossSting() {
    const b = bus();
    if (!b) return;
    const ac = b.context as AudioContext;
    const t = ac.currentTime;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 300;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    lp.connect(g).connect(b);
    for (const [f, amt] of [
      [55, 1],
      [82.4, 0.8],
      [116.5, 0.45],
    ] as const) {
      const osc = ac.createOscillator();
      const og = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      og.gain.value = amt;
      osc.connect(og).connect(lp);
      osc.start(t);
      osc.stop(t + 0.75);
    }
  },
  /** Two-partial bell — entering the shop. */
  shopBell() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    tone(b, t, 880, 0.7, "sine", 0.04);
    tone(b, t, 2140, 0.5, "sine", 0.018);
  },
  /** Bright double-blip — money spent on a purchase. */
  coin() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    tone(b, t, 988, 0.05, "square", 0.03);
    tone(b, t + 0.07, 1319, 0.07, "square", 0.03);
  },
  /** Paper shuffle — rerolling the stalls. */
  shuffle() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    for (let i = 0; i < 3; i++) noiseBurst(b, t + i * 0.09, 0.06, 2500, 0.03);
  },
  /** Cha-ching — selling a joker back. */
  sell() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    tone(b, t, 988, 0.05, "square", 0.03);
    tone(b, t + 0.07, 1319, 0.07, "square", 0.03);
    tone(b, t + 0.15, 2637, 0.06, "sine", 0.02);
  },
  /** One syllable of the White Knight's voice — squarish, pitch-jittered. */
  speakBlip() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    // A-minor pentatonic: the chatter sits inside the soundtrack's key.
    const SPEECH_NOTES = [220, 261.63, 293.66, 329.63, 392];
    const f = SPEECH_NOTES[Math.floor(Math.random() * SPEECH_NOTES.length)] * 2;
    tone(b, t, f, 0.05, "triangle", 0.06, f * 0.92);
  },
  /** Alternating hoof-falls for the knight's travels. */
  clipClop() {
    const b = bus();
    if (!b) return;
    const t = (b.context as AudioContext).currentTime;
    hoof = !hoof;
    tone(b, t, hoof ? 225 : 165, 0.05, "sine", 0.05, 90);
    noiseBurst(b, t, 0.02, 1400, 0.02);
  },
  /** A proper tumble — the knight has dismounted involuntarily. */
  crash() {
    crashNoise();
    thud(90);
  },
};

let hoof = false;
