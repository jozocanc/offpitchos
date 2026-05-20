import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas'],
  experimental: {
    // PDF import sends a few rendered page images to a Server Action.
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default nextConfig;
