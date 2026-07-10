import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  // Relative asset paths: the same build works at a domain root, a GitHub
  // Pages subpath, or an itch.io iframe.
  base: "./",
  plugins: [preact()],
});
