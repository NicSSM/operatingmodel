// next.config.ts
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const repo = "operatingmodel"; // <-- change to your repo name

const config: NextConfig = {
  output: "export",              // produce /out for static hosting
  images: { unoptimized: true }, // GH Pages can't run the Next image optimizer
  basePath: isProd ? `/${repo}` : undefined,   // for *project* pages (<user>.github.io/<repo>)
  assetPrefix: isProd ? `/${repo}/` : undefined,

  // (Optional, but keeps CI happy if eslint/types creep in)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default config;
