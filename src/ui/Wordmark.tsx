// The BLUNDERLAND wordmark: hand-set Victorian playbill letters where the
// type itself blunders — the U mid-topple, and LAND's A stood in for by a
// gold pawn. Every offset is em-based so the mark scales from HUD to title.

interface Letter {
  ch: string;
  rot: number; // degrees
  dy: number; // em
  gold?: boolean;
  topple?: boolean;
  pawn?: boolean;
}

const LETTERS: Letter[] = [
  { ch: "B", rot: -2, dy: 0 },
  { ch: "L", rot: 1.5, dy: 0.02 },
  { ch: "U", rot: -14, dy: 0.1, topple: true },
  { ch: "N", rot: 2.5, dy: -0.01 },
  { ch: "D", rot: -1.5, dy: 0.015 },
  { ch: "E", rot: 1, dy: -0.02 },
  { ch: "R", rot: -2.5, dy: 0.01 },
  { ch: "L", rot: 2, dy: -0.015, gold: true },
  { ch: "A", rot: 0, dy: 0, gold: true, pawn: true },
  { ch: "N", rot: -2, dy: 0.02, gold: true },
  { ch: "D", rot: 1.5, dy: -0.01, gold: true },
];

function Pawn() {
  return (
    <svg class="wm-pawn" viewBox="0 0 100 140" aria-hidden="true">
      <defs>
        <linearGradient id="wmgold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#eccb6d" />
          <stop offset="100%" stop-color="#b8892a" />
        </linearGradient>
      </defs>
      <g fill="url(#wmgold)">
        <circle cx="50" cy="27" r="27" />
        <path d="M22 52 h56 l-9 15 h-38 z" />
        <path d="M35 67 h30 c0 24 10 36 19 48 h-68 c9-12 19-24 19-48 z" />
        <path d="M10 117 h80 a8 8 0 0 1 8 10 l-3 11 h-90 l-3-11 a8 8 0 0 1 8-10 z" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span class="wordmark" role="img" aria-label="Blunderland">
      {LETTERS.map((l, i) =>
        l.pawn ? (
          <Pawn key={i} />
        ) : (
          <span
            key={i}
            aria-hidden="true"
            class={`wm${l.gold ? " wm-gold" : ""}${l.topple ? " wm-topple" : ""}`}
            style={{ transform: `rotate(${l.rot}deg) translateY(${l.dy}em)` }}
          >
            {l.ch}
            {l.topple && (
              <svg class="wm-arcs" viewBox="0 0 40 40" aria-hidden="true">
                <g
                  fill="none"
                  stroke="#d3a83c"
                  stroke-width="5"
                  stroke-linecap="round"
                  opacity="0.8"
                >
                  <path d="M 10 24 a 18 18 0 0 1 6 -12" />
                  <path d="M 20 28 a 26 26 0 0 1 9 -18" />
                </g>
              </svg>
            )}
          </span>
        ),
      )}
    </span>
  );
}
