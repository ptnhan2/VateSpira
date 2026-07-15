import type { NextConfig } from "next";
import dotenv from "dotenv";

// Load root .env (single source of truth for ALL credentials)
dotenv.config({ path: "../.env" });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
