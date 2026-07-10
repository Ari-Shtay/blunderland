// The Codex — every joker, charm, opening, patent, and poster the player has
// laid eyes on. The undiscovered keep their silhouettes; finding them is half
// the collection game.

import { CHARMS, CHARM_IDS } from "../engine/charms";
import { JOKERS, JOKER_IDS } from "../engine/jokers";
import { OPENINGS, OPENING_IDS } from "../engine/openings";
import { PATENTS, PATENT_IDS } from "../engine/patents";
import { POSTERS, POSTER_IDS } from "../engine/posters";
import { loadCodex } from "../save";
import { ArtIcon } from "./ArtIcon";

function Entry(props: {
  found: boolean;
  emoji: string;
  name: string;
  desc: string;
  rarity?: string;
  art?: { dir: "jokers" | "charms" | "openings"; id: string };
}) {
  if (!props.found) {
    return (
      <div class="codex-card unfound" title="Not yet encountered">
        <span class="codex-emoji">?</span>
        <span class="codex-name">???</span>
      </div>
    );
  }
  return (
    <div
      class={`codex-card${props.rarity ? ` rarity-${props.rarity}` : ""}`}
      title={props.desc}
    >
      {props.art ? (
        <ArtIcon
          dir={props.art.dir}
          id={props.art.id}
          emoji={props.emoji}
          class="codex-emoji"
        />
      ) : (
        <span class="codex-emoji">{props.emoji}</span>
      )}
      <span class="codex-name">{props.name}</span>
      <span class="codex-desc">{props.desc}</span>
    </div>
  );
}

function Section(props: {
  title: string;
  found: number;
  total: number;
  children: preact.ComponentChildren;
}) {
  return (
    <section class="codex-section">
      <h3>
        {props.title}
        <span class="codex-count">
          {props.found}/{props.total}
        </span>
      </h3>
      <div class="codex-grid">{props.children}</div>
    </section>
  );
}

export function Codex({ onBack }: { onBack: () => void }) {
  const codex = loadCodex();
  const jokers = new Set(codex.jokers);
  const charms = new Set(codex.charms);
  const openings = new Set(codex.openings);
  const patents = new Set(codex.patents);
  const posters = new Set(codex.posters);

  return (
    <main class="menu codex">
      <h2 class="picker-title">The Codex</h2>

      <Section title="Jokers" found={jokers.size} total={JOKER_IDS.length}>
        {JOKER_IDS.map((id) => (
          <Entry
            key={id}
            found={jokers.has(id)}
            emoji={JOKERS[id].emoji}
            name={JOKERS[id].name}
            desc={JOKERS[id].desc}
            rarity={JOKERS[id].rarity}
            art={{ dir: "jokers", id }}
          />
        ))}
      </Section>

      <Section title="Charms" found={charms.size} total={CHARM_IDS.length}>
        {CHARM_IDS.map((id) => (
          <Entry
            key={id}
            found={charms.has(id)}
            emoji={CHARMS[id].emoji}
            name={CHARMS[id].name}
            desc={CHARMS[id].desc}
            art={{ dir: "charms", id }}
          />
        ))}
      </Section>

      <Section title="Openings" found={openings.size} total={OPENING_IDS.length}>
        {OPENING_IDS.map((id) => (
          <Entry
            key={id}
            found={openings.has(id)}
            emoji={OPENINGS[id].emoji}
            name={OPENINGS[id].name}
            desc={OPENINGS[id].desc}
            art={{ dir: "openings", id }}
          />
        ))}
      </Section>

      <Section title="Patents" found={patents.size} total={PATENT_IDS.length}>
        {PATENT_IDS.map((id) => (
          <Entry
            key={id}
            found={patents.has(id)}
            emoji={PATENTS[id].emoji}
            name={PATENTS[id].name}
            desc={PATENTS[id].desc}
          />
        ))}
      </Section>

      <Section title="Wanted Posters" found={posters.size} total={POSTER_IDS.length}>
        {POSTER_IDS.map((id) => (
          <Entry
            key={id}
            found={posters.has(id)}
            emoji={POSTERS[id].emoji}
            name={POSTERS[id].name}
            desc={POSTERS[id].desc}
          />
        ))}
      </Section>

      <div class="menu-actions">
        <button class="btn ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </main>
  );
}
