#!/usr/bin/env node
// Regenerate public/art/manifest.json from the files on disk.
// Run after dropping in generated images:  node scripts/art-manifest.mjs

import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../public/art", import.meta.url).pathname;
mkdirSync(ROOT, { recursive: true });

const paths = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(png|webp|jpg)$/i.test(name)) paths.push(relative(ROOT, full));
  }
};
walk(ROOT);

writeFileSync(join(ROOT, "manifest.json"), JSON.stringify(paths.sort(), null, 2));
console.log(`public/art/manifest.json: ${paths.length} images`);
