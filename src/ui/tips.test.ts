// activeTip is pure — priority and trigger logic tested headlessly.

import { describe, expect, it } from "vitest";
import { newRun } from "../engine/run";
import type { RunState } from "../engine/types";
import { activeTip, TIP_ANCHORS, TIP_TEXT, type TipCtx, type TipId } from "./tips";

const base = newRun(1); // phase: blindIntro, ante 1, blindIdx 0, blind non-null

function ctx(over: Partial<TipCtx> = {}, runOver: Partial<RunState> = {}): TipCtx {
  return {
    run: { ...base, ...runOver },
    selected: null,
    selectedType: null,
    dests: [],
    swapMode: false,
    seen: new Set<TipId>(),
    ...over,
  };
}

const seen = (...ids: TipId[]) => new Set<TipId>(ids);

describe("activeTip", () => {
  it("arrival fires first at the very first blind intro, then goal", () => {
    expect(activeTip(ctx())).toBe("arrival");
    expect(activeTip(ctx({ seen: seen("arrival") }))).toBe("goal");
    expect(activeTip(ctx({ seen: seen("arrival", "goal") }))).toBe(null);
  });

  it("boss fires at a boss intro once arrival is seen", () => {
    const c = ctx({ seen: seen("arrival", "goal") }, { blindIdx: 2 });
    expect(activeTip(c)).toBe("boss");
  });

  it("royalHabit intercepts the first queen selection and beats underdog", () => {
    const playing = { phase: { name: "playing" } as const };
    expect(activeTip(ctx({ selectedType: "Q", selected: 0 }, playing))).toBe("royalHabit");
    expect(activeTip(ctx({ selectedType: "P", selected: 0 }, playing))).toBe("underdog");
    expect(activeTip(ctx({ selectedType: null }, playing))).toBe(null);
    // queen selection with royalHabit seen does NOT fall through to underdog
    expect(
      activeTip(ctx({ selectedType: "Q", selected: 0, seen: seen("royalHabit") }, playing)),
    ).toBe(null);
  });

  it("swap fires on each trigger leg, and only when a swap is possible", () => {
    const blind = base.blind!;
    const playing = { phase: { name: "playing" } as const };
    const withBlind = (b: Partial<typeof blind>) => ({
      ...playing,
      blind: { ...blind, queue: [99], swapsLeft: 3, ...b },
    });
    // leg 1: player armed swap themselves
    expect(activeTip(ctx({ swapMode: true }, withBlind({})))).toBe("swap");
    // leg 2: strategically live mid-blind (low moves + a spent piece).
    // "spent" is higher priority and would already be seen by then.
    expect(
      activeTip(ctx({ seen: seen("spent") }, withBlind({ movesLeft: 2, exhausted: [1] }))),
    ).toBe("swap");
    // not without swaps or queue
    expect(activeTip(ctx({ swapMode: true }, withBlind({ swapsLeft: 0 })))).toBe(null);
    expect(activeTip(ctx({ swapMode: true }, withBlind({ queue: [] })))).toBe(null);
    // not when nothing makes it teachable
    expect(activeTip(ctx({}, withBlind({ movesLeft: 4 })))).toBe(null);
  });

  it("every tip has text and an anchor entry", () => {
    for (const id of Object.keys(TIP_TEXT) as TipId[]) {
      expect(TIP_TEXT[id].length).toBeGreaterThan(10);
      expect(TIP_ANCHORS[id] !== undefined).toBe(true);
    }
  });
});
