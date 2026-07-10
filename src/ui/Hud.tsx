import { ANTES } from "../engine/constants";
import { BOSSES } from "../engine/bosses";
import { PATTERN_LABEL } from "../engine/charms";
import { bossFor } from "../engine/run";
import { OPENINGS } from "../engine/openings";
import { PATENTS } from "../engine/patents";
import { POSTERS } from "../engine/posters";
import { TRIALS } from "../engine/trials";
import type { MovePattern } from "../engine/types";
import type { RunState } from "../engine/types";

const BLIND_LABEL = ["Small Blind", "Big Blind", "Boss Blind"];

export interface HudProps {
  run: RunState;
  animScore: number;
  liveChips: number;
  liveMult: number;
  replaying: boolean;
}

export function Hud({ run, animScore, liveChips, liveMult, replaying }: HudProps) {
  const blind = run.blind;
  const boss = BOSSES[bossFor(run)];
  const isBoss = run.blindIdx === 2;
  const pct = blind ? Math.min(100, (animScore / blind.target) * 100) : 0;

  return (
    <aside class="hud">
      <div class="hud-title">
        BLUNDER<span>LAND</span>
      </div>

      <div class={`hud-ante${run.endless ? " endless" : ""}`}>
        <span class="label">{run.endless ? "Endless Night" : "Ante"}</span>
        <span class="value">
          {run.ante}
          {!run.endless && <em>/{ANTES}</em>}
        </span>
      </div>

      {(run.openingId !== "classical" || run.trial > 0) && (
        <div class="hud-run-tags">
          {OPENINGS[run.openingId].emoji} {OPENINGS[run.openingId].name}
          {run.trial > 0 && ` · ${TRIALS[run.trial - 1].name}`}
        </div>
      )}

      {run.pendingPosters.length > 0 && (
        <div class="hud-posters" title="Banked Wanted Posters — they fire on the blinds ahead">
          <span class="label">Posters</span>
          {run.pendingPosters.map((id, i) => (
            <span key={`${id}-${i}`} class="hud-poster" title={`${POSTERS[id].name} — ${POSTERS[id].desc}`}>
              {POSTERS[id].emoji}
            </span>
          ))}
        </div>
      )}

      {run.patents.length > 0 && (
        <div class="hud-patents" title="Patents — the Knight's inventions">
          {run.patents.map((id) => (
            <span key={id} class="hud-patent" title={`${PATENTS[id].name} — ${PATENTS[id].desc}`}>
              {PATENTS[id].emoji}
            </span>
          ))}
        </div>
      )}

      {blind && (
        <div class={`hud-blind${isBoss ? " boss" : ""}`}>
          <div class="blind-name">{isBoss ? boss.name : BLIND_LABEL[run.blindIdx]}</div>
          {isBoss && <div class="boss-desc">{boss.desc}</div>}
          <div class="blind-target">
            <span class="label">Target</span>
            <span class="target-num">{blind.target.toLocaleString()}</span>
          </div>
        </div>
      )}

      {blind && (
        <div class="hud-score">
          <div class="score-bar">
            <div class="score-fill" style={{ width: `${pct}%` }} />
          </div>
          <div class="score-num">{animScore.toLocaleString()}</div>
        </div>
      )}

      <div class={`hud-tally${replaying ? " live" : ""}`}>
        <span class="chips">{Math.round(liveChips)}</span>
        <span class="times">×</span>
        <span class="mult">{+liveMult.toFixed(2)}</span>
      </div>

      {blind && (
        <div class="hud-resources">
          <div class="res">
            <span class="label">Moves</span>
            <span class="pips">
              {Array.from({ length: blind.movesLeft }, (_, i) => (
                <i key={i} class="pip move" />
              ))}
              {blind.movesLeft === 0 && <em>none</em>}
            </span>
          </div>
          <div class="res">
            <span class="label">Swaps</span>
            <span class="pips">
              {Array.from({ length: blind.swapsLeft }, (_, i) => (
                <i key={i} class="pip swap" />
              ))}
              {blind.swapsLeft === 0 && <em>none</em>}
            </span>
          </div>
          <div class="res">
            <span class="label">Bag</span>
            <span class="value small">{blind.queue.length} left</span>
          </div>
        </div>
      )}

      {Object.values(run.studies).some((v) => v > 0) && (
        <div class="hud-studies">
          <span class="label">Studies</span>
          <div class="studies-list">
            {(Object.entries(run.studies) as [MovePattern, number][])
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${PATTERN_LABEL[k]} ${v}`)
              .join(" · ")}
          </div>
        </div>
      )}

      <div class="hud-money">${run.money}</div>

      {!isBoss && (
        <div class="hud-boss-preview">
          <span class="label">Upcoming boss — blind 3</span>
          <div class="preview-name">{boss.name}</div>
          <div class="preview-desc">{boss.desc}</div>
        </div>
      )}
    </aside>
  );
}
