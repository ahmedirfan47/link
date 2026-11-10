import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

/**
 * The website address baked into this build. Release builds set it:
 *   $env:LINK_SERVER_URL = "https://your-site.vercel.app"; npm run release -w @link/desktop
 */
const serverUrl = (process.env.LINK_SERVER_URL || "http://localhost:3000").replace(/\/+$/, "");
const define = { __LINK_SERVER_URL__: JSON.stringify(serverUrl) };

export default defineConfig({
  main: {
    define,
    build: { externalizeDeps: true },
  },
  preload: {
    define,
    build: { externalizeDeps: true },
  },
  renderer: {
    define,
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