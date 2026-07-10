// Trials — the post-win difficulty ladder (Balatro's stakes). Cumulative:
// playing Trial N applies every handicap 1..N. Tiers use existing engine
// knobs; three fire at flagged sites in run.ts/bosses.ts (see notes).

import type { Modifiers } from "./types";

export interface TrialDef {
  tier: number;
  name: string;
  desc: string;
  /** Pipeline handicaps (targets, swaps, gold). */
  mods?: (m: Modifiers) => Modifiers;
  // T1 (small-blind reward), T4 (interest cap) fire in clearBlind;
  // T6 (boss rules on Big blinds) fires in modifiersFor.
}

export const TRIALS: TrialDef[] = [
  {
    tier: 1,
    name: "Wooden Trial",
    desc: "Small blinds pay no reward.",
  },
  {
    tier: 2,
    name: "Stone Trial",
    desc: "All targets are 15% higher.",
    mods: (m) => ({ ...m, targetScale: m.targetScale * 1.15 }),
  },
  {
    tier: 3,
    name: "Iron Trial",
    desc: "One fewer swap every blind.",
    mods: (m) => ({ ...m, swapsPerBlind: Math.max(0, m.swapsPerBlind - 1) }),
  },
  {
    tier: 4,
    name: "Mirror Trial",
    desc: "Interest is capped at $3.",
  },
  {
    tier: 5,
    name: "Thorn Trial",
    desc: "Gold squares never appear.",
    mods: (m) => ({ ...m, noGoldSquare: true }),
  },
  {
    tier: 6,
    name: "Crimson Trial",
    desc: "Boss rules apply to Big blinds too.",
  },
];

export const MAX_TRIAL = TRIALS.length;

/** Apply the pipeline handicaps for tiers 1..trial. */
export function trialMods(trial: number, m: Modifiers): Modifiers {
  let mods = m;
  for (const t of TRIALS) {
    if (t.tier > trial) break;
    if (t.mods) mods = t.mods(mods);
  }
  return mods;
}
