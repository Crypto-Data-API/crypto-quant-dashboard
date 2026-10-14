import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Walk up from `start` to the pnpm workspace root (the directory holding pnpm-workspace.yaml). */
export function findWorkspaceRoot(start = process.cwd()): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Load the repo-root .env (and a local one, if present) without overriding real env vars. */
export function loadEnv(): string[] {
  const loaded: string[] = [];
  const candidates = new Set<string>();
  const root = findWorkspaceRoot();
  if (root) candidates.add(join(root, ".env"));
  candidates.add(resolve(process.cwd(), ".env"));
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const before = { ...process.env };
    process.loadEnvFile(file);
    // Real environment variables win over the file.
    for (const [k, v] of Object.entries(before)) process.env[k] = v;
    loaded.push(file);
  }
  return loaded;
}

export type StreamSource = "auto" | "live" | "delayed" | "off";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface WorkerConfig {
  apiKey: string | null;
  baseUrl: string;
  redisUrl: string | null;
  port: number;
  host: string;
  token: string | null;
  corsOrigin: string;
  ratePerMinute: number;
  dailyBudget: number;
  streamSource: StreamSource;
  gexSymbols: string;
  logLevel: LogLevel;
  onDemandMax: number;
}

/**
 * REDIS_URL unset -> local default (docker compose); empty, "off", "none" or "disabled" ->
 * no Redis (in-memory only).
 */
export function resolveRedisUrl(raw: string | undefined): string | null {
  if (raw === undefined) return "redis://localhost:6379";
  const v = raw.trim();
  if (v === "" || ["off", "none", "disabled", "false"].includes(v.toLowerCase())) return null;
  return v;
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number (got "${raw}")`);
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "") return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new Error(`${name} must be one of ${allowed.join(", ")} (got "${raw}")`);
}

export function readConfig(): WorkerConfig {
  const symbols = (process.env.GEX_SYMBOLS ?? "BTC,ETH,SOL,HYPE")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
  return {
    apiKey: process.env.CDA_API_KEY?.trim() || null,
    baseUrl: process.env.CDA_BASE_URL?.trim() || "https://cryptodataapi.com",
    redisUrl: resolveRedisUrl(process.env.REDIS_URL),
    port: int("WORKER_PORT", 4100, 1, 65535),
    host: process.env.WORKER_HOST?.trim() || "0.0.0.0",
    token: process.env.WORKER_TOKEN?.trim() || null,
    corsOrigin: process.env.WORKER_CORS_ORIGIN?.trim() || "*",
    // Pro Plus allows 120/min: 100/min with burst 1 admits at most 101 per rolling minute.
    // The worker lowers this automatically if /auth/keys/me reports a smaller per-minute limit.
    ratePerMinute: int("CDA_RATE_PER_MIN", 100, 1, 115),
    // Our share of the key's daily allowance (Pro Plus: 50,000/day, shared with other tooling).
    // Also capped at 95% of the key's reported daily limit.
    dailyBudget: int("CDA_DAILY_BUDGET", 30_000, 100, 1_000_000),
    streamSource: oneOf("STREAM_SOURCE", ["auto", "live", "delayed", "off"] as const, "auto"),
    gexSymbols: symbols || "BTC,ETH,SOL,HYPE",
    logLevel: oneOf("LOG_LEVEL", ["debug", "info", "warn", "error"] as const, "info"),
    onDemandMax: int("ON_DEMAND_MAX", 16, 1, 50),
  };
}
