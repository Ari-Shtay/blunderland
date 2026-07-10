// Pure run reducer: every function takes a RunState and returns a new one.
// No Date.now(), no Math.random() — all randomness flows through state.rng.

import {
  ANTES,
  ANTE_TARGETS,
  CHARM_SLOTS,
  BLIND_MULT,
  BLIND_REWARD,
  BOUNTY_ANTE_SCALE,
  BOUNTY_COUNT,
  BOUNTY_WEIGHTS,
  ENGRAVINGS,
  ENGRAVING_SHOP_CHANCE,
  ENHANCEMENTS,
  ENHANCEMENT_COST,
  INTEREST_CAP,
  INTEREST_PER,
  JOKER_SLOTS,
  MIN_BAG_SIZE,
  PACK_COST,
  PIECE_PACK_WEIGHTS,
  PROMOTION_PIECE,
  RARITY_WEIGHTS,
  REMOVE_COST,
  REMOVE_INCREMENT,
  REROLL_COST,
  REROLL_INCREMENT,
  SQUARES,
  STARTING_BAG,
  STARTING_MONEY,
  UNUSED_MOVE_PAY,
} from "./constants";
import { BOSS_IDS, modifiersFor } from "./bosses";
import { CHARMS, CHARM_IDS, EMPTY_STUDIES } from "./charms";
import { OPENINGS } from "./openings";
import { PATENTS, PATENT_IDS } from "./patents";
import { POSTER_IDS } from "./posters";
import { legalMoves, rankOf, squareAt } from "./movegen";
import { JOKERS, JOKER_IDS } from "./jokers";
import { scoreMove } from "./scoring";
import { next, nextInt, pick, shuffle } from "./rng";
import type {
  BagPiece,
  BlindKind,
  BlindState,
  BossId,
  Cell,
  CharmId,
  Engraving,
  Enhancement,
  JokerId,
  JokerInstance,
  Modifiers,
  OpeningId,
  PieceType,
  PosterId,
  Rarity,
  RunState,
  ScoreEvent,
  ShopState,
  Square,
} from "./types";

const BLIND_KINDS: BlindKind[] = ["small", "big", "boss"];

function weighted<T>(rng: number, table: readonly [T, number][]): [T, number] {
  const totalWeight = table.reduce((sum, [, w]) => sum + w, 0);
  let [roll, s] = next(rng);
  roll *= totalWeight;
  for (const [value, w] of table) {
    roll -= w;
    if (roll < 0) return [value, s];
  }
  return [table[table.length - 1][0], s];
}

/** Total joker slots — the Upside-Down Box patent adds one. */
export function jokerSlots(run: RunState): number {
  return JOKER_SLOTS + (run.patents.includes("upsideDownBox") ? 1 : 0);
}

export function blindTarget(ante: number, kind: BlindKind, scale = 1): number {
  // Past ante 8 the Endless Night sets its own pace: x2.5 per ante, rounded
  // to two leading digits so the numbers stay readable.
  const base =
    ante <= ANTE_TARGETS.length
      ? ANTE_TARGETS[ante - 1]
      : roundTwoDigits(
          ANTE_TARGETS[ANTE_TARGETS.length - 1] *
            Math.pow(2.5, ante - ANTE_TARGETS.length),
        );
  return Math.round(base * BLIND_MULT[kind] * scale);
}

function roundTwoDigits(n: number): number {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  return Math.round(n / mag) * mag;
}

/** The reigning boss — Endless antes cycle the run's shuffled roster. */
export function bossFor(run: RunState): BossId {
  return run.bosses[(run.ante - 1) % run.bosses.length];
}

