import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  basePath: "/dashboard",
  turbopack: {
    root: path.resolve(__dirname, "../../../.."),
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:9999", "waiter.inimi.dev"],
    },
  },
};

export default nextConfig;
