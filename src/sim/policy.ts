// Shop & charm policy for the sim bot. The core trick: a joker offer is
// valued by REPLAYING its onScore hook over the bot's recent real move
// contexts — every future joker is auto-evaluated with no hand tuning.
// Only non-onScore jokers get a small hand-scored fallback.

import { CHARMS } from "../engine/charms";
import { JOKERS } from "../engine/jokers";
import type { ScoreCtx } from "../engine/jokers";
import {
  buyCharm,
  buyEnhancement,
  buyJoker,
  buyPack,
  jokerSlots,
  removePiece,
  rerollShop,
  sellJoker,
  useCharm,
} from "../engine/run";
import type { CharmId, JokerId, PieceType, RunState } from "../engine/types";
import { bump, type Telemetry } from "./telemetry";

export interface RecordedMove {
  ctx: ScoreCtx;
  chips: number;
  mult: number;
  total: number;
}

const MONEY_WEIGHT = 3;
const EVAL_STATE = 3; // plausible mid-run counter for scaling jokers

/** Hand-scored values for jokers whose power isn't in onScore. */
const SPECIAL_JOKER_VALUE: Partial<Record<JokerId, (run: RunState) => number>> = {
  overtime: () => 30,
  reserves: () => 8,
  nightrider: (r) => (r.bag.filter((p) => p.type === "N").length >= 2 ? 16 : 6),
  perpetualMotion: (r) => (r.bag.some((p) => p.type === "Q") ? 14 : 2),
  herald: (r) =>
    r.bag.filter((p) => p.type === "P" || p.type === "N").length >= 4 ? 22 : 8,
  promotionFever: (r) => (r.bag.filter((p) => p.type === "P").length >= 4 ? 12 : 4),
  moonshot: () => 10,
  courtJester: () => 4,
  dividend: () => 10,
  nestEgg: () => 6,
  insurance: () => 12,
  mirrorKnight: (r) => (r.jokers.length >= 2 ? 18 : 4),
  warhorse: () => 14,
  redKing: () => 24,
  bandersnatch: () => 26,
};

export function jokerMarginalValue(
  id: JokerId,
  samples: RecordedMove[],
  run: RunState,
): number {
  const special = SPECIAL_JOKER_VALUE[id];
  if (special) return special(run);
  const def = JOKERS[id];
  if (!def.onScore || samples.length === 0) return 0;
  const avgChips = samples.reduce((a, s) => a + s.chips, 0) / samples.length;
  const avgMult = samples.reduce((a, s) => a + s.mult, 0) / samples.length;
  const avgTotal = samples.reduce((a, s) => a + s.total, 0) / samples.length;
  let sum = 0;
  for (const s of samples) {
    const c = def.onScore(s.ctx, EVAL_STATE);
    if (!c) continue;
    sum +=
      (c.chips ?? 0) * avgMult +
      (c.mult ?? 0) * avgChips +
      (c.xmult ? (c.xmult - 1) * avgTotal : 0) +
      (c.money ?? 0) * MONEY_WEIGHT;
  }
  return sum / samples.length;
}

