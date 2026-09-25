import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Blink claim URLs carry the gift key in the query string; keep them out of dev logs.
  logging: { incomingRequests: false },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.prestocks.com" },
      { protocol: "https", hostname: "prestocks.com" },
    ],
  },
};

export default nextConfig;
