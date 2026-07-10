// Patents — the White Knight sells you his own inventions. One offered in
// every boss-blind shop; each is a permanent run upgrade. Pipeline effects
// ride Modifiers (base → opening → trial → PATENTS → jokers → boss); the
// rest fire at flagged sites in run.ts.

import { DEAL_COUNT } from "./constants";
import type { Modifiers, PatentId } from "./types";

export interface PatentDef {
  id: PatentId;
  name: string;
  desc: string;
  emoji: string;
  cost: number;
  mods?: (m: Modifiers) => Modifiers;
  // upsideDownBox (joker slots), blottingPudding (pack choices), mouseTrap
  // (banish escalation), interestLedger (cap), spareReins (free reroll) are
  // read directly where they act.
}

const def = (p: PatentDef) => p;

export const PATENTS: Record<PatentId, PatentDef> = {
  beehiveSaddle: def({
    id: "beehiveSaddle",
    name: "Beehive Saddle",
    desc: "+1 swap every blind. In case of bees.",
    emoji: "🐝",
    cost: 8,
    mods: (m) => ({ ...m, swapsPerBlind: m.swapsPerBlind + 1 }),
  }),
  upsideDownBox: def({
    id: "upsideDownBox",
    name: "Upside-Down Box",
    desc: "+1 Joker slot. It keeps the rain out, this way up.",
    emoji: "📦",
    cost: 10,
  }),
  fifthLeg: def({
    id: "fifthLeg",
    name: "Fifth Leg",
    desc: "Six pieces dealt every blind.",
    emoji: "🦵",
    cost: 9,
    mods: (m) => ({ ...m, dealCount: DEAL_COUNT + 1 }),
  }),
  blottingPudding: def({
    id: "blottingPudding",
    name: "Blotting-Paper Pudding",
    desc: "Piece packs offer four choices.",
    emoji: "🍮",
    cost: 8,
  }),
  mouseTrap: def({
    id: "mouseTrap",
    name: "Mouse-Trap",
    desc: "Banishing never gets more expensive.",
    emoji: "🪤",
    cost: 8,
  }),
  interestLedger: def({
    id: "interestLedger",
    name: "Interest Ledger",
    desc: "Interest cap raised to $10. (The Mirror Trial still bites.)",
    emoji: "📔",
    cost: 9,
  }),
  ironStirrups: def({
    id: "ironStirrups",
    name: "Iron Stirrups",
    desc: "Quiet moves earn 80% of base chips instead of 60%.",
    emoji: "🪖",
    cost: 9,
    mods: (m) => ({ ...m, quietFactor: 0.8 }),
  }),
  spareReins: def({
    id: "spareReins",
    name: "Spare Reins",
    desc: "One free reroll in every shop.",
    emoji: "🪢",
    cost: 8,
  }),
};

export const PATENT_IDS = Object.keys(PATENTS) as PatentId[];
