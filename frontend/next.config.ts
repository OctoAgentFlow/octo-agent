import type { NextConfig } from "next";

const frontendRole = process.env.NEXT_PUBLIC_FRONTEND_ROLE === "admin" ? "admin" : "api";
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const githubPagesBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  distDir: frontendRole === "admin" ? ".next-admin" : ".next-api",
  ...(isGitHubPages && githubPagesBasePath
    ? {
        assetPrefix: githubPagesBasePath,
        basePath: githubPagesBasePath,
      }
    : {}),
  images: {
    unoptimized: isGitHubPages,
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" },
      { protocol: "https", hostname: "api.dicebear.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
