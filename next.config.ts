import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Music-bed audio imports (and other Server Action uploads).
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Next 15.5 proxies action bodies; keep this >= bodySizeLimit when supported.
    ...({
      proxyClientMaxBodySize: "25mb",
    } as Record<string, string>),
  },
};

export default nextConfig;
