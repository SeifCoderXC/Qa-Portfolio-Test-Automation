import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Secrets live in the repo-root .env, shared with the worker.
// loadEnvFile does not override variables that are already set.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  transpilePackages: ["@ai-qa/db", "@ai-qa/engine", "@ai-qa/integrations"],
  // Native module: must be required at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
