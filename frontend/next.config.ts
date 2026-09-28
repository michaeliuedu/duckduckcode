import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for the Docker image.
  output: "standalone",
  // Runtime configuration is read from process.env in server components, so
  // the same image works locally and on AWS.
};

export default nextConfig;
