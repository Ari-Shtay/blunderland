import { BOARD_SIZE, DEAL_COUNT, MOVES_PER_BLIND, QUIET_CHIP_FACTOR, SWAPS_PER_BLIND } from "./constants";
import { PATENTS } from "./patents";
import { JOKERS } from "./jokers";
import { OPENINGS } from "./openings";
import { trialMods } from "./trials";
import type { BossId, Modifiers, RunState } from "./types";

export interface BossDef {
  id: BossId;
  name: string;
  desc: string;
  apply: (mods: Modifiers) => Modifiers;
}

export const BOSSES: Record<BossId, BossDef> = {
  wall: {
    id: "wall",
    name: "The Wall",
    desc: "Bounties on dark squares are worth 0 chips.",
    apply: (m) => ({ ...m, darkBountiesWorthless: true }),
  },
  antiCavalry: {
    id: "antiCavalry",
    name: "Anti-Cavalry",
    desc: "Knight moves score nothing and trigger no jokers.",
    apply: (m) => ({ ...m, knightsScoreNothing: true }),
  },
  suddenDeath: {
    id: "suddenDeath",
    name: "Sudden Death",
    desc: "One move fewer this blind.",
    apply: (m) => ({ ...m, movesPerBlind: Math.max(2, m.movesPerBlind - 1) }),
  },
  royalDecree: {
    id: "royalDecree",
    name: "Royal Decree",
    desc: "Queens are not dealt this blind.",
    apply: (m) => ({ ...m, queensNotDealt: true }),
  },
  tollbooth: {
    id: "tollbooth",
    name: "Tollbooth",
    desc: "Every capture costs $1.",
    apply: (m) => ({ ...m, captureTax: m.captureTax + 1 }),
  },
  pacifist: {
    id: "pacifist",
    name: "Pacifist",
    desc: "Your first move this blind must not be a capture.",
    apply: (m) => ({ ...m, firstMoveQuiet: true }),
  },
  blackout: {
    id: "blackout",
    name: "Blackout",
    desc: "No gold square this blind.",
    apply: (m) => ({ ...m, noGoldSquare: true }),
  },
};

export const BOSS_IDS = Object.keys(BOSSES) as BossId[];

export function baseModifiers(): Modifiers {
  return {
    boardSize: BOARD_SIZE,
    movesPerBlind: MOVES_PER_BLIND,
    swapsPerBlind: SWAPS_PER_BLIND,
    targetScale: 1,
    dealCount: DEAL_COUNT,
    quietFactor: QUIET_CHIP_FACTOR,
    averageChipsMult: false,
    exhaustionExempt: [],
    darkBountiesWorthless: false,
    knightsScoreNothing: false,
    queensNotDealt: false,
    captureTax: 0,
    firstMoveQuiet: false,
    noGoldSquare: false,
  };
}

/**
 * Modifiers in effect for the current (or upcoming) blind of a run.
 * Pipeline order matters: base → opening → trial → jokers → boss.
 * Openings/trials set the baseline rules; jokers are player power layered on
 * top (Reserves' +2 swaps beats Iron Trial's −1); the boss always has the
 * last word.
 */
export function modifiersFor(run: RunState, blindIdx = run.blindIdx): Modifiers {
  let mods = baseModifiers();
  const opening = OPENINGS[run.openingId];
  if (opening.mods) mods = opening.mods(mods);
  mods = trialMods(run.trial, mods);
  for (const id of run.patents) {
    const apply = PATENTS[id].mods;
    if (apply) mods = apply(mods);
  }
  for (const inst of run.jokers) {
    const apply = JOKERS[inst.id].mods;
    if (apply) mods = apply(mods);
  }
  // Crimson Trial: boss rules reach the Big blind too.
  const bossFrom = run.trial >= 6 ? 1 : 2;
  if (blindIdx >= bossFrom) {
    mods = BOSSES[run.bosses[(run.ante - 1) % run.bosses.length]].apply(mods);
  }
  return mods;
}