function deal(run: RunState): RunState {
  const mods = modifiersFor(run);
  const size = mods.boardSize;
  let rng = run.rng;

  let order: BagPiece[];
  [order, rng] = shuffle(rng, run.bag);
  if (mods.queensNotDealt) {
    // Royal Decree: queens sink to the back of the draw order (best effort).
    order = [...order.filter((p) => p.type !== "Q"), ...order.filter((p) => p.type === "Q")];
  }
  // Opening guarantee (Queen's Gambit): at least one of the promised type on
  // the board each blind — unless a boss rule (Royal Decree) forbids it.
  const promised = OPENINGS[run.openingId].guaranteeDealt;
  const dealCount = Math.min(mods.dealCount, order.length);
  if (
    promised &&
    !(promised === "Q" && mods.queensNotDealt) &&
    !order.slice(0, dealCount).some((p) => p.type === promised)
  ) {
    const idx = order.findIndex((p, i) => i >= dealCount && p.type === promised);
    if (idx >= 0) {
      const tmp = order[dealCount - 1];
      order[dealCount - 1] = order[idx];
      order[idx] = tmp;
    }
  }
  const dealt = order.slice(0, dealCount);
  const queue = order.slice(dealt.length).map((p) => p.id);

  const board: (Cell | null)[] = new Array(SQUARES).fill(null);

  const homeSquares: Square[] = [];
  const wildSquares: Square[] = [];
  for (let r = 0; r < size; r++) {
    for (let f = 0; f < size; f++) {
      (r < 2 ? homeSquares : wildSquares).push(squareAt(f, r));
    }
  }

  let ownSquares: Square[];
  [ownSquares, rng] = pick(rng, homeSquares, dealt.length);
  dealt.forEach((p, i) => (board[ownSquares[i]] = { kind: "own", pieceId: p.id }));

  const rush = run.pendingPosters.includes("bountyRush");
  const bountyGoal = BOUNTY_COUNT + (rush ? 3 : 0);
  let bountySquares: Square[];
  [bountySquares, rng] = pick(rng, wildSquares, Math.min(bountyGoal, wildSquares.length));
  for (const sq of bountySquares) {
    let type: PieceType;
    [type, rng] = weighted(rng, BOUNTY_WEIGHTS);
    board[sq] = { kind: "bounty", type };
  }

  let goldSq: Square = -1; // Blackout sentinel — matches no destination
  if (!mods.noGoldSquare) {
    const empty = [...homeSquares, ...wildSquares].filter((sq) => board[sq] === null);
    let goldPick: Square[];
    [goldPick, rng] = pick(rng, empty.length > 0 ? empty : wildSquares, 1);
    goldSq = goldPick[0];
  }

  const kind = BLIND_KINDS[run.blindIdx];
  let poster: PosterId | undefined;
  if (run.blindIdx < 2) {
    let idx: number;
    [idx, rng] = nextInt(rng, POSTER_IDS.length);
    poster = POSTER_IDS[idx];
  }
  const blind: BlindState = {
    kind,
    poster,
    target: blindTarget(run.ante, kind, mods.targetScale),
    score: 0,
    movesLeft: mods.movesPerBlind + (rush ? 1 : 0),
    swapsLeft: mods.swapsPerBlind,
    board,
    queue,
    goldSq,
    chain: 0,
    captures: 0,
    exhausted: [],
    echo: false,
    bountyScale: 1 + BOUNTY_ANTE_SCALE * (run.ante - 1),
  };
  return {
    ...run,
    rng,
    blind,
    pendingPosters: rush
      ? run.pendingPosters.filter((t) => t !== "bountyRush")
      : run.pendingPosters,
    phase: { name: "blindIntro" },
  };
}

export interface NewRunOpts {
  opening?: OpeningId;
  trial?: number;
  /** Sim-only: race a custom bag regardless of opening. */
  bagOverride?: PieceType[];
}

export function newRun(seed: number, opts: NewRunOpts = {}): RunState {
  const opening = OPENINGS[opts.opening ?? "classical"];
  let rng = seed >>> 0 || 1;
  const bagTypes = opts.bagOverride ?? opening.startingBag ?? STARTING_BAG;
  const bag: BagPiece[] = bagTypes.map((type, i) => ({ id: i + 1, type }));
  // Every boss appears once before any repeats; a repeat never lands
  // back-to-back (7 bosses stretch across 8 antes).
  let bossOrder: BossId[];
  [bossOrder, rng] = shuffle(rng, BOSS_IDS);
  const bosses: BossId[] = bossOrder.slice(0, Math.min(ANTES, bossOrder.length));
  while (bosses.length < ANTES) {
    let refill: BossId[];
    [refill, rng] = shuffle(rng, BOSS_IDS);
    for (const b of refill) {
      if (bosses.length >= ANTES) break;
      if (bosses[bosses.length - 1] !== b) bosses.push(b);
    }
  }
  const jokers: JokerInstance[] = [];
  if (opening.startingRareJoker) {
    const rares = JOKER_IDS.filter((id) => JOKERS[id].rarity === "rare");
    let idx: number;
    [idx, rng] = nextInt(rng, rares.length);
    jokers.push({ id: rares[idx] });
  }
  const run: RunState = {
    seed,
    rng,
    ante: 1,
    blindIdx: 0,
    phase: { name: "blindIntro" },
    bag,
    nextPieceId: bag.length + 1,
    money: opening.startingMoney ?? STARTING_MONEY,
    jokers,
    charms: [],
    studies: { ...EMPTY_STUDIES, ...opening.startingStudies },
    removals: 0,
    patents: [],
    pendingPosters: [],
    openingId: opening.id,
    trial: Math.max(0, Math.min(6, opts.trial ?? 0)),
    bosses,
    blind: null,
    stats: { moves: 0, captures: 0, bestMove: 0, promotions: 0 },
  };
  return deal(run);
}

export function startPlaying(run: RunState): RunState {
  if (run.phase.name !== "blindIntro") return run;
  return checkStuck({ ...run, phase: { name: "playing" } });
}

function isExhausted(run: RunState, piece: BagPiece, mods: Modifiers): boolean {
  return (
    run.blind!.exhausted.includes(piece.id) && !mods.exhaustionExempt.includes(piece.type)
  );
}

