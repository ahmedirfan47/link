// Builds the Chrome extension into dist/. Load dist/ with "Load unpacked" in chrome://extensions.
//   LINK_URL=https://your-domain node build.mjs   points the extension at another Link site.
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const LINK_URL = (process.env.LINK_URL ?? "https://link-zeta-six.vercel.app").replace(/\/+$/, "");
const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("static", "dist", { recursive: true });

// The extension may only talk to the Link site it was built for (plus local development).
const manifest = JSON.parse(readFileSync("static/manifest.json", "utf8"));
const hosts = new Set([`${LINK_URL}/*`, "http://localhost:3000/*", "https://meet.google.com/*"]);
manifest.host_permissions = [...hosts];
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));

const options = {
  entryPoints: {
    background: "src/background.ts",
    "content-meet": "src/content-meet.ts",
    sidepanel: "src/sidepanel.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  define: { __LINK_URL__: JSON.stringify(LINK_URL) },
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
  console.log(`Built for ${LINK_URL}. Load apps/extension/dist in chrome://extensions (Developer mode, Load unpacked).`);
}
