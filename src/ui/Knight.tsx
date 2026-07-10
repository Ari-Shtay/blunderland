// The White Knight: persistent avatar + speech bubble with typewriter
// beep-speech. First-time tips send him TRAVELING — he hops to the element
// he's teaching, a spotlight dims everything else, and input is held until
// the player clicks through. Reactive lines and click-quips stay at his dock.
// The arrival cameo (once ever): he rides in, tumbles off, introduces himself.

import { useEffect, useRef, useState } from "preact/hooks";
import { sfx } from "./fx";
import {
  clickLine,
  onKnightLine,
  type ClickCtx,
  type KnightCategory,
  type KnightLine,
} from "./knightLines";
import { artUrl, hasArt } from "./art";
import { PIECE_URI } from "./pieces";
import { TIP_ANCHORS, TIP_TEXT, type TipAnchor, type TipId } from "./tips";

type Speech =
  | { kind: "tip"; id: TipId; text: string }
  | { kind: "line"; category: KnightCategory; text: string };

type Stance =
  | { name: "dock" }
  | { name: "cameo-ride" }
  | { name: "cameo-tumble" }
  | { name: "travel"; tipId: TipId }
  | { name: "field"; tipId: TipId }
  | { name: "return" };

export interface KnightProps {
  tip: TipId | null;
  onDismissTip: (id: TipId) => void;
  clickCtx: ClickCtx;
  /** Deal the intro blind (defined only while the blind intro is up). */
  onDeal?: () => void;
  /** Arm swap mode (defined only when arming is currently meaningful). */
  onArmSwap?: () => void;
  /** Changes whenever the game phase does — stale reactive lines clear on it. */
  phaseKey?: string;
}

const TYPE_MS = 28;
const LINE_LINGER_MS = 6000;
const KNIGHT = 56; // avatar box, matches CSS
const GAP = 18;
const TOP_MIN = 175; // bubble headroom above the knight
const TRAVEL_MS = 950;
const RIDE_MS = 2050;
const TUMBLE_MS = 1250;

const TIP_ACTIONS: Partial<Record<TipId, { label: string; prop: "onDeal" | "onArmSwap" }>> = {
  goal: { label: "Deal me in", prop: "onDeal" },
  swap: { label: "Show me — arm a swap", prop: "onArmSwap" },
};

interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
}

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const dockPoint = () => ({
  x: window.innerWidth - KNIGHT - 19.2,
  y: window.innerHeight - KNIGHT - 16,
});

