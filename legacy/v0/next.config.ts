import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // 输出纯静态 out/ 目录，适合 Cloudflare Pages / Vercel / 任何静态托管
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
