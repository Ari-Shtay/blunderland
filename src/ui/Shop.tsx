// Between-blind shop, organized into labeled stalls: Jokers, Pieces, Enhancements, Services.

import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { CHARM_SLOTS, JOKER_SLOTS, MIN_BAG_SIZE } from "../engine/constants";
import { CHARMS } from "../engine/charms";
import { JOKERS } from "../engine/jokers";
import type { RunState, ShopState } from "../engine/types";
import { ArtIcon } from "./ArtIcon";
import { PATENTS } from "../engine/patents";
import { ENGRAVINGS } from "../engine/constants";
import { PIECE_URI } from "./pieces";

const ENH_INFO = {
  heavy: { name: "Heavy", desc: "×1.5 Chips when this piece scores", icon: "🪨" },
  gilded: { name: "Gilded", desc: "+$1 when this piece scores", icon: "🪙" },
  volatile: { name: "Volatile", desc: "×2 Mult, but 1-in-4 chance to shatter", icon: "🧨" },
  foiled: { name: "Foiled", desc: "+30 Chips when this piece scores (engraving)", icon: "✨" },
  etched: { name: "Etched", desc: "+3 Mult when this piece scores (engraving)", icon: "🗡️" },
  prismatic: { name: "Prismatic", desc: "×1.5 Mult when this piece scores (engraving)", icon: "🔮" },
  phantom: { name: "Phantom", desc: "Counts as no piece — invisible to bag-size effects", icon: "👻" },
} as const;

export interface ShopProps {
  run: RunState;
  shop: ShopState;
  onBuyJoker: (i: number) => void;
  onBuyPack: (choice: number) => void;
  onBuyEnhancement: (pieceId: number) => void;
  onReroll: () => void;
  onRemove: (pieceId: number) => void;
  onSellJoker: (i: number) => void;
  onBuyCharm: () => void;
  onBuyPatent: () => void;
  onUseCharm: (i: number, pieceId?: number) => void;
  onContinue: () => void;
}

type Targeting = "enhance" | "remove" | { charm: number } | null;

function Stall(props: { title: string; note?: string; children: ComponentChildren }) {
  return (
    <section class="stall">
      <div class="stall-sign">
        <span class="stall-title">{props.title}</span>
        {props.note && <span class="stall-note">{props.note}</span>}
      </div>
      <div class="stall-goods">{props.children}</div>
    </section>
  );
}

