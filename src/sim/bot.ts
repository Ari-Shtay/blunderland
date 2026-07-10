// The policy bot: beam-searches each blind (exhaustion makes a blind an
// enumerable "order ≤4 of your pieces"), uses charm heuristics, and delegates
// shops to policy.ts. Deterministic — consumes only engine state.
// playGreedyRun is the FROZEN 1-ply baseline used as a regression gate.

import { CAPTURE_CHIPS, SQUARES } from "../engine/constants";
import { CHARMS } from "../engine/charms";
import {
  buyJoker,
  legalMovesFor,
  newRun,
  nextBlind,
  playMove,
  startPlaying,
  swapPiece,
  useCharm,
} from "../engine/run";
import { buildScoreCtx } from "../engine/scoring";
import type { NewRunOpts } from "../engine/run";
import type { PieceType, RunState, ScoreEvent } from "../engine/types";
import { doShop, type RecordedMove } from "./policy";
import { bump, type Telemetry } from "./telemetry";

export interface BotConfig {
  beamWidth: number;
  childCap: number;
  useCharms: boolean;
  telemetry?: Telemetry;
  label?: string;
}

export const GATE_CONFIG: BotConfig = { beamWidth: 4, childCap: 8, useCharms: true };
export const REPORT_CONFIG: BotConfig = { beamWidth: 12, childCap: 16, useCharms: true };

export interface RunResult {
  blindsCleared: number;
  won: boolean;
  finalAnte: number;
}

const totalOf = (events: ScoreEvent[]): number => {
  const e = events.find((ev) => ev.kind === "total");
  return e && e.kind === "total" ? e.amount : 0;
};

interface TraceStep {
  preRun: RunState;
  from: number;
  to: number;
}

interface Node {
  run: RunState;
  /** Immediate total of the move that produced this node (for child pruning). */
  lastTotal: number;
  /** Move lineage — contexts are built lazily only for the adopted path. */
  trace: TraceStep[];
}

/** Cheap potential: total bounty chips still on the board (no move-gen). */
function potential(run: RunState): number {
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing") return 0;
  let sum = 0;
  for (const c of blind.board) {
    if (c?.kind === "bounty") sum += CAPTURE_CHIPS[c.type];
  }
  return sum;
}

const evalNode = (n: Node): number => {
  const blind = n.run.blind;
  const score = blind ? blind.score : 0;
  return score + 0.15 * potential(n.run);
};

/** Build a RecordedMove from a trace step — called only for adopted paths. */
function recordStep(step: TraceStep): RecordedMove | null {
  const run = step.preRun;
  const { from, to } = step;
  const blind = run.blind;
  if (!blind) return null;
  const cell = blind.board[from];
  if (cell?.kind !== "own") return null;
  const piece = run.bag.find((p) => p.id === cell.pieceId);
  if (!piece) return null;
  const target = blind.board[to];
  const captured: PieceType | null = target?.kind === "bounty" ? target.type : null;
  const { events } = playMove(run, from, to);
  const totalEvent = events.find((e) => e.kind === "total");
  if (!totalEvent || totalEvent.kind !== "total") return null;
  const board = blind.board.slice();
  board[from] = null;
  board[to] = { kind: "own", pieceId: piece.id };
  const ctx = buildScoreCtx({
    board,
    bag: run.bag,
    blind,
    jokers: run.jokers,
    mover: piece,
    moverType: piece.type,
    from,
    to,
    captured,
    chainAfter: captured ? blind.chain + 1 : 0,
    promoted: false,
    money: run.money,
    removals: run.removals,
    studies: run.studies,
    echo: false,
    mods: modifiersFor(run),
    rng: run.rng,
  });
  return { ctx, chips: totalEvent.chips, mult: totalEvent.mult, total: totalEvent.amount };
}

import { modifiersFor } from "../engine/bosses";

/** All (from,to) children of a node, pruned to the best `childCap`. */
function moveChildren(node: Node, childCap: number): Node[] {
  const run = node.run;
  const out: { node: Node; total: number; key: number }[] = [];
  for (let from = 0; from < SQUARES; from++) {
    const dests = legalMovesFor(run, from);
    for (const to of dests) {
      const { run: after, events } = playMove(run, from, to);
      if (events.length === 0) continue;
      const total = totalOf(events);
      out.push({
        node: {
          run: after,
          lastTotal: total,
          trace: [...node.trace, { preRun: run, from, to }],
        },
        total,
        key: from * 32 + to,
      });
    }
  }
  out.sort((a, b) => b.total - a.total || a.key - b.key);
  return out.slice(0, childCap).map((o) => o.node);
}

