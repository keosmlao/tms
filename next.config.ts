import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "10.0.40.9",
    "10.0.21.147",
    "tms.odienmall.com",
  ],
  // Pin Turbopack's workspace root to this directory. Without this it walks
  // up the tree and finds the repo-root package-lock.json (used by the SOP
  // build scripts), which breaks module resolution — pg in particular fails
  // to load as an external in dev because Next looks for it relative to the
  // wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
