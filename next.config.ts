import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { securityConfig } from "./src/lib/security-config";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  ...securityConfig(process.env.NODE_ENV === "development"),
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
