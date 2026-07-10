// Balance gates, driven by the policy bot (src/sim/bot.ts). The old greedy
// bot stays frozen inside bot.ts as the regression yardstick.
//
// The piece-parity test is the permanent guard against any piece archetype
// dominating (the "queen problem"): archetype bags race across seeds and no
// bag may pull too far ahead of the pack. Heavy telemetry lives in
// scripts/balance-report.ts, not here — gates must stay fast.

import { describe, expect, it } from "vitest";
import { STARTING_BAG } from "./constants";
import type { PieceType } from "./types";
import { OPENING_IDS } from "./openings";
import { GATE_CONFIG, playBotRun, playGreedyRun } from "../sim/bot";

const ARCHETYPES: Record<string, PieceType[]> = {
  balanced: STARTING_BAG,
  pawnHeavy: ["P", "P", "P", "P", "P", "P", "P", "N", "B", "R"],
  knightCorps: ["N", "N", "N", "N", "P", "P", "P", "B", "B", "R"],
  bishopSynod: ["B", "B", "B", "B", "P", "P", "P", "N", "N", "R"],
  rookTowers: ["R", "R", "R", "P", "P", "P", "P", "N", "B", "Q"],
  queenCourt: ["Q", "Q", "P", "P", "P", "P", "N", "N", "B", "R"],
};

describe("balance sim (policy bot)", () => {
  it("ante 1 small blind is clearable in most seeds", () => {
    const N = 60;
    let clearedFirst = 0;
    let totalBlinds = 0;
    for (let seed = 1; seed <= N; seed++) {
      const r = playBotRun(seed, GATE_CONFIG, 3);
      totalBlinds += r.blindsCleared;
      if (r.blindsCleared >= 1) clearedFirst++;
    }
    console.log(
      `policy bot: cleared ante-1 small in ${clearedFirst}/${N} seeds; avg blinds (cap ante 3) = ${(totalBlinds / N).toFixed(2)}`,
    );
    expect(clearedFirst / N).toBeGreaterThan(0.7);
  });

  it("piece parity: no archetype bag dominates", { timeout: 20000 }, () => {
    const SEEDS = 40;
    const results: Record<string, { avg: number; firstClearRate: number }> = {};
    for (const [name, bag] of Object.entries(ARCHETYPES)) {
      let firstClears = 0;
      let totalBlinds = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = playBotRun(seed, GATE_CONFIG, 3, { bagOverride: bag });
        totalBlinds += r.blindsCleared;
        if (r.blindsCleared >= 1) firstClears++;
      }
      results[name] = { avg: totalBlinds / SEEDS, firstClearRate: firstClears / SEEDS };
    }
    const rows = Object.entries(results)
      .sort((a, b) => b[1].avg - a[1].avg)
      .map(
        ([name, r]) =>
          `  ${name.padEnd(12)} avg blinds ${r.avg.toFixed(2)}  ante-1 clear ${(r.firstClearRate * 100).toFixed(0)}%`,
      );
    console.log(`piece parity (cap ante 3, ${SEEDS} seeds):\n${rows.join("\n")}`);

    const avgs = Object.values(results).map((r) => r.avg);
    const spread = Math.max(...avgs) - Math.min(...avgs);
    for (const [name, r] of Object.entries(results)) {
      expect(r.firstClearRate, `${name} ante-1 clear rate`).toBeGreaterThanOrEqual(0.6);
    }
    expect(spread, "avg-blinds spread across archetypes").toBeLessThanOrEqual(2.0);
  });

  it("policy bot outplays the frozen greedy baseline", () => {
    const SEEDS = 20;
    let policy = 0;
    let greedy = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      policy += playBotRun(seed, GATE_CONFIG, 4).blindsCleared;
      greedy += playGreedyRun(seed, 4).blindsCleared;
    }
    console.log(
      `policy ${(policy / SEEDS).toFixed(2)} vs greedy ${(greedy / SEEDS).toFixed(2)} avg blinds (cap ante 4)`,
    );
    expect(policy).toBeGreaterThanOrEqual(greedy);
  });

  it("full-depth smoke: runs terminate and reach real depth", { timeout: 20000 }, () => {
    const SEEDS = 20;
    let totalWon = 0;
    let deepest = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = playBotRun(seed, GATE_CONFIG, 8);
      if (r.won) totalWon++;
      deepest = Math.max(deepest, r.finalAnte);
    }
    console.log(`full runs: ${totalWon}/${SEEDS} wins, deepest ante ${deepest}`);
    expect(deepest).toBeGreaterThanOrEqual(3);
  });
});

describe("openings gate", () => {
  it("every opening is playable and near Classical", { timeout: 30000 }, () => {
    const SEEDS = 30;
    const results: Record<string, { avg: number; firstClearRate: number }> = {};
    for (const id of OPENING_IDS) {
      let firstClears = 0;
      let totalBlinds = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = playBotRun(seed, GATE_CONFIG, 3, { opening: id });
        totalBlinds += r.blindsCleared;
        if (r.blindsCleared >= 1) firstClears++;
      }
      results[id] = { avg: totalBlinds / SEEDS, firstClearRate: firstClears / SEEDS };
    }
    const classical = results.classical.avg;
    const rows = Object.entries(results).map(
      ([id, r]) =>
        `  ${id.padEnd(13)} avg ${r.avg.toFixed(2)} (${(r.avg / classical).toFixed(2)}× classical)  ante-1 ${(r.firstClearRate * 100).toFixed(0)}%`,
    );
    console.log(`openings (cap ante 3, ${SEEDS} seeds):\n${rows.join("\n")}`);
    for (const [id, r] of Object.entries(results)) {
      expect(r.firstClearRate, `${id} ante-1 clear`).toBeGreaterThanOrEqual(0.6);
      const ratio = r.avg / classical;
      expect(ratio, `${id} avg ratio vs classical`).toBeGreaterThanOrEqual(0.65);
      expect(ratio, `${id} avg ratio vs classical`).toBeLessThanOrEqual(1.35);
    }
  });
});
