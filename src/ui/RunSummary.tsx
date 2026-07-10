// End-of-run recap: outcome, the build you rode, and the numbers.

import { useState } from "preact/hooks";
import { PATTERN_LABEL } from "../engine/charms";
import { PATENTS } from "../engine/patents";
import { JOKERS } from "../engine/jokers";
import { OPENINGS } from "../engine/openings";
import { TRIALS } from "../engine/trials";
import type { MovePattern, RunState } from "../engine/types";
import { ArtIcon } from "./ArtIcon";

export function RunSummary({
  run,
  won,
  onNewRun,
  onMenu,
  onEndless,
}: {
  run: RunState;
  won: boolean;
  onNewRun: () => void;
  onMenu: () => void;
  /** Ride past the win into the Endless Night (win screen only). */
  onEndless?: () => void;
}) {
  const studied = (Object.entries(run.studies) as [MovePattern, number][]).filter(
    ([, v]) => v > 0,
  );
  const [copied, setCopied] = useState(false);

  // A paste-ready report — seeds make every playtester bug reproducible.
  const copyReport = () => {
    const lines = [
      `Blunderland run report`,
      `seed ${run.seed} · ${OPENINGS[run.openingId].name}${run.trial > 0 ? ` · ${TRIALS[run.trial - 1].name} (T${run.trial})` : ""}`,
      won
        ? `WON all 8 antes${run.endless ? ` — Endless depth ${run.ante}` : ""}`
        : `fell at ante ${run.ante}, ${["small", "big", "boss"][run.blindIdx]} blind${run.endless ? " (Endless)" : ""}`,
      `jokers: ${run.jokers.map((j) => JOKERS[j.id].name).join(", ") || "none"}`,
      run.patents.length ? `patents: ${run.patents.map((id) => PATENTS[id].name).join(", ")}` : "",
      studied.length ? `studies: ${studied.map(([k, v]) => `${PATTERN_LABEL[k]} ${v}`).join(", ")}` : "",
      `moves ${run.stats.moves} · captures ${run.stats.captures} · best move ${run.stats.bestMove.toLocaleString()}`,
    ].filter(Boolean);
    void navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div class="overlay">
      <div class={`panel summary${won ? " won" : ""}`}>
        <h2>{won ? "CHECKMATE, HOUSE." : "RUN OVER"}</h2>
        <div class="summary-sub">
          {won
            ? "You broke the arena across all 8 antes."
            : run.endless
              ? `The Endless Night claimed you at ante ${run.ante}.`
              : `Fell at ante ${run.ante}, ${["small", "big", "boss"][run.blindIdx]} blind.`}
        </div>
        <div class="summary-tags">
          {OPENINGS[run.openingId].emoji} {OPENINGS[run.openingId].name}
          {run.trial > 0 && ` · ${TRIALS[run.trial - 1].name}`}
        </div>

        {run.jokers.length > 0 && (
          <div class="summary-build">
            <span class="label">The build</span>
            <div class="summary-jokers">
              {run.jokers.map((inst, i) => {
                const j = JOKERS[inst.id];
                return (
                  <div key={`${inst.id}-${i}`} class={`summary-joker rarity-${j.rarity}`} title={j.desc}>
                    <ArtIcon dir="jokers" id={inst.id} emoji={j.emoji} class="summary-joker-art" />
                    <span>{j.name}</span>
                  </div>
                );
              })}
            </div>
            {studied.length > 0 && (
              <div class="summary-studies">
                {studied.map(([k, v]) => `${PATTERN_LABEL[k]} ${v}`).join(" · ")}
              </div>
            )}
          </div>
        )}

        <dl class="summary-stats">
          <div>
            <dt>Moves played</dt>
            <dd>{run.stats.moves}</dd>
          </div>
          <div>
            <dt>Captures</dt>
            <dd>{run.stats.captures}</dd>
          </div>
          <div>
            <dt>Best move</dt>
            <dd>{run.stats.bestMove.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Promotions</dt>
            <dd>{run.stats.promotions}</dd>
          </div>
        </dl>
        <div class="summary-seed">
          seed {run.seed}
          <button class="btn ghost copy-report" onClick={copyReport}>
            {copied ? "Copied!" : "Copy run report"}
          </button>
        </div>
        <div class="summary-actions">
          {won && onEndless && (
            <button class="btn primary endless" onClick={onEndless}>
              Into the Endless Night →
            </button>
          )}
          <button class={`btn ${won && onEndless ? "ghost" : "primary"}`} onClick={onNewRun}>
            New Run
          </button>
          <button class="btn ghost" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