/** Destinations for a piece, with blind-rule filters (Pacifist) applied. */
function legalDestinations(
  run: RunState,
  piece: BagPiece,
  from: Square,
  mods: Modifiers,
): Square[] {
  const blind = run.blind!;
  let dests = legalMoves(blind.board, from, piece.type, mods);
  if (mods.firstMoveQuiet && blind.movesLeft === mods.movesPerBlind) {
    dests = dests.filter((sq) => blind.board[sq]?.kind !== "bounty");
  }
  return dests;
}

export function legalMovesFor(run: RunState, from: Square): Square[] {
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing") return [];
  const cell = blind.board[from];
  if (cell?.kind !== "own") return [];
  const piece = run.bag.find((p) => p.id === cell.pieceId);
  if (!piece) return [];
  const mods = modifiersFor(run);
  if (isExhausted(run, piece, mods)) return [];
  return legalDestinations(run, piece, from, mods);
}

function hasAnyLegalMove(run: RunState): boolean {
  const blind = run.blind!;
  const mods = modifiersFor(run);
  for (let sq = 0; sq < SQUARES; sq++) {
    const cell = blind.board[sq];
    if (cell?.kind !== "own") continue;
    const piece = run.bag.find((p) => p.id === cell.pieceId);
    if (!piece || isExhausted(run, piece, mods)) continue;
    if (legalDestinations(run, piece, sq, mods).length > 0) return true;
  }
  return false;
}

/** Is there anything in the queue a swap could draw? (Royal Decree skips queens.) */
function queueDrawable(run: RunState, mods: Modifiers): boolean {
  const blind = run.blind!;
  if (blind.queue.length === 0) return false;
  if (!mods.queensNotDealt) return true;
  return blind.queue.some((id) => run.bag.find((p) => p.id === id)?.type !== "Q");
}

/** Can the player usefully spend a swap right now? */
export function canSwap(run: RunState): boolean {
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing" || blind.swapsLeft <= 0) return false;
  return queueDrawable(run, modifiersFor(run));
}

/** The player is not stuck but cannot move — they must spend a swap. */
export function mustSwap(run: RunState): boolean {
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing" || blind.movesLeft <= 0) return false;
  return !hasAnyLegalMove(run) && canSwap(run);
}

/** Lose the blind when no legal move remains and swapping cannot fix it. */
function checkStuck(run: RunState): RunState {
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing" || blind.movesLeft <= 0) return run;
  if (hasAnyLegalMove(run)) return run;
  if (blind.swapsLeft > 0 && queueDrawable(run, modifiersFor(run))) return run;
  return { ...run, phase: { name: "lost" } };
}

/** Commons that pay Mult — the first market always shows one (the Knight's
 * Mult lesson must have a prop to point at). Piece-specific ones only count
 * when the bag actually fields that piece in numbers. */
const MULT_STARTERS: { id: JokerId; needs?: PieceType }[] = [
  { id: "oldGuard" },
  { id: "cavalry", needs: "N" },
  { id: "towerToll", needs: "R" },
  { id: "longDiagonal", needs: "B" },
  { id: "zigzag" },
  { id: "straightedge" },
  { id: "lightStep" },
];

function multStartersFor(run: RunState, owned: Set<JokerId>): JokerId[] {
  return MULT_STARTERS.filter(
    (s) =>
      !owned.has(s.id) &&
      (!s.needs || run.bag.filter((p) => p.type === s.needs).length >= 2),
  ).map((s) => s.id);
}

