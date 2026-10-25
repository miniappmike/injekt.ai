import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // The SpicyAPI SDK reads files next to itself at runtime, so it is loaded from node_modules instead of bundled.
  serverExternalPackages: ["@spicyapi/sdk"],
};

export default config;
