import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { modifiersFor } from "./engine/bosses";
import {
  buyCharm,
  buyEnhancement,
  buyJoker,
  buyPack,
  buyPatent,
  enterEndless,
  canSwap,
  legalMovesFor,
  mustSwap,
  newRun,
  nextBlind,
  playMove,
  removePiece,
  rerollShop,
  sellJoker,
  skipBlind,
  startPlaying,
  swapPiece,
  useCharm,
} from "./engine/run";
import { CHARMS } from "./engine/charms";
import type { OpeningId, RunState, Square } from "./engine/types";
import { Board } from "./ui/Board";
import { TipLayer } from "./ui/Card";
import { Wordmark } from "./ui/Wordmark";
import { Codex } from "./ui/Codex";
import { CharmBar } from "./ui/CharmBar";
import { OpeningPicker } from "./ui/OpeningPicker";
import { BlindIntro } from "./ui/BlindIntro";
import { HowToPlay } from "./ui/HowToPlay";
import { Hud } from "./ui/Hud";
import { JokerBar } from "./ui/JokerBar";
import { RunSummary } from "./ui/RunSummary";
import { Shop } from "./ui/Shop";
import { JOKER_SLOTS } from "./engine/constants";
import { loadArtManifest } from "./ui/art";
import { ensureCtx } from "./ui/audio";
import { AudioSettings } from "./ui/AudioSettings";
import { countUp, replayScore, sfx, type Popup } from "./ui/fx";
import { requestLine } from "./ui/knightLines";
import { Knight } from "./ui/Knight";
import { music, type MusicPhase } from "./ui/music";
import { activeTip, loadSeenTips, markTipSeen, resetTips, type TipId } from "./ui/tips";
import {
  clearRun,
  loadLastRun,
  loadRun,
  loadStats,
  recordCodex,
  recordEndlessDepth,
  recordRunEnd,
  saveRun,
} from "./save";

type Screen = "menu" | "openings" | "codex" | "game";