/** Offers only — payout is computed by clearBlind (rerolls must not re-pay). */
function rollShop(run: RunState): [ShopState, number] {
  let rng = run.rng;
  const owned = new Set(run.jokers.map((j) => j.id));

  const offered: JokerId[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const available = JOKER_IDS.filter((id) => !owned.has(id) && !offered.includes(id));
    if (available.length === 0) break;
    let rarity: Rarity;
    [rarity, rng] = weighted(rng, RARITY_WEIGHTS);
    // Fall back through rarities so a drained tier never empties the slot.
    const tiers: Rarity[] = [rarity, "common", "uncommon", "rare"];
    const pool = tiers
      .map((r) => available.filter((id) => JOKERS[id].rarity === r))
      .find((p) => p.length > 0);
    if (!pool) break;
    let picked: JokerId[];
    [picked, rng] = pick(rng, pool, 1);
    offered.push(picked[0]);
  }
  // The run's very first shop always offers at least one Mult common.
  if (
    run.ante === 1 &&
    run.blind?.kind === "small" &&
    !offered.some((id) => MULT_STARTERS.some((s) => s.id === id))
  ) {
    const starters = multStartersFor(run, owned);
    if (starters.length > 0 && offered.length > 0) {
      let picked: JokerId[];
      [picked, rng] = pick(rng, starters, 1);
      offered[offered.length - 1] = picked[0];
    }
  }

  const packSize = run.patents.includes("blottingPudding") ? 4 : 3;
  const choices: PieceType[] = [];
  for (let i = 0; i < packSize; i++) {
    let t: PieceType;
    [t, rng] = weighted(rng, PIECE_PACK_WEIGHTS);
    choices.push(t);
  }

  let enhKind: Enhancement | Engraving;
  {
    let engraveRoll: number;
    [engraveRoll, rng] = next(rng);
    if (engraveRoll < ENGRAVING_SHOP_CHANCE) {
      let idx: number;
      [idx, rng] = nextInt(rng, ENGRAVINGS.length);
      enhKind = ENGRAVINGS[idx];
    } else {
      let idx: number;
      [idx, rng] = nextInt(rng, ENHANCEMENTS.length);
      enhKind = ENHANCEMENTS[idx];
    }
  }

  let charmPick: CharmId[];
  [charmPick, rng] = pick(rng, CHARM_IDS, 1);

  // Boss shops carry a Patent offer (the Knight's inventions).
  let patent: ShopState["patent"];
  if (run.blind?.kind === "boss") {
    const unowned = PATENT_IDS.filter((id) => !run.patents.includes(id));
    if (unowned.length > 0) {
      let idx: number;
      [idx, rng] = nextInt(rng, unowned.length);
      const id = unowned[idx];
      const tip = run.pendingPosters.includes("patentTip");
      patent = {
        id,
        cost: tip ? Math.ceil(PATENTS[id].cost / 2) : PATENTS[id].cost,
        sold: false,
      };
    }
  }

  const shop: ShopState = {
    payout: { reward: 0, unused: 0, interest: 0, jokers: 0 },
    jokers: offered.map((joker) => ({ joker, cost: JOKERS[joker].cost, sold: false })),
    pack: { choices, cost: PACK_COST, sold: false },
    enhancement: { kind: enhKind, cost: ENHANCEMENT_COST, sold: false },
    charm: { id: charmPick[0], cost: CHARMS[charmPick[0]].cost, sold: false },
    patent,
    couponActive: run.pendingPosters.includes("coupon") || undefined,
    rerollCost: REROLL_COST,
    removeCost:
      REMOVE_COST +
      (run.patents.includes("mouseTrap") ? 0 : run.removals * REMOVE_INCREMENT),
    freeRerollsLeft:
      run.jokers.reduce((n, j) => n + (JOKERS[j.id].freeRerolls ?? 0), 0) +
      (run.patents.includes("spareReins") ? 1 : 0),
  };
  return [shop, rng];
}

function clearBlind(run: RunState, opts: { insured?: boolean } = {}): RunState {
  if (run.ante === ANTES && run.blindIdx === 2 && !run.endless) {
    return { ...run, phase: { name: "won" } };
  }

  // Blind-end joker effects fire before the payout is tallied. Each hook gets
  // a fresh rng roll (self-destruct gambles); destroyed jokers drop out here.
  let jokerMoney = 0;
  let endRng = run.rng;
  const jokers: JokerInstance[] = [];
  for (const inst of run.jokers) {
    const hook = JOKERS[inst.id].onBlindEnd;
    if (!hook) {
      jokers.push(inst);
      continue;
    }
    let roll: number;
    [roll, endRng] = next(endRng);
    const end = hook(inst.state ?? 0, roll, {
      movesLeft: run.blind?.movesLeft ?? 0,
      kind: run.blind?.kind ?? "small",
    });
    if (!end) {
      jokers.push(inst);
      continue;
    }
    jokerMoney += end.money ?? 0;
    if (end.destroy) continue;
    jokers.push(end.setState !== undefined ? { ...inst, state: end.setState } : inst);
  }

  const blind = run.blind!;
  // Wooden Trial: small blinds pay no reward. Insurance survives pay nothing.
  let reward =
    opts.insured || (run.trial >= 1 && blind.kind === "small")
      ? 0
      : BLIND_REWARD[blind.kind];
  const doubled = !opts.insured && run.pendingPosters.includes("doubleBounty");
  if (doubled) reward *= 2;
  const unused = opts.insured ? 0 : blind.movesLeft * UNUSED_MOVE_PAY;
  const interestPer = jokers.reduce(
    (per, j) => Math.min(per, JOKERS[j.id].interestPer ?? INTEREST_PER),
    INTEREST_PER,
  );
  // Mirror Trial caps interest at $3 (the Ledger patent cannot out-argue it).
  const baseCap =
    run.trial >= 4 ? 3 : run.patents.includes("interestLedger") ? 10 : INTEREST_CAP;
  const interestCap =
    baseCap + jokers.reduce((n, j) => n + (JOKERS[j.id].interestCapBonus ?? 0), 0);
  const interest = Math.min(
    Math.floor((run.money + reward + unused + jokerMoney) / interestPer),
    interestCap,
  );

  const pendingPosters = run.pendingPosters.filter(
    (t) => !(doubled && t === "doubleBounty"),
  );
  const [shop, rng] = rollShop({ ...run, jokers, rng: endRng });
  shop.payout = { reward, unused, interest, jokers: jokerMoney };
  return {
    ...run,
    rng,
    jokers,
    pendingPosters,
    money: run.money + reward + unused + interest + jokerMoney,
    phase: { name: "shop", shop },
  };
}

