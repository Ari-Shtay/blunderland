// The White Knight's dialogue: Through the Looking-Glass's kindly, melancholy
// inventor who keeps falling off his horse and is terribly proud of his own
// inventions. Measured chattiness: unprompted reactions share a cooldown;
// boss/win/loss always speak. Cosmetic randomness only — never run.rng.

export type KnightCategory =
  | "bigTotal"
  | "blunder"
  | "shatter"
  | "promotion"
  | "boss"
  | "win"
  | "loss"
  | "shop"
  | "idle"
  | "hintSwap"
  | "hintMoney"
  | "hintJokers";

export interface KnightLine {
  category: KnightCategory;
  text: string;
  important: boolean;
}

const LINES: Record<KnightCategory, string[]> = {
  bigTotal: [
    "Oh, gloriously struck! I once scored nearly that. Well, I fell off directly after, but still.",
    "Magnificent! You stayed on the horse AND landed the blow. I rarely manage both at once.",
    "A masterstroke! I shall note it in my book of clever things, next to the blotting-paper pudding.",
    "Now THAT is riding! I'd applaud, but I need both hands for the reins.",
    "Splendid work! It's not my own invention, more's the pity.",
  ],
  blunder: [
    "Ah. Well. I've fallen off my horse for less. The ground is quite friendly, once introduced.",
    "A gentle move. The best of us blunder; I do it professionally.",
    "Never mind, never mind. I once rode a full mile facing the tail.",
    "That one slipped, didn't it? Mine always do. Head-first, usually.",
    "Small scores build character. I have an enormous amount of character.",
  ],
  shatter: [
    "Shattered to bits! Rather like my collarbone, the Tuesday before last.",
    "Oh dear, to splinters. Beautiful, brilliant, and briefly.",
    "CRASH! Just like my saddle-bags on the hedge. Worth it, I always say.",
    "It broke! Everything of mine breaks too. That's how you know it was working.",
  ],
  promotion: [
    "A Queen! From a pawn! I once turned a sugar-loaf into a hat, but this is far better.",
    "Crowned at the far rank! I'd bow, but I'd only fall off.",
    "Promotion! She'll be wanting a grander steed now. Don't we all.",
    "From foot-soldier to Majesty! The board does love an underdog.",
    "Crowned! My favorite rule of the game. I do wish I'd invented it.",
  ],
  boss: [
    "Steady now. The red print means mischief; check your stirrups twice.",
    "A boss blind. I've studied its rule upside-down, which is how I understand things best.",
    "Courage! I shall watch from right here, at a safe and useful distance.",
    "The rules bend here. Bend with them. It's how I dismount, mostly.",
    "This one fights unfairly. Happily, so do your Jokers.",
  ],
  win: [
    "You've crossed the last brook! I watched you all the way to the end of the wood, and you never once fell off.",
    "Victory! Oh, this is better than my pudding. And my pudding was theoretical.",
    "The whole board is yours! I shall write a song about it, called 'Ways and Means'.",
    "Won! Forgive the tear. It's only that so few wave goodbye at the end.",
  ],
  loss: [
    "There, there. Off the horse is where the thinking happens. Shall we go again?",
    "A tumble, nothing more. I've had thousands; one gets quite good at landing.",
    "The blind was cruel and the horse was tall. Next run, we ride better.",
    "Lost? Only this once. The board forgets, and so must we. Mostly the board.",
    "Every fall of mine has taught me one thing. Admittedly, it is always the same thing.",
  ],
  shop: [
    "The Night Market again. Mind your purse; interest pays the patient.",
    "Everything here is somebody's own invention. Test the buckles before buying.",
    "Back at the market! The Jokers do the scoring, remember. I merely do the falling.",
    "Browse slowly. I once bought a mouse-trap for my horse. There were no mice. There was also no need.",
  ],
  idle: [
    "It's my own invention, this game. Well, parts of it. Well. I watched.",
    "I keep a beehive on the saddle, in case of bees. There have never been bees. That's how well it works.",
    "The trick to riding is to keep falling off until the ground gives up.",
    "I invented a way of remembering things: write them down, then lose the paper. It half works.",
    "Fine weather on the board today. Every square exactly where I left it.",
    "Do click again whenever you like. Visitors are rare, out here on the wing.",
  ],
  hintSwap: [
    "Stuck fast! Swap a piece. The newcomer arrives fresh, mark you.",
    "No legal moves, alas. The Swap button, friend. I use it constantly, conceptually.",
  ],
  hintMoney: [
    "Purse a bit light? Every $5 banked pays a dollar of interest. Patience is an investment.",
    "Skint, are we? Skip a purchase and let the interest do the trotting.",
  ],
  hintJokers: [
    "Slots all full! I'll buy one back at half price, should a better companion appear.",
    "A full stable of Jokers. Selling one is no betrayal; it's rotation.",
  ],
};

const ALWAYS_FIRE = new Set<KnightCategory>(["boss", "win", "loss"]);
const COOLDOWN_MS = 45_000;

let lastReactionAt = -Infinity;
const lastIdx: Partial<Record<KnightCategory, number>> = {};
let listener: ((line: KnightLine) => void) | null = null;

function pick(cat: KnightCategory): string {
  const pool = LINES[cat];
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && idx === lastIdx[cat]) idx = (idx + 1) % pool.length;
  lastIdx[cat] = idx;
  return pool[idx];
}

export function onKnightLine(cb: (line: KnightLine) => void): () => void {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

/** Unprompted reaction — cooldown-gated unless the moment is important. */
export function requestLine(cat: KnightCategory): void {
  const important = ALWAYS_FIRE.has(cat);
  const now = Date.now();
  if (!important && now - lastReactionAt < COOLDOWN_MS) return;
  lastReactionAt = now;
  listener?.({ category: cat, text: pick(cat), important });
}

export interface ClickCtx {
  mustSwap: boolean;
  lowMoney: boolean;
  jokersFull: boolean;
  inShop: boolean;
}

/** On-demand line when the player clicks him — no cooldown, hints first. */
export function clickLine(ctx: ClickCtx): KnightLine {
  const cat: KnightCategory = ctx.mustSwap
    ? "hintSwap"
    : ctx.jokersFull && ctx.inShop
      ? "hintJokers"
      : ctx.lowMoney && ctx.inShop
        ? "hintMoney"
        : "idle";
  return { category: cat, text: pick(cat), important: false };
}
