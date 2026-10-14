/**
 * Server-side cache reader for the Next route handlers. The browser never calls CDA: it
 * calls /api/data/*, which reads the envelopes the worker wrote.
 *
 * Read order:
 *   1. Redis (REDIS_URL), where the worker mirrors every envelope.
 *   2. The worker's own HTTP API (WORKER_URL), used when Redis is unset or down; the worker
 *      always keeps an in-memory copy.
 *   3. Neither reachable: a `worker_offline` envelope so panels render an explicit state.
 */
import {
  DATASETS,
  demandMember,
  emptyEnvelope,
  isOnDemandDef,
  keys,
  staleAfter,
  type DatasetDef,
  type DatasetId,
  type Envelope,
  type WorkerStatus,
} from "@cqd/schemas";
import { Redis } from "ioredis";

type RedisState = "disabled" | "connecting" | "up" | "down";

const g = globalThis as unknown as { __cqdRedis?: Redis; __cqdRedisWarned?: boolean };

function workerUrl(): string {
  return (process.env.WORKER_URL || "http://localhost:4100").replace(/\/+$/, "");
}

function workerHeaders(): HeadersInit {
  const token = process.env.WORKER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Same rule as the worker: unset -> local default; empty / "off" / "none" / "disabled" -> no Redis. */
function redisUrl(): string | null {
  const raw = process.env.REDIS_URL;
  if (raw === undefined) return "redis://localhost:6379";
  const v = raw.trim();
  return v === "" || ["off", "none", "disabled", "false"].includes(v.toLowerCase()) ? null : v;
}

function getRedis(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  if (!g.__cqdRedis) {
    const r = new Redis(url, {
      connectTimeout: 1_500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 2_000, 15_000),
    });
    r.on("error", (err: Error & { code?: string }) => {
      if (!g.__cqdRedisWarned) {
        console.warn(`[web] redis unavailable (${err.message || err.code || err.name}); reading through the worker HTTP API`);
        g.__cqdRedisWarned = true;
      }
    });
    r.on("ready", () => {
      g.__cqdRedisWarned = false;
    });
    g.__cqdRedis = r;
  }
  return g.__cqdRedis;
}

export function redisState(): RedisState {
  const r = getRedis();
  if (!r) return "disabled";
  if (r.status === "ready") return "up";
  if (r.status === "connecting" || r.status === "connect" || r.status === "wait") return "connecting";
  return "down";
}

/** undefined = Redis not usable right now (fall back); null = key missing. */
async function redisGet(key: string): Promise<string | null | undefined> {
  const r = getRedis();
  if (!r || r.status !== "ready") return undefined;
  try {
    return await r.get(key);
  } catch {
    return undefined;
  }
}

async function fetchWorker<T>(path: string, timeoutMs = 2_500): Promise<T | null> {
  try {
    const res = await fetch(`${workerUrl()}${path}`, {
      headers: workerHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function offline<T>(id: DatasetId, param: string | null): Envelope<T> {
  const def = DATASETS[id] as DatasetDef;
  return emptyEnvelope<T>(id, "worker_offline", {
    param,
    intervalMs: def.intervalMs,
    staleAfterMs: staleAfter(def),
    error: { kind: "worker_offline", message: `Cannot reach the cache or the worker at ${workerUrl()}. Start it with "pnpm dev:worker".` },
  });
}

export async function readHeartbeat(): Promise<{ status: WorkerStatus | null; via: "redis" | "worker" | "none" }> {
  const raw = await redisGet(keys.heartbeat);
  if (typeof raw === "string") {
    try {
      return { status: JSON.parse(raw) as WorkerStatus, via: "redis" };
    } catch {
      /* fall through */
    }
  }
  const s = await fetchWorker<WorkerStatus>("/status", 1_500);
  return s ? { status: s, via: "worker" } : { status: null, via: "none" };
}

/** Register viewer interest in an on-demand dataset so the worker keeps polling it. */
async function registerDemand(id: DatasetId, param: string): Promise<boolean> {
  const r = getRedis();
  if (!r || r.status !== "ready") return false;
  const def = DATASETS[id] as DatasetDef;
  try {
    await r.zadd(keys.demand, Date.now() + (def.demandTtlMs ?? 120_000), demandMember(id, param));
    return true;
  } catch {
    return false;
  }
}

export async function readEnvelope<T = unknown>(id: DatasetId, param: string | null): Promise<Envelope<T>> {
  const def = DATASETS[id] as DatasetDef;
  const qs = param ? `?param=${encodeURIComponent(param)}` : "";

  if (def.param && param) await registerDemand(id, param);
  else if (isOnDemandDef(def)) await registerDemand(id, "");

  const raw = await redisGet(keys.data(id, param));
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Envelope<T>;
    } catch {
      /* corrupt entry: fall through to the worker */
    }
  }
  if (raw === null) {
    // Redis is up but has no entry. If the worker is alive and mirroring to Redis, the
    // entry is simply not written yet.
    const hb = await redisGet(keys.heartbeat);
    if (typeof hb === "string") {
      try {
        const status = JSON.parse(hb) as WorkerStatus;
        if (!status.keyConfigured && def.tier !== "keyless") {
          return emptyEnvelope<T>(id, "no_api_key", {
            param,
            intervalMs: def.intervalMs,
            staleAfterMs: staleAfter(def),
            error: { kind: "no_api_key", message: "CDA_API_KEY is not configured on the worker." },
          });
        }
      } catch {
        /* ignore */
      }
      return emptyEnvelope<T>(id, "pending", { param, intervalMs: def.intervalMs, staleAfterMs: staleAfter(def) });
    }
  }
  // Redis unavailable, or no live worker writing to it: ask the worker directly.
  const env = await fetchWorker<Envelope<T>>(`/data/${id}${qs}`);
  return env ?? offline<T>(id, param);
}

export function streamUpstream(search: string): string {
  return `${workerUrl()}/stream${search}`;
}
