import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(githubPages
    ? {
        output: "export" as const,
        basePath: "/dual-store-scheduler",
        assetPrefix: "/dual-store-scheduler/",
        trailingSlash: true,
      }
    : {}),
  images: { unoptimized: true },
};

export default nextConfig;
