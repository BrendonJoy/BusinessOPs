import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trade-assist/db"],
  // Testing on a real phone means loading the dev server over the LAN IP rather
  // than localhost. Next blocks cross-origin requests to /_next/* dev assets by
  // default, which lets the server-rendered HTML through but stops React from
  // hydrating — the page looks right and every button is dead. Dev-only; has no
  // effect on the production build.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
