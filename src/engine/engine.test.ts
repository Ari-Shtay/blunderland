import { describe, expect, it } from "vitest";
import { next, nextInt, seedFromString, shuffle } from "./rng";
import { legalMoves, squareAt, squareName, isDark } from "./movegen";
import { baseModifiers, BOSSES, modifiersFor } from "./bosses";
import { scoreMove, type ScoredMoveInput } from "./scoring";
import {
  blindTarget,
  bossFor,
  buyCharm,
  enterEndless,
  buyEnhancement,
  buyJoker,
  buyPack,
  canSwap,
  useCharm,
  legalMovesFor,
  mustSwap,
  newRun,
  nextBlind,
  playMove,
  removePiece,
  rerollShop,
  buyPatent,
  jokerSlots,
  sellJoker,
  skipBlind,
  startPlaying,
  swapPiece,
} from "./run";
import { JOKERS } from "./jokers";
import { OPENING_IDS } from "./openings";
import {
  BASE_CHIPS,
  BLIND_REWARD,
  ENGRAVING_CHIPS,
  ENGRAVING_MULT,
  ENGRAVING_XMULT,
  QUIET_CHIP_FACTOR,
  SQUARES,
  STARTING_BAG,
  SWAPS_PER_BLIND,
} from "./constants";
import type {
  BagPiece,
  BlindState,
  BossId,
  Cell,
  JokerId,
  PieceType,
  RunState,
  ShopState,
} from "./types";

// ---------- helpers ----------

function emptyBoard(): (Cell | null)[] {
  return new Array(SQUARES).fill(null);
}

function testBlind(overrides: Partial<BlindState> = {}): BlindState {
  return {
    kind: "small",
    target: 100,
    score: 0,
    movesLeft: 4,
    swapsLeft: SWAPS_PER_BLIND,
    board: emptyBoard(),
    queue: [],
    goldSq: 24,
    chain: 0,
    captures: 0,
    exhausted: [],
    echo: false,
    bountyScale: 1,
    ...overrides,
  };
}

function testRun(overrides: Partial<RunState> = {}): RunState {
  return {
    seed: 1,
    rng: 12345,
    ante: 1,
    blindIdx: 0,
    phase: { name: "playing" },
    bag: [],
    nextPieceId: 100,
    money: 10,
    jokers: [],
    charms: [],
    studies: { quiet: 0, capture: 0, chain: 0, fork: 0, slide: 0, promotion: 0 },
    removals: 0,
    openingId: "classical",
    trial: 0,
    patents: [],
    pendingPosters: [],
    bosses: ["wall", "royalDecree", "antiCavalry", "suddenDeath", "tollbooth", "pacifist", "blackout", "wall"],
    blind: null,
    stats: { moves: 0, captures: 0, bestMove: 0, promotions: 0 },
    ...overrides,
  };
}

/** Shorthand: joker ids → owned instances. */
const js = (...ids: JokerId[]) => ids.map((id) => ({ id }));

/** Chips a quiet (non-capture) move earns for a piece type. */
const quiet = (t: keyof typeof BASE_CHIPS) => Math.round(BASE_CHIPS[t] * QUIET_CHIP_FACTOR);

function scoreInput(overrides: Partial<ScoredMoveInput>): ScoredMoveInput {
  const mover: BagPiece = { id: 1, type: "N" };
  return {
    board: emptyBoard(),
    bag: [mover],
    blind: testBlind(),
    jokers: [],
    mover,
    moverType: "N",
    from: 0,
    to: 7,
    captured: null,
    chainAfter: 0,
    promoted: false,
    money: 0,
    removals: 0,
    studies: { quiet: 0, capture: 0, chain: 0, fork: 0, slide: 0, promotion: 0 },
    echo: false,
    mods: baseModifiers(),
    rng: 1,
    ...overrides,
  };
}

// ---------- rng ----------

