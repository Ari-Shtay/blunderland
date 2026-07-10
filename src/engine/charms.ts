// Single-use charms — Blunderland's consumables. Unlike Balatro's tarots,
// most charms fire MID-BLIND: they steer the puzzle, not just the deck.
// All effects are implemented in run.ts (useCharm); this file is pure data.

import type { CharmId, MovePattern } from "./types";

export interface CharmDef {
  id: CharmId;
  name: string;
  desc: string;
  emoji: string;
  cost: number;
  /** When it can be used. */
  phase: "playing" | "shop" | "any";
  /** What it must be aimed at. */
  target: "boardPiece" | "bagPiece" | "none";
  /** Study charms level this move pattern. */
  study?: MovePattern;
}

const def = (c: CharmDef) => c;

export const CHARMS: Record<CharmId, CharmDef> = {
  invitation: def({
    id: "invitation",
    name: "Invitation",
    desc: "Summon a Legendary Joker, if a slot stands empty.",
    emoji: "💌",
    cost: 9,
    phase: "any",
    target: "none",
  }),
  secondBreakfast: def({
    id: "secondBreakfast",
    name: "Second Breakfast",
    desc: "Wake one spent piece — it may move again this blind.",
    emoji: "🥐",
    cost: 4,
    phase: "playing",
    target: "boardPiece",
  }),
  tempest: def({
    id: "tempest",
    name: "Tempest",
    desc: "Scatter every bounty to new squares.",
    emoji: "🌪️",
    cost: 3,
    phase: "playing",
    target: "none",
  }),
  royalWrit: def({
    id: "royalWrit",
    name: "Royal Writ",
    desc: "Crown a pawn on the board into a Queen, at once.",
    emoji: "📜",
    cost: 5,
    phase: "playing",
    target: "boardPiece",
  }),
  echo: def({
    id: "echo",
    name: "Echo",
    desc: "Your next move scores twice.",
    emoji: "🔔",
    cost: 5,
    phase: "playing",
    target: "none",
  }),
  extraHour: def({
    id: "extraHour",
    name: "Extra Hour",
    desc: "+1 move this blind.",
    emoji: "🕰️",
    cost: 5,
    phase: "playing",
    target: "none",
  }),
  windfall: def({
    id: "windfall",
    name: "Windfall",
    desc: "Earn $1 for every bounty on the board.",
    emoji: "🍃",
    cost: 3,
    phase: "playing",
    target: "none",
  }),
  pressGang: def({
    id: "pressGang",
    name: "Press-Gang",
    desc: "Add two pawns to your bag.",
    emoji: "🪖",
    cost: 3,
    phase: "any",
    target: "none",
  }),
  transmutation: def({
    id: "transmutation",
    name: "Transmutation",
    desc: "A bag piece becomes the next piece up the ladder.",
    emoji: "⚗️",
    cost: 4,
    phase: "shop",
    target: "bagPiece",
  }),
  silverPolish: def({
    id: "silverPolish",
    name: "Silver Polish",
    desc: "Apply a random enhancement to a bag piece.",
    emoji: "🧴",
    cost: 4,
    phase: "shop",
    target: "bagPiece",
  }),
  cullingWrit: def({
    id: "cullingWrit",
    name: "Culling Writ",
    desc: "Banish a bag piece, free — the ledger never hears of it.",
    emoji: "🖋️",
    cost: 4,
    phase: "shop",
    target: "bagPiece",
  }),
  studyQuiet: def({
    id: "studyQuiet",
    name: "Study: Quiet Steps",
    desc: "Level up Quiet moves — +8 Chips, +1 Mult forever.",
    emoji: "📗",
    cost: 4,
    phase: "any",
    target: "none",
    study: "quiet",
  }),
  studyCapture: def({
    id: "studyCapture",
    name: "Study: The Hunt",
    desc: "Level up Captures — +10 Chips, +1 Mult forever.",
    emoji: "📕",
    cost: 4,
    phase: "any",
    target: "none",
    study: "capture",
  }),
  studyChain: def({
    id: "studyChain",
    name: "Study: Chains",
    desc: "Level up Chain captures (2+ in a row) — +12 Chips, +2 Mult forever.",
    emoji: "📙",
    cost: 4,
    phase: "any",
    target: "none",
    study: "chain",
  }),
  studyFork: def({
    id: "studyFork",
    name: "Study: The Fork",
    desc: "Level up Forks (attack 2+ bounties) — +12 Chips, +2 Mult forever.",
    emoji: "📘",
    cost: 4,
    phase: "any",
    target: "none",
    study: "fork",
  }),
  studySlide: def({
    id: "studySlide",
    name: "Study: Long Rides",
    desc: "Level up Long Slides (3+ squares) — +10 Chips, +1 Mult forever.",
    emoji: "📓",
    cost: 4,
    phase: "any",
    target: "none",
    study: "slide",
  }),
  studyPromotion: def({
    id: "studyPromotion",
    name: "Study: Coronations",
    desc: "Level up Promotions — +25 Chips, +3 Mult forever.",
    emoji: "📖",
    cost: 4,
    phase: "any",
    target: "none",
    study: "promotion",
  }),
};

export const CHARM_IDS = Object.keys(CHARMS) as CharmId[];

export const PATTERN_LABEL: Record<MovePattern, string> = {
  quiet: "Quiet",
  capture: "Hunt",
  chain: "Chains",
  fork: "Fork",
  slide: "Rides",
  promotion: "Crowns",
};

export const EMPTY_STUDIES: Record<MovePattern, number> = {
  quiet: 0,
  capture: 0,
  chain: 0,
  fork: 0,
  slide: 0,
  promotion: 0,
};
