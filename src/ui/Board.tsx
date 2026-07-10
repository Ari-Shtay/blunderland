// 5×5 board renderer. Pieces are absolutely positioned by transform so CSS
// transitions animate slides for free. Bounties are black, yours are white.

import { BOARD_SIZE } from "../engine/constants";
import { fileOf, isDark, rankOf, squareAt } from "../engine/movegen";
import type { BagPiece, BlindState, Modifiers, Square } from "../engine/types";
import { PIECE_URI } from "./pieces";
import type { Popup } from "./fx";

export interface BoardProps {
  blind: BlindState;
  bag: BagPiece[];
  mods: Modifiers;
  selected: Square | null;
  dests: Square[];
  /** Predicted move total per destination square (Into-the-Breach style). */
  previews: Record<Square, number>;
  swapMode: boolean;
  popups: Popup[];
  landedSq: Square | null;
  /** Square of the latest capture — spawns a particle burst. */
  burstSq: Square | null;
  onSquareClick: (sq: Square) => void;
}

/** Positions in the board's coordinate space (left/top of a 5-wide grid). */
const pct = (n: number) => `${n * 20}%`;
/** Translate offsets are relative to the piece's own 20%-wide box. */
const own = (n: number) => `${n * 100}%`;

export function Board(props: BoardProps) {
  const { blind, bag, mods, selected, dests, previews, swapMode, popups, landedSq, burstSq } =
    props;
  const size = mods.boardSize;
  const center = squareAt(Math.floor(size / 2), Math.floor(size / 2));

  const squares = [];
  for (let r = BOARD_SIZE - 1; r >= 0; r--) {
    for (let f = 0; f < BOARD_SIZE; f++) {
      const sq = squareAt(f, r);
      const oob = f >= size || r >= size;
      const classes = ["sq"];
      classes.push(isDark(sq) ? "dark" : "light");
      if (oob) classes.push("oob");
      if (sq === selected) classes.push("selected");
      if (sq === blind.goldSq && !oob) classes.push("gold");
      if (dests.includes(sq)) classes.push(blind.board[sq] ? "dest-capture" : "dest");
      squares.push(
        <div
          key={sq}
          class={classes.join(" ")}
          onClick={() => !oob && props.onSquareClick(sq)}
        >
          {sq === blind.goldSq && !oob && <span class="gold-coin">⛁</span>}
          {sq === center && !oob && <span class="center-mark">✦</span>}
          {dests.includes(sq) && previews[sq] !== undefined && (
            <span class="dest-score">{previews[sq]}</span>
          )}
          {f === 0 && <span class="coord rank">{r + 1}</span>}
          {r === 0 && <span class="coord file">{"abcde"[f]}</span>}
        </div>,
      );
    }
  }

  const pieces = [];
  for (let sq = 0; sq < BOARD_SIZE * BOARD_SIZE; sq++) {
    const cell = blind.board[sq];
    if (!cell) continue;
    const x = fileOf(sq);
    const y = BOARD_SIZE - 1 - rankOf(sq);
    if (cell.kind === "bounty") {
      pieces.push(
        <div
          key={`bounty-${sq}-${cell.type}`}
          class="piece bounty"
          style={{
            transform: `translate(${own(x)}, ${own(y)})`,
            backgroundImage: `url('${PIECE_URI["b" + cell.type]}')`,
          }}
        />,
      );
    } else {
      const piece = bag.find((p) => p.id === cell.pieceId);
      if (!piece) continue;
      const spent =
        blind.exhausted.includes(piece.id) && !mods.exhaustionExempt.includes(piece.type);
      const classes = ["piece", "own"];
      if (piece.enhancement) classes.push(`enh-${piece.enhancement}`);
      if (piece.engraving) classes.push(`eng-${piece.engraving}`);
      if (sq === landedSq) classes.push("landed");
      if (spent) classes.push("exhausted");
      if (swapMode) classes.push("swappable");
      pieces.push(
        <div
          key={`own-${piece.id}`}
          class={classes.join(" ")}
          style={{
            transform: `translate(${own(x)}, ${own(y)})`,
            backgroundImage: `url('${PIECE_URI["w" + piece.type]}')`,
          }}
          onClick={() => props.onSquareClick(sq)}
        />,
      );
    }
  }

  return (
    <div class={`board${swapMode ? " swap-mode" : ""}`}>
      <div class="squares">{squares}</div>
      <div class="pieces">{pieces}</div>
      {burstSq !== null && (
        <div
          class="burst"
          style={{
            left: pct(fileOf(burstSq)),
            top: pct(BOARD_SIZE - 1 - rankOf(burstSq)),
          }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} class={`spark s${i}`} />
          ))}
        </div>
      )}
      <div class="popups">
        {popups
          .filter((p) => p.sq !== undefined)
          .map((p) => (
            <div
              key={p.id}
              class={`popup pop-${p.flavor}`}
              style={{
                left: pct(fileOf(p.sq!)),
                top: pct(BOARD_SIZE - 1 - rankOf(p.sq!)),
              }}
            >
              {p.text}
            </div>
          ))}
      </div>
    </div>
  );
}