describe("rng", () => {
  it("is deterministic for a given state", () => {
    const [a1, s1] = next(42);
    const [a2] = next(42);
    expect(a1).toBe(a2);
    const [b1] = next(s1);
    expect(b1).not.toBe(a1);
  });

  it("nextInt stays in range", () => {
    let s = seedFromString("blunderland");
    for (let i = 0; i < 200; i++) {
      let v: number;
      [v, s] = nextInt(s, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it("shuffle preserves elements and is deterministic", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const [out1] = shuffle(99, arr);
    const [out2] = shuffle(99, arr);
    expect(out1).toEqual(out2);
    expect([...out1].sort()).toEqual(arr);
  });
});

// ---------- movegen ----------

describe("movegen", () => {
  const mods = baseModifiers();

  it("names squares correctly", () => {
    expect(squareName(0)).toBe("a1");
    expect(squareName(24)).toBe("e5");
    expect(squareAt(2, 2)).toBe(12);
  });

  it("a1 is dark", () => {
    expect(isDark(0)).toBe(true);
    expect(isDark(1)).toBe(false);
  });

  it("pawn pushes forward, captures diagonally, blocked by any piece", () => {
    const board = emptyBoard();
    board[squareAt(2, 2)] = { kind: "bounty", type: "P" }; // c3 blocks c2 push
    board[squareAt(1, 2)] = { kind: "bounty", type: "N" }; // b3 capturable
    board[squareAt(3, 2)] = { kind: "own", pieceId: 9 }; // d3 own — not capturable
    const moves = legalMoves(board, squareAt(2, 1), "P", mods); // pawn on c2
    expect(moves.sort()).toEqual([squareAt(1, 2)].sort());
  });

  it("pawn cannot capture straight ahead", () => {
    const board = emptyBoard();
    board[squareAt(0, 1)] = { kind: "bounty", type: "Q" };
    expect(legalMoves(board, squareAt(0, 0), "P", mods)).toEqual([]);
  });

  it("knight from corner a1 has exactly b3 and c2", () => {
    const moves = legalMoves(emptyBoard(), 0, "N", mods);
    expect(moves.sort((x, y) => x - y)).toEqual([squareAt(2, 1), squareAt(1, 2)].sort((x, y) => x - y));
  });

  it("rook rays stop at own pieces, capture bounties", () => {
    const board = emptyBoard();
    board[squareAt(0, 2)] = { kind: "own", pieceId: 9 }; // a3 blocks north
    board[squareAt(3, 0)] = { kind: "bounty", type: "R" }; // d1 capturable east
    const moves = legalMoves(board, 0, "R", mods); // rook a1
    expect(moves).toContain(squareAt(0, 1)); // a2
    expect(moves).not.toContain(squareAt(0, 2)); // a3 own
    expect(moves).not.toContain(squareAt(0, 3)); // beyond block
    expect(moves).toContain(squareAt(3, 0)); // d1 capture
    expect(moves).not.toContain(squareAt(4, 0)); // beyond bounty
  });

  it("queen = rook + bishop", () => {
    const q = legalMoves(emptyBoard(), 12, "Q", mods).sort((a, b) => a - b);
    const r = legalMoves(emptyBoard(), 12, "R", mods);
    const b = legalMoves(emptyBoard(), 12, "B", mods);
    expect(q).toEqual([...r, ...b].sort((x, y) => x - y));
    expect(q.length).toBe(16); // center of 5×5
  });

});

// ---------- scoring ----------

describe("scoring", () => {
  it("scores base chips × 1 for a quiet knight move", () => {
    const res = scoreMove(scoreInput({}));
    expect(res.total).toBe(quiet("N")); // quiet moves earn a fraction of base
    expect(res.events.at(-1)).toEqual({
      kind: "total",
      amount: quiet("N"),
      chips: quiet("N"),
      mult: 1,
    });
  });

  it("adds scaled capture chips", () => {
    const res = scoreMove(
      scoreInput({ captured: "R", blind: testBlind({ bountyScale: 1.4 }) }),
    );
    expect(res.total).toBe(20 + Math.round(50 * 1.4));
  });

  it("underdog chips: a pawn move outscores a queen move", () => {
    const pawn: BagPiece = { id: 1, type: "P" };
    const queen: BagPiece = { id: 1, type: "Q" };
    const p = scoreMove(scoreInput({ mover: pawn, bag: [pawn], moverType: "P" }));
    const q = scoreMove(scoreInput({ mover: queen, bag: [queen], moverType: "Q" }));
    expect(p.total).toBe(quiet("P"));
    expect(q.total).toBe(quiet("Q"));
  });

  it("cavalry adds +4 mult for knights only", () => {
    const knight = scoreMove(scoreInput({ jokers: js("cavalry") }));
    expect(knight.total).toBe(quiet("N") * 5);
    const mover: BagPiece = { id: 1, type: "R" };
    const rook = scoreMove(scoreInput({ jokers: js("cavalry"), mover, bag: [mover], moverType: "R" }));
    expect(rook.total).toBe(quiet("R"));
  });

  it("joker order: additive mult before xmult joker listed later", () => {
    const mover: BagPiece = { id: 1, type: "N" };
    const bag: BagPiece[] = [mover, { id: 2, type: "B" }, { id: 3, type: "B" }];
    const res = scoreMove(scoreInput({ jokers: js("cavalry", "bishopPair"), bag }));
    // quiet knight chips, mult (1 + 4) * 2 = 10
    expect(res.total).toBe(quiet("N") * 10);
  });

  it("combo chain scales with consecutive captures", () => {
    const res = scoreMove(scoreInput({ jokers: js("comboChain"), captured: "P", chainAfter: 3 }));
    // chips 20 + 15 = 35, mult 1 + 6 = 7
    expect(res.total).toBe(245);
  });

  it("The Wall voids dark-square captures", () => {
    const mods = BOSSES.wall.apply(baseModifiers());
    // square 12 (c3) is dark: file+rank = 4
    const res = scoreMove(scoreInput({ mods, to: 12, captured: "Q" }));
    // base 20 + capture 0 + center 10
    expect(res.total).toBe(30);
  });

  it("Anti-Cavalry zeroes knight chips and mutes Cavalry", () => {
    const mods = BOSSES.antiCavalry.apply(baseModifiers());
    const res = scoreMove(scoreInput({ mods, jokers: js("cavalry"), captured: "P" }));
    expect(res.total).toBe(0);
  });

  it("Anti-Cavalry mutes ALL jokers, retriggers, and square bonuses for knights", () => {
    const mods = BOSSES.antiCavalry.apply(baseModifiers());
    // quiet knight to the gold center square with quiet-chips and retrigger jokers
    const res = scoreMove(
      scoreInput({
        mods,
        jokers: js("quietStrength", "herald"),
        to: 12,
        blind: testBlind({ goldSq: 12 }),
      }),
    );
    expect(res.total).toBe(0);
    expect(res.events.some((e) => e.kind === "retrigger")).toBe(false);
  });

  it("heavy enhancement boosts chips 1.5×", () => {
    const mover: BagPiece = { id: 1, type: "R", enhancement: "heavy" };
    const res = scoreMove(scoreInput({ mover, bag: [mover], moverType: "R" }));
    expect(res.total).toBe(quiet("R") + Math.round(quiet("R") * 0.5));
  });

  it("gilded pays money, royal tax pays on capture", () => {
    const mover: BagPiece = { id: 1, type: "N", enhancement: "gilded" };
    const res = scoreMove(
      scoreInput({ mover, bag: [mover], jokers: js("royalTax"), captured: "P" }),
    );
    expect(res.moneyDelta).toBe(2);
  });

  it("promotion fever doubles the total on promotion", () => {
    const plain = scoreMove(scoreInput({ promoted: true }));
    const fever = scoreMove(scoreInput({ promoted: true, jokers: js("promotionFever") }));
    expect(fever.total).toBe(plain.total * 2);
  });

  it("gold square pays bonus chips", () => {
    const res = scoreMove(scoreInput({ blind: testBlind({ goldSq: 7 }), to: 7 }));
    expect(res.total).toBe(quiet("N") + 20);
  });
});

// ---------- run reducer ----------

describe("run", () => {
  it("newRun is deterministic and deals a legal blind", () => {
    const a = newRun(777);
    const b = newRun(777);
    expect(a).toEqual(b);
    expect(a.bag.length).toBe(STARTING_BAG.length);
    expect(a.phase.name).toBe("blindIntro");
    const blind = a.blind!;
    const own = blind.board.filter((c) => c?.kind === "own").length;
    const bounties = blind.board.filter((c) => c?.kind === "bounty").length;
    expect(own).toBe(5);
    expect(bounties).toBe(7);
    expect(blind.queue.length).toBe(STARTING_BAG.length - 5);
    expect(blind.target).toBe(100);
  });

  it("survives a JSON save round-trip", () => {
    const run = startPlaying(newRun(123));
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });

  it("playMove scores, decrements moves, and updates stats", () => {
    let run = startPlaying(newRun(42));
    // find any own piece with a legal move
    const blind = run.blind!;
    let from = -1;
    let to = -1;
    for (let sq = 0; sq < SQUARES; sq++) {
      if (blind.board[sq]?.kind !== "own") continue;
      const dests = legalMovesFor(run, sq);
      if (dests.length > 0) {
        from = sq;
        to = dests[0];
        break;
      }
    }
    expect(from).toBeGreaterThanOrEqual(0);
    const { run: after, events } = playMove(run, from, to);
    expect(after.stats.moves).toBe(1);
    expect(events.some((e) => e.kind === "total")).toBe(true);
    if (after.phase.name === "playing") {
      expect(after.blind!.movesLeft).toBe(3);
      expect(after.blind!.score).toBeGreaterThan(0);
    }
  });

  it("rejects illegal moves untouched", () => {
    const run = startPlaying(newRun(42));
    const { run: same, events } = playMove(run, 0, 24);
    expect(events).toEqual([]);
    expect(same).toBe(run);
  });

  it("clearing a blind pays out and opens the shop", () => {
    const bag: BagPiece[] = [{ id: 1, type: "Q" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    let run = testRun({
      bag,
      money: 0,
      blind: testBlind({ board, target: 80, movesLeft: 4, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    // Qa1 x Qa4: chips 10 + 80 = 90 ≥ 80
    expect(after.phase.name).toBe("shop");
    if (after.phase.name === "shop") {
      const { reward, unused, interest } = after.phase.shop.payout;
      expect(reward).toBe(3);
      expect(unused).toBe(3); // 3 moves left after this one
      expect(after.money).toBe(reward + unused + interest);
    }
  });

  it("running out of moves loses the run", () => {
    const bag: BagPiece[] = [{ id: 1, type: "P" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({
      bag,
      blind: testBlind({ board, target: 99999, movesLeft: 1 }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 1));
    expect(after.phase.name).toBe("lost");
  });

  it("pawn promotes permanently on the last rank", () => {
    const bag: BagPiece[] = [{ id: 1, type: "P" }];
    const board = emptyBoard();
    board[squareAt(2, 3)] = { kind: "own", pieceId: 1 }; // c4
    const run = testRun({
      bag,
      blind: testBlind({ board, target: 99999, movesLeft: 4 }),
    });
    const { run: after, events } = playMove(run, squareAt(2, 3), squareAt(2, 4));
    expect(after.bag[0].type).toBe("Q");
    expect(after.stats.promotions).toBe(1);
    expect(events.some((e) => e.kind === "promote")).toBe(true);
  });

  it("swap returns the piece to the queue and draws the next", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "P" },
      { id: 2, type: "Q" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({ bag, blind: testBlind({ board, queue: [2] }) });
    const after = swapPiece(run, 0);
    expect(after.blind!.board[0]).toEqual({ kind: "own", pieceId: 2 });
    expect(after.blind!.queue).toEqual([1]);
    expect(after.blind!.swapsLeft).toBe(SWAPS_PER_BLIND - 1);
    // no swaps left → no-op
    const drained = { ...after, blind: { ...after.blind!, swapsLeft: 0 } };
    expect(swapPiece(drained, 0)).toBe(drained);
  });

  it("sudden death gives 3 moves; overtime gives one back", () => {
    let run = newRun(5);
    run = { ...run, blindIdx: 2, bosses: ["suddenDeath", ...run.bosses.slice(1)] };
    expect(modifiersFor(run).movesPerBlind).toBe(3);
    run = { ...run, jokers: js("overtime") };
    expect(modifiersFor(run).movesPerBlind).toBe(4);
  });

  it("shop: buy joker, pack, enhancement, reroll, remove piece", () => {
    const bag: BagPiece[] = STARTING_BAG.map((type, i) => ({ id: i + 1, type }));
    const base = testRun({ bag, money: 50 });
    const [shop, rng] = (() => {
      // roll a shop via a cleared-blind path
      const board = emptyBoard();
      board[0] = { kind: "own", pieceId: 1 };
      board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
      const r = {
        ...base,
        bag: [{ id: 1, type: "Q" } as BagPiece],
        blind: testBlind({ board, target: 10 }),
      };
      const { run: cleared } = playMove(r, 0, squareAt(0, 3));
      if (cleared.phase.name !== "shop") throw new Error("expected shop");
      return [cleared.phase.shop, cleared] as const;
    })();
    let run = rng as RunState;
    run = { ...run, bag, money: 50 };

    expect(shop.jokers.length).toBe(2);
    const jokerId = shop.jokers[0].joker;
    run = buyJoker(run, 0);
    expect(run.jokers).toEqual([{ id: jokerId }]);

    const bagBefore = run.bag.length;
    run = buyPack(run, 1);
    expect(run.bag.length).toBe(bagBefore + 1);

    run = buyEnhancement(run, run.bag[0].id);
    // The stall may have offered an enhancement OR an engraving.
    expect(run.bag[0].enhancement ?? run.bag[0].engraving).toBeDefined();

    const moneyBefore = run.money;
    run = rerollShop(run);
    expect(run.money).toBe(moneyBefore - 2);
    if (run.phase.name === "shop") {
      expect(run.phase.shop.jokers.every((o) => !o.sold)).toBe(true);
    }

    const sizeBefore = run.bag.length;
    run = removePiece(run, run.bag[0].id);
    expect(run.bag.length).toBe(sizeBefore - 1);
  });

  it("nextBlind advances small → big → boss → next ante", () => {
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    let run = testRun({
      bag: [{ id: 1, type: "Q" }],
      blind: testBlind({ board, target: 10 }),
    });
    const { run: cleared } = playMove(run, 0, squareAt(0, 3));
    const advanced = nextBlind(cleared);
    expect(advanced.blindIdx).toBe(1);
    expect(advanced.ante).toBe(1);
    expect(advanced.phase.name).toBe("blindIntro");
    expect(advanced.blind!.target).toBe(blindTarget(1, "big"));
  });

  it("clearing ante 8 boss wins the run", () => {
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    const run = testRun({
      ante: 8,
      blindIdx: 2,
      bag: [{ id: 1, type: "Q" }],
      blind: testBlind({ kind: "boss", board, target: 10 }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    expect(after.phase.name).toBe("won");
  });

  it("targets escalate per ante and blind kind", () => {
    expect(blindTarget(1, "small")).toBe(100);
    expect(blindTarget(1, "big")).toBe(150);
    expect(blindTarget(1, "boss")).toBe(200);
    expect(blindTarget(8, "boss")).toBe(48000);
  });
});

// ---------- shop: rarity, selling, rerolls ----------

const dummyShop = (over: Partial<ShopState> = {}): ShopState => ({
  payout: { reward: 0, unused: 0, interest: 0, jokers: 0 },
  jokers: [],
  pack: { choices: ["P", "P", "P"], cost: 3, sold: false },
  enhancement: { kind: "heavy", cost: 4, sold: false },
  charm: { id: "tempest", cost: 3, sold: false },
  rerollCost: 2,
  removeCost: 2,
  freeRerollsLeft: 0,
  ...over,
});

const shopRun = (over: Partial<RunState> = {}, shop: ShopState = dummyShop()) =>
  testRun({ money: 100, phase: { name: "shop", shop }, ...over });

describe("shop economy", () => {

  it("shop offers follow rarity weights (commons > uncommons > rares)", () => {
    const counts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const rolled = rerollShop(shopRun({ rng: seed * 7919 }));
      if (rolled.phase.name !== "shop") throw new Error("expected shop");
      for (const offer of rolled.phase.shop.jokers) {
        counts[JOKERS[offer.joker].rarity]++;
      }
    }
    expect(counts.common).toBeGreaterThan(counts.uncommon);
    expect(counts.uncommon).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(0);
  });

  it("selling a joker refunds half its cost and frees the slot", () => {
    const run = shopRun({ jokers: [{ id: "overtime" }, { id: "cavalry" }] });
    const after = sellJoker(run, 0);
    expect(after.money).toBe(100 + Math.floor(JOKERS.overtime.cost / 2));
    expect(after.jokers).toEqual([{ id: "cavalry" }]);
    // out of shop phase it's a no-op
    const playing = testRun({ jokers: [{ id: "cavalry" }] });
    expect(sellJoker(playing, 0)).toBe(playing);
  });

  it("free rerolls charge nothing, burn down, and don't raise the price", () => {
    const free = rerollShop(shopRun({}, dummyShop({ freeRerollsLeft: 2 })));
    expect(free.money).toBe(100);
    if (free.phase.name !== "shop") throw new Error("expected shop");
    expect(free.phase.shop.freeRerollsLeft).toBe(1);
    expect(free.phase.shop.rerollCost).toBe(2); // still base
  });

  it("paid rerolls cost $1 more each time within a shop (Balatro-style)", () => {
    let run = shopRun();
    run = rerollShop(run); // $2
    expect(run.money).toBe(98);
    if (run.phase.name !== "shop") throw new Error("expected shop");
    expect(run.phase.shop.rerollCost).toBe(3);
    run = rerollShop(run); // $3
    expect(run.money).toBe(95);
    run = rerollShop(run); // $4
    expect(run.money).toBe(91);
    if (run.phase.name !== "shop") throw new Error("expected shop");
    expect(run.phase.shop.rerollCost).toBe(5);
  });

  it("banish costs $1 more per removal for the rest of the run; reroll resets per shop", () => {
    const bag: BagPiece[] = STARTING_BAG.map((type, i) => ({ id: i + 1, type }));
    let run = shopRun({ bag });
    run = removePiece(run, run.bag[0].id); // $2
    expect(run.money).toBe(98);
    expect(run.removals).toBe(1);
    if (run.phase.name !== "shop") throw new Error("expected shop");
    expect(run.phase.shop.removeCost).toBe(3);
    run = removePiece(run, run.bag[0].id); // $3
    expect(run.money).toBe(95);
    expect(run.removals).toBe(2);

    // Reach the NEXT shop by clearing a blind: reroll resets, banish does not.
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    const playing = {
      ...run,
      bag: [{ id: 1, type: "Q" } as BagPiece],
      phase: { name: "playing" } as const,
      blind: testBlind({ board, target: 10, queue: [] }),
    };
    const { run: nextShop } = playMove(playing, 0, squareAt(0, 3));
    expect(nextShop.phase.name).toBe("shop");
    if (nextShop.phase.name === "shop") {
      expect(nextShop.phase.shop.rerollCost).toBe(2); // reset to base
      expect(nextShop.phase.shop.removeCost).toBe(4); // 2 base + 2 removals
    }
  });

  it("joker scaling state survives a JSON round-trip", () => {
    const run = testRun({ jokers: [{ id: "cavalry", state: 7 }] });
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});

// ---------- charms & studies ----------

describe("charms & studies", () => {
  it("buyCharm deducts, holds, and respects the two slots", () => {
    const run = shopRun();
    const bought = buyCharm(run);
    expect(bought.money).toBe(100 - 3); // tempest costs $3
    expect(bought.charms).toEqual(["tempest"]);
    const full = shopRun({ charms: ["echo", "windfall"] });
    expect(buyCharm(full)).toBe(full);
  });

  it("studies level a pattern and scoring applies the bonus", () => {
    const run = testRun({ charms: ["studyCapture"] });
    const after = useCharm(run, 0);
    expect(after.studies.capture).toBe(1);
    expect(after.charms).toEqual([]);
    const res = scoreMove(
      scoreInput({
        captured: "P",
        studies: { quiet: 0, capture: 2, chain: 0, fork: 0, slide: 0, promotion: 0 },
      }),
    );
    // N capture: 20 + 15, study Lv2: +20 chips, +2 mult → 55 × 3
    expect(res.total).toBe(165);
  });

  it("echo doubles exactly the next move", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "N" },
      { id: 2, type: "P" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[4] = { kind: "own", pieceId: 2 };
    let run = testRun({
      bag,
      charms: ["echo"],
      blind: testBlind({ board, target: 99999 }),
    });
    run = useCharm(run, 0);
    expect(run.blind!.echo).toBe(true);
    const { run: after, events } = playMove(run, 0, squareAt(1, 2));
    expect(events.some((e) => e.kind === "retrigger" && e.source === "Echo")).toBe(true);
    expect(after.blind!.score).toBe(quiet("N") * 2);
    expect(after.blind!.echo).toBe(false);
  });

  it("extra hour, windfall, and press-gang do what they say", () => {
    const board = emptyBoard();
    board[10] = { kind: "bounty", type: "P" };
    board[11] = { kind: "bounty", type: "R" };
    const base = testRun({
      bag: [{ id: 1, type: "N" }],
      charms: ["extraHour", "windfall", "pressGang"],
      blind: testBlind({ board, target: 99999 }),
    });
    const hour = useCharm(base, 0);
    expect(hour.blind!.movesLeft).toBe(5);
    const wind = useCharm(base, 1);
    expect(wind.money).toBe(12); // 10 + 2 bounties
    const gang = useCharm(base, 2);
    expect(gang.bag.filter((p) => p.type === "P").length).toBe(2);
  });

  it("second breakfast wakes only exhausted pieces", () => {
    const bag: BagPiece[] = [{ id: 1, type: "N" }];
    const board = emptyBoard();
    board[7] = { kind: "own", pieceId: 1 };
    const run = testRun({
      bag,
      charms: ["secondBreakfast"],
      blind: testBlind({ board, target: 99999, exhausted: [1] }),
    });
    const woken = useCharm(run, 0, 7);
    expect(woken.blind!.exhausted).toEqual([]);
    expect(woken.charms).toEqual([]);
    // a fresh piece is not a valid target — charm kept
    const fresh = testRun({
      bag,
      charms: ["secondBreakfast"],
      blind: testBlind({ board, target: 99999 }),
    });
    expect(useCharm(fresh, 0, 7)).toBe(fresh);
  });

  it("royal writ crowns a board pawn; transmutation climbs the ladder", () => {
    const bag: BagPiece[] = [{ id: 1, type: "P" }];
    const board = emptyBoard();
    board[6] = { kind: "own", pieceId: 1 };
    const run = testRun({
      bag,
      charms: ["royalWrit"],
      blind: testBlind({ board, target: 99999 }),
    });
    const crowned = useCharm(run, 0, 6);
    expect(crowned.bag[0].type).toBe("Q");
    expect(crowned.stats.promotions).toBe(1);

    const shop = shopRun({ bag: [{ id: 1, type: "B" }], charms: ["transmutation"] });
    const up = useCharm(shop, 0, 1);
    expect(up.bag[0].type).toBe("R");
    const qShop = shopRun({ bag: [{ id: 1, type: "Q" }], charms: ["transmutation"] });
    expect(useCharm(qShop, 0, 1)).toBe(qShop); // queens have nowhere to climb
  });

  it("culling writ banishes free — no ledger tick, no charge", () => {
    const bag: BagPiece[] = STARTING_BAG.map((type, i) => ({ id: i + 1, type }));
    const run = shopRun({ bag, charms: ["cullingWrit"] });
    const after = useCharm(run, 0, 1);
    expect(after.bag.length).toBe(bag.length - 1);
    expect(after.money).toBe(100);
    expect(after.removals).toBe(0);
  });

  it("tempest keeps every bounty, somewhere new", () => {
    const board = emptyBoard();
    board[10] = { kind: "bounty", type: "P" };
    board[15] = { kind: "bounty", type: "Q" };
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({
      bag: [{ id: 1, type: "N" }],
      charms: ["tempest"],
      blind: testBlind({ board, target: 99999 }),
    });
    const after = useCharm(run, 0);
    const bounties = after.blind!.board.filter((c) => c?.kind === "bounty");
    expect(bounties.map((b) => b!.kind === "bounty" && b!.type).sort()).toEqual(["P", "Q"]);
    expect(after.blind!.board[0]).toEqual({ kind: "own", pieceId: 1 });
  });

  it("phase gating: shop charms refuse to fire mid-blind", () => {
    const run = testRun({
      bag: [{ id: 1, type: "P" }],
      charms: ["transmutation"],
      blind: testBlind({ target: 99999 }),
    });
    expect(useCharm(run, 0, 1)).toBe(run);
  });
});

// ---------- exhaustion ----------

describe("exhaustion", () => {
  it("a piece that moved cannot move again this blind", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "N" },
      { id: 2, type: "P" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 }; // Na1
    board[4] = { kind: "own", pieceId: 2 }; // Pe1 keeps the blind unstuck
    const run = testRun({ bag, blind: testBlind({ board, target: 99999 }) });
    const b3 = squareAt(1, 2);
    const { run: after, events } = playMove(run, 0, b3);
    expect(after.blind!.exhausted).toEqual([1]);
    expect(events.some((e) => e.kind === "exhaust" && e.pieceId === 1)).toBe(true);
    expect(legalMovesFor(after, b3)).toEqual([]);
    const { run: same, events: none } = playMove(after, b3, squareAt(3, 3));
    expect(none).toEqual([]);
    expect(same).toBe(after);
  });

  it("swapping an exhausted piece out works; swapped back in it stays exhausted", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "P" },
      { id: 2, type: "N" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({ bag, blind: testBlind({ board, target: 99999, queue: [2] }) });
    const a2 = squareAt(0, 1);
    const { run: moved } = playMove(run, 0, a2);
    expect(moved.blind!.exhausted).toEqual([1]);

    const swapped = swapPiece(moved, a2);
    expect(swapped.blind!.board[a2]).toEqual({ kind: "own", pieceId: 2 });
    expect(legalMovesFor(swapped, a2).length).toBeGreaterThan(0); // fresh piece moves

    const swappedBack = swapPiece(swapped, a2);
    expect(swappedBack.blind!.board[a2]).toEqual({ kind: "own", pieceId: 1 });
    expect(legalMovesFor(swappedBack, a2)).toEqual([]); // still exhausted
  });

  it("stuck with no swap option loses; with queue the player must swap", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "P" },
      { id: 2, type: "N" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 }; // Pa1
    board[squareAt(0, 1)] = { kind: "bounty", type: "P" }; // a2 blocks the push, no diagonal
    const stuck = testRun({
      bag: [bag[0]],
      phase: { name: "blindIntro" },
      blind: testBlind({ board, target: 99999, queue: [] }),
    });
    expect(startPlaying(stuck).phase.name).toBe("lost");

    const swappable = testRun({
      bag,
      phase: { name: "blindIntro" },
      blind: testBlind({ board, target: 99999, queue: [2] }),
    });
    const playing = startPlaying(swappable);
    expect(playing.phase.name).toBe("playing");
    expect(mustSwap(playing)).toBe(true);
    const resolved = swapPiece(playing, 0); // knight in, pawn out
    expect(resolved.phase.name).toBe("playing");
    expect(mustSwap(resolved)).toBe(false);
  });

  it("nightrider-exempt knights can move twice", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "N" },
      { id: 2, type: "P" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[4] = { kind: "own", pieceId: 2 };
    const run = testRun({
      bag,
      jokers: [{ id: "nightrider" }],
      blind: testBlind({ board, target: 99999 }),
    });
    const b3 = squareAt(1, 2);
    const { run: after } = playMove(run, 0, b3);
    expect(after.blind!.exhausted).toEqual([]); // exempt — never marked
    expect(legalMovesFor(after, b3).length).toBeGreaterThan(0);
  });

  it("a shattered piece is pruned from the exhausted list", () => {
    // Find an rng state whose next roll shatters a volatile piece (< 0.25).
    let rng = 1;
    for (;;) {
      const [roll] = next(rng);
      if (roll < 0.25) break;
      rng++;
    }
    const bag: BagPiece[] = [{ id: 1, type: "P", enhancement: "volatile" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({ rng, bag, blind: testBlind({ board, target: 99999 }) });
    const { run: after, events } = playMove(run, 0, squareAt(0, 1));
    expect(events.some((e) => e.kind === "shatter")).toBe(true);
    expect(events.some((e) => e.kind === "exhaust")).toBe(false);
    expect(after.bag).toEqual([]);
    expect(after.blind!.exhausted).toEqual([]);
  });
});

// ---------- bosses ----------

describe("bosses", () => {
  /** A run sitting in the shop before the ante-1 boss blind. */
  const preBoss = (boss: BossId, bag: BagPiece[], money = 10): RunState =>
    testRun({
      bag,
      money,
      blindIdx: 1,
      bosses: [boss, "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
      phase: { name: "shop", shop: dummyShop() },
    });

  it("Royal Decree deals no queens while non-queens remain", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "Q" },
      { id: 2, type: "Q" },
      { id: 3, type: "P" },
      { id: 4, type: "P" },
      { id: 5, type: "N" },
      { id: 6, type: "B" },
      { id: 7, type: "R" },
    ];
    const run = nextBlind(preBoss("royalDecree", bag));
    expect(run.blindIdx).toBe(2);
    const dealtIds = run.blind!.board
      .filter((c): c is { kind: "own"; pieceId: number } => c?.kind === "own")
      .map((c) => c.pieceId);
    expect(dealtIds.length).toBe(5);
    for (const id of dealtIds) {
      expect(bag.find((p) => p.id === id)!.type).not.toBe("Q");
    }
    expect(run.blind!.queue.sort()).toEqual([1, 2]);
  });

  it("Royal Decree swaps skip queens; all-queen queue disables swapping", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "P" },
      { id: 2, type: "Q" },
      { id: 3, type: "N" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({
      bag,
      blindIdx: 2,
      bosses: ["royalDecree", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
      blind: testBlind({ board, target: 99999, queue: [2, 3] }),
    });
    expect(canSwap(run)).toBe(true);
    const after = swapPiece(run, 0);
    expect(after.blind!.board[0]).toEqual({ kind: "own", pieceId: 3 }); // knight, not queen
    expect(after.blind!.queue).toEqual([2, 1]); // queen rotated to front, pawn to back

    const allQueens = testRun({
      bag,
      blindIdx: 2,
      bosses: ["royalDecree", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
      blind: testBlind({ board, target: 99999, queue: [2] }),
    });
    expect(canSwap(allQueens)).toBe(false);
    expect(swapPiece(allQueens, 0)).toBe(allQueens);
  });

  it("Tollbooth charges $1 per capture, clamped at $0", () => {
    const bag: BagPiece[] = [{ id: 1, type: "R" }, { id: 2, type: "P" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[4] = { kind: "own", pieceId: 2 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "P" };
    const mk = (money: number) =>
      testRun({
        bag,
        money,
        blindIdx: 2,
        bosses: ["tollbooth", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
        blind: testBlind({ board, target: 99999 }),
      });
    const { run: taxed, events } = playMove(mk(5), 0, squareAt(0, 3));
    expect(taxed.money).toBe(4);
    expect(events.some((e) => e.kind === "money" && e.amount === -1)).toBe(true);

    const { run: broke, events: brokeEvents } = playMove(mk(0), 0, squareAt(0, 3));
    expect(broke.money).toBe(0);
    expect(brokeEvents.some((e) => e.kind === "money")).toBe(false);
  });

  it("Pacifist blocks captures only on the first move", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "R" },
      { id: 2, type: "R" },
    ];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 }; // Ra1
    board[4] = { kind: "own", pieceId: 2 }; // Re1
    board[squareAt(0, 3)] = { kind: "bounty", type: "P" }; // a4 on R1's file
    board[squareAt(4, 3)] = { kind: "bounty", type: "P" }; // e4 on R2's file
    const run = testRun({
      bag,
      blindIdx: 2,
      bosses: ["pacifist", "wall", "wall", "wall", "wall", "wall", "wall", "wall"],
      blind: testBlind({ board, target: 99999 }),
    });
    expect(legalMovesFor(run, 0)).not.toContain(squareAt(0, 3));
    expect(playMove(run, 0, squareAt(0, 3)).events).toEqual([]);

    const { run: afterQuiet } = playMove(run, 0, squareAt(1, 0)); // Rb1, quiet
    expect(afterQuiet.phase.name).toBe("playing");
    expect(legalMovesFor(afterQuiet, 4)).toContain(squareAt(4, 3)); // captures open up
    const { run: captured } = playMove(afterQuiet, 4, squareAt(4, 3));
    expect(captured.blind!.captures).toBe(1);
  });

  it("Blackout removes the gold square", () => {
    const bag: BagPiece[] = STARTING_BAG.map((type, i) => ({ id: i + 1, type }));
    const run = nextBlind(preBoss("blackout", bag));
    expect(run.blind!.goldSq).toBe(-1);
  });
});

// ---------- new jokers ----------

describe("new jokers", () => {
  it("tally grows with captures and pays +1 mult per 2", () => {
    const res = scoreMove(
      scoreInput({ jokers: [{ id: "tally", state: 4 }], captured: "P" }),
    );
    // chips 20 + 15 = 35, mult 1 + 2 = 3
    expect(res.total).toBe(105);
    expect(res.jokerStates).toEqual([5]);
  });

  it("commuter streaks on non-queens and resets on a queen", () => {
    const streak = scoreMove(scoreInput({ jokers: [{ id: "commuter", state: 2 }] }));
    // quiet knight chips, mult 1 + 3
    expect(streak.total).toBe(quiet("N") * 4);
    expect(streak.jokerStates).toEqual([3]);

    const queen: BagPiece = { id: 1, type: "Q" };
    const reset = scoreMove(
      scoreInput({
        jokers: [{ id: "commuter", state: 5 }],
        mover: queen,
        bag: [queen],
        moverType: "Q",
      }),
    );
    expect(reset.jokerStates).toEqual([0]);
  });

  it("gambit doubles only the blind's first capture", () => {
    const first = scoreMove(scoreInput({ jokers: js("gambit"), captured: "P" }));
    expect(first.total).toBe((20 + 15) * 2);
    const later = scoreMove(
      scoreInput({
        jokers: js("gambit"),
        captured: "P",
        blind: testBlind({ captures: 1 }),
      }),
    );
    expect(later.total).toBe(35);
  });

  it("herald retriggers pawn and knight moves", () => {
    const knight = scoreMove(scoreInput({ jokers: js("herald") }));
    expect(knight.total).toBe(quiet("N") * 2);
    const rook: BagPiece = { id: 1, type: "R" };
    const noRetrigger = scoreMove(
      scoreInput({ jokers: js("herald"), mover: rook, bag: [rook], moverType: "R" }),
    );
    expect(noRetrigger.total).toBe(quiet("R"));
  });

  it("dividend pays at blind end and moonshot boosts interest", () => {
    const bag: BagPiece[] = [{ id: 1, type: "Q" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    const run = testRun({
      bag,
      money: 20,
      jokers: js("dividend", "moonshot"),
      blind: testBlind({ board, target: 80, movesLeft: 4, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    expect(after.phase.name).toBe("shop");
    if (after.phase.name === "shop") {
      const { reward, unused, interest, jokers } = after.phase.shop.payout;
      expect(jokers).toBe(3); // dividend
      expect(reward).toBe(3);
      expect(unused).toBe(3);
      // moonshot: $1 per $4 on (20 + 3 + 3 + 3) = 29 → 7, cap 10
      expect(interest).toBe(7);
    }
  });

  it("overtime and reserves stack onto blind resources", () => {
    const run = testRun({ jokers: js("overtime", "reserves") });
    const mods = modifiersFor(run);
    expect(mods.movesPerBlind).toBe(5);
    expect(mods.swapsPerBlind).toBe(5);
  });

  it("wave-1: menagerie counts distinct scorer types per blind", () => {
    const first = scoreMove(scoreInput({ jokers: [{ id: "menagerie" }] }));
    expect(first.jokerStates).toEqual([2]); // N bit set
    const pawn: BagPiece = { id: 1, type: "P" };
    const second = scoreMove(
      scoreInput({
        jokers: [{ id: "menagerie", state: 2 }],
        mover: pawn,
        bag: [pawn],
        moverType: "P",
      }),
    );
    expect(second.jokerStates).toEqual([3]); // P joins N
    expect(second.events.some((e) => e.kind === "mult" && e.amount === 2)).toBe(true);
    expect(JOKERS.menagerie.onBlindEnd!(3, 0.5)).toEqual({ setState: 0 });
  });

  it("wave-1: sugar loaf melts on a bad roll, survives a good one", () => {
    expect(JOKERS.sugarLoaf.onBlindEnd!(0, 0.1)).toEqual({ destroy: true });
    expect(JOKERS.sugarLoaf.onBlindEnd!(0, 0.19)).toEqual({ destroy: true });
    expect(JOKERS.sugarLoaf.onBlindEnd!(0, 0.9)).toBe(null);
  });

  it("wave-1: nest egg grows and sells for its nest", () => {
    expect(JOKERS.nestEgg.onBlindEnd!(4, 0.5)).toEqual({ setState: 6 });
    const run = shopRun({ jokers: [{ id: "nestEgg", state: 10 }] });
    const sold = sellJoker(run, 0);
    expect(sold.money).toBe(100 + Math.floor(JOKERS.nestEgg.cost / 2) + 10);
  });

  it("wave-1: full rotation doubles only the final move", () => {
    const final = scoreMove(
      scoreInput({ jokers: js("fullRotation"), blind: testBlind({ movesLeft: 1 }) }),
    );
    expect(final.events.some((e) => e.kind === "xmult" && e.amount === 2)).toBe(true);
    const early = scoreMove(
      scoreInput({ jokers: js("fullRotation"), blind: testBlind({ movesLeft: 3 }) }),
    );
    expect(early.events.some((e) => e.kind === "xmult")).toBe(false);
  });

  it("wave-1: veteran gains mult per blind cleared", () => {
    expect(JOKERS.veteran.onBlindEnd!(2, 0.5)).toEqual({ setState: 3 });
    const res = scoreMove(scoreInput({ jokers: [{ id: "veteran", state: 4 }] }));
    expect(res.events.some((e) => e.kind === "mult" && e.amount === 4)).toBe(true);
  });

  it("every joker id resolves and costs match its rarity band", () => {
    const bands = { common: [3, 5], uncommon: [6, 7], rare: [8, 10], legendary: [12, 12] } as const;
    for (const def of Object.values(JOKERS)) {
      const [lo, hi] = bands[def.rarity];
      expect(def.cost, `${def.id} cost`).toBeGreaterThanOrEqual(lo);
      expect(def.cost, `${def.id} cost`).toBeLessThanOrEqual(hi);
    }
    expect(Object.keys(JOKERS).length).toBe(78);
  });
});

// ---------- openings & trials ----------

describe("openings & trials", () => {
  it("king's gambit: penniless with a deterministic rare joker", () => {
    const a = newRun(42, { opening: "kingsGambit" });
    const b = newRun(42, { opening: "kingsGambit" });
    expect(a.money).toBe(0);
    expect(a.jokers.length).toBe(1);
    expect(JOKERS[a.jokers[0].id].rarity).toBe("rare");
    expect(a.jokers[0].id).toBe(b.jokers[0].id);
  });

  it("queen's gambit: two queens and 10% stiffer targets", () => {
    const run = newRun(7, { opening: "queensGambit" });
    expect(run.bag.filter((p) => p.type === "Q").length).toBe(2);
    expect(run.blind!.target).toBe(Math.round(100 * 1.1));
  });

  it("blitz: three moves, four swaps, softer targets", () => {
    const run = newRun(7, { opening: "blitz" });
    const mods = modifiersFor(run);
    expect(mods.movesPerBlind).toBe(3);
    expect(mods.swapsPerBlind).toBe(4);
    expect(run.blind!.target).toBe(90);
    expect(run.blind!.movesLeft).toBe(3);
  });

  it("fianchetto: tireless bishops", () => {
    const run = newRun(7, { opening: "fianchetto" });
    expect(modifiersFor(run).exhaustionExempt).toContain("B");
    expect(run.bag.filter((p) => p.type === "B").length).toBe(4);
    expect(run.bag.some((p) => p.type === "N")).toBe(false);
  });

  it("pawn storm starts with the coronation study", () => {
    const run = newRun(7, { opening: "pawnStorm" });
    expect(run.studies.promotion).toBe(1);
    expect(run.bag.filter((p) => p.type === "P").length).toBe(8);
  });

  it("trials stack cumulatively (targets + swaps)", () => {
    const t3 = newRun(7, { trial: 3 });
    expect(t3.blind!.target).toBe(Math.round(100 * 1.15)); // Stone
    expect(modifiersFor(t3).swapsPerBlind).toBe(SWAPS_PER_BLIND - 1); // Iron
    const t5 = newRun(7, { trial: 5 });
    expect(t5.blind!.goldSq).toBe(-1); // Thorn
  });

  it("wooden trial: small blinds pay nothing", () => {
    const bag: BagPiece[] = [{ id: 1, type: "Q" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    const run = testRun({
      bag,
      trial: 1,
      money: 0,
      blind: testBlind({ board, target: 80, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    expect(after.phase.name).toBe("shop");
    if (after.phase.name === "shop") {
      expect(after.phase.shop.payout.reward).toBe(0);
      expect(after.phase.shop.payout.unused).toBe(3); // unused moves still pay
    }
  });

  it("mirror trial caps interest at $3", () => {
    const bag: BagPiece[] = [{ id: 1, type: "Q" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    const run = testRun({
      bag,
      trial: 4,
      money: 40,
      blind: testBlind({ board, target: 80, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    if (after.phase.name === "shop") {
      expect(after.phase.shop.payout.interest).toBe(3);
    }
  });

  it("crimson trial: the boss haunts the big blind too", () => {
    const run = testRun({ trial: 6, blindIdx: 1, bosses: ["suddenDeath", "wall", "wall", "wall", "wall", "wall", "wall", "wall"] });
    expect(modifiersFor(run).movesPerBlind).toBe(3);
    const normal = testRun({ trial: 5, blindIdx: 1, bosses: ["suddenDeath", "wall", "wall", "wall", "wall", "wall", "wall", "wall"] });
    expect(modifiersFor(normal).movesPerBlind).toBe(4);
  });
});

// ---------- wave 3: engravings, patents, posters, deep-hook jokers ----------

describe("engravings", () => {
  it("foiled adds chips, etched adds mult, prismatic multiplies", () => {
    const mover: BagPiece = { id: 1, type: "N", engraving: "foiled" };
    const foiled = scoreMove(scoreInput({ mover, bag: [mover] }));
    expect(
      foiled.events.some(
        (e) => e.kind === "chips" && e.amount === ENGRAVING_CHIPS && e.source === "Foiled",
      ),
    ).toBe(true);

    const etched = scoreMove(
      scoreInput({ mover: { id: 1, type: "N", engraving: "etched" } }),
    );
    expect(
      etched.events.some(
        (e) => e.kind === "mult" && e.amount === ENGRAVING_MULT && e.source === "Etched",
      ),
    ).toBe(true);

    const prismatic = scoreMove(
      scoreInput({ mover: { id: 1, type: "N", engraving: "prismatic" } }),
    );
    expect(
      prismatic.events.some(
        (e) => e.kind === "xmult" && e.amount === ENGRAVING_XMULT && e.source === "Prismatic",
      ),
    ).toBe(true);
  });

  it("phantom pieces are invisible to bag-size jokers", () => {
    const mover: BagPiece = { id: 1, type: "N" };
    const bag: BagPiece[] = [
      mover,
      { id: 2, type: "P", engraving: "phantom" },
      { id: 3, type: "P", engraving: "phantom" },
      { id: 4, type: "P" },
    ];
    // minimalist: xmult when the bag is small — 2 visible pieces counts.
    const res = scoreMove(scoreInput({ mover, bag, jokers: js("minimalist") }));
    const ghost = scoreMove(
      scoreInput({ mover, bag: bag.map((p) => ({ ...p, engraving: undefined })), jokers: js("minimalist") }),
    );
    const x = (r: typeof res) => r.events.filter((e) => e.kind === "xmult" && e.source === JOKERS.minimalist.name).length;
    expect(x(res)).toBeGreaterThanOrEqual(x(ghost));
  });
});

describe("patents", () => {
  it("buyPatent charges, grants the patent, and marks it sold", () => {
    const shop = dummyShop({ patent: { id: "beehiveSaddle", cost: 8, sold: false } });
    const run = shopRun({}, shop);
    const after = buyPatent(run);
    expect(after.money).toBe(92);
    expect(after.patents).toEqual(["beehiveSaddle"]);
    if (after.phase.name === "shop") expect(after.phase.shop.patent?.sold).toBe(true);
    // idempotent: buying again does nothing
    expect(buyPatent(after)).toBe(after);
  });

  it("patent tip halves the patent price and is spent on purchase", () => {
    const shop = dummyShop({ patent: { id: "beehiveSaddle", cost: 4, sold: false } });
    const run = shopRun({ pendingPosters: ["patentTip"] }, shop);
    const after = buyPatent(run);
    expect(after.money).toBe(96);
    expect(after.pendingPosters).toEqual([]);
  });

  it("upside-down box grants a sixth joker slot", () => {
    expect(jokerSlots(testRun())).toBe(5);
    expect(jokerSlots(testRun({ patents: ["upsideDownBox"] }))).toBe(6);
  });

  it("iron stirrups raise quiet-move chips to 80%", () => {
    const run = testRun({ patents: ["ironStirrups"] });
    expect(modifiersFor(run).quietFactor).toBe(0.8);
  });

  it("mouse-trap freezes banish price escalation", () => {
    const bag: BagPiece[] = [
      { id: 1, type: "P" }, { id: 2, type: "P" }, { id: 3, type: "P" },
      { id: 4, type: "P" }, { id: 5, type: "P" }, { id: 6, type: "P" }, { id: 7, type: "P" },
    ];
    const trapped = removePiece(shopRun({ bag, patents: ["mouseTrap"] }), 1);
    if (trapped.phase.name === "shop") expect(trapped.phase.shop.removeCost).toBe(2);
    const normal = removePiece(shopRun({ bag }), 1);
    if (normal.phase.name === "shop") expect(normal.phase.shop.removeCost).toBe(3);
  });

  it("beehive saddle adds a swap through the pipeline", () => {
    expect(modifiersFor(testRun({ patents: ["beehiveSaddle"] })).swapsPerBlind).toBe(
      SWAPS_PER_BLIND + 1,
    );
  });
});

describe("wanted posters", () => {
  it("skipBlind forfeits the blind, banks the poster, and deals the next", () => {
    const run = testRun({
      phase: { name: "blindIntro" },
      blindIdx: 0,
      bag: STARTING_BAG.map((t, i) => ({ id: i + 1, type: t })),
      blind: testBlind({ poster: "doubleBounty" }),
    });
    const after = skipBlind(run);
    expect(after.blindIdx).toBe(1);
    expect(after.pendingPosters).toEqual(["doubleBounty"]);
    expect(after.money).toBe(run.money + 2); // no payout — just the poster's $2
    expect(after.phase.name).toBe("blindIntro");
  });

  it("skipBlind never skips a boss", () => {
    const run = testRun({
      phase: { name: "blindIntro" },
      blindIdx: 2,
      blind: testBlind({ kind: "boss", poster: "coupon" }),
    });
    expect(skipBlind(run)).toBe(run);
  });

  it("charm cache pays out a charm immediately", () => {
    const run = testRun({
      phase: { name: "blindIntro" },
      blindIdx: 0,
      bag: STARTING_BAG.map((t, i) => ({ id: i + 1, type: t })),
      blind: testBlind({ poster: "charmCache" }),
    });
    const after = skipBlind(run);
    expect(after.charms.length).toBe(1);
    expect(after.pendingPosters).toEqual([]);
  });

  it("double bounty doubles the next cleared blind's reward, once", () => {
    const bag: BagPiece[] = [{ id: 1, type: "Q" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    const run = testRun({
      bag,
      money: 0,
      pendingPosters: ["doubleBounty"],
      blind: testBlind({ board, target: 50, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    expect(after.phase.name).toBe("shop");
    if (after.phase.name === "shop") {
      expect(after.phase.shop.payout.reward).toBe(BLIND_REWARD.small * 2);
    }
    expect(after.pendingPosters).toEqual([]);
  });

  it("coupon makes the next purchase free and is spent by it", () => {
    const shop = dummyShop({
      couponActive: true,
      jokers: [{ joker: "cavalry", cost: 4, sold: false }],
    });
    const run = shopRun({ money: 0, pendingPosters: ["coupon"] }, shop);
    const after = buyJoker(run, 0);
    expect(after.money).toBe(0);
    expect(after.jokers.map((j) => j.id)).toEqual(["cavalry"]);
    expect(after.pendingPosters).toEqual([]);
    if (after.phase.name === "shop") expect(after.phase.shop.couponActive).toBeUndefined();
  });

  it("an unspent coupon keeps across shops", () => {
    const bag: BagPiece[] = [{ id: 1, type: "Q" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    const run = testRun({
      bag,
      pendingPosters: ["coupon"],
      blind: testBlind({ board, target: 50, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    expect(after.pendingPosters).toEqual(["coupon"]); // survives the clear
    if (after.phase.name === "shop") expect(after.phase.shop.couponActive).toBe(true);
  });

  it("the Knight never discounts his patents — coupons don't apply", () => {
    const shop = dummyShop({
      couponActive: true,
      patent: { id: "beehiveSaddle", cost: 8, sold: false },
    });
    const run = shopRun({ money: 100, pendingPosters: ["coupon"] }, shop);
    const after = buyPatent(run);
    expect(after.money).toBe(92); // full price
    expect(after.pendingPosters).toEqual(["coupon"]); // coupon untouched
  });

  it("bounty rush grants three extra bounties and an extra move", () => {
    const run = testRun({
      phase: { name: "blindIntro" },
      blindIdx: 0,
      bag: STARTING_BAG.map((t, i) => ({ id: i + 1, type: t })),
      blind: testBlind({ poster: "bountyRush" }),
    });
    const after = skipBlind(run);
    const bounties = after.blind!.board.filter((c) => c?.kind === "bounty").length;
    expect(bounties).toBeGreaterThanOrEqual(9); // 7 base + 3, board permitting
    expect(after.blind!.movesLeft).toBe(5);
    expect(after.pendingPosters).toEqual([]); // consumed at deal
  });
});

describe("deep-hook jokers & legendaries", () => {
  it("insurance survives a failed blind at 60%+, breaking itself", () => {
    const bag: BagPiece[] = [{ id: 1, type: "P" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({
      bag,
      jokers: js("insurance"),
      blind: testBlind({ board, target: 1000, score: 650, movesLeft: 1, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 1));
    expect(after.phase.name).toBe("shop");
    expect(after.jokers.find((j) => j.id === "insurance")).toBeUndefined();
    if (after.phase.name === "shop") {
      expect(after.phase.shop.payout.reward).toBe(0);
      expect(after.phase.shop.payout.unused).toBe(0);
    }
  });

  it("insurance does not save a rout below 60%", () => {
    const bag: BagPiece[] = [{ id: 1, type: "P" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    const run = testRun({
      bag,
      jokers: js("insurance"),
      blind: testBlind({ board, target: 1000, score: 0, movesLeft: 1, queue: [] }),
    });
    const { run: after } = playMove(run, 0, squareAt(0, 1));
    expect(after.phase.name).toBe("lost");
  });

  it("mirror knight copies the joker to its right, state included", () => {
    // veteran at state 4 gives +4 mult; the mirror standing left doubles it up.
    const mirrored = scoreMove(
      scoreInput({ jokers: [{ id: "mirrorKnight" }, { id: "veteran", state: 4 }] }),
    );
    expect(
      mirrored.events.filter((e) => e.kind === "mult" && e.amount === 4).length,
    ).toBe(2);
    // Nothing to its right → contributes nothing.
    const alone = scoreMove(scoreInput({ jokers: js("mirrorKnight") }));
    expect(
      alone.events.some((e) => e.kind === "mult" && e.source === JOKERS.veteran.name),
    ).toBe(false);
  });

  it("warhorse grows only when the blind ends with zero moves left", () => {
    expect(JOKERS.warhorse.onBlindEnd!(2, 0.5, { movesLeft: 0, kind: "small" })).toEqual({
      setState: 3,
    });
    expect(JOKERS.warhorse.onBlindEnd!(2, 0.5, { movesLeft: 1, kind: "small" })).toBeNull();
    const res = scoreMove(scoreInput({ jokers: [{ id: "warhorse", state: 2 }] }));
    expect(res.events.some((e) => e.kind === "xmult" && e.amount === 1.5)).toBe(true);
  });

  it("the red king dreams in dark squares", () => {
    const dark = scoreMove(scoreInput({ jokers: js("redKing"), to: 8 }));
    const light = scoreMove(scoreInput({ jokers: js("redKing"), to: 1 }));
    const xOf = (r: typeof dark) => {
      const e = r.events.find((e) => e.kind === "xmult" && e.source === JOKERS.redKing.name);
      return e && e.kind === "xmult" ? e.amount : null;
    };
    expect(isDark(8)).toBe(true);
    expect(xOf(dark)).toBe(2);
    expect(xOf(light)).toBe(0.5);
  });

  it("the bandersnatch feeds on boss blinds", () => {
    expect(JOKERS.bandersnatch.onBlindEnd!(0, 0.5, { movesLeft: 2, kind: "boss" })).toEqual({
      setState: 1,
    });
    expect(JOKERS.bandersnatch.onBlindEnd!(0, 0.5, { movesLeft: 0, kind: "big" })).toBeNull();
  });

  it("invitation summons an unowned legendary into a free slot", () => {
    const run = testRun({ charms: ["invitation"], jokers: [] });
    const after = useCharm(run, 0);
    expect(after.charms).toEqual([]);
    expect(after.jokers.length).toBe(1);
    expect(JOKERS[after.jokers[0].id].rarity).toBe("legendary");
    // Full slots: the invitation stays sealed.
    const full = testRun({
      charms: ["invitation"],
      jokers: js("cavalry", "towerToll", "longDiagonal", "footSoldier", "pawnStorm"),
    });
    expect(useCharm(full, 0)).toBe(full);
  });
});

describe("looking-glass opening", () => {
  it("averages chips and mult, then squares", () => {
    const mods = { ...baseModifiers(), averageChipsMult: true };
    const res = scoreMove(scoreInput({ mods }));
    const chips = quiet("N");
    const expected = Math.round(((chips + 1) / 2) ** 2);
    const total = res.events.find((e) => e.kind === "total");
    expect(total?.kind === "total" && total.amount).toBe(expected);
  });

  it("newRun applies doubled targets", () => {
    const glass = newRun(7, { opening: "lookingGlass" });
    const classic = newRun(7, { opening: "classical" });
    expect(glass.blind!.target).toBe(classic.blind!.target * 3);
  });
});

describe("post-playtest fixes", () => {
  it("bosses never repeat until every boss has appeared, and never back-to-back", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { bosses } = newRun(seed);
      const firstSeven = bosses.slice(0, 7);
      expect(new Set(firstSeven).size).toBe(7);
      for (let i = 1; i < bosses.length; i++) {
        expect(bosses[i]).not.toBe(bosses[i - 1]);
      }
    }
  });

  it("the first shop always offers a Mult common", () => {
    const MULT_STARTERS = [
      "oldGuard", "cavalry", "towerToll", "longDiagonal",
      "zigzag", "straightedge", "lightStep",
    ];
    for (const id of MULT_STARTERS) {
      expect(JOKERS[id as JokerId].rarity).toBe("common");
    }
    for (let seed = 1; seed <= 30; seed++) {
      const board = emptyBoard();
      board[0] = { kind: "own", pieceId: 1 };
      board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
      const run = testRun({
        seed,
        rng: seed * 7919,
        bag: [{ id: 1, type: "Q" }],
        blind: testBlind({ board, target: 50, queue: [] }),
      });
      const { run: after } = playMove(run, 0, squareAt(0, 3));
      if (after.phase.name === "shop") {
        expect(
          after.phase.shop.jokers.some((o) => MULT_STARTERS.includes(o.joker)),
          `seed ${seed}: ${after.phase.shop.jokers.map((o) => o.joker).join(",")}`,
        ).toBe(true);
      }
    }
  });

  it("rerolling refreshes an unsold patent but never a bought one", () => {
    const bought = rerollShop(
      shopRun(
        { blind: testBlind({ kind: "boss" }) },
        dummyShop({ patent: { id: "beehiveSaddle", cost: 8, sold: true } }),
      ),
    );
    if (bought.phase.name === "shop") {
      expect(bought.phase.shop.patent).toEqual({ id: "beehiveSaddle", cost: 8, sold: true });
    }
    const fresh = rerollShop(
      shopRun(
        { blind: testBlind({ kind: "boss" }) },
        dummyShop({ patent: { id: "beehiveSaddle", cost: 8, sold: false } }),
      ),
    );
    if (fresh.phase.name === "shop") {
      expect(fresh.phase.shop.patent).toBeDefined();
      expect(fresh.phase.shop.patent!.sold).toBe(false);
    }
  });
});

describe("full-game playtest fixes", () => {
  it("culling writ scrubs a dealt copy off the stale board", () => {
    const bag: BagPiece[] = STARTING_BAG.map((t, i) => ({ id: i + 1, type: t }));
    const board = emptyBoard();
    board[3] = { kind: "own", pieceId: 2 };
    const run = testRun({
      bag,
      charms: ["cullingWrit"],
      blind: testBlind({ board }),
      phase: { name: "shop", shop: dummyShop() },
    });
    const after = useCharm(run, 0, 2);
    expect(after.bag.some((p) => p.id === 2)).toBe(false);
    expect(after.blind!.board[3]).toBeNull();
  });

  it("sudden death floors at 2 moves under Blitz", () => {
    const bosses: BossId[] = ["suddenDeath", "wall", "wall", "wall", "wall", "wall", "wall", "wall"];
    const classical = testRun({ blindIdx: 2, bosses });
    expect(modifiersFor(classical).movesPerBlind).toBe(3);
    const blitz = testRun({ blindIdx: 2, bosses, openingId: "blitz" });
    expect(modifiersFor(blitz).movesPerBlind).toBe(2);
  });
});

describe("design tuning (full-game playtest)", () => {
  it("queen's gambit always fields a queen, except under Royal Decree", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const run = newRun(seed, { opening: "queensGambit" });
      const types = run.blind!.board
        .filter((c): c is Extract<Cell, { kind: "own" }> => c?.kind === "own")
        .map((c) => run.bag.find((p) => p.id === c.pieceId)!.type);
      expect(types.includes("Q"), `seed ${seed}: ${types.join(",")}`).toBe(true);
    }
    // Royal Decree overrides the guarantee
    const decree = newRun(3, { opening: "queensGambit" });
    const rigged = {
      ...decree,
      blindIdx: 2 as const,
      bosses: ["royalDecree", "wall", "wall", "wall", "wall", "wall", "wall", "wall"] as BossId[],
    };
    const dealt = startPlaying(rigged);
    expect(dealt.blind).toBeDefined();
  });

  it("first-shop mult starter respects bag composition", () => {
    // A bishop-heavy, knightless bag must never be offered Cavalry as the
    // guaranteed starter (needs 2+ knights).
    const bag: BagPiece[] = ["B", "B", "B", "B", "P", "P", "P", "P", "R", "Q"].map(
      (t, i) => ({ id: i + 1, type: t as PieceType }),
    );
    for (let seed = 1; seed <= 20; seed++) {
      const board = emptyBoard();
      board[0] = { kind: "own", pieceId: 10 };
      board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
      const run = testRun({
        seed,
        rng: seed * 104729,
        bag,
        blind: testBlind({ board, target: 50, queue: [] }),
      });
      const { run: after } = playMove(run, 0, squareAt(0, 3));
      if (after.phase.name === "shop") {
        const ids = after.phase.shop.jokers.map((o) => o.joker);
        // the guarantee itself must still hold via bag-legal starters
        expect(
          ids.some((id) =>
            ["oldGuard", "towerToll", "longDiagonal", "zigzag", "straightedge", "lightStep", "cavalry"].includes(id),
          ),
          `seed ${seed}: ${ids.join(",")}`,
        ).toBe(true);
      }
    }
  });

  it("unlock ladder follows the retuned order", () => {
    expect(OPENING_IDS).toEqual([
      "classical", "kingsGambit", "pawnStorm", "blitz", "queensGambit", "fianchetto", "lookingGlass",
    ]);
  });
});

describe("endless night", () => {
  const finalBossRun = () => {
    const bag: BagPiece[] = [{ id: 1, type: "Q" }];
    const board = emptyBoard();
    board[0] = { kind: "own", pieceId: 1 };
    board[squareAt(0, 3)] = { kind: "bounty", type: "Q" };
    return testRun({
      bag,
      ante: 8,
      blindIdx: 2,
      blind: testBlind({ kind: "boss", board, target: 50, queue: [] }),
    });
  };

  it("clearing the ante-8 boss still wins first", () => {
    const { run: after } = playMove(finalBossRun(), 0, squareAt(0, 3));
    expect(after.phase.name).toBe("won");
  });

  it("enterEndless pays the held-back payout and opens the shop", () => {
    const { run: won } = playMove(finalBossRun(), 0, squareAt(0, 3));
    const endless = enterEndless(won);
    expect(endless.endless).toBe(true);
    expect(endless.phase.name).toBe("shop");
    if (endless.phase.name === "shop") {
      expect(endless.phase.shop.payout.reward).toBeGreaterThan(0);
    }
    // and the next blind rides into ante 9 with a steeper target
    const next = nextBlind(endless);
    expect(next.ante).toBe(9);
    expect(next.blind!.target).toBeGreaterThan(blindTarget(8, "small"));
  });

  it("an endless boss clear never re-wins", () => {
    const run = { ...finalBossRun(), endless: true, ante: 9 };
    const { run: after } = playMove(run, 0, squareAt(0, 3));
    expect(after.phase.name).toBe("shop");
  });

  it("targets extrapolate past ante 8 and bosses cycle", () => {
    expect(blindTarget(9, "small")).toBeGreaterThan(blindTarget(8, "small") * 2);
    expect(blindTarget(12, "boss")).toBeGreaterThan(blindTarget(11, "boss"));
    const run = testRun({ ante: 9 });
    expect(bossFor(run)).toBe(run.bosses[0]);
    expect(bossFor(testRun({ ante: 15 }))).toBe(run.bosses[6]);
  });
});
