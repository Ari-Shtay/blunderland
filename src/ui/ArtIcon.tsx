// An icon that upgrades from emoji to painted art when the file exists.

import { artUrl, hasArt } from "./art";

export interface ArtIconProps {
  /** Subdirectory under public/art (e.g. "jokers", "charms", "openings"). */
  dir: string;
  id: string;
  emoji: string;
  class?: string;
}

export function ArtIcon({ dir, id, emoji, class: cls }: ArtIconProps) {
  const path = `${dir}/${id}.png`;
  if (hasArt(path)) {
    return <img class={`art-icon ${cls ?? ""}`} src={artUrl(path)} alt="" draggable={false} />;
  }
  return <span class={cls}>{emoji}</span>;
}
