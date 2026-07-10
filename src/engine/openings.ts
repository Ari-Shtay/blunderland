// Openings — run-start loadouts (Balatro's decks, in chess terms). Each
// bends one starting rule; heavier twists ride the Modifiers pipeline
// (base → opening → trial → jokers → boss).

import type { Modifiers, MovePattern, OpeningId, PieceType } from "./types";

export interface OpeningDef {
  id: OpeningId;
  name: string;
  desc: string;
  emoji: string;
  startingBag?: PieceType[];
  startingMoney?: number;
  /** King's Gambit: draw one random rare joker at run start (seeded). */
  startingRareJoker?: boolean;
  startingStudies?: Partial<Record<MovePattern, number>>;
  /** Deal at least one of this type per blind, bag and boss rules permitting. */
  guaranteeDealt?: PieceType;
  mods?: (m: Modifiers) => Modifiers;
}

const def = (o: OpeningDef) => o;

export const OPENINGS: Record<OpeningId, OpeningDef> = {
  classical: def({
    id: "classical",
    name: "Classical",
    desc: "The standard game. Every tool, no promises.",
    emoji: "♟️",
  }),
  kingsGambit: def({
    id: "kingsGambit",
    name: "King's Gambit",
    desc: "Start penniless — but with a random rare Joker in hand.",
    emoji: "🤴",
    startingMoney: 0,
    startingRareJoker: true,
  }),
  pawnStorm: def({
    id: "pawnStorm",
    name: "Pawn Storm",
    desc: "Eight pawns march. Coronations start studied.",
    emoji: "🌩️",
    startingBag: ["P", "P", "P", "P", "P", "P", "P", "P", "N", "B"],
    startingStudies: { promotion: 1 },
  }),
  blitz: def({
    id: "blitz",
    name: "Blitz",
    desc: "Three moves per blind, one extra swap. Targets are 10% lower.",
    emoji: "⏱️",
    mods: (m) => ({
      ...m,
      movesPerBlind: m.movesPerBlind - 1,
      swapsPerBlind: m.swapsPerBlind + 1,
      targetScale: m.targetScale * 0.9,
    }),
  }),
  queensGambit: def({
    id: "queensGambit",
    name: "Queen's Gambit",
    desc: "Two queens, no rooks. Targets are 10% higher.",
    emoji: "👑",
    startingBag: ["Q", "Q", "P", "P", "P", "P", "N", "N", "B", "B"],
    guaranteeDealt: "Q",
    mods: (m) => ({ ...m, targetScale: m.targetScale * 1.1 }),
  }),
  fianchetto: def({
    id: "fianchetto",
    name: "Fianchetto",
    desc: "Four bishops that never tire. No knights. Targets are 10% higher.",
    emoji: "📐",
    startingBag: ["B", "B", "B", "B", "P", "P", "P", "P", "R", "Q"],
    mods: (m) => ({
      ...m,
      exhaustionExempt: [...m.exhaustionExempt, "B"],
      targetScale: m.targetScale * 1.1,
    }),
  }),
  lookingGlass: def({
    id: "lookingGlass",
    name: "Looking-Glass",
    desc: "Chips and Mult are AVERAGED, then squared. Targets are tripled.",
    emoji: "🪞",
    mods: (m) => ({ ...m, averageChipsMult: true, targetScale: m.targetScale * 3 }),
  }),
};

export const OPENING_IDS = Object.keys(OPENINGS) as OpeningId[];
