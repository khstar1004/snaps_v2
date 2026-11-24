import path from "node:path";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.env.NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: [
    "remotion",
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/player",
    "@remotion/compositor-linux-x64-gnu",
    "esbuild",
    "@esbuild/linux-x64",
  ],
};

export default nextConfig;
