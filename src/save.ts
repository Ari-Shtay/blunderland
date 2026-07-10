// Best-effort localStorage persistence. Never throws.

import { OPENING_IDS } from "./engine/openings";
import { MAX_TRIAL } from "./engine/trials";
import type {
  CharmId,
  JokerId,
  OpeningId,
  PatentId,
  PosterId,
  RunState,
} from "./engine/types";

const RUN_KEY = "blunderland:run:v6";
const OLD_RUN_KEYS = [
  "blunderland:run:v1",
  "blunderland:run:v2",
  "blunderland:run:v3",
  "blunderland:run:v4",
  "blunderland:run:v5",
];
const MIGRATE_KEYS = ["blunderland:run:v5", "blunderland:run:v4"];
const STATS_KEY = "blunderland:stats:v1";

export interface LifetimeStats {
  runs: number;
  wins: number;
  bestAnte: number;
  bestMove: number;
  winsByOpening: Partial<Record<OpeningId, number>>;
  bestTrialWon: number;
  /** Deepest ante survived in the Endless Night (post-win antes only). */
  bestEndless: number;
}

export interface LastRun {
  won: boolean;
  ante: number;
  bestMove: number;
}

const LAST_RUN_KEY = "blunderland:lastrun:v1";

export function loadLastRun(): LastRun | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    if (raw) return JSON.parse(raw) as LastRun;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    for (const key of OLD_RUN_KEYS) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — play on */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (raw) {
      const run = JSON.parse(raw) as RunState;
      if (typeof run.seed !== "number" || !run.phase?.name) return null;
      return run;
    }
    // v5/v4 → v6 migration: the shapes are compatible, just fill the new fields.
    for (const key of MIGRATE_KEYS) {
      const old = localStorage.getItem(key);
      if (!old) continue;
      const run = JSON.parse(old) as RunState;
      if (typeof run.seed !== "number" || !run.phase?.name) return null;
      return {
        ...run,
        openingId: run.openingId ?? "classical",
        trial: run.trial ?? 0,
        patents: run.patents ?? [],
        pendingPosters: run.pendingPosters ?? [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as LifetimeStats;
      return {
        ...s,
        winsByOpening: s.winsByOpening ?? {},
        bestTrialWon: s.bestTrialWon ?? -1,
        bestEndless: s.bestEndless ?? 0,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    runs: 0,
    wins: 0,
    bestAnte: 0,
    bestMove: 0,
    winsByOpening: {},
    bestTrialWon: -1,
    bestEndless: 0,
  };
}

/** An endless run dies after its win was already counted — update bests only. */
export function recordEndlessDepth(run: RunState): void {
  try {
    const s = loadStats();
    localStorage.setItem(
      STATS_KEY,
      JSON.stringify({
        ...s,
        bestAnte: Math.max(s.bestAnte, run.ante),
        bestMove: Math.max(s.bestMove, run.stats.bestMove),
        bestEndless: Math.max(s.bestEndless, run.ante),
      } satisfies LifetimeStats),
    );
  } catch {
    /* ignore */
  }
}

// ---- codex: everything the player has laid eyes on ----

export interface Codex {
  jokers: JokerId[];
  charms: CharmId[];
  openings: OpeningId[];
  patents: PatentId[];
  posters: PosterId[];
}

const CODEX_KEY = "blunderland:codex:v1";
const EMPTY_CODEX: Codex = { jokers: [], charms: [], openings: [], patents: [], posters: [] };

export function loadCodex(): Codex {
  try {
    const raw = localStorage.getItem(CODEX_KEY);
    if (raw) return { ...EMPTY_CODEX, ...(JSON.parse(raw) as Codex) };
  } catch {
    /* ignore */
  }
  return { ...EMPTY_CODEX };
}

/** Fold everything visible in this run state into the codex. Cheap: sets. */
export function recordCodex(run: RunState): void {
  try {
    const c = loadCodex();
    const jokers = new Set(c.jokers);
    const charms = new Set(c.charms);
    const openings = new Set(c.openings);
    const patents = new Set(c.patents);
    const posters = new Set(c.posters);
    const before =
      jokers.size + charms.size + openings.size + patents.size + posters.size;

    openings.add(run.openingId);
    for (const j of run.jokers) jokers.add(j.id);
    for (const ch of run.charms) charms.add(ch);
    for (const pt of run.patents) patents.add(pt);
    for (const po of run.pendingPosters) posters.add(po);
    if (run.blind?.poster) posters.add(run.blind.poster);
    if (run.phase.name === "shop") {
      const shop = run.phase.shop;
      for (const o of shop.jokers) jokers.add(o.joker);
      charms.add(shop.charm.id);
      if (shop.patent) patents.add(shop.patent.id);
    }

    if (
      jokers.size + charms.size + openings.size + patents.size + posters.size ===
      before
    ) {
      return; // nothing new — skip the write
    }
    localStorage.setItem(
      CODEX_KEY,
      JSON.stringify({
        jokers: [...jokers],
        charms: [...charms],
        openings: [...openings],
        patents: [...patents],
        posters: [...posters],
      } satisfies Codex),
    );
  } catch {
    /* ignore */
  }
}

// ---- unlock progress (openings + trials, win-gated) ----

export interface Progress {
  openings: OpeningId[];
  trialUnlocked: number;
}

const PROGRESS_KEY = "blunderland:progress:v1";
const DEFAULT_PROGRESS: Progress = {
  openings: ["classical", "kingsGambit"],
  trialUnlocked: 0,
};

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return {
        openings: p.openings?.length ? p.openings : DEFAULT_PROGRESS.openings,
        trialUnlocked: p.trialUnlocked ?? 0,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PROGRESS, openings: [...DEFAULT_PROGRESS.openings] };
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** A win unlocks the next Opening and, at the frontier, the next Trial. */
function advanceProgress(run: RunState): void {
  const p = loadProgress();
  const nextOpening = OPENING_IDS.find((id) => !p.openings.includes(id));
  if (nextOpening) p.openings.push(nextOpening);
  if (run.trial >= p.trialUnlocked) {
    p.trialUnlocked = Math.min(MAX_TRIAL, run.trial + 1);
  }
  saveProgress(p);
}

export function recordRunEnd(run: RunState, won: boolean): void {
  if (won) advanceProgress(run);
  try {
    const s = loadStats();
    localStorage.setItem(
      LAST_RUN_KEY,
      JSON.stringify({ won, ante: run.ante, bestMove: run.stats.bestMove } satisfies LastRun),
    );
    localStorage.setItem(
      STATS_KEY,
      JSON.stringify({
        runs: s.runs + 1,
        wins: s.wins + (won ? 1 : 0),
        bestAnte: Math.max(s.bestAnte, run.ante),
        bestMove: Math.max(s.bestMove, run.stats.bestMove),
        winsByOpening: won
          ? { ...s.winsByOpening, [run.openingId]: (s.winsByOpening[run.openingId] ?? 0) + 1 }
          : s.winsByOpening,
        bestTrialWon: won ? Math.max(s.bestTrialWon, run.trial) : s.bestTrialWon,
        bestEndless: run.endless ? Math.max(s.bestEndless, run.ante) : s.bestEndless,
      } satisfies LifetimeStats),
    );
  } catch {
    /* ignore */
  }
}
