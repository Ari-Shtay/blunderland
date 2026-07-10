// Compact rules reference. Every number renders from constants.ts, so this
// screen can never drift out of sync with the actual balance.

import {
  BASE_CHIPS,
  CAPTURE_CHIPS,
  INTEREST_CAP,
  INTEREST_PER,
  JOKER_SLOTS,
  MOVES_PER_BLIND,
  REMOVE_COST,
  REROLL_COST,
  SWAPS_PER_BLIND,
} from "../engine/constants";
import type { PieceType } from "../engine/types";
import { PIECE_URI } from "./pieces";

const PIECE_ORDER: PieceType[] = ["P", "N", "B", "R", "Q"];
const PIECE_NAME: Record<PieceType, string> = {
  P: "Pawn",
  N: "Knight",
  B: "Bishop",
  R: "Rook",
  Q: "Queen",
};

export interface HowToPlayProps {
  onClose: () => void;
  onResetTips: () => void;
}

export function HowToPlay({ onClose, onResetTips }: HowToPlayProps) {
  return (
    <div class="overlay">
      <div class="howto panel">
        <h2>How to Play</h2>

        <section>
          <h3>The Deal</h3>
          <p>
            Clear each blind by reaching its score target in{" "}
            <b>{MOVES_PER_BLIND} moves</b>. A move scores its piece's chips, plus the
            captured bounty's chips, all <b>× your Mult</b>. Land on the gold or
            center square for bonus chips.
          </p>
        </section>

        <section>
          <h3>The Underdog Ladder</h3>
          <p>
            Weak pieces score high; strong pieces reach far. Quiet (non-capture)
            moves earn <b>half</b> the piece's chips: hunting the bounties is the
            job. While the White Knight is still teaching, every legal square shows
            what the move would score. After his lessons, the math is yours.
          </p>
          <div class="howto-pieces">
            <div class="howto-piece-row header">
              <span />
              <span>capturing</span>
              <span>as bounty</span>
            </div>
            {PIECE_ORDER.map((t) => (
              <div key={t} class="howto-piece-row">
                <span class="howto-piece-name">
                  <i style={{ backgroundImage: `url('${PIECE_URI["w" + t]}')` }} />
                  {PIECE_NAME[t]}
                </span>
                <span class="chips-num">+{BASE_CHIPS[t]}</span>
                <span class="chips-num">+{CAPTURE_CHIPS[t]}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3>Spent Pieces</h3>
          <p>
            A piece that moves is <b>spent</b> for the rest of the blind: it dims,
            can't move again, and still blocks squares. You get{" "}
            <b>{SWAPS_PER_BLIND} swaps</b> per blind to bench a piece for the next
            in your bag; the newcomer arrives fresh. Pawns that reach the far rank
            are crowned Queens.
          </p>
        </section>

        <section>
          <h3>Charms &amp; Studies</h3>
          <p>
            Charms are single-use trinkets (two pockets). Most work <b>mid-blind</b>:
            wake a spent piece, scatter the bounties, echo your next move, buy an
            extra hour. <b>Studies</b> level up a move pattern (Quiet, Hunt, Chains,
            Fork, Long Rides, Coronations), adding chips and Mult to every matching
            move, forever.
          </p>
        </section>

        <section>
          <h3>The Night Market</h3>
          <p>
            Jokers are your scoring engine: <b>{JOKER_SLOTS} slots</b>, rarer ones
            roll less often, and you can sell one back for half price. Rerolls start
            at ${REROLL_COST} and climb $1 each time (fresh price every shop).
            Banishing a piece starts at ${REMOVE_COST} and climbs $1 for the rest of
            the run. Every ${INTEREST_PER} you bank pays $1 interest (up to $
            {INTEREST_CAP}). Boss blinds bend the rules; the ante's boss is
            previewed in the sidebar from the start.
          </p>
        </section>

        <div class="howto-actions">
          <button class="btn ghost" onClick={onResetTips}>
            Replay tips
          </button>
          <button class="btn primary" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
