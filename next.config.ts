import type { NextConfig } from "next";
const isPages = process.env.GITHUB_ACTIONS === "true";
const repo = "camera-physio-emotion-monitor";
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: isPages ? `/${repo}` : "",
  assetPrefix: isPages ? `/${repo}/` : "",
};
export default config;