/** Swap children: only when stuck-ish or under pace; cap 2. */
function swapChildren(node: Node): Node[] {
  const run = node.run;
  const blind = run.blind;
  if (!blind || run.phase.name !== "playing") return [];
  if (blind.swapsLeft <= 0 || blind.queue.length === 0) return [];
  // Find own squares whose piece has the fewest options.
  const owned: { sq: number; options: number }[] = [];
  for (let sq = 0; sq < SQUARES; sq++) {
    if (blind.board[sq]?.kind !== "own") continue;
    owned.push({ sq, options: legalMovesFor(run, sq).length });
  }
  const pace = blind.target / Math.max(1, blind.movesLeft);
  const stuckish = owned.some((o) => o.options === 0);
  const bestNow = Math.max(0, ...owned.map(() => 0)); // pace check handled below
  void bestNow;
  const underPace = node.lastTotal < pace * 0.5;
  if (!stuckish && !underPace) return [];
  owned.sort((a, b) => a.options - b.options || a.sq - b.sq);
  const out: Node[] = [];
  for (const o of owned.slice(0, 2)) {
    const after = swapPiece(run, o.sq);
    if (after !== run) out.push({ run: after, lastTotal: 0, trace: node.trace });
  }
  return out;
}

/** Charm heuristics at blind start. */
function useBlindStartCharms(run: RunState, t?: Telemetry): RunState {
  let r = run;
  for (let guard = 0; guard < 4; guard++) {
    if (r.phase.name !== "playing" || r.charms.length === 0) break;
    const blind = r.blind!;
    const idx = r.charms.findIndex((id) => {
      const def = CHARMS[id];
      if (def.study) return true; // always cash studies
      if (id === "echo") return !blind.echo;
      if (id === "extraHour") return blind.kind === "boss";
      if (id === "windfall") return true;
      if (id === "pressGang") return false; // policy buys it only for pawn bags... skip use
      return false;
    });
    if (idx < 0) break;
    const id = r.charms[idx];
    const next = useCharm(r, idx);
    if (next === r) break;
    if (t) bump(t.charmUsed, id);
    r = next;
  }
  return r;
}

/** Beam over one blind; returns the finished (cleared/lost) RunState. */
export function chooseBlindPlan(run: RunState, cfg: BotConfig): { run: RunState; recorded: RecordedMove[] } {
  let start = run;
  if (cfg.useCharms) start = useBlindStartCharms(start, cfg.telemetry);
  let beam: Node[] = [{ run: start, lastTotal: 0, trace: [] }];
  const finished: Node[] = [];

  for (let step = 0; step < 12 && beam.length > 0; step++) {
    const next: Node[] = [];
    for (const node of beam) {
      if (node.run.phase.name !== "playing") {
        finished.push(node);
        continue;
      }
      const kids = [...moveChildren(node, cfg.childCap), ...swapChildren(node)];
      if (kids.length === 0) {
        finished.push(node); // stuck — engine will have marked lost
        continue;
      }
      for (const k of kids) {
        if (k.run.phase.name !== "playing") finished.push(k);
        else next.push(k);
      }
    }
    next.sort((a, b) => evalNode(b) - evalNode(a));
    beam = next.slice(0, cfg.beamWidth);
  }
  finished.push(...beam);

  // Prefer cleared blinds; among cleared, max unused moves then score.
  const cleared = finished.filter((n) => n.run.phase.name !== "playing" && n.run.phase.name !== "lost");
  const adopt = (n: Node) => ({
    run: n.run,
    recorded: n.trace.map(recordStep).filter((r): r is RecordedMove => r !== null),
  });
  if (cleared.length > 0) {
    cleared.sort((a, b) => {
      const ma = a.run.blind?.movesLeft ?? 0;
      const mb = b.run.blind?.movesLeft ?? 0;
      return mb - ma || (b.run.blind?.score ?? 0) - (a.run.blind?.score ?? 0);
    });
    return adopt(cleared[0]);
  }
  finished.sort((a, b) => (b.run.blind?.score ?? 0) - (a.run.blind?.score ?? 0));
  const best = finished[0];
  return best ? adopt(best) : { run: start, recorded: [] };
}

