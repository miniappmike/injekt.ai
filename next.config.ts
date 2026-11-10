import type { NextConfig } from "next";

// 16 MB so an admin can upload a marketplace preview (up to 15 MB) through a server action.
const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  // The SpicyAPI SDK reads files next to itself at runtime, so it is loaded from node_modules instead of bundled.
  serverExternalPackages: ["@spicyapi/sdk"],
};

export default config;
