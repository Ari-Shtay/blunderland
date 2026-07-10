// Telemetry sink for bot runs + report shaping. Pure data, no engine imports
// beyond types. The report is the game's balance instrument (StS-style pick
// rates / win rates), consumed by scripts/balance-report.ts.

import type { BlindKind, CharmId, JokerId } from "../engine/types";

export interface BlindRecord {
  ante: number;
  kind: BlindKind;
  score: number;
  target: number;
  cleared: boolean;
  label: string; // archetype / opening tag
}

export interface Telemetry {
  jokerOffered: Map<JokerId, number>;
  jokerBought: Map<JokerId, number>;
  jokerSold: Map<JokerId, number>;
  /** Owned at run end, split by outcome. */
  jokerInWins: Map<JokerId, number>;
  jokerInLosses: Map<JokerId, number>;
  /** Value the policy model assigned at purchase (for residual auditing). */
  jokerValueAtBuy: Map<JokerId, number[]>;
  charmBought: Map<CharmId, number>;
  charmUsed: Map<CharmId, number>;
  blinds: BlindRecord[];
  moneyAtShop: { ante: number; money: number }[];
  runs: { label: string; blindsCleared: number; won: boolean; finalAnte: number }[];
}

export function newTelemetry(): Telemetry {
  return {
    jokerOffered: new Map(),
    jokerBought: new Map(),
    jokerSold: new Map(),
    jokerInWins: new Map(),
    jokerInLosses: new Map(),
    jokerValueAtBuy: new Map(),
    charmBought: new Map(),
    charmUsed: new Map(),
    blinds: [],
    moneyAtShop: [],
    runs: [],
  };
}

export const bump = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export interface JokerReportRow {
  id: string;
  offered: number;
  bought: number;
  pickRate: number; // bought / offered
  inWins: number;
  inLosses: number;
  winShare: number; // inWins / (inWins + inLosses)
  avgValueAtBuy: number;
}

export interface BalanceReport {
  runs: number;
  winRate: number;
  avgBlinds: number;
  jokers: JokerReportRow[];
  charms: { id: string; bought: number; used: number }[];
  anteCurve: {
    ante: number;
    blinds: number;
    clearRate: number;
    p10: number;
    p50: number;
    p90: number;
  }[];
  byLabel: { label: string; runs: number; winRate: number; avgBlinds: number }[];
  economy: { ante: number; medianMoney: number }[];
}

const pct = (n: number) => Math.round(n * 1000) / 10;
const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

export function buildReport(t: Telemetry): BalanceReport {
  const jokerIds = new Set<JokerId>([
    ...t.jokerOffered.keys(),
    ...t.jokerBought.keys(),
    ...t.jokerInWins.keys(),
    ...t.jokerInLosses.keys(),
  ]);
  const jokers: JokerReportRow[] = [...jokerIds]
    .map((id) => {
      const offered = t.jokerOffered.get(id) ?? 0;
      const bought = t.jokerBought.get(id) ?? 0;
      const inWins = t.jokerInWins.get(id) ?? 0;
      const inLosses = t.jokerInLosses.get(id) ?? 0;
      const values = t.jokerValueAtBuy.get(id) ?? [];
      return {
        id,
        offered,
        bought,
        pickRate: offered > 0 ? bought / offered : 0,
        inWins,
        inLosses,
        winShare: inWins + inLosses > 0 ? inWins / (inWins + inLosses) : 0,
        avgValueAtBuy:
          values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      };
    })
    .sort((a, b) => b.pickRate - a.pickRate);

  const antes = [...new Set(t.blinds.map((b) => b.ante))].sort((a, b) => a - b);
  const anteCurve = antes.map((ante) => {
    const rows = t.blinds.filter((b) => b.ante === ante);
    const ratios = rows.map((b) => b.score / b.target);
    return {
      ante,
      blinds: rows.length,
      clearRate: rows.filter((b) => b.cleared).length / rows.length,
      p10: quantile(ratios, 0.1),
      p50: quantile(ratios, 0.5),
      p90: quantile(ratios, 0.9),
    };
  });

  const labels = [...new Set(t.runs.map((r) => r.label))];
  const byLabel = labels.map((label) => {
    const rows = t.runs.filter((r) => r.label === label);
    return {
      label,
      runs: rows.length,
      winRate: rows.filter((r) => r.won).length / rows.length,
      avgBlinds: rows.reduce((a, r) => a + r.blindsCleared, 0) / rows.length,
    };
  });

  const economy = antes.map((ante) => ({
    ante,
    medianMoney: quantile(
      t.moneyAtShop.filter((m) => m.ante === ante).map((m) => m.money),
      0.5,
    ),
  }));

  return {
    runs: t.runs.length,
    winRate: t.runs.length ? t.runs.filter((r) => r.won).length / t.runs.length : 0,
    avgBlinds: t.runs.length
      ? t.runs.reduce((a, r) => a + r.blindsCleared, 0) / t.runs.length
      : 0,
    jokers,
    charms: [...new Set([...t.charmBought.keys(), ...t.charmUsed.keys()])].map((id) => ({
      id,
      bought: t.charmBought.get(id) ?? 0,
      used: t.charmUsed.get(id) ?? 0,
    })),
    anteCurve,
    byLabel,
    economy,
  };
}

export function renderMarkdown(r: BalanceReport): string {
  const lines: string[] = [];
  lines.push(`# Blunderland balance report`);
  lines.push(``);
  lines.push(
    `Runs: **${r.runs}** · win rate **${pct(r.winRate)}%** · avg blinds **${r.avgBlinds.toFixed(2)}**`,
  );
  lines.push(``);
  lines.push(`## By label`);
  lines.push(`| label | runs | win% | avg blinds |`);
  lines.push(`|---|---|---|---|`);
  for (const b of r.byLabel)
    lines.push(`| ${b.label} | ${b.runs} | ${pct(b.winRate)} | ${b.avgBlinds.toFixed(2)} |`);
  lines.push(``);
  lines.push(`## Ante curve`);
  lines.push(`| ante | blinds | clear% | p10 | p50 | p90 |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const a of r.anteCurve)
    lines.push(
      `| ${a.ante} | ${a.blinds} | ${pct(a.clearRate)} | ${a.p10.toFixed(2)} | ${a.p50.toFixed(2)} | ${a.p90.toFixed(2)} |`,
    );
  lines.push(``);
  lines.push(`## Jokers (pick rate · win share when owned)`);
  lines.push(`| joker | offered | bought | pick% | wins | losses | win-share% | model value |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const j of r.jokers)
    lines.push(
      `| ${j.id} | ${j.offered} | ${j.bought} | ${pct(j.pickRate)} | ${j.inWins} | ${j.inLosses} | ${pct(j.winShare)} | ${j.avgValueAtBuy.toFixed(1)} |`,
    );
  lines.push(``);
  lines.push(`## Charms`);
  lines.push(`| charm | bought | used |`);
  lines.push(`|---|---|---|`);
  for (const c of r.charms) lines.push(`| ${c.id} | ${c.bought} | ${c.used} |`);
  lines.push(``);
  lines.push(`## Economy (median $ at shop)`);
  lines.push(`| ante | median $ |`);
  lines.push(`|---|---|`);
  for (const e of r.economy) lines.push(`| ${e.ante} | ${e.medianMoney} |`);
  lines.push(``);
  return lines.join("\n");
}
