import { BLIND_REWARD } from "../engine/constants";
import { BOSSES } from "../engine/bosses";
import { bossFor } from "../engine/run";
import { POSTERS } from "../engine/posters";
import type { RunState } from "../engine/types";

const BLIND_LABEL = ["Small Blind", "Big Blind", "Boss Blind"];

export function BlindIntro({
  run,
  onDeal,
  onSkip,
  locked = false,
}: {
  run: RunState;
  onDeal: () => void;
  /** Wanted Poster: skip this blind (no payout) and take its tag. */
  onSkip?: () => void;
  /** The White Knight has the floor — dealing waits for him. */
  locked?: boolean;
}) {
  const blind = run.blind!;
  const isBoss = run.blindIdx === 2;
  const boss = BOSSES[bossFor(run)];
  const poster = !isBoss && blind.poster ? POSTERS[blind.poster] : null;

  return (
    <div class="overlay">
      <div class={`panel intro${isBoss ? " boss" : ""}`}>
        <div class="intro-ante">Ante {run.ante}</div>
        <h2 class="intro-name">{isBoss ? boss.name : BLIND_LABEL[run.blindIdx]}</h2>
        {isBoss && <div class="intro-boss-desc">{boss.desc}</div>}
        <div class="intro-target">
          <span class="label">Score at least</span>
          <div class="target-num big">{blind.target.toLocaleString()}</div>
        </div>
        <div class="intro-meta">
          <span>{blind.movesLeft} moves</span>
          <span>·</span>
          <span>{blind.swapsLeft} swaps</span>
          <span>·</span>
          <span>reward ${BLIND_REWARD[blind.kind]}</span>
        </div>
        <button class="btn primary" disabled={locked} onClick={onDeal}>
          Deal
        </button>
        {poster && onSkip && (
          <button
            class="btn ghost intro-skip"
            disabled={locked}
            onClick={onSkip}
            title={poster.desc}
          >
            Skip blind, take the {poster.name}
            <span class="intro-skip-desc">{poster.desc} (no reward)</span>
          </button>
        )}
      </div>
    </div>
  );
}
