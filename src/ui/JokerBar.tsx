import { JOKER_SLOTS } from "../engine/constants";
import { JOKERS } from "../engine/jokers";
import type { JokerInstance } from "../engine/types";
import { GameCard } from "./Card";

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
          <GameCard
            key={inst.id}
            size="sm"
            class={`joker-card${firing === j.name ? " firing" : ""}`}
            art={{ dir: "jokers", id: inst.id, emoji: j.emoji }}
            name={j.name}
            rarity={j.rarity}
            stateBadge={badge}
            tip={{
              name: j.name,
              rarity: j.rarity,
              desc: j.desc,
              lines: badge ? [`Currently ${badge}`] : undefined,
            }}
          />
        );
      })}
      {Array.from({ length: JOKER_SLOTS - jokers.length }, (_, i) => (
        <div key={`empty-${i}`} class="gcard sm empty-slot">
          <div class="gcard-emoji dim">♟</div>
        </div>
      ))}
    </div>
  );
}
