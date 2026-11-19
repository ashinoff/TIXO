import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Resolve product metadata before streaming, including true 404 responses and social previews.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
