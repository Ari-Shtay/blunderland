// Seeded mulberry32 RNG. State is a plain number kept inside RunState,
// so runs are reproducible and every reducer stays pure.

export function seedFromString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Returns [float in [0,1), next state]. */
export function next(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return [((x ^ (x >>> 14)) >>> 0) / 4294967296, t];
}

/** Returns [int in [0, n), next state]. */
export function nextInt(state: number, n: number): [number, number] {
  const [f, s] = next(state);
  return [Math.floor(f * n), s];
}

/** Fisher–Yates shuffle. Returns [shuffled copy, next state]. */
export function shuffle<T>(state: number, arr: readonly T[]): [T[], number] {
  const out = arr.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, s] = nextInt(s, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, s];
}

/** Pick k distinct elements. Returns [picked, next state]. */
export function pick<T>(state: number, arr: readonly T[], k: number): [T[], number] {
  const [shuffled, s] = shuffle(state, arr);
  return [shuffled.slice(0, k), s];
}
