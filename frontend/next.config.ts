import type { NextConfig } from "next";
import dotenv from "dotenv";

// Load root .env (single source of truth for ALL credentials)
dotenv.config({ path: "../.env" });

const nextConfig: NextConfig = {
  turbopack: {
    // Fix: .kilo/package.json confuses Turbopack root detection → 404.
    // Explicitly set root to frontend directory (process.cwd() = frontend/ when running pnpm dev/build).
    root: process.cwd(),
  },
};

export default nextConfig;
