import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

/**
 * The web app reads the repo-root .env, but only the variables it needs. The CDA API key
 * is deliberately NOT loaded here: only apps/worker ever talks to CryptoDataApi.
 */
const WEB_ENV_KEYS = ["REDIS_URL", "WORKER_URL", "WORKER_TOKEN", "NEXT_PUBLIC_STREAM_URL"];
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  const parsed = parseEnv(readFileSync(rootEnv, "utf8"));
  for (const key of WEB_ENV_KEYS) {
    const value = parsed[key];
    if (value !== undefined && process.env[key] === undefined) process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The monorepo root, so file tracing never picks up a lockfile from a parent directory.
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@cqd/schemas"],
  serverExternalPackages: ["ioredis"],
  env: {
    NEXT_PUBLIC_STREAM_URL: process.env.NEXT_PUBLIC_STREAM_URL ?? "",
  },
};

export default nextConfig;
