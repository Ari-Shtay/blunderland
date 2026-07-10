// Pure, serializable game state types. No DOM, no classes.

export type PieceType = "P" | "N" | "B" | "R" | "Q";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export type OpeningId =
  | "classical"
  | "kingsGambit"
  | "queensGambit"
  | "pawnStorm"
  | "blitz"
  | "fianchetto"
  | "lookingGlass";

/** The six move patterns — Blunderland's "poker hands", leveled by Studies. */
export type MovePattern = "quiet" | "capture" | "chain" | "fork" | "slide" | "promotion";

export type CharmId =
  | "invitation"
  | "secondBreakfast"
  | "tempest"
  | "royalWrit"
  | "echo"
  | "extraHour"
  | "windfall"
  | "pressGang"
  | "transmutation"
  | "silverPolish"
  | "cullingWrit"
  | "studyQuiet"
  | "studyCapture"
  | "studyChain"
  | "studyFork"
  | "studySlide"
  | "studyPromotion";

export type Enhancement = "heavy" | "gilded" | "volatile";

/** Second piece-modifier layer — stacks WITH an enhancement. */
export type Engraving = "foiled" | "etched" | "prismatic" | "phantom";

/** Permanent run upgrades sold in boss-blind shops (the Knight's inventions). */
export type PatentId =
  | "beehiveSaddle"
  | "upsideDownBox"
  | "fifthLeg"
  | "blottingPudding"
  | "mouseTrap"
  | "interestLedger"
  | "ironStirrups"
  | "spareReins";

/** Wanted Poster tags earned by skipping a small/big blind. */
export type PosterId = "coupon" | "doubleBounty" | "charmCache" | "patentTip" | "bountyRush";

/** A piece owned by the player, living in the bag across the whole run. */
export interface BagPiece {
  id: number;
  type: PieceType;
  enhancement?: Enhancement;
  engraving?: Engraving;
}

/** Square index 0..24; index = rank * 5 + file. a1 = 0, e1 = 4, a5 = 20. */
export type Square = number;

export type Cell =
  | { kind: "own"; pieceId: number }
  | { kind: "bounty"; type: PieceType };

export interface Move {
  from: Square;
  to: Square;
}

export type BlindKind = "small" | "big" | "boss";

export interface BlindState {
  kind: BlindKind;
  target: number;
  score: number;
  movesLeft: number;
  swapsLeft: number;
  /** board[square] — null is empty. Squares outside boss-shrunk bounds stay null. */
  board: (Cell | null)[];
  /** Bag piece ids not yet dealt this blind, in draw order. */
  queue: number[];
  /** Bonus square rotating per blind. */
  goldSq: Square;
  /** Consecutive captures so far this blind (for chain jokers). */
  chain: number;
  /** Total captures so far this blind. */
  captures: number;
  /** Bag piece ids that already moved this blind — they cannot move again. */
  exhausted: number[];
  /** Echo charm armed: the next move scores twice. */
  echo: boolean;
  /** The Wanted Poster on offer if this blind is skipped (small/big only). */
  poster?: PosterId;
  /** Bounty chips are scaled by this (grows with ante). */
  bountyScale: number;
}

export type JokerId =
  // commons
  | "cavalry"
  | "towerToll"
  | "longDiagonal"
  | "footSoldier"
  | "pawnStorm"
  | "darkRitual"
  | "edgeLord"
  | "centerStage"
  | "openingBook"
  | "quietStrength"
  | "royalTax"
  | "pawnbroker"
  | "goldRush"
  | "dividend"
  | "courtJester"
  | "minimalist"
  // uncommons
  | "bishopPair"
  | "fianchetto"
  | "comboChain"
  | "forkLord"
  | "tally"
  | "commuter"
  | "gambit"
  | "reserves"
  | "nightrider"
  | "herald"
  // wave-1 commons
  | "oldGuard"
  | "looseCannon"
  | "lightStep"
  | "creep"
  | "longMarch"
  | "zigzag"
  | "straightedge"
  | "deepStrike"
  | "smallGame"
  | "poacher"
  | "tollRoads"
  | "courtFavor"
  | "sugarLoaf"
  | "clockworkMouse"
  | "nestEgg"
  // wave-1 uncommons
  | "pawnChorus"
  | "siegeEngine"
  | "sprinter"
  | "repeater"
  | "headhunter"
  | "menagerie"
  | "centrist"
  | "veteran"
  | "pilgrim"
  | "bountyLedger"
  | "sculptor"
  | "lookingGlassMilk"
  | "warchest"
  | "benchCoach"
  | "coronationFund"
  | "monoculture"
  | "emptyCourt"
  // rares
  | "glassQueen"
  | "promotionFever"
  | "overtime"
  | "midasTouch"
  | "moonshot"
  | "perpetualMotion"
  // wave-3
  | "insurance"
  | "mirrorKnight"
  | "warhorse"
  | "redKing"
  | "bandersnatch"
  // wave-1 rares
  | "knightsVow"
  | "cloister"
  | "chainGang"
  | "forkDynasty"
  | "fourCorners"
  | "fullRotation"
  | "dynasty"
  | "thinAir"
  | "heavyHand";

