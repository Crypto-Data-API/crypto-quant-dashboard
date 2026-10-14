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

/**
 * Static export for GitHub Pages (NEXT_PUBLIC_DATA_MODE=static, see scripts/build-static.ts):
 * no server, every panel reads samples copied into public/samples. GITHUB_PAGES=true serves it
 * under /crypto-quant-dashboard.
 */
const STATIC = process.env.NEXT_PUBLIC_DATA_MODE === "static";
const BASE_PATH = STATIC && process.env.GITHUB_PAGES === "true" ? "/crypto-quant-dashboard" : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The monorepo root, so file tracing never picks up a lockfile from a parent directory.
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@cqd/schemas"],
  serverExternalPackages: ["ioredis"],
  // The /api route handlers are named route.api.ts. Server mode lists "api.ts" as a page
  // extension so they are routes; the static export leaves it out, so they are not built.
  pageExtensions: STATIC ? ["tsx", "ts"] : ["tsx", "ts", "api.ts"],
  ...(STATIC
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        ...(BASE_PATH ? { basePath: BASE_PATH, assetPrefix: BASE_PATH } : {}),
      }
    : {}),
  env: {
    NEXT_PUBLIC_STREAM_URL: process.env.NEXT_PUBLIC_STREAM_URL ?? "",
    NEXT_PUBLIC_DATA_MODE: STATIC ? "static" : "server",
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
};

export default nextConfig;
