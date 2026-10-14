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
    redisUrl: process.env.REDIS_URL?.trim() || null,
    port: int("WORKER_PORT", 4100, 1, 65535),
    host: process.env.WORKER_HOST?.trim() || "0.0.0.0",
    token: process.env.WORKER_TOKEN?.trim() || null,
    corsOrigin: process.env.WORKER_CORS_ORIGIN?.trim() || "*",
    // Hard ceiling of 29: CDA Pro allows 30/min and the bucket can admit burst + rate per minute.
    ratePerMinute: int("CDA_RATE_PER_MIN", 28, 1, 28),
    dailyBudget: int("CDA_DAILY_BUDGET", 10_000, 100, 1_000_000),
    streamSource: oneOf("STREAM_SOURCE", ["auto", "live", "delayed", "off"] as const, "auto"),
    gexSymbols: symbols || "BTC,ETH,SOL,HYPE",
    logLevel: oneOf("LOG_LEVEL", ["debug", "info", "warn", "error"] as const, "info"),
    onDemandMax: int("ON_DEMAND_MAX", 8, 1, 50),
  };
}
