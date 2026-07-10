import { GLASS_QUEEN_SHATTER_CHANCE } from "./constants";
import { fileOf, rankOf } from "./movegen";
import type { BagPiece, Cell, JokerId, Modifiers, PieceType, Rarity, Square } from "./types";

/** What a joker contributes to one scoring move. */
export interface Contribution {
  chips?: number;
  mult?: number;
  xmult?: number;
  money?: number;
  /** New per-instance counter value (scaling jokers). */
  setState?: number;
}

/** Everything a joker may inspect when a move scores. */
export interface ScoreCtx {
  /** Board state AFTER the move was applied. */
  board: (Cell | null)[];
  bag: BagPiece[];
  mover: BagPiece;
  /** Piece type at the moment of scoring (post-promotion). */
  moverType: PieceType;
  from: Square;
  to: Square;
  captured: PieceType | null;
  /** Consecutive captures this blind, including this move. 0 for a quiet move. */
  chain: number;
  promoted: boolean;
  isDarkDest: boolean;
  isCornerDest: boolean;
  isCenterDest: boolean;
  isGoldDest: boolean;
  /** Chebyshev distance traveled (a knight hop counts as 2). */
  slideDist: number;
  isDiagonal: boolean;
  isOrthogonal: boolean;
  /** 0-based index of this move within the blind. */
  moveIndex: number;
  /** Moves remaining INCLUDING this one (1 = the blind's final move). */
  movesLeft: number;
  swapsLeft: number;
  /** Captures made this blind BEFORE this move. */
  capturesThisBlind: number;
  /** Bounties still on the board AFTER this move. */
  bountiesOnBoard: number;
  attackedBountyCount: number;
  /** Player money before this move's earnings. */
  money: number;
  /** Pieces banished this run. */
  removals: number;
  jokerCount: number;
  emptySlots: number;
  /** Bag size excluding Phantom-engraved pieces. */
  bagSize: number;
  blindKind: import("./types").BlindKind;
  mods: Modifiers;
}

export type { Rarity };

export interface JokerDef {
  id: JokerId;
  name: string;
  desc: string;
  emoji: string;
  rarity: Rarity;
  cost: number;
  /** Contribute to a scoring move. `state` is this instance's counter (0 if unset). */
  onScore?: (ctx: ScoreCtx, state: number) => Contribution | null;
  /**
   * Fires when a blind is cleared, before the shop rolls. `roll` is a fresh
   * 0..1 draw from the run rng (for self-destruct gambles). `destroy: true`
   * removes this joker.
   */
  onBlindEnd?: (
    state: number,
    roll: number,
    end?: { movesLeft: number; kind: import("./types").BlindKind },
  ) => { money?: number; setState?: number; destroy?: boolean } | null;
  /** Extra sell value on top of floor(cost/2) (e.g. Nest Egg growth). */
  sellBonus?: (state: number) => number;
  /** Adjust blind rules (extra moves/swaps, exhaustion exemptions). */
  mods?: (m: Modifiers) => Modifiers;
  /** When true for a move, the whole move scores again (total ×2, stacks). */
  retrigger?: (ctx: ScoreCtx) => boolean;
  /** Chance the mover shatters after a qualifying scoring move. */
  shatter?: { chance: number; applies: (ctx: ScoreCtx) => boolean };
  /** Free shop rerolls granted per shop. */
  freeRerolls?: number;
  /** Interest: $1 per this many $ held (lowest across jokers wins). */
  interestPer?: number;
  /** Added to the interest cap (summed across jokers). */
  interestCapBonus?: number;
  /** Render a counter badge for scaling jokers. */
  stateLabel?: (state: number) => string;
}

const def = (j: JokerDef) => j;

const isEdge = (sq: Square, size: number) => {
  const f = fileOf(sq);
  const r = rankOf(sq);
  return f === 0 || r === 0 || f === size - 1 || r === size - 1;
};