const SAMPLE_CAP = 24;

/** Full run with the policy bot. */
export function playBotRun(
  seed: number,
  cfg: BotConfig,
  maxAnte = 8,
  opts: NewRunOpts = {},
): RunResult {
  const t = cfg.telemetry;
  let run = startPlaying(newRun(seed, opts));
  let samples: RecordedMove[] = [];
  let cleared = 0;
  for (let guard = 0; guard < 200; guard++) {
    if (run.phase.name === "won") {
      finishTelemetry(t, run, cfg, cleared, true);
      return { blindsCleared: cleared, won: true, finalAnte: run.ante };
    }
    if (run.phase.name === "lost") {
      recordBlind(t, run, cfg, false);
      finishTelemetry(t, run, cfg, cleared, false);
      return { blindsCleared: cleared, won: false, finalAnte: run.ante };
    }
    if (run.phase.name === "shop") {
      cleared++;
      recordBlind(t, run, cfg, true);
      run = doShop(run, samples, t);
      run = startPlaying(nextBlind(run));
      if (run.ante > maxAnte) {
        finishTelemetry(t, run, cfg, cleared, false);
        return { blindsCleared: cleared, won: false, finalAnte: run.ante };
      }
      continue;
    }
    if (run.phase.name === "blindIntro") {
      run = startPlaying(run);
      continue;
    }
    const plan = chooseBlindPlan(run, cfg);
    run = plan.run;
    samples = [...samples, ...plan.recorded].slice(-SAMPLE_CAP);
  }
  finishTelemetry(t, run, cfg, cleared, false);
  return { blindsCleared: cleared, won: false, finalAnte: run.ante };
}

function recordBlind(t: Telemetry | undefined, run: RunState, cfg: BotConfig, cleared: boolean) {
  if (!t || !run.blind) return;
  t.blinds.push({
    ante: run.ante,
    kind: run.blind.kind,
    score: run.blind.score,
    target: run.blind.target,
    cleared,
    label: cfg.label ?? "default",
  });
}

function finishTelemetry(
  t: Telemetry | undefined,
  run: RunState,
  cfg: BotConfig,
  blindsCleared: number,
  won: boolean,
) {
  if (!t) return;
  for (const inst of run.jokers) {
    bump(won ? t.jokerInWins : t.jokerInLosses, inst.id);
  }
  t.runs.push({ label: cfg.label ?? "default", blindsCleared, won, finalAnte: run.ante });
}

// ---- FROZEN greedy baseline (do not improve — it's the regression yardstick) ----

export function playGreedyRun(seed: number, maxAnte = 8, opts: NewRunOpts = {}): RunResult {
  let run = startPlaying(newRun(seed, opts));
  let cleared = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (run.phase.name === "won") return { blindsCleared: cleared, won: true, finalAnte: run.ante };
    if (run.phase.name === "lost") return { blindsCleared: cleared, won: false, finalAnte: run.ante };
    if (run.phase.name === "shop") {
      cleared++;
      run = buyJoker(run, 0);
      run = buyJoker(run, 1);
      run = startPlaying(nextBlind(run));
      if (run.ante > maxAnte) return { blindsCleared: cleared, won: false, finalAnte: run.ante };
      continue;
    }
    if (run.phase.name === "blindIntro") {
      run = startPlaying(run);
      continue;
    }
    run = greedyMove(run);
  }
  return { blindsCleared: cleared, won: false, finalAnte: run.ante };
}

function greedyMove(run: RunState): RunState {
  let best: { run: RunState; total: number } | null = null;
  for (let from = 0; from < SQUARES; from++) {
    for (const to of legalMovesFor(run, from)) {
      const { run: after, events } = playMove(run, from, to);
      const total = totalOf(events);
      if (!best || total > best.total) best = { run: after, total };
    }
  }
  if (best) return best.run;
  const blind = run.blind;
  if (blind && blind.swapsLeft > 0 && blind.queue.length > 0) {
    for (let sq = 0; sq < SQUARES; sq++) {
      if (blind.board[sq]?.kind !== "own") continue;
      if (legalMovesFor(run, sq).length === 0) {
        const swapped = swapPiece(run, sq);
        if (swapped !== run) return swapped;
      }
    }
  }
  return { ...run, phase: { name: "lost" } };
}
