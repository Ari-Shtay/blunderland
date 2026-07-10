// Every tuning number lives here. Balance passes should touch only this file.

import type { BlindKind, Enhancement, PieceType } from "./types";

export const BOARD_SIZE = 5;
export const SQUARES = BOARD_SIZE * BOARD_SIZE;

export const MOVES_PER_BLIND = 4;
export const SWAPS_PER_BLIND = 3;
export const DEAL_COUNT = 5; // own pieces dealt per blind
export const BOUNTY_COUNT = 7; // neutral bounties per blind
export const JOKER_SLOTS = 5;
export const ANTES = 8;

/**
 * Chips for moving a piece — inverted "underdog" ladder. Mobility and score
 * value are opposing axes: the queen reaches everything but pays for it.
 */
export const BASE_CHIPS: Record<PieceType, number> = {
  P: 30,
  N: 20,
  B: 20,
  R: 15,
  Q: 10,
};

/**
 * Quiet (non-capture) moves earn this fraction of base chips — bare shuffling
 * onto bonus squares must not out-earn actually hunting the bounty map.
 */
export const QUIET_CHIP_FACTOR = 0.6;

/** Chips for capturing a bounty of this type (before ante scaling). */
export const CAPTURE_CHIPS: Record<PieceType, number> = {
  P: 15,
  N: 30,
  B: 30,
  R: 50,
  Q: 80,
};

/** Weighted bounty spawn table — mostly small fry, rare queens. */
export const BOUNTY_WEIGHTS: [PieceType, number][] = [
  ["P", 40],
  ["N", 22],
  ["B", 22],
  ["R", 11],
  ["Q", 5],
];

export const CENTER_SQ_CHIPS = 10; // c3
export const GOLD_SQ_CHIPS = 20; // rotating gold square

/** Bounty chips scale by 1 + BOUNTY_ANTE_SCALE * (ante - 1). */
export const BOUNTY_ANTE_SCALE = 0.25;

/** Ante score targets (small blind base); big ×1.5, boss ×2. */
export const ANTE_TARGETS = [100, 260, 600, 1300, 2600, 5200, 11000, 24000];
export const BLIND_MULT: Record<BlindKind, number> = { small: 1, big: 1.5, boss: 2 };

export const BLIND_REWARD: Record<BlindKind, number> = { small: 3, big: 4, boss: 5 };
export const UNUSED_MOVE_PAY = 1;
export const INTEREST_PER = 5; // $1 per $5 held
export const INTEREST_CAP = 5;

export const STARTING_MONEY = 4;
export const STARTING_BAG: PieceType[] = ["P", "P", "P", "P", "P", "N", "N", "B", "B", "R", "Q"];

export const PACK_COST = 3;
export const ENHANCEMENT_COST = 4;
/** Reroll: base cost each shop, +increment per paid reroll (Balatro-style). */
export const REROLL_COST = 2;
export const REROLL_INCREMENT = 1;
/** Banish: base cost, +increment per piece removed across the run (never resets). */
export const REMOVE_COST = 2;
export const REMOVE_INCREMENT = 1;
export const MIN_BAG_SIZE = 6;

export const PIECE_PACK_WEIGHTS: [PieceType, number][] = [
  ["P", 25],
  ["N", 25],
  ["B", 25],
  ["R", 15],
  ["Q", 10],
];

export const CHARM_SLOTS = 2;

/** Per-level bonus a leveled Study grants to matching moves. */
export const STUDY_BONUS: Record<import("./types").MovePattern, { chips: number; mult: number }> = {
  quiet: { chips: 8, mult: 1 },
  capture: { chips: 10, mult: 1 },
  chain: { chips: 12, mult: 2 },
  fork: { chips: 12, mult: 2 },
  slide: { chips: 10, mult: 1 },
  promotion: { chips: 25, mult: 3 },
};

export const ENHANCEMENTS: Enhancement[] = ["heavy", "gilded", "volatile"];
export const ENGRAVINGS: import("./types").Engraving[] = [
  "foiled",
  "etched",
  "prismatic",
  "phantom",
];
export const ENGRAVING_CHIPS = 30; // Foiled
export const ENGRAVING_MULT = 3; // Etched
export const ENGRAVING_XMULT = 1.5; // Prismatic
/** Chance the enhancement stall offers an engraving instead. */
export const ENGRAVING_SHOP_CHANCE = 0.25;
export const HEAVY_CHIP_X = 1.5;
export const GILDED_MONEY = 1;
export const VOLATILE_MULT_X = 2;
export const VOLATILE_SHATTER_CHANCE = 0.25;
export const GLASS_QUEEN_SHATTER_CHANCE = 0.25;

export const PROMOTION_RANK = 4; // rank index (0-based) — rank 5
// Auto-queen is a real tradeoff under underdog chips: mobility up, base chips down.
export const PROMOTION_PIECE: PieceType = "Q";

/** Shop joker slot rarity roll. */
export const RARITY_WEIGHTS: [import("./types").Rarity, number][] = [
  ["common", 60],
  ["uncommon", 30],
  ["rare", 10],
];
