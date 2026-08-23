import type { NextConfig } from "next";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath = process.env.GITHUB_ACTIONS && repository ? `/${repository}` : "";

const nextConfig: NextConfig = {
  trailingSlash: true,
  basePath,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
