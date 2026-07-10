// First-time tips voiced by the White Knight — Through the Looking-Glass's
// kindly, blundering guide across the chessboard. Balatro-style: each tip
// fires once, in context, mid-run; dismissed tips never return.

import { BASE_CHIPS, INTEREST_PER, JOKER_SLOTS } from "../engine/constants";
import { rankOf } from "../engine/movegen";
import { mustSwap } from "../engine/run";
import type { PieceType, RunState, Square } from "../engine/types";

export type TipId =
  | "arrival"
  | "goal"
  | "boss"
  | "shop"
  | "mult"
  | "royalHabit"
  | "underdog"
  | "spent"
  | "promotion"
  | "swap";

export const TIP_TEXT: Record<TipId, string> = {
  arrival:
    "Oh! A visitor! I am the White Knight — I shall accompany you and fall off things so you needn't.",
  goal:
    "Four moves to reach the target. Each move scores its piece's chips — a capture adds the bounty's worth — all of it times your Mult. The glinting gold square and the center pay bonus chips.",
  boss:
    "A boss blind bends the rules — the red print says how. I post it on the left a whole ante ahead, so you can pack accordingly.",
  shop:
    `The Night Market! Jokers do the real scoring — ${JOKER_SLOTS} slots, and I'll buy one back at half price. Keep money banked: every $${INTEREST_PER} held pays $1 interest.`,
  mult:
    "One more market secret: every point is chips TIMES Mult, and blinds outgrow bare chips by the third ante. A Joker that pays Mult is not a luxury — never leave the early market without one.",
  royalHabit:
    `Woah, woah — steady! Her Majesty earns a mere ${BASE_CHIPS.Q} a move. See the little numbers? The humble folk are paid treble.`,
  underdog:
    `Mind the ladder: a pawn's strike earns ${BASE_CHIPS.P} chips, Her Majesty's a mere ${BASE_CHIPS.Q} — and quiet steps pay but half. The numbers on each square show true totals; I'll take the number-cards away once you've the knack.`,
  spent:
    "A piece that moves is spent until the next blind — it still blocks squares, mind. Four moves want four fresh pieces.",
  promotion:
    "The far rank crowns a pawn into a Queen — a grander steed, humbler chips.",
  swap:
    "Pick a piece to bench it for the next in your bag. The newcomer arrives fresh, even if the benched one was spent.",
};

/**
 * Where the knight travels to deliver each tip. null = stays at his dock,
 * no spotlight (the arrival cameo handles its own staging).
 */
export interface TipAnchor {
  selectors: string[];
  side?: "above";
  pad?: number;
}

export const TIP_ANCHORS: Record<TipId, TipAnchor | null> = {
  arrival: null,
  goal: { selectors: [".overlay .panel.intro"] },
  boss: { selectors: [".intro-boss-desc", ".hud-blind.boss"], pad: 14 },
  shop: { selectors: [".market-stalls .stall:first-child"] },
  mult: { selectors: [".market-stalls .stall:first-child"] },
  royalHabit: { selectors: [".board"] },
  underdog: { selectors: [".board"] },
  spent: { selectors: [".board"] },
  promotion: { selectors: [".board"] },
  swap: { selectors: [".stage-controls .btn:first-child"], side: "above", pad: 10 },
};

const KEY = "blunderland:tips:v1";

export function loadSeenTips(): Set<TipId> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set(JSON.parse(raw) as TipId[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

export function markTipSeen(id: TipId): void {
  try {
    const seen = loadSeenTips();
    seen.add(id);
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* ignore */
  }
}

export function resetTips(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export interface TipCtx {
  run: RunState;
  selected: Square | null;
  selectedType: PieceType | null;
  dests: Square[];
  swapMode: boolean;
  seen: Set<TipId>;
}

/** The single tip to show right now, if any — checked in priority order. */
export function activeTip(ctx: TipCtx): TipId | null {
  const { run, seen } = ctx;
  const phase = run.phase.name;
  const blind = run.blind;
  const check = (id: TipId, when: boolean) => (when && !seen.has(id) ? id : null);

  return (
    check("arrival", phase === "blindIntro") ??
    check("goal", phase === "blindIntro" && run.ante === 1 && run.blindIdx === 0) ??
    check("boss", phase === "blindIntro" && run.blindIdx === 2) ??
    check("shop", phase === "shop") ??
    check("mult", phase === "shop" && seen.has("shop")) ??
    check("royalHabit", phase === "playing" && ctx.selectedType === "Q") ??
    check(
      "underdog",
      phase === "playing" && ctx.selectedType !== null && ctx.selectedType !== "Q",
    ) ??
    check("spent", phase === "playing" && blind !== null && blind.exhausted.length > 0) ??
    check(
      "promotion",
      phase === "playing" &&
        ctx.selectedType === "P" &&
        ctx.dests.some((sq) => rankOf(sq) === 4),
    ) ??
    check(
      "swap",
      phase === "playing" &&
        blind !== null &&
        blind.swapsLeft > 0 &&
        blind.queue.length > 0 &&
        (ctx.swapMode ||
          mustSwap(run) ||
          (blind.movesLeft <= 2 && blind.exhausted.length > 0)),
    )
  );
}
