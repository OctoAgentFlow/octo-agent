import type { NextConfig } from "next";

const frontendRole = process.env.NEXT_PUBLIC_FRONTEND_ROLE === "admin" ? "admin" : "api";

const nextConfig: NextConfig = {
  distDir: frontendRole === "admin" ? ".next-admin" : ".next-api",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" },
      { protocol: "https", hostname: "api.dicebear.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
