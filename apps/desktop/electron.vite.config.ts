import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: { externalizeDeps: true },
  },
  preload: {
    build: { externalizeDeps: true },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          overlay: resolve(__dirname, "src/renderer/overlay.html"),
        },
      },
    },
    // The embedding library ships its own WASM loader; let it load as-is.
    optimizeDeps: { exclude: ["@huggingface/transformers"] },
  },
});