// The card system: art-forward faces with a name plate, everything else in a
// hover tooltip. Rarity is worn as material, not written — parchment, blue
// steel, amethyst foil, gold leaf. One tooltip exists at a time (a singleton
// layer fed by a pub/sub, same pattern as knightLines).

import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Rarity } from "../engine/types";
import { ArtIcon } from "./ArtIcon";

// ---- tooltip singleton ----

export interface TipContent {
  name: string;
  rarity?: Rarity;
  desc: string;
  /** Extra context lines: sell value, charm timing, scaling state... */
  lines?: string[];
}

interface TipState {
  rect: DOMRect;
  content: TipContent;
}

type TipListener = (tip: TipState | null) => void;
let tipListener: TipListener | null = null;
let currentTip: TipState | null = null;

function showTip(rect: DOMRect, content: TipContent): void {
  currentTip = { rect, content };
  tipListener?.(currentTip);
}

export function hideTip(): void {
  currentTip = null;
  tipListener?.(null);
}

const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

/** Mounted once in App: renders the single active tooltip, clamped on-screen. */
export function TipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean }>({
    x: 0,
    y: 0,
    below: false,
  });

  useEffect(() => {
    tipListener = setTip;
    return () => {
      tipListener = null;
    };
  }, []);

  useEffect(() => {
    if (!tip || !ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 10;
    let x = tip.rect.x + tip.rect.width / 2 - w / 2;
    x = Math.min(Math.max(8, x), window.innerWidth - w - 8);
    let y = tip.rect.y - h - gap;
    let below = false;
    if (y < 8) {
      y = tip.rect.y + tip.rect.height + gap;
      below = true;
    }
    setPos({ x, y, below });
  }, [tip]);

  if (!tip) return null;
  const c = tip.content;
  return (
    <div
      ref={ref}
      class={`card-tip${pos.below ? " below" : ""}`}
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
    >
      <div class="card-tip-head">
        <span class="card-tip-name">{c.name}</span>
        {c.rarity && <span class={`card-tip-rarity ${c.rarity}`}>{RARITY_LABEL[c.rarity]}</span>}
      </div>
      <div class="card-tip-desc">{c.desc}</div>
      {c.lines?.map((l, i) => (
        <div key={i} class="card-tip-line">
          {l}
        </div>
      ))}
    </div>
  );
}

// ---- the card ----

const coarsePointer = () =>
  typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export interface GameCardProps {
  art: { dir: string; id: string; emoji: string } | JSX.Element;
  name: string;
  rarity?: Rarity;
  size?: "lg" | "sm";
  /** Hanging price tag (shop). Pre-rendered so callers control strikethroughs. */
  priceTag?: ComponentChildren;
  /** Small corner badge for scaling jokers ("×2.75"). */
  stateBadge?: string;
  sold?: boolean;
  disabled?: boolean;
  /** Externally-armed state (targeting flows). */
  selected?: boolean;
  /** Extra classes (e.g. "shop-card" kept for the playtest driver). */
  class?: string;
  onClick?: () => void;
  tip: TipContent;
}

export function GameCard(p: GameCardProps) {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  // A re-render can move the card under a live tooltip; touch arming resets
  // when the card stops being interactable.
  useEffect(() => {
    if (p.disabled || p.sold) setArmed(false);
  }, [p.disabled, p.sold]);

  const enter = () => {
    if (ref.current) showTip(ref.current.getBoundingClientRect(), p.tip);
  };

  const click = () => {
    if (!p.onClick) return;
    if (coarsePointer() && !armed) {
      // First tap: show the tooltip and arm; the second tap acts.
      setArmed(true);
      enter();
      return;
    }
    setArmed(false);
    hideTip();
    p.onClick();
  };

  const classes = [
    "gcard",
    p.size === "sm" ? "sm" : "lg",
    p.rarity ? `r-${p.rarity}` : "r-none",
    p.sold ? "sold" : "",
    p.selected || armed ? "armed" : "",
    p.class ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      class={classes}
      disabled={p.disabled}
      onClick={click}
      onMouseEnter={enter}
      onMouseLeave={hideTip}
      onFocus={enter}
      onBlur={hideTip}
    >
      <span class="gcard-art">
        {"dir" in (p.art as object) ? (
          <ArtIcon
            dir={(p.art as { dir: string }).dir}
            id={(p.art as { id: string }).id}
            emoji={(p.art as { emoji: string }).emoji}
            class="gcard-emoji"
          />
        ) : (
          (p.art as JSX.Element)
        )}
      </span>
      <span class="gcard-plate">{p.name}</span>
      {p.stateBadge && <span class="gcard-state">{p.stateBadge}</span>}
      {p.priceTag !== undefined && <span class="gcard-price">{p.priceTag}</span>}
      {p.sold && <span class="gcard-sold">SOLD</span>}
    </button>
  );
}