/**
 * From the win screen: carry the run into the Endless Night. The final boss
 * was cleared but never paid out (clearBlind short-circuited to "won"), so
 * re-clearing it with the flag set runs the hooks, pays, and opens the shop.
 */
export function enterEndless(run: RunState): RunState {
  if (run.phase.name !== "won") return run;
  return clearBlind({ ...run, endless: true });
}

export interface PlayResult {
  run: RunState;
  events: ScoreEvent[];
}

export function playMove(run: RunState, from: Square, to: Square): PlayResult {
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing") return { run, events: [] };
  const cell = blind.board[from];
  if (cell?.kind !== "own") return { run, events: [] };
  const piece = run.bag.find((p) => p.id === cell.pieceId);
  if (!piece) return { run, events: [] };
  const mods: Modifiers = modifiersFor(run);
  if (isExhausted(run, piece, mods)) return { run, events: [] };
  if (!legalDestinations(run, piece, from, mods).includes(to)) {
    return { run, events: [] };
  }

  const targetCell = blind.board[to];
  const captured = targetCell?.kind === "bounty" ? targetCell.type : null;

  const board = blind.board.slice();
  board[from] = null;
  board[to] = { kind: "own", pieceId: piece.id };

  const promoted = piece.type === "P" && rankOf(to) === mods.boardSize - 1;
  const moverType: PieceType = promoted ? PROMOTION_PIECE : piece.type;
  let bag = run.bag;
  if (promoted) {
    bag = bag.map((p) => (p.id === piece.id ? { ...p, type: moverType } : p));
  }

  const chainAfter = captured ? blind.chain + 1 : 0;
  const events: ScoreEvent[] = [];
  if (promoted) events.push({ kind: "promote", sq: to, source: "promotion" });

  const result = scoreMove({
    board,
    bag,
    blind,
    jokers: run.jokers,
    mover: bag.find((p) => p.id === piece.id)!,
    moverType,
    from,
    to,
    captured,
    chainAfter,
    promoted,
    money: run.money,
    removals: run.removals,
    studies: run.studies,
    echo: blind.echo,
    jokerSlots: jokerSlots(run),
    mods,
    rng: run.rng,
  });
  events.push(...result.events);

  // Tollbooth: captures cost money, clamped so the purse never goes negative.
  let moneyDelta = result.moneyDelta;
  if (captured && mods.captureTax > 0) {
    const tax = Math.min(mods.captureTax, Math.max(0, run.money + moneyDelta));
    if (tax > 0) {
      events.push({ kind: "money", amount: -tax, source: "Tollbooth" });
      moneyDelta -= tax;
    }
  }

  let finalBoard = board;
  if (result.shattered.length > 0) {
    bag = bag.filter((p) => !result.shattered.includes(p.id));
    finalBoard = board.map((c) =>
      c?.kind === "own" && result.shattered.includes(c.pieceId) ? null : c,
    );
  }

  // The mover is spent for the rest of the blind (exempt types excepted).
  let exhausted = blind.exhausted;
  if (!mods.exhaustionExempt.includes(moverType) && !result.shattered.includes(piece.id)) {
    exhausted = [...exhausted, piece.id];
    events.push({ kind: "exhaust", sq: to, pieceId: piece.id });
  }
  if (result.shattered.length > 0) {
    exhausted = exhausted.filter((id) => !result.shattered.includes(id));
  }

  const newBlind: BlindState = {
    ...blind,
    board: finalBoard,
    score: blind.score + result.total,
    movesLeft: blind.movesLeft - 1,
    chain: chainAfter,
    captures: blind.captures + (captured ? 1 : 0),
    exhausted,
    echo: false, // an armed Echo is consumed by this move
  };
  const jokersAfter = run.jokers.map((j, i) =>
    result.jokerStates[i] !== (j.state ?? 0) ? { ...j, state: result.jokerStates[i] } : j,
  );

  let newRunState: RunState = {
    ...run,
    rng: result.rng,
    bag,
    money: run.money + moneyDelta,
    jokers: jokersAfter,
    blind: newBlind,
    stats: {
      moves: run.stats.moves + 1,
      captures: run.stats.captures + (captured ? 1 : 0),
      bestMove: Math.max(run.stats.bestMove, result.total),
      promotions: run.stats.promotions + (promoted ? 1 : 0),
    },
  };

  if (newBlind.score >= newBlind.target) {
    newRunState = clearBlind(newRunState);
  } else if (newBlind.movesLeft <= 0) {
    // Insurance: survive one failed blind at 60%+ of the target — the joker
    // breaks and the blind pays nothing, but the run lives.
    const insuredIdx = newRunState.jokers.findIndex((j) => j.id === "insurance");
    if (insuredIdx >= 0 && newBlind.score >= 0.6 * newBlind.target) {
      newRunState = clearBlind(
        {
          ...newRunState,
          jokers: newRunState.jokers.filter((_, i) => i !== insuredIdx),
        },
        { insured: true },
      );
    } else {
      newRunState = { ...newRunState, phase: { name: "lost" } };
    }
  } else {
    newRunState = checkStuck(newRunState);
  }
  return { run: newRunState, events };
}