/** Which piece type dominates the bag (drives pack/study/banish choices). */
function dominantType(run: RunState): PieceType {
  const counts = new Map<PieceType, number>();
  for (const p of run.bag) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  let best: PieceType = "P";
  let bestN = -1;
  for (const [t, n] of counts) {
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

const STUDY_FOR_TYPE: Record<PieceType, CharmId> = {
  P: "studyPromotion",
  N: "studyFork",
  B: "studySlide",
  R: "studySlide",
  Q: "studyCapture",
};

function moneyFloor(run: RunState): number {
  return Math.min(25, 5 * run.ante);
}

/** Play out a whole shop deterministically. */
export function doShop(run: RunState, samples: RecordedMove[], t?: Telemetry): RunState {
  let r = run;
  if (r.phase.name !== "shop") return r;
  if (t) t.moneyAtShop.push({ ante: r.ante, money: r.money });

  // 0. Use any held study charms immediately (pure upside).
  for (let guard = 0; guard < 4; guard++) {
    const i = r.charms.findIndex((id) => CHARMS[id].study);
    if (i < 0) break;
    const id = r.charms[i];
    const next = useCharm(r, i);
    if (next === r) break;
    if (t) bump(t.charmUsed, id);
    r = next;
  }

  const shopNow = () => (r.phase.name === "shop" ? r.phase.shop : null);

  // 1..4. Joker acquisition with up to 2 paid rerolls.
  for (let round = 0; round < 3; round++) {
    const shop = shopNow();
    if (!shop) break;
    for (let i = 0; i < shop.jokers.length; i++) {
      const offer = shop.jokers[i];
      if (offer.sold) continue;
      if (t) bump(t.jokerOffered, offer.joker);
      const value = jokerMarginalValue(offer.joker, samples, r);
      const threshold = offer.cost * 1.2;
      // Early antes may dip below the interest floor; later ones protect it.
      const canAfford =
        r.money >= offer.cost && (r.ante <= 2 || r.money - offer.cost >= moneyFloor(r) - 6);
      if (value < threshold || r.money < offer.cost) continue;
      // Sell the weakest owned joker if slots are full and this is a real upgrade.
      if (r.jokers.length >= jokerSlots(r)) {
        let weakest = -1;
        let weakestValue = Infinity;
        r.jokers.forEach((inst, idx) => {
          const v = jokerMarginalValue(inst.id, samples, r);
          if (v < weakestValue) {
            weakestValue = v;
            weakest = idx;
          }
        });
        if (weakest >= 0 && value > weakestValue * 1.5) {
          const soldId = r.jokers[weakest].id;
          const next = sellJoker(r, weakest);
          if (next !== r && t) bump(t.jokerSold, soldId);
          r = next;
        } else {
          continue;
        }
      }
      if (!canAfford) continue;
      const before = r;
      r = buyJoker(r, i);
      if (r !== before && t) {
        bump(t.jokerBought, offer.joker);
        const arr = t.jokerValueAtBuy.get(offer.joker) ?? [];
        arr.push(value);
        t.jokerValueAtBuy.set(offer.joker, arr);
      }
    }
    // Reroll if nothing was worth it and we're flush.
    const after = shopNow();
    if (!after) break;
    const unsoldValues = after.jokers
      .filter((o) => !o.sold)
      .map((o) => jokerMarginalValue(o.joker, samples, r));
    const worthIt = unsoldValues.some((v, idx) => v >= after.jokers[idx]?.cost * 1.2);
    const free = after.freeRerollsLeft > 0;
    if (worthIt) break;
    if (!free && r.money <= moneyFloor(r) + after.rerollCost + 4) break;
    const next = rerollShop(r);
    if (next === r) break;
    r = next;
  }

  // 5. Piece pack: buy the piece matching the dominant type when affordable.
  {
    const shop = shopNow();
    if (shop && !shop.pack.sold && r.money - shop.pack.cost > moneyFloor(r) - 8) {
      const dom = dominantType(r);
      let idx = shop.pack.choices.indexOf(dom);
      if (idx < 0) idx = 0;
      r = buyPack(r, idx);
    }
  }

  // 6. Enhancement: heavy → most frequent mover type's first piece; gilded → a pawn.
  {
    const shop = shopNow();
    if (shop && !shop.enhancement.sold && r.money - shop.enhancement.cost >= moneyFloor(r) - 5) {
      const kind = shop.enhancement.kind;
      let target = r.bag.find((p) => !p.enhancement && p.type === dominantType(r));
      if (kind === "gilded") target = r.bag.find((p) => !p.enhancement && p.type === "P") ?? target;
      if (kind === "volatile" && r.bag.length <= 9) target = undefined; // shatter risk
      if (target) r = buyEnhancement(r, target.id);
    }
  }

  // 7. Charm: studies matching the bag; cheap utility when flush.
  {
    const shop = shopNow();
    if (shop && !shop.charm.sold && r.charms.length < 2) {
      const def = CHARMS[shop.charm.id];
      const wantedStudy = STUDY_FOR_TYPE[dominantType(r)];
      const want =
        (def.study && (shop.charm.id === wantedStudy || r.money > moneyFloor(r) + 10)) ||
        ((def.id === "echo" || def.id === "extraHour") && r.money > moneyFloor(r) + 6);
      if (want && r.money >= shop.charm.cost) {
        const before = r;
        r = buyCharm(r);
        if (r !== before && t) bump(t.charmBought, def.id);
      }
    }
  }

  // Immediately consume any study we just bought.
  for (let guard = 0; guard < 2; guard++) {
    const i = r.charms.findIndex((id) => CHARMS[id].study);
    if (i < 0) break;
    const id = r.charms[i];
    const next = useCharm(r, i);
    if (next === r) break;
    if (t) bump(t.charmUsed, id);
    r = next;
  }

  // 8. Banish: thin one off-type piece when the bag is fat and money allows.
  {
    const shop = shopNow();
    if (shop && r.bag.length > 9 && r.money - shop.removeCost > moneyFloor(r)) {
      const dom = dominantType(r);
      const victim = r.bag.find((p) => p.type !== dom && p.type !== "Q" && !p.enhancement);
      if (victim) r = removePiece(r, victim.id);
    }
  }

  return r;
}
