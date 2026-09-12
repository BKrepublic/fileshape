import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  base: "./",
  publicDir: "public",
  build: {
    outDir: "../dist/browser",
    emptyOutDir: true,
  },
});
