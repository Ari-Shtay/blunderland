// The chips × mult pipeline. Pure: takes state + a validated move, returns
// the score, an ordered ScoreEvent script for the UI, and RNG/bag side effects.

import {
  BASE_CHIPS,
  CAPTURE_CHIPS,
  CENTER_SQ_CHIPS,
  ENGRAVING_CHIPS,
  ENGRAVING_MULT,
  ENGRAVING_XMULT,
  GILDED_MONEY,
  GOLD_SQ_CHIPS,
  HEAVY_CHIP_X,
  JOKER_SLOTS,
  STUDY_BONUS,
  VOLATILE_MULT_X,
  VOLATILE_SHATTER_CHANCE,
} from "./constants";
import { attackedBounties, fileOf, isDark, rankOf, squareAt } from "./movegen";
import { PATTERN_LABEL } from "./charms";
import { JOKERS, type ScoreCtx } from "./jokers";
import type {
  BagPiece,
  BlindState,
  Cell,
  JokerInstance,
  Modifiers,
  PieceType,
  ScoreEvent,
  Square,
} from "./types";
import { next } from "./rng";

export interface ScoreResult {
  total: number;
  events: ScoreEvent[];
  moneyDelta: number;
  /** Bag piece ids destroyed by shatter effects. */
  shattered: number[];
  /** Post-move counter per joker instance, aligned with the input array. */
  jokerStates: number[];
  rng: number;
}

export interface ScoredMoveInput {
  /** Board AFTER the move (mover at `to`, capture removed). */
  board: (Cell | null)[];
  bag: BagPiece[];
  blind: BlindState;
  jokers: JokerInstance[];
  mover: BagPiece;
  moverType: PieceType; // post-promotion type
  from: Square;
  to: Square;
  captured: PieceType | null;
  chainAfter: number;
  promoted: boolean;
  money: number;
  removals: number;
  /** Move-pattern levels from Studies. */
  studies: Record<import("./types").MovePattern, number>;
  /** Echo charm: this move scores twice. */
  echo: boolean;
  /** Total joker slots (patents can raise it). */
  jokerSlots?: number;
  mods: Modifiers;
  rng: number;
}

/** The full per-move context jokers inspect — exported so the sim's policy
 *  bot can replay joker hooks over recorded moves. */
export function buildScoreCtx(input: ScoredMoveInput): ScoreCtx {
  const { board, bag, blind, jokers, mover, moverType, from, to, captured, mods } = input;
  const center = squareAt(Math.floor(mods.boardSize / 2), Math.floor(mods.boardSize / 2));
  const slideDist = Math.max(
    Math.abs(fileOf(to) - fileOf(from)),
    Math.abs(rankOf(to) - rankOf(from)),
  );
  return {
    board,
    bag,
    mover,
    moverType,
    from,
    to,
    captured,
    chain: input.chainAfter,
    promoted: input.promoted,
    isDarkDest: isDark(to),
    isCornerDest:
      (fileOf(to) === 0 || fileOf(to) === mods.boardSize - 1) &&
      (rankOf(to) === 0 || rankOf(to) === mods.boardSize - 1),
    isCenterDest: to === center,
    isGoldDest: to === blind.goldSq,
    slideDist,
    isDiagonal:
      Math.abs(fileOf(to) - fileOf(from)) === Math.abs(rankOf(to) - rankOf(from)) &&
      fileOf(to) !== fileOf(from),
    isOrthogonal: (fileOf(to) === fileOf(from)) !== (rankOf(to) === rankOf(from)),
    moveIndex: mods.movesPerBlind - blind.movesLeft,
    movesLeft: blind.movesLeft,
    swapsLeft: blind.swapsLeft,
    capturesThisBlind: blind.captures,
    bountiesOnBoard: board.filter((c) => c?.kind === "bounty").length,
    attackedBountyCount: attackedBounties(board, to, moverType, mods).length,
    money: input.money,
    removals: input.removals,
    jokerCount: jokers.length,
    emptySlots: Math.max(0, (input.jokerSlots ?? JOKER_SLOTS) - jokers.length),
    bagSize: bag.filter((p) => p.engraving !== "phantom").length,
    blindKind: blind.kind,
    mods,
  };
}

