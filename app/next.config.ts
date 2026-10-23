import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Not on Next's built-in list. Production already tree-shakes it (client chunks byte-identical with and
    // without this); the gain is dev, which otherwise resolves the whole ~1,500-icon barrel.
    optimizePackageImports: ["@phosphor-icons/react"],
    // Photos arrive downscaled (lib/photo/downscale.ts), usually well under 1 MB; the headroom covers
    // a detailed label's JPEG and a photo the browser couldn't decode.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
