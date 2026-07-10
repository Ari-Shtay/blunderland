// Run setup: choose an Opening (starting loadout) and a Trial tier.
// Locked entries show their unlock condition — wins open the ladder.

import { useState } from "preact/hooks";
import { STARTING_BAG } from "../engine/constants";
import { seedFromString } from "../engine/rng";
import { OPENINGS, OPENING_IDS } from "../engine/openings";
import { TRIALS } from "../engine/trials";
import type { OpeningId } from "../engine/types";
import { loadProgress } from "../save";
import { ArtIcon } from "./ArtIcon";
import { PIECE_URI } from "./pieces";

export interface OpeningPickerProps {
  onStart: (opening: OpeningId, trial: number, seed?: number) => void;
  onBack: () => void;
}

export function OpeningPicker({ onStart, onBack }: OpeningPickerProps) {
  const progress = loadProgress();
  const [opening, setOpening] = useState<OpeningId>("classical");
  const [trial, setTrial] = useState(0);
  const [seedText, setSeedText] = useState("");

  const begin = () => {
    const t = seedText.trim();
    if (!t) return onStart(opening, trial);
    const n = /^\d+$/.test(t) ? Number(t) >>> 0 : seedFromString(t);
    onStart(opening, trial, n || 1);
  };

  return (
    <main class="menu picker">
      <h2 class="picker-title">Choose your Opening</h2>
      <div class="opening-grid">
        {OPENING_IDS.map((id) => {
          const def = OPENINGS[id];
          const locked = !progress.openings.includes(id);
          const bag = def.startingBag ?? STARTING_BAG;
          return (
            <button
              key={id}
              class={`opening-card${opening === id ? " selected" : ""}${locked ? " locked" : ""}`}
              disabled={locked}
              onClick={() => setOpening(id)}
            >
              <div class="opening-art">
                {locked ? (
                  <span class="opening-emoji">🔒</span>
                ) : (
                  <ArtIcon dir="openings" id={id} emoji={def.emoji} class="opening-emoji" />
                )}
              </div>
              <div class="opening-name">{def.name}</div>
              <div class="opening-desc">
                {locked ? "Win a run to unlock the next Opening." : def.desc}
              </div>
              {!locked && (
                <div class="opening-bag">
                  {bag.map((t, i) => (
                    <i key={i} style={{ backgroundImage: `url('${PIECE_URI["w" + t]}')` }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div class="trial-row">
        <span class="label">Trial</span>
        <button
          class="btn ghost trial-step"
          disabled={trial <= 0}
          onClick={() => setTrial(trial - 1)}
        >
          −
        </button>
        <span class="trial-name">
          {trial === 0 ? "None" : `${TRIALS[trial - 1].name} (T${trial})`}
        </span>
        <button
          class="btn ghost trial-step"
          disabled={trial >= progress.trialUnlocked}
          onClick={() => setTrial(trial + 1)}
          title={
            trial >= progress.trialUnlocked
              ? "Win at your highest Trial to unlock the next"
              : undefined
          }
        >
          +
        </button>
      </div>
      {trial > 0 && (
        <p class="trial-desc">
          {TRIALS.slice(0, trial)
            .map((t) => t.desc)
            .join(" ")}
        </p>
      )}

      <div class="seed-row">
        <span class="label">Seed</span>
        <input
          class="seed-input"
          type="text"
          placeholder="random"
          value={seedText}
          onInput={(e) => setSeedText((e.target as HTMLInputElement).value)}
          title="A number or any phrase. The same seed deals the same run."
        />
      </div>

      <div class="menu-actions">
        <button class="btn ghost" onClick={onBack}>
          Back
        </button>
        <button class="btn primary" onClick={begin}>
          Begin Run
        </button>
      </div>
    </main>
  );
}
