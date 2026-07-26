import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trade-assist/db"],
};

export default nextConfig;
