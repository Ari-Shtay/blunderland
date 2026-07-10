import { JOKER_SLOTS } from "../engine/constants";
import { JOKERS } from "../engine/jokers";
import type { JokerInstance } from "../engine/types";
import { ArtIcon } from "./ArtIcon";

export interface JokerBarProps {
  jokers: JokerInstance[];
  /** Source name of the effect currently firing (matches joker names). */
  firing: string | null;
}

export function JokerBar({ jokers, firing }: JokerBarProps) {
  return (
    <div class="joker-bar">
      {jokers.map((inst) => {
        const j = JOKERS[inst.id];
        const badge = j.stateLabel?.(inst.state ?? 0);
        return (
          <div
            key={inst.id}
            class={`joker-card rarity-${j.rarity}${firing === j.name ? " firing" : ""}`}
          >
            <div class="joker-art">
              <ArtIcon dir="jokers" id={inst.id} emoji={j.emoji} class="joker-emoji" />
            </div>
            <div class="joker-name">{j.name}</div>
            {badge && <div class="joker-state">{badge}</div>}
            <div class="joker-tip">{j.desc}</div>
          </div>
        );
      })}
      {Array.from({ length: JOKER_SLOTS - jokers.length }, (_, i) => (
        <div key={`empty-${i}`} class="joker-card empty">
          <div class="joker-emoji dim">♟</div>
        </div>
      ))}
    </div>
  );
}