export type BossId =
  | "wall"
  | "antiCavalry"
  | "suddenDeath"
  | "royalDecree"
  | "tollbooth"
  | "pacifist"
  | "blackout";

/** An owned joker. `state` is a per-instance counter for scaling jokers. */
export interface JokerInstance {
  id: JokerId;
  state?: number;
}

export interface ShopJokerOffer {
  joker: JokerId;
  cost: number;
  sold: boolean;
}

export interface ShopState {
  payout: { reward: number; unused: number; interest: number; jokers: number };
  jokers: ShopJokerOffer[];
  /** Pick one of three pieces to add to the bag. */
  pack: { choices: PieceType[]; cost: number; sold: boolean };
  enhancement: { kind: Enhancement | Engraving; cost: number; sold: boolean };
  /** One single-use charm offered per shop. */
  charm: { id: CharmId; cost: number; sold: boolean };
  /** A patent offer — present only in boss-blind shops. */
  patent?: { id: PatentId; cost: number; sold: boolean };
  /** Coupon poster: the next purchase in this shop is free. */
  couponActive?: boolean;
  rerollCost: number;
  removeCost: number;
  /** Free rerolls remaining in this shop (from jokers). */
  freeRerollsLeft: number;
}

export type Phase =
  | { name: "blindIntro" }
  | { name: "playing" }
  | { name: "shop"; shop: ShopState }
  | { name: "won" }
  | { name: "lost" };

export interface RunState {
  seed: number;
  /** mulberry32 state — advances with every random draw; serializable. */
  rng: number;
  ante: number; // 1..8
  blindIdx: number; // 0 small, 1 big, 2 boss
  phase: Phase;
  bag: BagPiece[];
  nextPieceId: number;
  money: number;
  jokers: JokerInstance[];
  /** Single-use charms held (max CHARM_SLOTS). */
  charms: CharmId[];
  /** Move-pattern levels (Studies) — permanent chips+mult on matching moves. */
  studies: Record<MovePattern, number>;
  /** Pieces banished this run — each one raises the next banish's price. */
  removals: number;
  /** Permanent patents bought in boss shops. */
  patents: PatentId[];
  /** Poster tags waiting to fire (coupon, double bounty, bounty rush...). */
  pendingPosters: PosterId[];
  /** Set when the player rides past the ante-8 win into the Endless Night. */
  endless?: boolean;
  /** The run's Opening (starting loadout / rule twist). */
  openingId: OpeningId;
  /** Trial tier 0-6, cumulative handicaps. */
  trial: number;
  /** Boss for each ante, rolled at run start (previewed in advance). */
  bosses: BossId[];
  blind: BlindState | null;
  stats: { moves: number; captures: number; bestMove: number; promotions: number };
}

/** One step of a move's score resolution, replayed by the UI as juice. */
export type ScoreEvent =
  | { kind: "chips"; amount: number; source: string; sq?: Square }
  | { kind: "mult"; amount: number; source: string }
  | { kind: "xmult"; amount: number; source: string }
  | { kind: "money"; amount: number; source: string }
  | { kind: "retrigger"; source: string }
  | { kind: "shatter"; pieceId: number; source: string }
  | { kind: "exhaust"; sq: Square; pieceId: number }
  | { kind: "promote"; sq: Square; source: string }
  | { kind: "total"; amount: number; chips: number; mult: number };

/** Boss and joker rule modifiers consulted by movegen/scoring/dealing. */
export interface Modifiers {
  boardSize: number;
  movesPerBlind: number;
  swapsPerBlind: number;
  /** Blind targets are multiplied by this (openings/trials). */
  targetScale: number;
  /** Pieces dealt to the board per blind. */
  dealCount: number;
  /** Fraction of base chips a quiet move earns. */
  quietFactor: number;
  /** Looking-Glass: score = ((chips+mult)/2)² instead of chips×mult. */
  averageChipsMult: boolean;
  /** Piece types that ignore exhaustion (may move repeatedly). */
  exhaustionExempt: PieceType[];
  darkBountiesWorthless: boolean;
  knightsScoreNothing: boolean;
  /** Royal Decree: queens go to the queue instead of the board. */
  queensNotDealt: boolean;
  /** Tollbooth: money lost per capture (clamped at $0). */
  captureTax: number;
  /** Pacifist: the blind's first move may not capture. */
  firstMoveQuiet: boolean;
  /** Blackout: no gold square this blind. */
  noGoldSquare: boolean;
}