/** Return the piece on `sq` to the bag queue and draw the next one there. */
export function swapPiece(run: RunState, sq: Square): RunState {
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing") return run;
  if (blind.swapsLeft <= 0 || blind.queue.length === 0) return run;
  const cell = blind.board[sq];
  if (cell?.kind !== "own") return run;

  const mods = modifiersFor(run);
  // Royal Decree: skip queens in the queue, rotating them to the back.
  let drawIdx = 0;
  if (mods.queensNotDealt) {
    drawIdx = blind.queue.findIndex(
      (id) => run.bag.find((p) => p.id === id)?.type !== "Q",
    );
    if (drawIdx === -1) return run;
  }
  const drawn = blind.queue[drawIdx];
  const skipped = blind.queue.slice(0, drawIdx);
  const rest = blind.queue.slice(drawIdx + 1);
  const board = blind.board.slice();
  board[sq] = { kind: "own", pieceId: drawn };
  return checkStuck({
    ...run,
    blind: {
      ...blind,
      board,
      queue: [...rest, ...skipped, cell.pieceId],
      swapsLeft: blind.swapsLeft - 1,
    },
  });
}

// ---- Shop actions ----

function shopOf(run: RunState): ShopState | null {
  return run.phase.name === "shop" ? run.phase.shop : null;
}

/** Coupon poster: the next purchase is free (spends the banked coupon). */
function couponPrice(
  run: RunState,
  shop: ShopState,
  cost: number,
): { cost: number; shop: ShopState; posters: PosterId[] } {
  if (!shop.couponActive) return { cost, shop, posters: run.pendingPosters };
  return {
    cost: 0,
    shop: { ...shop, couponActive: undefined },
    posters: run.pendingPosters.filter((t) => t !== "coupon"),
  };
}

export function buyJoker(run: RunState, index: number): RunState {
  const shop0 = shopOf(run);
  const offer = shop0?.jokers[index];
  if (!shop0 || !offer || offer.sold) return run;
  const { cost, shop, posters } = couponPrice(run, shop0, offer.cost);
  if (run.money < cost || run.jokers.length >= jokerSlots(run)) return run;
  const jokers = shop.jokers.map((o, i) => (i === index ? { ...o, sold: true } : o));
  return {
    ...run,
    money: run.money - cost,
    pendingPosters: posters,
    jokers: [...run.jokers, { id: offer.joker }],
    phase: { name: "shop", shop: { ...shop, jokers } },
  };
}

/** Buy the boss-shop Patent (Patent Tip poster halves it, then is spent). */
/** Coupons never apply — the Knight does not discount his own inventions. */
export function buyPatent(run: RunState): RunState {
  const shop = shopOf(run);
  const offer = shop?.patent;
  if (!shop || !offer || offer.sold) return run;
  if (run.money < offer.cost) return run;
  return {
    ...run,
    money: run.money - offer.cost,
    patents: [...run.patents, offer.id],
    pendingPosters: run.pendingPosters.filter((t) => t !== "patentTip"),
    phase: {
      name: "shop",
      shop: { ...shop, patent: { ...offer, sold: true } },
    },
  };
}

/**
 * Skip a Small or Big blind from its intro, forfeiting its payout, and take
 * the Wanted Poster nailed to it.
 */
export function skipBlind(run: RunState): RunState {
  if (run.phase.name !== "blindIntro" || run.blindIdx >= 2) return run;
  const poster = run.blind?.poster;
  if (!poster) return run;
  let r: RunState = { ...run, blindIdx: run.blindIdx + 1 };
  if (poster === "charmCache") {
    if (r.charms.length < CHARM_SLOTS) {
      let rng = r.rng;
      let idx: number;
      [idx, rng] = nextInt(rng, CHARM_IDS.length);
      r = { ...r, rng, charms: [...r.charms, CHARM_IDS[idx]] };
    }
  } else {
    r = { ...r, pendingPosters: [...r.pendingPosters, poster] };
    if (poster === "doubleBounty") r = { ...r, money: r.money + 2 };
  }
  return deal(r);
}

/** Sell an owned joker (shop phase only) for half its cost. */
export function sellJoker(run: RunState, index: number): RunState {
  const shop = shopOf(run);
  const inst = run.jokers[index];
  if (!shop || !inst) return run;
  const def = JOKERS[inst.id];
  const refund = Math.floor(def.cost / 2) + (def.sellBonus?.(inst.state ?? 0) ?? 0);
  return {
    ...run,
    money: run.money + refund,
    jokers: run.jokers.filter((_, i) => i !== index),
  };
}

