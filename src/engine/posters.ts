// Wanted Posters — skip a Small or Big blind (forfeiting its payout) and
// take the tag nailed to it. Each blind rolls its poster at deal time so the
// offer is visible before you choose.

import type { PosterId } from "./types";

export interface PosterDef {
  id: PosterId;
  name: string;
  desc: string;
  emoji: string;
}

const def = (p: PosterDef) => p;

export const POSTERS: Record<PosterId, PosterDef> = {
  coupon: def({
    id: "coupon",
    name: "Coupon",
    desc: "Your next shop purchase is free. It keeps until spent, but never on a Patent.",
    emoji: "🎟️",
  }),
  doubleBounty: def({
    id: "doubleBounty",
    name: "Double Bounty",
    desc: "Take $2 now; the next blind you clear pays double reward.",
    emoji: "💰",
  }),
  charmCache: def({
    id: "charmCache",
    name: "Charm Cache",
    desc: "Gain a random charm immediately.",
    emoji: "🎁",
  }),
  patentTip: def({
    id: "patentTip",
    name: "Patent Tip",
    desc: "The next patent offer is half price.",
    emoji: "🤫",
  }),
  bountyRush: def({
    id: "bountyRush",
    name: "Bounty Rush",
    desc: "The next blind spawns three extra bounties and grants +1 move.",
    emoji: "🐇",
  }),
};

export const POSTER_IDS = Object.keys(POSTERS) as PosterId[];
