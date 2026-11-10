import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared core package ships TypeScript source; Next compiles it.
  transpilePackages: ["@link/core"],
  // Document parsers run on the server only and should not be bundled.
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    serverActions: {
      // Source files (PDF, DOCX) are uploaded through Server Actions.
      bodySizeLimit: "12mb",
    },
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