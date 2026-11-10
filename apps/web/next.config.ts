import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared core package ships TypeScript source; Next compiles it.
  transpilePackages: ["@link/core"],
  // Document parsers run on the server only and should not be bundled.
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    serverActions: {
      // Files go straight from the browser to Supabase Storage, so actions only
      // carry text (notes, answers). Vercel caps request bodies at 4.5 MB anyway.
      bodySizeLimit: "2mb",
    },
  },
  // PostHog is reached through this site so ad blockers do not drop events.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;