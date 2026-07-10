// Heavy balance telemetry — run with:  npx vite-node scripts/balance-report.ts
// Env: SEEDS (per label, default 60). Writes reports/balance-<date>.{json,md}.
// This is the StS-style metrics instrument: pick rates, win shares, curves.

import { mkdirSync, writeFileSync } from "node:fs";
import { STARTING_BAG } from "../src/engine/constants";
import type { PieceType } from "../src/engine/types";
import { REPORT_CONFIG, playBotRun } from "../src/sim/bot";
import { buildReport, newTelemetry, renderMarkdown } from "../src/sim/telemetry";

const SEEDS = Number(process.env.SEEDS ?? 60);

const LABELS: Record<string, PieceType[] | undefined> = {
  balanced: undefined, // STARTING_BAG default
  pawnHeavy: ["P", "P", "P", "P", "P", "P", "P", "N", "B", "R"],
  knightCorps: ["N", "N", "N", "N", "P", "P", "P", "B", "B", "R"],
  bishopSynod: ["B", "B", "B", "B", "P", "P", "P", "N", "N", "R"],
  rookTowers: ["R", "R", "R", "P", "P", "P", "P", "N", "B", "Q"],
  queenCourt: ["Q", "Q", "P", "P", "P", "P", "N", "N", "B", "R"],
};

void STARTING_BAG;

const t = newTelemetry();
const started = Date.now();
for (const [label, bag] of Object.entries(LABELS)) {
  const cfg = { ...REPORT_CONFIG, telemetry: t, label };
  for (let seed = 1; seed <= SEEDS; seed++) {
    playBotRun(seed, cfg, 8, { bagOverride: bag });
  }
  console.log(`${label}: ${SEEDS} runs done (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}

const report = buildReport(t);
mkdirSync("reports", { recursive: true });
const date = new Date().toISOString().slice(0, 10);
writeFileSync(`reports/balance-${date}.json`, JSON.stringify(report, null, 2));
writeFileSync(`reports/balance-${date}.md`, renderMarkdown(report));
console.log(`\nwrote reports/balance-${date}.{json,md}\n`);

// Console digest: headline + flags
console.log(
  `runs ${report.runs} · win ${(report.winRate * 100).toFixed(1)}% · avg blinds ${report.avgBlinds.toFixed(2)}`,
);
const never = report.jokers.filter((j) => j.offered >= 10 && j.bought === 0);
const always = report.jokers.filter((j) => j.offered >= 10 && j.pickRate > 0.9);
console.log(`never picked (${never.length}): ${never.map((j) => j.id).join(", ")}`);
console.log(`near-always picked (${always.length}): ${always.map((j) => j.id).join(", ")}`);