function resolveAnchorEl(anchor: TipAnchor): Element | null {
  for (const sel of anchor.selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function holeFor(el: Element, anchor: TipAnchor): Hole {
  const r = el.getBoundingClientRect();
  const pad = anchor.pad ?? 8;
  return { x: r.left - pad, y: r.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad };
}

function placeBeside(hole: Hole, side?: "above"): { x: number; y: number; flip: boolean } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = hole.x + hole.w / 2;
  const cy = hole.y + hole.h / 2;
  let x: number;
  let y: number;
  if (side === "above") {
    x = Math.min(Math.max(cx - KNIGHT / 2, 12), vw - KNIGHT - 12);
    y = Math.max(hole.y - KNIGHT - GAP, TOP_MIN);
  } else if (hole.x - KNIGHT - GAP >= 12) {
    x = hole.x - KNIGHT - GAP;
    y = Math.min(Math.max(cy - KNIGHT / 2, TOP_MIN), vh - KNIGHT - 16);
  } else if (hole.x + hole.w + GAP + KNIGHT <= vw - 12) {
    x = hole.x + hole.w + GAP;
    y = Math.min(Math.max(cy - KNIGHT / 2, TOP_MIN), vh - KNIGHT - 16);
  } else {
    x = Math.min(Math.max(cx - KNIGHT / 2, 12), vw - KNIGHT - 12);
    y = Math.min(hole.y + hole.h + GAP, vh - KNIGHT - 16);
  }
  // The bubble opens AWAY from the hole so it never covers the lesson.
  return { x, y, flip: x + KNIGHT / 2 > cx };
}

export function Knight(props: KnightProps) {
  const { tip, onDismissTip, clickCtx } = props;
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [typed, setTyped] = useState(0);
  const [stance, setStance] = useState<Stance>({ name: "dock" });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [noAnim, setNoAnim] = useState(false);
  const [hole, setHole] = useState<Hole | null>(null);
  const [flip, setFlip] = useState(false);

  const [bubbleShift, setBubbleShift] = useState(0);
  const [nudge, setNudge] = useState(0);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const pendingImportant = useRef<KnightLine | null>(null);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clop = useRef<ReturnType<typeof setInterval> | null>(null);
  const stanceRef = useRef(stance);
  stanceRef.current = stance;
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const typedRef = useRef(typed);
  typedRef.current = typed;

  const typing = speech !== null && typed < speech.text.length;
  const done = speech !== null && !typing;
  const spotlightUp =
    hole !== null ||
    stance.name === "cameo-ride" ||
    stance.name === "cameo-tumble" ||
    (speech?.kind === "tip" && speech.id === "arrival");

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (clop.current) {
      clearInterval(clop.current);
      clop.current = null;
    }
  };
  useEffect(() => clearTimers, []);

  // ---- journeys ----

  const showTip = (tipId: TipId) =>
    setSpeech({ kind: "tip", id: tipId, text: TIP_TEXT[tipId] });

  const glideTo = (target: { x: number; y: number }) => {
    // FLIP: pin the current dock point untransitioned, then release toward
    // the target so the CSS transition carries him.
    setNoAnim(true);
    setPos(dockPoint());
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setNoAnim(false);
        setPos(target);
      }),
    );
  };

  const beginJourney = (tipId: TipId, el: Element, anchor: TipAnchor) => {
    const h = holeFor(el, anchor);
    const target = placeBeside(h, anchor.side);
    setHole(h); // spotlight up from this instant — input is frozen
    setFlip(target.flip);
    setSpeech(null);
    if (reducedMotion()) {
      setNoAnim(true);
      setPos({ x: target.x, y: target.y });
      setStance({ name: "field", tipId });
      showTip(tipId);
      return;
    }
    setStance({ name: "travel", tipId });
    glideTo(target);
    later(() => {
      setStance({ name: "field", tipId });
      showTip(tipId);
    }, TRAVEL_MS);
  };

  const endJourney = () => {
    setSpeech(null);
    setHole(null);
    const showParked = () => {
      const parked = pendingImportant.current;
      pendingImportant.current = null;
      if (parked) setSpeech({ kind: "line", category: parked.category, text: parked.text });
    };
    if (stanceRef.current.name === "field" && !reducedMotion()) {
      setStance({ name: "return" });
      setPos(dockPoint());
      later(() => {
        setStance({ name: "dock" });
        setPos(null);
        showParked();
      }, TRAVEL_MS);
    } else {
      setStance({ name: "dock" });
      setPos(null);
      setNoAnim(false);
      showParked();
    }
  };

  // ---- arrival cameo ----

  const finishCameo = () => {
    clearTimers();
    setStance({ name: "dock" });
    setPos(null);
    setNoAnim(false);
    showTip("arrival");
  };

  const startCameo = () => {
    setSpeech(null);
    setHole(null);
    if (reducedMotion()) {
      finishCameo();
      return;
    }
    setStance({ name: "cameo-ride" });
    setNoAnim(true);
    setPos({ x: -80, y: dockPoint().y });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setNoAnim(false);
        setPos(dockPoint());
      }),
    );
    clop.current = setInterval(() => sfx.clipClop(), 250);
    later(() => {
      if (clop.current) {
        clearInterval(clop.current);
        clop.current = null;
      }
      sfx.crash();
      setStance({ name: "cameo-tumble" });
    }, RIDE_MS);
    later(finishCameo, RIDE_MS + TUMBLE_MS);
  };

  // ---- launch: a pending tip while docked starts a journey ----

  useEffect(() => {
    if (stance.name !== "dock" || tip === null) return;
    if (speech?.kind === "tip") return; // already delivering one
    if (tip === "arrival") {
      startCameo();
      return;
    }
    const anchor = TIP_ANCHORS[tip];
    if (!anchor) {
      showTip(tip);
      return;
    }
    let tries = 0;
    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      const el = resolveAnchorEl(anchor);
      if (el) {
        beginJourney(tip, el, anchor);
        return;
      }
      if (++tries < 5) later(attempt, 60);
      else showTip(tip); // dock fallback, no spotlight
    };
    attempt();
    return () => {
      cancelled = true;
    };
  }, [tip, stance, speech]);

  // ---- reactive lines ----

  useEffect(
    () =>
      onKnightLine((line) => {
        const busy =
          stanceRef.current.name !== "dock" || speechRef.current?.kind === "tip";
        if (busy) {
          if (line.important) pendingImportant.current = line;
          return;
        }
        setSpeech((cur) => {
          if (cur && !line.important) return cur;
          return { kind: "line", category: line.category, text: line.text };
        });
      }),
    [],
  );

  // ---- typewriter + voice ----

  useEffect(() => {
    if (!speech) return;
    setTyped(0);
    const iv = setInterval(() => {
      setTyped((n) => {
        if (n >= speech.text.length) {
          clearInterval(iv);
          return n;
        }
        if (/[a-zA-Z0-9]/.test(speech.text[n])) sfx.speakBlip();
        return n + 1;
      });
    }, TYPE_MS);
    return () => clearInterval(iv);
  }, [speech]);

  // Keep the bubble fully on-screen — dismissal lives on its button, so an
  // off-viewport bubble would be a soft-lock.
  useEffect(() => {
    setBubbleShift(0);
  }, [speech]);
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || bubbleShift !== 0) return;
    const r = el.getBoundingClientRect();
    let dx = 0;
    if (r.left < 8) dx = 8 - r.left;
    else if (r.right > window.innerWidth - 8) dx = window.innerWidth - 8 - r.right;
    if (dx !== 0) setBubbleShift(dx);
  }, [speech, pos, stance, bubbleShift]);

  useEffect(() => {
    if (nudge === 0) return;
    const t = setTimeout(() => setNudge(0), 500);
    return () => clearTimeout(t);
  }, [nudge]);

  // Reactive lines are context-bound: when the phase moves on, they go stale
  // ("Back at the market!" must not haunt the next blind intro).
  useEffect(() => {
    if (speechRef.current?.kind === "line") setSpeech(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.phaseKey]);

  // Non-tip lines wander off on their own after a while.
  useEffect(() => {
    if (linger.current) clearTimeout(linger.current);
    if (speech?.kind === "line" && done) {
      linger.current = setTimeout(() => setSpeech(null), LINE_LINGER_MS);
    }
    return () => {
      if (linger.current) clearTimeout(linger.current);
    };
  }, [speech, done]);

  // ---- clicks: lessons are FORCED. The cameo plays out, tip text types at
  // its own pace, and dismissal happens only through the bubble's button.
  // Casual dock lines keep their relaxed click-to-complete/dismiss.

  const dismissCurrentTip = () => {
    const sp = speechRef.current;
    if (sp?.kind !== "tip") return;
    onDismissTip(sp.id);
    endJourney();
  };

  const handleClick = () => {
    const s = stanceRef.current;
    const sp = speechRef.current;
    // Journeys and the cameo cannot be skipped.
    if (s.name !== "dock" && s.name !== "field") return;
    if (sp?.kind === "tip") {
      // A click may fast-complete the text (the lesson still fully displays),
      // but dismissal happens only through the bubble's button. Once the text
      // is done, swallowed clicks bounce the bubble so the player's eye finds
      // the button instead of a frozen screen.
      if (typedRef.current < sp.text.length) {
        setTyped(sp.text.length);
        typedRef.current = sp.text.length;
      } else {
        setNudge((n) => n + 1);
      }
      return;
    }
    if (!sp) {
      if (s.name === "dock") {
        const line = clickLine(clickCtx);
        setSpeech({ kind: "line", category: line.category, text: line.text });
      }
      return;
    }
    // Casual line: click completes, then dismisses.
    if (typedRef.current < sp.text.length) {
      setTyped(sp.text.length);
      typedRef.current = sp.text.length;
      return;
    }
    setSpeech(null);
  };

  // Re-anchor on resize while he's in the field.
  useEffect(() => {
    if (stance.name !== "field") return;
    const anchor = TIP_ANCHORS[stance.tipId];
    if (!anchor) return;
    const onResize = () => {
      const el = resolveAnchorEl(anchor);
      if (!el) return;
      const h = holeFor(el, anchor);
      const target = placeBeside(h, anchor.side);
      setHole(h);
      setPos({ x: target.x, y: target.y });
      setFlip(target.flip);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [stance]);

  // ---- render ----

  const action = speech?.kind === "tip" ? TIP_ACTIONS[speech.id] : undefined;
  const actionCb = action ? props[action.prop] : undefined;
  const bubbleVisible =
    speech !== null && (stance.name === "dock" || stance.name === "field");
  const dockClasses = [
    "knight-dock",
    pos !== null ? "roaming" : "",
    noAnim ? "no-anim" : "",
    flip && pos !== null ? "flip" : "",
    stance.name === "travel" ? "traveling" : "",
    stance.name === "return" ? "returning" : "",
    stance.name === "cameo-ride" ? "riding" : "",
    stance.name === "cameo-tumble" ? "tumbling" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {spotlightUp && (
        <div class={`spotlight${hole ? "" : " bare"}`} onClick={handleClick}>
          {hole && (
            <div
              class="spotlight-hole"
              style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
            />
          )}
        </div>
      )}
      <div
        class={dockClasses}
        style={pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : undefined}
      >
        {bubbleVisible && (
          <div
            ref={bubbleRef}
            class={`knight-bubble${nudge > 0 ? " nudge" : ""}`}
            // The rise animation owns `transform`, so the viewport clamp
            // shifts the anchor edge instead.
            style={
              bubbleShift
                ? flip && pos !== null
                  ? { left: `${bubbleShift}px` }
                  : { right: `${-bubbleShift}px` }
                : undefined
            }
            onClick={handleClick}
          >
            <span class="knight-name">The White Knight</span>
            <span class={`knight-text${typing ? " typing" : ""}`}>
              {speech!.text.slice(0, typed)}
            </span>
            {done && speech!.kind === "tip" && (
              <button
                class="knight-action"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissCurrentTip();
                  actionCb?.();
                }}
              >
                {actionCb ? action!.label : "Onward."}
              </button>
            )}
          </div>
        )}
        <button
          class={`knight-avatar${typing ? " talking" : ""}${hasArt("knight.png") ? " painted" : ""}`}
          style={{
            backgroundImage: `url('${hasArt("knight.png") ? artUrl("knight.png") : PIECE_URI.wN}')`,
          }}
          title="The White Knight"
          onClick={handleClick}
        />
      </div>
    </>
  );
}