export function scoreMove(input: ScoredMoveInput): ScoreResult {
  const { board, blind, jokers, mover, moverType, from, to, captured, mods } = input;
  const events: ScoreEvent[] = [];
  let rng = input.rng;
  let chips = 0;
  let mult = 1;
  let moneyDelta = 0;
  const shattered: number[] = [];

  const knightMuted = moverType === "N" && mods.knightsScoreNothing;
  const slideDist = Math.max(
    Math.abs(fileOf(to) - fileOf(from)),
    Math.abs(rankOf(to) - rankOf(from)),
  );
  const attacked = attackedBounties(board, to, moverType, mods).length;

  // 1. Base chips for the moving piece (quiet moves earn a fraction).
  const base = knightMuted
    ? 0
    : Math.round(BASE_CHIPS[moverType] * (captured ? 1 : mods.quietFactor));
  events.push({ kind: "chips", amount: base, source: knightMuted ? "Anti-Cavalry" : moverType, sq: to });
  chips += base;

  // 2. Capture chips, scaled by ante, possibly voided by The Wall.
  if (captured) {
    const voided = mods.darkBountiesWorthless && isDark(to);
    const amount = voided || knightMuted ? 0 : Math.round(CAPTURE_CHIPS[captured] * blind.bountyScale);
    events.push({
      kind: "chips",
      amount,
      source: voided ? "The Wall" : `capture ${captured}`,
      sq: to,
    });
    chips += amount;
  }

  // 3. Square bonuses (a muted knight earns nothing anywhere).
  const center = squareAt(Math.floor(mods.boardSize / 2), Math.floor(mods.boardSize / 2));
  if (to === center && !knightMuted) {
    events.push({ kind: "chips", amount: CENTER_SQ_CHIPS, source: "center", sq: to });
    chips += CENTER_SQ_CHIPS;
  }
  if (to === blind.goldSq && !knightMuted) {
    events.push({ kind: "chips", amount: GOLD_SQ_CHIPS, source: "gold square", sq: to });
    chips += GOLD_SQ_CHIPS;
  }

  // 3.5 Studies — leveled move patterns add base-layer chips and mult.
  if (!knightMuted) {
    const matches: [import("./types").MovePattern, boolean][] = [
      ["quiet", captured === null],
      ["capture", captured !== null],
      ["chain", input.chainAfter >= 2],
      ["fork", attacked >= 2],
      ["slide", slideDist >= 3],
      ["promotion", input.promoted],
    ];
    for (const [pattern, hit] of matches) {
      const lvl = input.studies[pattern];
      if (!hit || lvl <= 0) continue;
      const bonus = STUDY_BONUS[pattern];
      const source = `${PATTERN_LABEL[pattern]} study`;
      events.push({ kind: "chips", amount: bonus.chips * lvl, source });
      chips += bonus.chips * lvl;
      events.push({ kind: "mult", amount: bonus.mult * lvl, source });
      mult += bonus.mult * lvl;
    }
  }

  // 4. Enhancements on the mover.
  if (mover.enhancement === "heavy") {
    const bonus = Math.round(chips * (HEAVY_CHIP_X - 1));
    events.push({ kind: "chips", amount: bonus, source: "Heavy", sq: to });
    chips += bonus;
  }
  if (mover.enhancement === "gilded") {
    events.push({ kind: "money", amount: GILDED_MONEY, source: "Gilded" });
    moneyDelta += GILDED_MONEY;
  }
  if (mover.enhancement === "volatile") {
    events.push({ kind: "xmult", amount: VOLATILE_MULT_X, source: "Volatile" });
    mult *= VOLATILE_MULT_X;
  }

  // 4.5 Engravings — the second modifier layer, stacking with enhancements.
  if (mover.engraving === "foiled" && !knightMuted) {
    events.push({ kind: "chips", amount: ENGRAVING_CHIPS, source: "Foiled" });
    chips += ENGRAVING_CHIPS;
  }
  if (mover.engraving === "etched" && !knightMuted) {
    events.push({ kind: "mult", amount: ENGRAVING_MULT, source: "Etched" });
    mult += ENGRAVING_MULT;
  }
  if (mover.engraving === "prismatic" && !knightMuted) {
    events.push({ kind: "xmult", amount: ENGRAVING_XMULT, source: "Prismatic" });
    mult *= ENGRAVING_XMULT;
  }

  // 5. Jokers, in owned order.
  const ctx = buildScoreCtx(input);

  const jokerStates = jokers.map((j) => j.state ?? 0);
  jokers.forEach((inst, i) => {
    if (knightMuted) return; // Anti-Cavalry: knight moves trigger no jokers
    // Mirror Knight reflects the scoring ability (and state) of its neighbor.
    const mirrored = inst.id === "mirrorKnight" ? jokers[i + 1] : undefined;
    const jokerDef = mirrored ? JOKERS[mirrored.id] : JOKERS[inst.id];
    const c = jokerDef.onScore?.(ctx, mirrored ? (mirrored.state ?? 0) : jokerStates[i]);
    if (!c) return;
    if (c.chips) {
      events.push({ kind: "chips", amount: c.chips, source: jokerDef.name });
      chips += c.chips;
    }
    if (c.mult) {
      events.push({ kind: "mult", amount: c.mult, source: jokerDef.name });
      mult += c.mult;
    }
    if (c.xmult) {
      events.push({ kind: "xmult", amount: c.xmult, source: jokerDef.name });
      mult *= c.xmult;
    }
    if (c.money) {
      events.push({ kind: "money", amount: c.money, source: jokerDef.name });
      moneyDelta += c.money;
    }
    if (c.setState !== undefined && !mirrored) jokerStates[i] = c.setState;
  });

  let total = mods.averageChipsMult
    ? Math.round(((chips + mult) / 2) ** 2)
    : Math.round(chips * mult);

  // 6. Retriggers — the whole move scores again (stacks across jokers).
  if (!knightMuted) {
    for (const inst of jokers) {
      const jokerDef = JOKERS[inst.id];
      if (jokerDef.retrigger?.(ctx)) {
        events.push({ kind: "retrigger", source: jokerDef.name });
        total *= 2;
      }
    }
  }
  if (input.echo) {
    events.push({ kind: "retrigger", source: "Echo" });
    total *= 2;
  }

  // 7. Shatter rolls (after scoring — the piece still scored this move).
  if (mover.enhancement === "volatile") {
    let roll: number;
    [roll, rng] = next(rng);
    if (roll < VOLATILE_SHATTER_CHANCE) {
      events.push({ kind: "shatter", pieceId: mover.id, source: "Volatile" });
      shattered.push(mover.id);
    }
  }
  for (const inst of jokers) {
    const jokerDef = JOKERS[inst.id];
    if (!jokerDef.shatter || shattered.includes(mover.id)) continue;
    if (!jokerDef.shatter.applies(ctx)) continue;
    let roll: number;
    [roll, rng] = next(rng);
    if (roll < jokerDef.shatter.chance) {
      events.push({ kind: "shatter", pieceId: mover.id, source: jokerDef.name });
      shattered.push(mover.id);
    }
  }

  events.push({ kind: "total", amount: total, chips, mult });
  return { total, events, moneyDelta, shattered, jokerStates, rng };
}
