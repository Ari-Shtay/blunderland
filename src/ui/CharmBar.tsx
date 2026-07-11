// Held charms, shown during play. Instant charms fire on click; board-target
// charms arm a targeting mode (the next own-piece click is the target).

import { CHARMS } from "../engine/charms";
import type { CharmId } from "../engine/types";
import { GameCard } from "./Card";

export interface CharmBarProps {
  charms: CharmId[];
  /** Index currently armed for board targeting. */
  armed: number | null;
  phase: string;
  onCharmClick: (index: number) => void;
}

export function CharmBar({ charms, armed, phase, onCharmClick }: CharmBarProps) {
  if (charms.length === 0) return null;
  return (
    <div class="charm-bar">
      <span class="label">Charms</span>
      {charms.map((id, i) => {
        const c = CHARMS[id];
        const usable = c.phase === "any" || c.phase === phase;
        return (
          <GameCard
            key={`${id}-${i}`}
            size="sm"
            class="charm-card"
            art={{ dir: "charms", id, emoji: c.emoji }}
            name={armed === i ? "pick a piece…" : c.name}
            disabled={!usable}
            selected={armed === i}
            onClick={() => onCharmClick(i)}
            tip={{
              name: c.name,
              desc: c.desc,
              lines: [c.target === "boardPiece" ? "Click, then pick a piece on the board." : "Fires on click."],
            }}
          />
        );
      })}
    </div>
  );
}
