// Move generation for a 5×5 kingless score-attack board.
// Own pieces block; bounties are capturable; bounties never move.

import { BOARD_SIZE } from "./constants";
import type { Cell, Modifiers, PieceType, Square } from "./types";

export const fileOf = (sq: Square) => sq % BOARD_SIZE;
export const rankOf = (sq: Square) => Math.floor(sq / BOARD_SIZE);
export const squareAt = (file: number, rank: number): Square => rank * BOARD_SIZE + file;

/** Standard chess coloring with a1 dark: (file+rank) even → dark. */
export const isDark = (sq: Square) => (fileOf(sq) + rankOf(sq)) % 2 === 0;

export const squareName = (sq: Square) =>
  "abcde"[fileOf(sq)] + String(rankOf(sq) + 1);

const KNIGHT_OFFSETS: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const BISHOP_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inBounds(file: number, rank: number, mods: Modifiers): boolean {
  return file >= 0 && file < mods.boardSize && rank >= 0 && rank < mods.boardSize;
}

/** Legal destination squares for the piece of `type` sitting on `from`. */
export function legalMoves(
  board: (Cell | null)[],
  from: Square,
  type: PieceType,
  mods: Modifiers,
): Square[] {
  const f = fileOf(from);
  const r = rankOf(from);
  const out: Square[] = [];

  const consider = (file: number, rank: number): "stop" | "go" => {
    if (!inBounds(file, rank, mods)) return "stop";
    const sq = squareAt(file, rank);
    const cell = board[sq];
    if (cell === null) {
      out.push(sq);
      return "go";
    }
    if (cell.kind === "bounty") out.push(sq); // capture
    return "stop"; // any occupant blocks the ray
  };

  if (type === "P") {
    // Forward push (no capture), no double step on a 5×5 board.
    if (inBounds(f, r + 1, mods) && board[squareAt(f, r + 1)] === null) {
      out.push(squareAt(f, r + 1));
    }
    // Diagonal captures only.
    for (const df of [-1, 1]) {
      if (!inBounds(f + df, r + 1, mods)) continue;
      const sq = squareAt(f + df, r + 1);
      if (board[sq]?.kind === "bounty") out.push(sq);
    }
    return out;
  }

  if (type === "N") {
    for (const [df, dr] of KNIGHT_OFFSETS) consider(f + df, r + dr);
    return out;
  }

  const dirs =
    type === "B" ? BISHOP_DIRS : type === "R" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
  for (const [df, dr] of dirs) {
    for (let i = 1; i < BOARD_SIZE; i++) {
      if (consider(f + df * i, r + dr * i) === "stop") break;
    }
  }
  return out;
}

/** Squares holding bounties that `type` on `from` attacks (used by Fork Lord). */
export function attackedBounties(
  board: (Cell | null)[],
  from: Square,
  type: PieceType,
  mods: Modifiers,
): Square[] {
  if (type === "P") {
    const f = fileOf(from);
    const r = rankOf(from);
    const out: Square[] = [];
    for (const df of [-1, 1]) {
      if (!inBounds(f + df, r + 1, mods)) continue;
      const sq = squareAt(f + df, r + 1);
      if (board[sq]?.kind === "bounty") out.push(sq);
    }
    return out;
  }
  return legalMoves(board, from, type, mods).filter((sq) => board[sq]?.kind === "bounty");
}