export function buyPack(run: RunState, choiceIdx: number): RunState {
  const shop0 = shopOf(run);
  if (!shop0 || shop0.pack.sold) return run;
  const type = shop0.pack.choices[choiceIdx];
  if (!type) return run;
  const { cost, shop, posters } = couponPrice(run, shop0, shop0.pack.cost);
  if (run.money < cost) return run;
  return {
    ...run,
    money: run.money - cost,
    pendingPosters: posters,
    bag: [...run.bag, { id: run.nextPieceId, type }],
    nextPieceId: run.nextPieceId + 1,
    phase: { name: "shop", shop: { ...shop, pack: { ...shop.pack, sold: true } } },
  };
}

const isEngraving = (k: Enhancement | Engraving): k is Engraving =>
  (ENGRAVINGS as string[]).includes(k);

export function buyEnhancement(run: RunState, pieceId: number): RunState {
  const shop0 = shopOf(run);
  if (!shop0 || shop0.enhancement.sold) return run;
  if (!run.bag.some((p) => p.id === pieceId)) return run;
  const { cost, shop, posters } = couponPrice(run, shop0, shop0.enhancement.cost);
  if (run.money < cost) return run;
  const kind = shop.enhancement.kind;
  return {
    ...run,
    money: run.money - cost,
    pendingPosters: posters,
    bag: run.bag.map((p) =>
      p.id === pieceId
        ? isEngraving(kind)
          ? { ...p, engraving: kind }
          : { ...p, enhancement: kind }
        : p,
    ),
    phase: {
      name: "shop",
      shop: { ...shop, enhancement: { ...shop.enhancement, sold: true } },
    },
  };
}

export function buyCharm(run: RunState): RunState {
  const shop0 = shopOf(run);
  if (!shop0 || shop0.charm.sold) return run;
  const { cost, shop, posters } = couponPrice(run, shop0, shop0.charm.cost);
  if (run.money < cost || run.charms.length >= CHARM_SLOTS) return run;
  return {
    ...run,
    money: run.money - cost,
    pendingPosters: posters,
    charms: [...run.charms, shop.charm.id],
    phase: { name: "shop", shop: { ...shop, charm: { ...shop.charm, sold: true } } },
  };
}

/**
 * Use a held charm. `target` is a board square for boardPiece charms, a bag
 * piece id for bagPiece charms, and ignored otherwise. Invalid uses return
 * the run unchanged (the charm is kept).
 */
