// Held charms, shown during play. Instant charms fire on click; board-target
// charms arm a targeting mode (the next own-piece click is the target).

import { CHARMS } from "../engine/charms";
import type { CharmId } from "../engine/types";
import { ArtIcon } from "./ArtIcon";

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
          <button
            key={`${id}-${i}`}
            class={`charm-card${armed === i ? " targeting" : ""}`}
            disabled={!usable}
            onClick={() => onCharmClick(i)}
          >
            <ArtIcon dir="charms" id={id} emoji={c.emoji} class="charm-emoji" />
            <span class="charm-name">{armed === i ? "pick a piece…" : c.name}</span>
            <span class="charm-tip">{c.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