export function Shop(props: ShopProps) {
  const { run, shop } = props;
  const [targeting, setTargeting] = useState<Targeting>(null);
  // Input shield: the blind can end mid-click-stream, so swallow clicks for a
  // beat after the shop opens (playtesters sold jokers by accident).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, []);
  const { reward, unused, interest, jokers: jokerPay } = shop.payout;
  const freeReroll = shop.freeRerollsLeft > 0;
  const enh = ENH_INFO[shop.enhancement.kind];
  const canRemove = run.bag.length > MIN_BAG_SIZE && run.money >= shop.removeCost;
  const slots = JOKER_SLOTS + (run.patents.includes("upsideDownBox") ? 1 : 0);
  const patentDef = shop.patent ? PATENTS[shop.patent.id] : null;
  const patentBase = shop.patent ? PATENTS[shop.patent.id].cost : 0;
  const enhIsEngraving = (ENGRAVINGS as readonly string[]).includes(shop.enhancement.kind);

  const clickBagPiece = (pieceId: number) => {
    if (targeting === "enhance") {
      props.onBuyEnhancement(pieceId);
      setTargeting(null);
    } else if (targeting === "remove") {
      props.onRemove(pieceId);
      setTargeting(null);
    } else if (targeting && typeof targeting === "object") {
      props.onUseCharm(targeting.charm, pieceId);
      setTargeting(null);
    }
  };

  const charmDef = CHARMS[shop.charm.id];
  const charmAffordable =
    run.money >= shop.charm.cost && run.charms.length < CHARM_SLOTS;

  return (
    <div class="overlay">
      <div class={`shop panel${ready ? "" : " shielded"}`}>
        <div class="shop-header">
          <h2>The Night Market</h2>
          <div class="payout">
            <span>Blind cleared: +${reward}</span>
            {unused > 0 && <span>Unused moves: +${unused}</span>}
            {jokerPay > 0 && <span>Jokers: +${jokerPay}</span>}
            {interest > 0 && <span>Interest: +${interest}</span>}
          </div>
          <div class="shop-money">${run.money}</div>
          {shop.couponActive && (
            <div class="coupon-banner" title="Wanted Poster: Coupon">
              Coupon: your next purchase is free
            </div>
          )}
        </div>

        <div class="market-stalls">
          <Stall title="Jokers" note={`${run.jokers.length}/${slots} slots`}>
            {shop.jokers.map((offer, i) => {
              const j = JOKERS[offer.joker];
              const affordable =
                (shop.couponActive || run.money >= offer.cost) && run.jokers.length < slots;
              return (
                <button
                  key={offer.joker}
                  class={`shop-card joker rarity-${j.rarity}${offer.sold ? " sold" : ""}`}
                  disabled={offer.sold || !affordable}
                  onClick={() => props.onBuyJoker(i)}
                >
                  <div class={`card-rarity ${j.rarity}`}>{j.rarity}</div>
                  <div class="card-art">
                    <ArtIcon dir="jokers" id={offer.joker} emoji={j.emoji} class="card-emoji" />
                  </div>
                  <div class="card-name">{j.name}</div>
                  <div class="card-desc">{j.desc}</div>
                  <div class="card-cost">{offer.sold ? "SOLD" : `$${offer.cost}`}</div>
                </button>
              );
            })}
          </Stall>

          <Stall title="Pieces">
            <div class={`shop-card pack${shop.pack.sold ? " sold" : ""}`}>
              <div class="card-name">Piece Pack</div>
              <div class="pack-choices">
                {shop.pack.choices.map((t, i) => (
                  <button
                    key={i}
                    class="pack-piece"
                    disabled={shop.pack.sold || run.money < shop.pack.cost}
                    onClick={() => props.onBuyPack(i)}
                    style={{ backgroundImage: `url('${PIECE_URI["w" + t]}')` }}
                    title={`Add a ${t} to your bag`}
                  />
                ))}
              </div>
              <div class="card-desc">Add one piece to your bag</div>
              <div class="card-cost">{shop.pack.sold ? "SOLD" : `$${shop.pack.cost}`}</div>
            </div>
          </Stall>

          <Stall
            title={enhIsEngraving ? "Engravings" : "Enhancements"}
            note={enhIsEngraving ? "stacks with an enhancement" : undefined}
          >
            <button
              class={`shop-card enhancement${shop.enhancement.sold ? " sold" : ""}${targeting === "enhance" ? " targeting" : ""}`}
              disabled={shop.enhancement.sold || run.money < shop.enhancement.cost}
              onClick={() => setTargeting(targeting === "enhance" ? null : "enhance")}
            >
              <div class="card-emoji">{enh.icon}</div>
              <div class="card-name">{enh.name}</div>
              <div class="card-desc">{enh.desc}</div>
              <div class="card-cost">
                {shop.enhancement.sold
                  ? "SOLD"
                  : targeting === "enhance"
                    ? "pick a piece ↓"
                    : `$${shop.enhancement.cost}`}
              </div>
            </button>
          </Stall>

          <Stall title="Charms" note={`${run.charms.length}/${CHARM_SLOTS} held`}>
            <button
              class={`shop-card charm${shop.charm.sold ? " sold" : ""}`}
              disabled={shop.charm.sold || !charmAffordable}
              onClick={props.onBuyCharm}
            >
              <div class="card-art">
                <ArtIcon dir="charms" id={shop.charm.id} emoji={charmDef.emoji} class="card-emoji" />
              </div>
              <div class="card-name">{charmDef.name}</div>
              <div class="card-desc">{charmDef.desc}</div>
              <div class="card-cost">{shop.charm.sold ? "SOLD" : `$${shop.charm.cost}`}</div>
            </button>
          </Stall>

          {shop.patent && patentDef && (
            <Stall title="Patents" note="the Knight's inventions; permanent, one per boss market">
              <button
                class={`shop-card patent${shop.patent.sold ? " sold" : ""}`}
                disabled={shop.patent.sold || run.money < shop.patent.cost}
                onClick={props.onBuyPatent}
              >
                <div class="card-emoji">{patentDef.emoji}</div>
                <div class="card-name">{patentDef.name}</div>
                <div class="card-desc">{patentDef.desc}</div>
                <div class="card-cost">
                  {shop.patent.sold ? (
                    "SOLD"
                  ) : shop.patent.cost < patentBase ? (
                    <>
                      <s>${patentBase}</s> ${shop.patent.cost}
                    </>
                  ) : (
                    `$${shop.patent.cost}`
                  )}
                </div>
              </button>
            </Stall>
          )}

          <Stall title="Services">
            <button
              class="shop-card service"
              disabled={!freeReroll && run.money < shop.rerollCost}
              onClick={props.onReroll}
            >
              <div class="card-emoji">🎲</div>
              <div class="card-name">Reroll</div>
              <div class="card-desc">Restock every stall with new wares</div>
              <div class="card-cost">{freeReroll ? "FREE" : `$${shop.rerollCost}`}</div>
            </button>
            <button
              class={`shop-card service${targeting === "remove" ? " targeting" : ""}`}
              disabled={!canRemove}
              onClick={() => setTargeting(targeting === "remove" ? null : "remove")}
            >
              <div class="card-emoji">🕳️</div>
              <div class="card-name">Banish</div>
              <div class="card-desc">Remove a piece from your bag forever</div>
              <div class="card-cost">
                {targeting === "remove" ? "pick a piece ↓" : `$${shop.removeCost}`}
              </div>
            </button>
          </Stall>
        </div>

        {run.charms.length > 0 && (
          <div class="joker-strip">
            <span class="label">Your charms</span>
            <div class="joker-sells">
              {run.charms.map((id, i) => {
                const c = CHARMS[id];
                const usableHere = c.phase === "any" || c.phase === "shop";
                const arming =
                  targeting && typeof targeting === "object" && targeting.charm === i;
                return (
                  <button
                    key={`${id}-${i}`}
                    class={`joker-sell charm-use${arming ? " targeting" : ""}`}
                    title={`${c.name} — ${c.desc}`}
                    disabled={!usableHere}
                    onClick={() => {
                      if (c.target === "bagPiece") {
                        setTargeting(arming ? null : { charm: i });
                      } else {
                        props.onUseCharm(i);
                        setTargeting(null);
                      }
                    }}
                  >
                    <span class="joker-sell-emoji">{c.emoji}</span>
                    <span class="joker-sell-price">
                      {arming ? "pick a piece ↓" : "Use"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {run.jokers.length > 0 && (
          <div class="joker-strip">
            <span class="label">Your jokers</span>
            <div class="joker-sells">
              {run.jokers.map((inst, i) => {
                const j = JOKERS[inst.id];
                return (
                  <button
                    key={inst.id}
                    class="joker-sell"
                    title={`${j.name} — ${j.desc}`}
                    onClick={() => props.onSellJoker(i)}
                  >
                    <span class="joker-sell-emoji">{j.emoji}</span>
                    <span class="joker-sell-price">Sell ${Math.floor(j.cost / 2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div class={`bag-strip${targeting ? " targeting" : ""}`}>
          <span class="label">Your bag ({run.bag.length})</span>
          <div class="bag-pieces">
            {run.bag.map((p) => (
              <button
                key={p.id}
                class={`bag-piece${p.enhancement ? ` enh-${p.enhancement}` : ""}${p.engraving ? ` eng-${p.engraving}` : ""}`}
                style={{ backgroundImage: `url('${PIECE_URI["w" + p.type]}')` }}
                title={[
                  p.enhancement && ENH_INFO[p.enhancement].name,
                  p.engraving && ENH_INFO[p.engraving].name,
                ]
                  .filter(Boolean)
                  .join(" · ") || p.type}
                disabled={!targeting}
                onClick={() => clickBagPiece(p.id)}
              />
            ))}
          </div>
        </div>

        <button class="btn primary continue" onClick={props.onContinue}>
          Next Blind →
        </button>
      </div>
    </div>
  );
}