export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [run, setRun] = useState<RunState | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [dests, setDests] = useState<Square[]>([]);
  const [previews, setPreviews] = useState<Record<Square, number>>({});
  const [showHelp, setShowHelp] = useState(false);
  const [seenTips, setSeenTips] = useState<Set<TipId>>(loadSeenTips);
  const [swapMode, setSwapMode] = useState(false);
  const [charmArm, setCharmArm] = useState<number | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [tally, setTally] = useState<{ chips: number; mult: number }>({ chips: 0, mult: 1 });
  const [replaying, setReplaying] = useState(false);
  const [firing, setFiring] = useState<string | null>(null);
  const [animScore, setAnimScore] = useState(0);
  const [shake, setShake] = useState<"" | "shake" | "shake-big">("");
  const [landedSq, setLandedSq] = useState<Square | null>(null);
  const [burstSq, setBurstSq] = useState<Square | null>(null);
  const cancelReplay = useRef<(() => void) | null>(null);
  const cancelCount = useRef<(() => void) | null>(null);
  const endedRuns = useRef(new Set<number>());
  const lastPhaseKey = useRef("");

  // Painted art swaps in when the manifest lists files (docs/art-prompts.md).
  const [, setArtReady] = useState(false);
  useEffect(() => {
    void loadArtManifest().then(() => setArtReady(true));
  }, []);

  // Audio unlock: the context may only start inside a user gesture.
  useEffect(() => {
    const unlock = () => {
      ensureCtx();
      music.start();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Music follows the game phase; one-shot stingers fire on phase entry.
  useEffect(() => {
    let phase: MusicPhase = "menu";
    let key = "menu";
    if (screen === "game" && run) {
      const p = run.phase.name;
      key = `${p}:${run.ante}:${run.blindIdx}`;
      if (p === "won" || p === "lost") {
        if (lastPhaseKey.current !== key) {
          lastPhaseKey.current = key;
          music.sting(p === "won" ? "win" : "lose");
          requestLine(p === "won" ? "win" : "loss");
        }
        return;
      }
      phase = p === "shop" ? "shop" : run.blindIdx === 2 ? "boss" : "playing";
    }
    music.setPhase(phase);
    if (lastPhaseKey.current !== key) {
      lastPhaseKey.current = key;
      if (screen === "game" && run?.phase.name === "shop") {
        sfx.shopBell();
        requestLine("shop");
      }
      if (screen === "game" && run?.phase.name === "blindIntro" && run.blindIdx === 2) {
        sfx.bossSting();
        requestLine("boss");
      }
    }
  }, [screen, run]);

  // Persist runs; record win/loss once; fold discoveries into the codex.
  useEffect(() => {
    if (!run) return;
    recordCodex(run);
    if (run.phase.name === "won" || run.phase.name === "lost") {
      if (!endedRuns.current.has(run.seed)) {
        endedRuns.current.add(run.seed);
        recordRunEnd(run, run.phase.name === "won");
      } else if (run.phase.name === "lost" && run.endless) {
        // The win was already counted; the Endless Night only moves the bests.
        recordEndlessDepth(run);
      }
      clearRun();
    } else {
      saveRun(run);
    }
  }, [run]);

  const addPopup = useCallback((p: Popup) => {
    setPopups((prev) => [...prev, p]);
    setTimeout(() => setPopups((prev) => prev.filter((q) => q.id !== p.id)), 1100);
  }, []);

  // Score previews are training wheels: shown only while the White Knight's
  // underdog lessons are still being taught. Afterward the mental math IS the
  // game (Balatro never shows you a hand's score in advance either).
  const previewsOn = !seenTips.has("underdog") || !seenTips.has("royalHabit");

  const previewFor = (r: RunState, from: Square, ds: Square[]) => {
    const out: Record<Square, number> = {};
    if (!previewsOn) return out;
    for (const to of ds) {
      const { events } = playMove(r, from, to);
      const t = events.find((e) => e.kind === "total");
      if (t && t.kind === "total") out[to] = t.amount;
    }
    return out;
  };

  const dismissTip = (id: TipId) => {
    // The queen intercept and the underdog ladder teach the same fact —
    // dismissing either retires both.
    const ids: TipId[] =
      id === "royalHabit" || id === "underdog" ? ["royalHabit", "underdog"] : [id];
    ids.forEach(markTipSeen);
    setSeenTips(new Set([...seenTips, ...ids]));
  };

  const beginRun = (r: RunState) => {
    cancelReplay.current?.();
    cancelCount.current?.();
    music.setSeed(r.seed);
    music.start();
    setRun(r);
    setScreen("game");
    setSelected(null);
    setDests([]);
    setPreviews({});
    setSwapMode(false);
    setCharmArm(null);
    setPopups([]);
    setTally({ chips: 0, mult: 1 });
    setReplaying(false);
    setAnimScore(r.blind?.score ?? 0);
  };

  const handleMove = (from: Square, to: Square) => {
    if (!run || replaying) return;
    const wasCapture = run.blind?.board[to]?.kind === "bounty";
    const { run: next, events } = playMove(run, from, to);
    if (events.length === 0) return;
    sfx.land(wasCapture);
    if (wasCapture) {
      setBurstSq(to);
      setTimeout(() => setBurstSq(null), 750);
    }
    const hadShatter = events.some((e) => e.kind === "shatter");
    const hadPromote = events.some((e) => e.kind === "promote");
    const fromScore = run.blind?.score ?? 0;
    setRun(next);
    setSelected(null);
    setDests([]);
    setPreviews({});
    setLandedSq(to);
    setReplaying(true);
    cancelReplay.current = replayScore(events, {
      popup: addPopup,
      tally: (chips, mult) => setTally({ chips, mult }),
      total: (amount, big) => {
        cancelCount.current = countUp(fromScore, fromScore + amount, 500, setAnimScore);
        setShake(big ? "shake-big" : "shake");
        setTimeout(() => setShake(""), 450);
        if (amount >= 300) requestLine("bigTotal");
        else if (amount < 15) requestLine("blunder");
      },
      jokerFire: (source) => {
        setFiring(source);
        setTimeout(() => setFiring(null), 350);
      },
      done: () => {
        setReplaying(false);
        setLandedSq(null);
        setTimeout(() => setTally({ chips: 0, mult: 1 }), 600);
        if (hadShatter) requestLine("shatter");
        else if (hadPromote) requestLine("promotion");
      },
    });
  };

  const handleSquareClick = (sq: Square) => {
    if (!run || run.phase.name !== "playing" || replaying) return;
    const blind = run.blind!;
    const cell = blind.board[sq];

    if (charmArm !== null) {
      const next = useCharm(run, charmArm, sq);
      if (next !== run) {
        sfx.coin();
        setRun(next);
        setCharmArm(null);
      }
      return;
    }

    if (swapMode) {
      if (cell?.kind === "own" && blind.swapsLeft > 0 && blind.queue.length > 0) {
        const next = swapPiece(run, sq);
        setRun(next);
        // One swap per arming — a stray second click must not bench another piece.
        setSwapMode(false);
      }
      return;
    }

    if (selected !== null && dests.includes(sq)) {
      handleMove(selected, sq);
      return;
    }
    if (cell?.kind === "own") {
      if (sq === selected) {
        setSelected(null);
        setDests([]);
        setPreviews({});
      } else {
        const moves = legalMovesFor(run, sq);
        sfx.select();
        setSelected(sq);
        setDests(moves);
        setPreviews(previewFor(run, sq, moves));
      }
      return;
    }
    setSelected(null);
    setDests([]);
    setPreviews({});
  };

  const startNewRun = () => setScreen("openings");

  // Seed 230: two natural captures, then no legal moves at 76/100 — the
  // Knight's swap lesson arrives exactly when swapping is the only way on.
  const TUTORIAL_SEED = 230;
  const startRunWith = (opening: OpeningId, trial: number, seed?: number) => {
    const fresh = !seenTips.has("arrival");
    const chosen =
      seed ??
      (fresh && opening === "classical" && trial === 0
        ? TUTORIAL_SEED
        : Math.floor(Math.random() * 0xffffffff) || 1);
    beginRun(newRun(chosen, { opening, trial }));
  };

  const handleCharmClick = (index: number) => {
    if (!run) return;
    const id = run.charms[index];
    if (!id) return;
    const def = CHARMS[id];
    setSwapMode(false);
    if (def.target === "boardPiece") {
      setCharmArm(charmArm === index ? null : index);
      return;
    }
    if (def.target === "none") {
      const next = useCharm(run, index);
      if (next !== run) {
        sfx.coin();
        setRun(next);
      }
      setCharmArm(null);
    }
  };

  /** Run a shop action; play its sound only if the action actually happened. */
  const shopAction = (next: RunState, sound: () => void) => {
    if (next !== run) sound();
    setRun(next);
  };

  if (screen === "openings") {
    return <OpeningPicker onStart={startRunWith} onBack={() => setScreen("menu")} />;
  }

  if (screen === "codex") {
    return <Codex onBack={() => setScreen("menu")} />;
  }

  if (screen === "menu") {
    const saved = loadRun();
    const stats = loadStats();
    const lastRun = loadLastRun();
    return (
      <main class="menu">
        <div class="menu-glow" />
        <div class="menu-arena" aria-hidden="true" />
        <div class="menu-motes" aria-hidden="true">
          {[...Array(7)].map((_, i) => (
            <i key={i} class={`mote m${i}`} />
          ))}
        </div>
        <h1 class="menu-title">
          <Wordmark />
        </h1>
        <p class="menu-tag">The house plays black.</p>
        <div class="menu-actions">
          <button class="btn primary" onClick={startNewRun}>
            New Run
          </button>
          {saved && (
            <button class="btn ghost" onClick={() => beginRun(saved)}>
              Continue — ante {saved.ante}
            </button>
          )}
          <button class="btn ghost" onClick={() => setShowHelp(true)}>
            How to Play
          </button>
          <button class="btn ghost" onClick={() => setScreen("codex")}>
            Codex
          </button>
        </div>
        {showHelp && (
          <HowToPlay
            onClose={() => setShowHelp(false)}
            onResetTips={() => {
              resetTips();
              setSeenTips(new Set());
            }}
          />
        )}
        {stats.runs > 0 && (
          <p class="menu-stats">
            {stats.runs} runs · {stats.wins} wins · best ante {stats.bestAnte} · best move{" "}
            {stats.bestMove.toLocaleString()}
            {stats.bestTrialWon >= 0 &&
              ` · won at Trial ${stats.bestTrialWon === 0 ? "0 (none)" : stats.bestTrialWon}`}
            {stats.bestEndless > 0 && ` · endless depth ${stats.bestEndless}`}
            {lastRun && !saved && (
              <>
                <br />
                last run: {lastRun.won ? "won" : `fell at ante ${lastRun.ante}`} · best move{" "}
                {lastRun.bestMove.toLocaleString()}
              </>
            )}
          </p>
        )}
        <AudioSettings />
        <p class="menu-credit">
          made by Ari Shtaynberg · chess pieces by Colin M.L. Burnett (CC BY-SA 3.0) ·{" "}
          <a
            class="menu-feedback"
            href="https://github.com/Ari-Shtay/blunderland/issues"
            target="_blank"
            rel="noreferrer"
          >
            give feedback
          </a>
        </p>
      </main>
    );
  }

  if (!run) return null;
  const mods = modifiersFor(run);
  const blind = run.blind;
  const showIntro = run.phase.name === "blindIntro";
  const showShop = run.phase.name === "shop" && !replaying;
  const showEnd = (run.phase.name === "won" || run.phase.name === "lost") && !replaying;

  const cellSel = selected !== null ? blind?.board[selected] : null;
  const selectedType =
    cellSel?.kind === "own"
      ? (run.bag.find((p) => p.id === cellSel.pieceId)?.type ?? null)
      : null;
  const tip = replaying
    ? null
    : activeTip({ run, selected, selectedType, dests, swapMode, seen: seenTips });

  return (
    <main class={`game ${shake}`}>
      <Hud
        run={run}
        animScore={animScore}
        liveChips={tally.chips}
        liveMult={tally.mult}
        replaying={replaying}
        onHome={() => setScreen("menu")}
      />
      <section class="stage">
        <JokerBar jokers={run.jokers} firing={firing} />
        <CharmBar
          charms={run.charms}
          armed={charmArm}
          phase={run.phase.name}
          onCharmClick={handleCharmClick}
        />
        {blind && (
          <Board
            blind={blind}
            bag={run.bag}
            mods={mods}
            selected={selected}
            dests={dests}
            previews={previews}
            swapMode={swapMode || charmArm !== null}
            popups={popups}
            landedSq={landedSq}
            burstSq={burstSq}
            onSquareClick={handleSquareClick}
          />
        )}
        <div class="stage-controls">
          <button
            class={`btn ghost${swapMode ? " targeting" : ""}${
              mustSwap(run) && !replaying ? " urgent" : ""
            }`}
            disabled={!canSwap(run)}
            onClick={() => {
              setCharmArm(null);
              setSwapMode(!swapMode);
            }}
          >
            {swapMode ? "Swapping: pick a piece" : `Swap (${blind?.swapsLeft ?? 0})`}
          </button>
          <button class="btn ghost" onClick={() => setScreen("menu")}>
            Menu
          </button>
          <button class="btn ghost help" title="How to Play" onClick={() => setShowHelp(true)}>
            ?
          </button>
          <AudioSettings inline />
        </div>
        {mustSwap(run) && !replaying && (
          <div class="must-swap-hint">No legal moves. Swap a piece to continue.</div>
        )}
        <div class="hud-popups">
          {popups
            .filter((p) => p.sq === undefined)
            .map((p) => (
              <div key={p.id} class={`popup pop-${p.flavor}`}>
                {p.source ? `${p.source}: ` : ""}
                {p.text}
              </div>
            ))}
        </div>
      </section>

      {showIntro && (
        <BlindIntro
          run={run}
          onDeal={() => setRun(startPlaying(run))}
          onSkip={() => {
            sfx.shuffle();
            setRun(skipBlind(run));
          }}
          locked={tip !== null}
        />
      )}
      {showShop && run.phase.name === "shop" && (
        <Shop
          run={run}
          shop={run.phase.shop}
          onBuyJoker={(i) => shopAction(buyJoker(run, i), sfx.coin)}
          onBuyPack={(c) => shopAction(buyPack(run, c), sfx.coin)}
          onBuyEnhancement={(id) => shopAction(buyEnhancement(run, id), sfx.coin)}
          onReroll={() => shopAction(rerollShop(run), sfx.shuffle)}
          onRemove={(id) => shopAction(removePiece(run, id), sfx.coin)}
          onSellJoker={(i) => shopAction(sellJoker(run, i), sfx.sell)}
          onBuyCharm={() => shopAction(buyCharm(run), sfx.coin)}
          onBuyPatent={() => shopAction(buyPatent(run), sfx.coin)}
          onMenu={() => setScreen("menu")}
          onUseCharm={(i, pieceId) => shopAction(useCharm(run, i, pieceId), sfx.coin)}
          onContinue={() => {
            const next = nextBlind(run);
            setRun(next);
            setAnimScore(0);
          }}
        />
      )}
      {showEnd && (
        <RunSummary
          run={run}
          won={run.phase.name === "won"}
          onNewRun={startNewRun}
          onMenu={() => setScreen("menu")}
          onEndless={
            run.phase.name === "won" && !run.endless
              ? () => {
                  sfx.bossSting();
                  setRun(enterEndless(run));
                  setAnimScore(0);
                }
              : undefined
          }
        />
      )}
      {showHelp && (
        <HowToPlay
          onClose={() => setShowHelp(false)}
          onResetTips={() => {
            resetTips();
            setSeenTips(new Set());
          }}
        />
      )}
      <TipLayer />
      <Knight
        tip={tip}
        onDismissTip={dismissTip}
        phaseKey={`${run.phase.name}:${run.ante}:${run.blindIdx}`}
        clickCtx={{
          mustSwap: mustSwap(run),
          lowMoney: run.money < 5,
          jokersFull: run.jokers.length >= JOKER_SLOTS,
          inShop: run.phase.name === "shop",
        }}
        onDeal={showIntro ? () => setRun(startPlaying(run)) : undefined}
        onArmSwap={
          run.phase.name === "playing" && !swapMode && canSwap(run)
            ? () => setSwapMode(true)
            : undefined
        }
      />
    </main>
  );
}