export function useCharm(run: RunState, index: number, target?: number): RunState {
  const id = run.charms[index];
  if (!id) return run;
  const def = CHARMS[id];
  const phase = run.phase.name;
  if (def.phase !== "any" && def.phase !== phase) return run;
  if (def.phase === "any" && phase !== "playing" && phase !== "shop") return run;

  const spend = (r: RunState): RunState => ({
    ...r,
    charms: r.charms.filter((_, i) => i !== index),
  });

  // Studies — level a move pattern, usable anywhere.
  if (def.study) {
    return spend({
      ...run,
      studies: { ...run.studies, [def.study]: run.studies[def.study] + 1 },
    });
  }

  switch (id) {
    case "invitation": {
      if (run.jokers.length >= jokerSlots(run)) return run;
      const legends = JOKER_IDS.filter(
        (jid) => JOKERS[jid].rarity === "legendary" && !run.jokers.some((j) => j.id === jid),
      );
      if (legends.length === 0) return run;
      let rng = run.rng;
      let idx: number;
      [idx, rng] = nextInt(rng, legends.length);
      return spend({ ...run, rng, jokers: [...run.jokers, { id: legends[idx] }] });
    }
    case "pressGang": {
      return spend({
        ...run,
        bag: [
          ...run.bag,
          { id: run.nextPieceId, type: "P" },
          { id: run.nextPieceId + 1, type: "P" },
        ],
        nextPieceId: run.nextPieceId + 2,
      });
    }
    case "windfall": {
      const blind = run.blind;
      if (!blind) return run;
      const bounties = blind.board.filter((c) => c?.kind === "bounty").length;
      return spend({ ...run, money: run.money + bounties });
    }
    case "extraHour": {
      const blind = run.blind;
      if (!blind) return run;
      return spend({ ...run, blind: { ...blind, movesLeft: blind.movesLeft + 1 } });
    }
    case "echo": {
      const blind = run.blind;
      if (!blind || blind.echo) return run;
      return spend({ ...run, blind: { ...blind, echo: true } });
    }
    case "tempest": {
      const blind = run.blind;
      if (!blind) return run;
      const board = blind.board.slice();
      const types: PieceType[] = [];
      board.forEach((c, sq) => {
        if (c?.kind === "bounty") {
          types.push(c.type);
          board[sq] = null;
        }
      });
      if (types.length === 0) return run;
      const empty = board
        .map((c, sq) => (c === null ? sq : -1))
        .filter((sq) => sq >= 0);
      let rng = run.rng;
      let spots: Square[];
      [spots, rng] = pick(rng, empty, Math.min(types.length, empty.length));
      types.slice(0, spots.length).forEach((t, i) => {
        board[spots[i]] = { kind: "bounty", type: t };
      });
      return checkStuck(spend({ ...run, rng, blind: { ...blind, board } }));
    }
    case "secondBreakfast": {
      const blind = run.blind;
      if (!blind || target === undefined) return run;
      const cell = blind.board[target];
      if (cell?.kind !== "own" || !blind.exhausted.includes(cell.pieceId)) return run;
      return spend({
        ...run,
        blind: {
          ...blind,
          exhausted: blind.exhausted.filter((pid) => pid !== cell.pieceId),
        },
      });
    }
    case "royalWrit": {
      const blind = run.blind;
      if (!blind || target === undefined) return run;
      const cell = blind.board[target];
      if (cell?.kind !== "own") return run;
      const piece = run.bag.find((p) => p.id === cell.pieceId);
      if (!piece || piece.type !== "P") return run;
      return spend({
        ...run,
        bag: run.bag.map((p) => (p.id === piece.id ? { ...p, type: "Q" } : p)),
        stats: { ...run.stats, promotions: run.stats.promotions + 1 },
      });
    }
    case "transmutation": {
      if (target === undefined) return run;
      const ladder: PieceType[] = ["P", "N", "B", "R", "Q"];
      const piece = run.bag.find((p) => p.id === target);
      if (!piece || piece.type === "Q") return run;
      const nextType = ladder[ladder.indexOf(piece.type) + 1];
      return spend({
        ...run,
        bag: run.bag.map((p) => (p.id === target ? { ...p, type: nextType } : p)),
      });
    }
    case "silverPolish": {
      if (target === undefined) return run;
      if (!run.bag.some((p) => p.id === target)) return run;
      let rng = run.rng;
      let enhIdx: number;
      [enhIdx, rng] = nextInt(rng, ENHANCEMENTS.length);
      const kind: Enhancement = ENHANCEMENTS[enhIdx];
      return spend({
        ...run,
        rng,
        bag: run.bag.map((p) => (p.id === target ? { ...p, enhancement: kind } : p)),
      });
    }
    case "cullingWrit": {
      if (target === undefined) return run;
      if (run.bag.length <= MIN_BAG_SIZE) return run;
      if (!run.bag.some((p) => p.id === target)) return run;
      return spend({
        ...run,
        bag: run.bag.filter((p) => p.id !== target),
        // Scrub the culled piece from the stale pre-shop board too — a dealt
        // copy would otherwise linger as a ghost cell.
        blind: run.blind && {
          ...run.blind,
          board: run.blind.board.map((c) =>
            c?.kind === "own" && c.pieceId === target ? null : c,
          ),
        },
      });
    }
    default:
      return run;
  }
}

export function rerollShop(run: RunState): RunState {
  const shop = shopOf(run);
  if (!shop) return run;
  const free = shop.freeRerollsLeft > 0;
  if (!free && run.money < shop.rerollCost) return run;
  const paid = free ? run : { ...run, money: run.money - shop.rerollCost };
  const [fresh, rng] = rollShop(paid);
  // Keep the payout banner; only offers reroll. Free rerolls burn down and don't
  // escalate the price; each paid reroll costs $1 more (resets next shop).
  return {
    ...paid,
    rng,
    phase: {
      name: "shop",
      shop: {
        ...fresh,
        payout: shop.payout,
        // A fresh patent offer per reroll; a bought patent stays bought.
        patent: shop.patent?.sold ? shop.patent : fresh.patent,
        couponActive: shop.couponActive,
        rerollCost: free ? shop.rerollCost : shop.rerollCost + REROLL_INCREMENT,
        freeRerollsLeft: free ? shop.freeRerollsLeft - 1 : 0,
      },
    },
  };
}

export function removePiece(run: RunState, pieceId: number): RunState {
  const shop = shopOf(run);
  if (!shop || run.money < shop.removeCost) return run;
  if (run.bag.length <= MIN_BAG_SIZE) return run;
  if (!run.bag.some((p) => p.id === pieceId)) return run;
  return {
    ...run,
    money: run.money - shop.removeCost,
    bag: run.bag.filter((p) => p.id !== pieceId),
    removals: run.removals + 1,
    // Scrub the banished piece from the stale pre-shop board too.
    blind: run.blind && {
      ...run.blind,
      board: run.blind.board.map((c) =>
        c?.kind === "own" && c.pieceId === pieceId ? null : c,
      ),
    },
    phase: {
      name: "shop",
      shop: {
        ...shop,
        removeCost:
          shop.removeCost +
          (run.patents.includes("mouseTrap") ? 0 : REMOVE_INCREMENT),
      },
    },
  };
}

export function nextBlind(run: RunState): RunState {
  if (run.phase.name !== "shop") return run;
  const advanced =
    run.blindIdx === 2
      ? { ...run, ante: run.ante + 1, blindIdx: 0 }
      : { ...run, blindIdx: run.blindIdx + 1 };
  return deal(advanced);
}