export const JOKERS: Record<JokerId, JokerDef> = {
  // ---- commons ----
  cavalry: def({
    id: "cavalry",
    name: "Cavalry",
    desc: "+4 Mult when a knight scores.",
    emoji: "🐴",
    rarity: "common",
    cost: 4,
    onScore: (c) =>
      c.moverType === "N" && !c.mods.knightsScoreNothing ? { mult: 4 } : null,
  }),
  towerToll: def({
    id: "towerToll",
    name: "Tower Toll",
    desc: "+4 Mult when a rook scores.",
    emoji: "🗼",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.moverType === "R" ? { mult: 4 } : null),
  }),
  longDiagonal: def({
    id: "longDiagonal",
    name: "Long Diagonal",
    desc: "+4 Mult when a bishop scores.",
    emoji: "📏",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.moverType === "B" ? { mult: 4 } : null),
  }),
  footSoldier: def({
    id: "footSoldier",
    name: "Foot Soldier",
    desc: "+15 Chips when a pawn scores.",
    emoji: "🥾",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.moverType === "P" ? { chips: 15 } : null),
  }),
  pawnStorm: def({
    id: "pawnStorm",
    name: "Pawn Storm",
    desc: "+8 Chips per pawn in your bag.",
    emoji: "🌩️",
    rarity: "common",
    cost: 4,
    onScore: (c) => {
      const pawns = c.bag.filter((p) => p.type === "P").length;
      return pawns > 0 ? { chips: 8 * pawns } : null;
    },
  }),
  edgeLord: def({
    id: "edgeLord",
    name: "Edge Lord",
    desc: "+2 Mult on edge-square destinations.",
    emoji: "🧗",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (isEdge(c.to, c.mods.boardSize) ? { mult: 2 } : null),
  }),
  openingBook: def({
    id: "openingBook",
    name: "Opening Book",
    desc: "+30 Chips on the first move of each blind.",
    emoji: "📖",
    rarity: "common",
    cost: 3,
    onScore: (c) => (c.moveIndex === 0 ? { chips: 30 } : null),
  }),
  quietStrength: def({
    id: "quietStrength",
    name: "Quiet Strength",
    desc: "+20 Chips on non-capture moves.",
    emoji: "🧘",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.captured === null ? { chips: 20 } : null),
  }),
  pawnbroker: def({
    id: "pawnbroker",
    name: "Pawnbroker",
    desc: "Earn $2 when a pawn captures.",
    emoji: "🏦",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.moverType === "P" && c.captured ? { money: 2 } : null),
  }),
  goldRush: def({
    id: "goldRush",
    name: "Gold Rush",
    desc: "Earn $2 when landing on the gold square.",
    emoji: "⛏️",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.isGoldDest ? { money: 2 } : null),
  }),
  dividend: def({
    id: "dividend",
    name: "Dividend",
    desc: "Earn $3 at the end of every blind.",
    emoji: "💵",
    rarity: "common",
    cost: 5,
    onBlindEnd: () => ({ money: 3 }),
  }),
  courtJester: def({
    id: "courtJester",
    name: "Court Jester",
    desc: "The first shop reroll is free.",
    emoji: "🃏",
    rarity: "common",
    cost: 4,
    freeRerolls: 1,
  }),
  minimalist: def({
    id: "minimalist",
    name: "Minimalist",
    desc: "×1.5 Mult while your bag holds 8 or fewer pieces.",
    emoji: "🕊️",
    rarity: "common",
    cost: 5,
    onScore: (c) => (c.bagSize <= 8 ? { xmult: 1.5 } : null),
  }),
  bishopPair: def({
    id: "bishopPair",
    name: "Bishop Pair",
    desc: "×2 Mult while your bag holds 2+ bishops.",
    emoji: "⛪",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.bag.filter((p) => p.type === "B").length >= 2 ? { xmult: 2 } : null),
  }),
  glassQueen: def({
    id: "glassQueen",
    name: "Glass Queen",
    desc: "×3 Mult when the queen scores. 1-in-4 chance she shatters.",
    emoji: "👑",
    rarity: "rare",
    cost: 8,
    onScore: (c) => (c.moverType === "Q" ? { xmult: 3 } : null),
    shatter: { chance: GLASS_QUEEN_SHATTER_CHANCE, applies: (c) => c.moverType === "Q" },
  }),
  darkRitual: def({
    id: "darkRitual",
    name: "Dark Ritual",
    desc: "+3 Mult on dark-square destinations.",
    emoji: "🌑",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.isDarkDest ? { mult: 3 } : null),
  }),
  centerStage: def({
    id: "centerStage",
    name: "Center Stage",
    desc: "+30 Chips when landing on the center square.",
    emoji: "🎯",
    rarity: "common",
    cost: 3,
    onScore: (c) => (c.isCenterDest ? { chips: 30 } : null),
  }),
  fianchetto: def({
    id: "fianchetto",
    name: "Fianchetto",
    desc: "×1.5 Mult on corner destinations.",
    emoji: "📐",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.isCornerDest ? { xmult: 1.5 } : null),
  }),
  comboChain: def({
    id: "comboChain",
    name: "Combo Chain",
    desc: "+2 Mult per consecutive capture this blind.",
    emoji: "⛓️",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.chain > 0 ? { mult: 2 * c.chain } : null),
  }),
  forkLord: def({
    id: "forkLord",
    name: "Fork Lord",
    desc: "+5 Mult if the moved piece attacks 2+ bounties after landing.",
    emoji: "🍴",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.attackedBountyCount >= 2 ? { mult: 5 } : null),
  }),
  tally: def({
    id: "tally",
    name: "Tally",
    desc: "+1 Mult per 2 captures made this run.",
    emoji: "🧮",
    rarity: "uncommon",
    cost: 6,
    onScore: (c, s) => ({
      mult: Math.floor(s / 2),
      setState: c.captured ? s + 1 : s,
    }),
    stateLabel: (s) => `${s} caps`,
  }),
  commuter: def({
    id: "commuter",
    name: "Commuter",
    desc: "+1 Mult per consecutive non-queen scoring move. Queens reset it.",
    emoji: "🚲",
    rarity: "uncommon",
    cost: 6,
    onScore: (c, s) =>
      c.moverType === "Q" ? { setState: 0 } : { mult: s + 1, setState: s + 1 },
    stateLabel: (s) => `+${s}`,
  }),
  gambit: def({
    id: "gambit",
    name: "Gambit",
    desc: "×2 Mult on the first capture of each blind.",
    emoji: "🗡️",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.captured && c.capturesThisBlind === 0 ? { xmult: 2 } : null),
  }),
  reserves: def({
    id: "reserves",
    name: "Reserves",
    desc: "+2 swaps every blind.",
    emoji: "🔄",
    rarity: "uncommon",
    cost: 6,
    mods: (m) => ({ ...m, swapsPerBlind: m.swapsPerBlind + 2 }),
  }),
  nightrider: def({
    id: "nightrider",
    name: "Nightrider",
    desc: "Knights never exhaust; they may move again and again.",
    emoji: "🌙",
    rarity: "uncommon",
    cost: 7,
    mods: (m) => ({ ...m, exhaustionExempt: [...m.exhaustionExempt, "N"] }),
  }),
  herald: def({
    id: "herald",
    name: "Herald",
    desc: "Pawn and knight moves score twice.",
    emoji: "📯",
    rarity: "uncommon",
    cost: 7,
    retrigger: (c) => c.moverType === "P" || c.moverType === "N",
  }),
  royalTax: def({
    id: "royalTax",
    name: "Royal Tax",
    desc: "Earn $1 for every capture.",
    emoji: "💰",
    rarity: "common",
    cost: 3,
    onScore: (c) => (c.captured ? { money: 1 } : null),
  }),
  promotionFever: def({
    id: "promotionFever",
    name: "Promotion Fever",
    desc: "Promotions retrigger the move's score.",
    emoji: "🎉",
    rarity: "rare",
    cost: 8,
    retrigger: (c) => c.promoted,
  }),
  overtime: def({
    id: "overtime",
    name: "Overtime",
    desc: "+1 move every blind.",
    emoji: "⏳",
    rarity: "rare",
    cost: 9,
    mods: (m) => ({ ...m, movesPerBlind: m.movesPerBlind + 1 }),
  }),
  midasTouch: def({
    id: "midasTouch",
    name: "Midas Touch",
    desc: "×2 Mult when landing on the gold square.",
    emoji: "🤴",
    rarity: "rare",
    cost: 9,
    onScore: (c) => (c.isGoldDest ? { xmult: 2 } : null),
  }),
  moonshot: def({
    id: "moonshot",
    name: "Moonshot",
    desc: "Interest pays $1 per $4 held, capped at $10.",
    emoji: "🌕",
    rarity: "rare",
    cost: 8,
    interestPer: 4,
    interestCapBonus: 5,
  }),
  perpetualMotion: def({
    id: "perpetualMotion",
    name: "Perpetual Motion",
    desc: "Queens never exhaust; they may move again and again.",
    emoji: "♾️",
    rarity: "rare",
    cost: 10,
    mods: (m) => ({ ...m, exhaustionExempt: [...m.exhaustionExempt, "Q"] }),
  }),

  // ---- wave-1 commons ----
  oldGuard: def({
    id: "oldGuard",
    name: "Old Guard",
    desc: "+3 Mult.",
    emoji: "🎖️",
    rarity: "common",
    cost: 3,
    onScore: () => ({ mult: 3 }),
  }),
  looseCannon: def({
    id: "looseCannon",
    name: "Loose Cannon",
    desc: "+0 to +15 Mult, differently every move.",
    emoji: "💣",
    rarity: "common",
    cost: 4,
    onScore: (c) => ({ mult: (c.from * 31 + c.to * 17 + c.moveIndex * 7) % 16 }),
  }),
  lightStep: def({
    id: "lightStep",
    name: "Light Step",
    desc: "+2 Mult on light-square destinations.",
    emoji: "🌕",
    rarity: "common",
    cost: 4,
    onScore: (c) => (!c.isDarkDest ? { mult: 2 } : null),
  }),
  creep: def({
    id: "creep",
    name: "Creep",
    desc: "+12 Chips on single-square moves.",
    emoji: "🐌",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.slideDist === 1 ? { chips: 12 } : null),
  }),
  longMarch: def({
    id: "longMarch",
    name: "Long March",
    desc: "+5 Chips per square traveled.",
    emoji: "🥾",
    rarity: "common",
    cost: 4,
    onScore: (c) => ({ chips: 5 * c.slideDist }),
  }),
  zigzag: def({
    id: "zigzag",
    name: "Zigzag",
    desc: "+4 Mult on diagonal moves.",
    emoji: "⚡",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.isDiagonal ? { mult: 4 } : null),
  }),
  straightedge: def({
    id: "straightedge",
    name: "Straightedge",
    desc: "+4 Mult on straight-line moves.",
    emoji: "📏",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.isOrthogonal ? { mult: 4 } : null),
  }),
  deepStrike: def({
    id: "deepStrike",
    name: "Deep Strike",
    desc: "+25 Chips landing on the far two ranks.",
    emoji: "🗡️",
    rarity: "common",
    cost: 4,
    onScore: (c) => (Math.floor(c.to / 5) >= 3 ? { chips: 25 } : null),
  }),
  smallGame: def({
    id: "smallGame",
    name: "Small Game",
    desc: "+5 Mult when capturing a pawn bounty.",
    emoji: "🐁",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.captured === "P" ? { mult: 5 } : null),
  }),
  poacher: def({
    id: "poacher",
    name: "Poacher",
    desc: "Captures earn +3 Chips per bounty still on the board.",
    emoji: "🪤",
    rarity: "common",
    cost: 4,
    onScore: (c) => (c.captured ? { chips: 3 * c.bountiesOnBoard } : null),
  }),
  tollRoads: def({
    id: "tollRoads",
    name: "Toll Roads",
    desc: "Earn $1 on every quiet move.",
    emoji: "🛣️",
    rarity: "common",
    cost: 5,
    onScore: (c) => (c.captured === null ? { money: 1 } : null),
  }),
  courtFavor: def({
    id: "courtFavor",
    name: "Court Favor",
    desc: "+2 Mult per Joker you own.",
    emoji: "🎭",
    rarity: "common",
    cost: 4,
    onScore: (c) => ({ mult: 2 * c.jokerCount }),
  }),
  sugarLoaf: def({
    id: "sugarLoaf",
    name: "Sugar Loaf",
    desc: "+14 Mult. 1-in-5 chance it melts after each blind.",
    emoji: "🍚",
    rarity: "uncommon",
    cost: 6,
    onScore: () => ({ mult: 14 }),
    onBlindEnd: (_s, roll) => (roll < 1 / 5 ? { destroy: true } : null),
  }),
  clockworkMouse: def({
    id: "clockworkMouse",
    name: "Clockwork Mouse",
    desc: "+80 Chips, winding down 10 per blind.",
    emoji: "🐭",
    rarity: "common",
    cost: 5,
    onScore: (_c, s) => {
      const chips = Math.max(0, 80 - 10 * s);
      return chips > 0 ? { chips } : null;
    },
    onBlindEnd: (s) => ({ setState: s + 1 }),
    stateLabel: (s) => `${Math.max(0, 80 - 10 * s)}`,
  }),
  nestEgg: def({
    id: "nestEgg",
    name: "Nest Egg",
    desc: "Does nothing. Gains $2 of sell value every blind.",
    emoji: "🥚",
    rarity: "common",
    cost: 4,
    onBlindEnd: (s) => ({ setState: s + 2 }),
    sellBonus: (s) => s,
    stateLabel: (s) => `$${2 + s}`,
  }),

  // ---- wave-1 uncommons ----
  pawnChorus: def({
    id: "pawnChorus",
    name: "Pawn Chorus",
    desc: "×1.5 Mult when a pawn scores.",
    emoji: "🎶",
    rarity: "uncommon",
    cost: 7,
    onScore: (c) => (c.moverType === "P" ? { xmult: 1.5 } : null),
  }),
  siegeEngine: def({
    id: "siegeEngine",
    name: "Siege Engine",
    desc: "+40 Chips when a rook captures.",
    emoji: "🏰",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.moverType === "R" && c.captured ? { chips: 40 } : null),
  }),
  sprinter: def({
    id: "sprinter",
    name: "Sprinter",
    desc: "×1.5 Mult on moves of 3+ squares.",
    emoji: "🏃",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.slideDist >= 3 ? { xmult: 1.5 } : null),
  }),
  repeater: def({
    id: "repeater",
    name: "Repeater",
    desc: "×1.5 Mult when a move repeats the previous kind (quiet or capture).",
    emoji: "🔁",
    rarity: "uncommon",
    cost: 6,
    onScore: (c, s) => {
      const kind = c.captured ? 2 : 1;
      return s === kind ? { xmult: 1.5, setState: kind } : { setState: kind };
    },
  }),
  headhunter: def({
    id: "headhunter",
    name: "Headhunter",
    desc: "×3 Mult when capturing a Queen bounty.",
    emoji: "🎯",
    rarity: "uncommon",
    cost: 7,
    onScore: (c) => (c.captured === "Q" ? { xmult: 3 } : null),
  }),
  menagerie: def({
    id: "menagerie",
    name: "Menagerie",
    desc: "+1 Mult per distinct piece type that has scored this blind.",
    emoji: "🎪",
    rarity: "uncommon",
    cost: 6,
    onScore: (c, s) => {
      const bit = { P: 1, N: 2, B: 4, R: 8, Q: 16 }[c.moverType];
      const mask = s | bit;
      let count = 0;
      for (let m = mask; m > 0; m >>= 1) count += m & 1;
      return { mult: count, setState: mask };
    },
    onBlindEnd: () => ({ setState: 0 }),
  }),
  centrist: def({
    id: "centrist",
    name: "Centrist",
    desc: "×1.5 Mult landing anywhere in the middle nine squares.",
    emoji: "🧭",
    rarity: "uncommon",
    cost: 7,
    onScore: (c) => {
      const f = c.to % 5;
      const r = Math.floor(c.to / 5);
      return f >= 1 && f <= 3 && r >= 1 && r <= 3 ? { xmult: 1.5 } : null;
    },
  }),
  veteran: def({
    id: "veteran",
    name: "Veteran",
    desc: "Gains +1 Mult for every blind cleared.",
    emoji: "🧓",
    rarity: "uncommon",
    cost: 6,
    onScore: (_c, s) => (s > 0 ? { mult: s } : null),
    onBlindEnd: (s) => ({ setState: s + 1 }),
    stateLabel: (s) => `+${s}`,
  }),
  pilgrim: def({
    id: "pilgrim",
    name: "Pilgrim",
    desc: "Gains +2 Chips for every move ever made.",
    emoji: "🚶",
    rarity: "uncommon",
    cost: 6,
    onScore: (_c, s) => ({ chips: 2 * s, setState: s + 1 }),
    stateLabel: (s) => `+${2 * s}`,
  }),
  bountyLedger: def({
    id: "bountyLedger",
    name: "Bounty Ledger",
    desc: "Gains ×0.1 Mult per Rook or Queen bounty ever captured.",
    emoji: "📒",
    rarity: "uncommon",
    cost: 7,
    onScore: (c, s) => {
      const grows = c.captured === "R" || c.captured === "Q";
      const x = 1 + s / 10;
      return {
        ...(x > 1 ? { xmult: x } : {}),
        ...(grows ? { setState: s + 1 } : {}),
      };
    },
    stateLabel: (s) => `×${(1 + s / 10).toFixed(1)}`,
  }),
  sculptor: def({
    id: "sculptor",
    name: "Sculptor",
    desc: "+2 Mult per piece banished this run.",
    emoji: "🗿",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.removals > 0 ? { mult: 2 * c.removals } : null),
  }),
  lookingGlassMilk: def({
    id: "lookingGlassMilk",
    name: "Looking-Glass Milk",
    desc: "×2 Mult, souring ×0.05 per swap used this blind.",
    emoji: "🥛",
    rarity: "uncommon",
    cost: 7,
    onScore: (c) => {
      const used = c.mods.swapsPerBlind - c.swapsLeft;
      const x = Math.max(1, 2 - 0.05 * used);
      return x > 1 ? { xmult: x } : null;
    },
  }),
  warchest: def({
    id: "warchest",
    name: "Warchest",
    desc: "+1 Mult per $4 held.",
    emoji: "🧰",
    rarity: "uncommon",
    cost: 7,
    onScore: (c) => {
      const mult = Math.floor(c.money / 4);
      return mult > 0 ? { mult } : null;
    },
  }),
  benchCoach: def({
    id: "benchCoach",
    name: "Bench Coach",
    desc: "+1 Mult per unused swap.",
    emoji: "📣",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.swapsLeft > 0 ? { mult: c.swapsLeft } : null),
  }),
  coronationFund: def({
    id: "coronationFund",
    name: "Coronation Fund",
    desc: "Promotions pay $5.",
    emoji: "💒",
    rarity: "uncommon",
    cost: 6,
    onScore: (c) => (c.promoted ? { money: 5 } : null),
  }),
  monoculture: def({
    id: "monoculture",
    name: "Monoculture",
    desc: "×2 Mult while your bag holds 6+ pawns.",
    emoji: "🌾",
    rarity: "uncommon",
    cost: 7,
    onScore: (c) =>
      c.bag.filter((p) => p.type === "P").length >= 6 ? { xmult: 2 } : null,
  }),
  emptyCourt: def({
    id: "emptyCourt",
    name: "Empty Court",
    desc: "×1 Mult for each empty Joker slot.",
    emoji: "🪑",
    rarity: "uncommon",
    cost: 7,
    onScore: (c) => (c.emptySlots > 1 ? { xmult: c.emptySlots } : null),
  }),

  // ---- wave-1 rares ----
  knightsVow: def({
    id: "knightsVow",
    name: "Knight's Vow",
    desc: "×2 Mult when a knight captures.",
    emoji: "🛡️",
    rarity: "rare",
    cost: 8,
    onScore: (c) =>
      c.moverType === "N" && c.captured && !c.mods.knightsScoreNothing
        ? { xmult: 2 }
        : null,
  }),
  cloister: def({
    id: "cloister",
    name: "Cloister",
    desc: "×2 Mult when a bishop scores.",
    emoji: "⛩️",
    rarity: "rare",
    cost: 8,
    onScore: (c) => (c.moverType === "B" ? { xmult: 2 } : null),
  }),
  chainGang: def({
    id: "chainGang",
    name: "Chain Gang",
    desc: "×1.5 Mult per consecutive capture this blind.",
    emoji: "⛓️",
    rarity: "rare",
    cost: 9,
    onScore: (c) => (c.chain > 0 ? { xmult: 1 + 0.5 * c.chain } : null),
  }),
  forkDynasty: def({
    id: "forkDynasty",
    name: "Fork Dynasty",
    desc: "×1 Mult more per bounty the mover attacks after landing (max ×5).",
    emoji: "🍴",
    rarity: "rare",
    cost: 9,
    onScore: (c) =>
      c.attackedBountyCount > 0
        ? { xmult: Math.min(5, 1 + c.attackedBountyCount) }
        : null,
  }),
  fourCorners: def({
    id: "fourCorners",
    name: "Four Corners",
    desc: "×2 Mult on corner destinations.",
    emoji: "🧩",
    rarity: "rare",
    cost: 8,
    onScore: (c) => (c.isCornerDest ? { xmult: 2 } : null),
  }),
  fullRotation: def({
    id: "fullRotation",
    name: "Full Rotation",
    desc: "×2 Mult on the blind's final move.",
    emoji: "🎡",
    rarity: "rare",
    cost: 8,
    onScore: (c) => (c.movesLeft === 1 ? { xmult: 2 } : null),
  }),
  dynasty: def({
    id: "dynasty",
    name: "Dynasty",
    desc: "Gains ×0.5 Mult permanently per promotion this run.",
    emoji: "🏛️",
    rarity: "rare",
    cost: 9,
    onScore: (c, s) => {
      const x = 1 + 0.5 * s;
      return {
        ...(x > 1 ? { xmult: x } : {}),
        ...(c.promoted ? { setState: s + 1 } : {}),
      };
    },
    stateLabel: (s) => `×${(1 + 0.5 * s).toFixed(1)}`,
  }),
  thinAir: def({
    id: "thinAir",
    name: "Thin Air",
    desc: "×2 Mult while your bag holds 7 or fewer pieces.",
    emoji: "🎈",
    rarity: "rare",
    cost: 9,
    onScore: (c) => (c.bagSize <= 7 ? { xmult: 2 } : null),
  }),
  heavyHand: def({
    id: "heavyHand",
    name: "Heavy Hand",
    desc: "+120 Chips. One fewer swap every blind.",
    emoji: "🥊",
    rarity: "rare",
    cost: 8,
    onScore: () => ({ chips: 120 }),
    mods: (m) => ({ ...m, swapsPerBlind: Math.max(0, m.swapsPerBlind - 1) }),
  }),

  // ---- wave-3 deep-hook rares ----
  insurance: def({
    id: "insurance",
    name: "Insurance",
    desc: "Survive one failed blind at 60%+ of the target, then breaks. No reward.",
    emoji: "🛟",
    rarity: "rare",
    cost: 8,
    // Consumed in playMove's loss branch — no scoring hooks.
  }),
  mirrorKnight: def({
    id: "mirrorKnight",
    name: "Mirror Knight",
    desc: "Copies the scoring ability of the Joker to its right.",
    emoji: "🪞",
    rarity: "rare",
    cost: 10,
    // Resolved inside the scoring loop.
  }),
  warhorse: def({
    id: "warhorse",
    name: "Warhorse",
    desc: "Gains ×0.25 Mult for every blind cleared using ALL its moves.",
    emoji: "🐎",
    rarity: "rare",
    cost: 9,
    onScore: (_c, s) => (s > 0 ? { xmult: 1 + 0.25 * s } : null),
    onBlindEnd: (s, _r, end) => (end && end.movesLeft === 0 ? { setState: s + 1 } : null),
    stateLabel: (s) => `×${(1 + 0.25 * s).toFixed(2)}`,
  }),

  // ---- legendaries (summoned only by the Invitation charm) ----
  redKing: def({
    id: "redKing",
    name: "The Red King, Dreaming",
    desc: "×2 Mult on dark squares, ×0.5 on light. You are in his dream.",
    emoji: "🛌",
    rarity: "legendary",
    cost: 12,
    onScore: (c) => ({ xmult: c.isDarkDest ? 2 : 0.5 }),
  }),
  bandersnatch: def({
    id: "bandersnatch",
    name: "The Bandersnatch",
    desc: "Gains ×0.5 Mult for every boss blind slain.",
    emoji: "🐉",
    rarity: "legendary",
    cost: 12,
    onScore: (_c, s) => (s > 0 ? { xmult: 1 + 0.5 * s } : null),
    onBlindEnd: (s, _r, end) => (end && end.kind === "boss" ? { setState: s + 1 } : null),
    stateLabel: (s) => `×${(1 + 0.5 * s).toFixed(1)}`,
  }),
};

export const JOKER_IDS = Object.keys(JOKERS) as JokerId[];
