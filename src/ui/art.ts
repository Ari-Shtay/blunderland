// Drop-in art pipeline (the theme.ogg pattern, for images). Batch-generate
// images per docs/art-prompts.md, drop them in public/art/, run
// `node scripts/art-manifest.mjs`, and the game upgrades itself — emoji stay
// as the fallback. One manifest fetch at startup; no per-image 404s.

let manifest: Set<string> = new Set();
let loaded = false;

export async function loadArtManifest(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch("/art/manifest.json");
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return;
    const paths = (await res.json()) as unknown;
    if (Array.isArray(paths)) {
      manifest = new Set(paths.filter((p): p is string => typeof p === "string"));
    }
  } catch {
    /* no art — emoji fallback everywhere */
  }
}

export function hasArt(path: string): boolean {
  return manifest.has(path);
}

export function artUrl(path: string): string {
  return `/art/${path}`;
}
