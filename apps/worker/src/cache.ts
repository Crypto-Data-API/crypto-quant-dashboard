import { keys, parseDemandMember, type Envelope } from "@cqd/schemas";
import { Redis } from "ioredis";
import type { Logger } from "./log";

/**
 * Worker cache. The in-process map is always the worker's source of truth (it serves the
 * worker's own HTTP API); Redis is a best-effort mirror that the web app reads. If Redis is
 * unset or unreachable everything keeps working in memory, and the web app falls back to
 * reading through the worker's HTTP API.
 */
export class WorkerCache {
  private readonly mem = new Map<string, { value: unknown; expiresAt: number | null }>();
  private readonly memDemand = new Map<string, number>();
  private readonly memCounters = new Map<string, number>();
  private redis: Redis | null = null;
  private redisReady = false;
  private warnedDown = false;

  constructor(
    private readonly log: Logger,
    redisUrl: string | null,
  ) {
    if (!redisUrl) {
      log.warn("REDIS_URL not set: using in-memory cache only (web app will read through the worker HTTP API)");
      return;
    }
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      // Fail fast while disconnected instead of queueing writes forever.
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 1_000, 15_000),
    });
    redis.on("ready", () => {
      this.redisReady = true;
      this.warnedDown = false;
      log.info("redis connected", { url: redactUrl(redisUrl) });
    });
    redis.on("end", () => {
      this.redisReady = false;
    });
    redis.on("close", () => {
      if (this.redisReady) log.warn("redis connection closed; continuing in memory");
      this.redisReady = false;
    });
    redis.on("error", (err: Error) => {
      if (!this.warnedDown) {
        log.warn("redis unavailable; continuing in memory and retrying in the background", { error: err.message });
        this.warnedDown = true;
      }
    });
    this.redis = redis;
  }

  async connect(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.connect();
    } catch {
      // The error handler above already logged; ioredis keeps retrying.
    }
  }

  get kind(): "redis" | "memory" {
    return this.redisReady ? "redis" : "memory";
  }

  /** The underlying client when connected (for the leader lock). */
  get client(): Redis | null {
    return this.redisReady ? this.redis : null;
  }

  // ---- envelopes ---------------------------------------------------------

  getEnvelope<T = unknown>(key: string): Envelope<T> | null {
    const hit = this.mem.get(key);
    if (!hit) return null;
    if (hit.expiresAt !== null && hit.expiresAt < Date.now()) {
      this.mem.delete(key);
      return null;
    }
    return hit.value as Envelope<T>;
  }

  setEnvelope(key: string, env: Envelope, ttlMs: number): void {
    this.mem.set(key, { value: env, expiresAt: Date.now() + ttlMs });
    if (this.redisReady && this.redis) {
      this.redis.set(key, JSON.stringify(env), "PX", Math.max(1_000, Math.round(ttlMs))).catch((err: Error) => {
        this.log.debug("redis set failed", { key, error: err.message });
      });
    }
  }

  /** Warm start: pull envelopes a previous worker left in Redis so restarts do not refetch everything. */
  async restore(keyList: string[]): Promise<number> {
    if (!this.redisReady || !this.redis || keyList.length === 0) return 0;
    try {
      const values = await this.redis.mget(...keyList);
      const ttls = await Promise.all(keyList.map((k) => this.redis!.pttl(k)));
      let n = 0;
      values.forEach((raw, i) => {
        if (!raw) return;
        try {
          const ttl = ttls[i] ?? -1;
          this.mem.set(keyList[i]!, { value: JSON.parse(raw), expiresAt: ttl > 0 ? Date.now() + ttl : null });
          n++;
        } catch {
          /* ignore corrupt entries */
        }
      });
      return n;
    } catch (err) {
      this.log.warn("redis restore failed", { error: (err as Error).message });
      return 0;
    }
  }

  // ---- on-demand registrations ------------------------------------------

  addDemand(member: string, expiresAt: number): void {
    const prev = this.memDemand.get(member) ?? 0;
    if (expiresAt > prev) this.memDemand.set(member, expiresAt);
  }

  /** Active on-demand requests from both this process and the web app (via Redis), soonest-expiring last. */
  async activeDemand(now = Date.now()): Promise<Array<{ dataset: string; param: string; expiresAt: number }>> {
    const merged = new Map<string, number>();
    for (const [m, exp] of this.memDemand) {
      if (exp > now) merged.set(m, exp);
      else this.memDemand.delete(m);
    }
    if (this.redisReady && this.redis) {
      try {
        await this.redis.zremrangebyscore(keys.demand, "-inf", now);
        const rows = await this.redis.zrangebyscore(keys.demand, now, "+inf", "WITHSCORES");
        for (let i = 0; i + 1 < rows.length; i += 2) {
          const member = rows[i]!;
          const exp = Number(rows[i + 1]);
          if (exp > (merged.get(member) ?? 0)) merged.set(member, exp);
        }
      } catch (err) {
        this.log.debug("redis demand read failed", { error: (err as Error).message });
      }
    }
    const out: Array<{ dataset: string; param: string; expiresAt: number }> = [];
    for (const [member, expiresAt] of merged) {
      const parsed = parseDemandMember(member);
      if (parsed) out.push({ ...parsed, expiresAt });
    }
    return out.sort((a, b) => b.expiresAt - a.expiresAt);
  }

  // ---- daily call counter -------------------------------------------------

  /** Count one keyed CDA request. Redis keys expire after 3 days. */
  countCall(date: string, dataset: string, status: string): void {
    const bump = (k: string) => this.memCounters.set(k, (this.memCounters.get(k) ?? 0) + 1);
    bump(keys.callsTotal(date));
    bump(`${keys.callsByDataset(date)}|${dataset}`);
    bump(`${keys.callsByStatus(date)}|${status}`);
    if (this.redisReady && this.redis) {
      const ttl = 3 * 24 * 3600;
      this.redis
        .multi()
        .incr(keys.callsTotal(date))
        .expire(keys.callsTotal(date), ttl)
        .hincrby(keys.callsByDataset(date), dataset, 1)
        .expire(keys.callsByDataset(date), ttl)
        .hincrby(keys.callsByStatus(date), status, 1)
        .expire(keys.callsByStatus(date), ttl)
        .exec()
        .catch((err: Error) => this.log.debug("redis counter failed", { error: err.message }));
    }
  }

  /**
   * Seed today's counters from Redis on startup, so a restarted worker does not forget the
   * calls it already spent today.
   */
  async restoreCounters(date: string): Promise<void> {
    if (!this.redisReady || !this.redis) return;
    try {
      const [total, byDataset, byStatus] = await Promise.all([
        this.redis.get(keys.callsTotal(date)),
        this.redis.hgetall(keys.callsByDataset(date)),
        this.redis.hgetall(keys.callsByStatus(date)),
      ]);
      if (total) this.memCounters.set(keys.callsTotal(date), Number(total));
      for (const [k, v] of Object.entries(byDataset)) this.memCounters.set(`${keys.callsByDataset(date)}|${k}`, Number(v));
      for (const [k, v] of Object.entries(byStatus)) this.memCounters.set(`${keys.callsByStatus(date)}|${k}`, Number(v));
    } catch (err) {
      this.log.warn("redis counter restore failed", { error: (err as Error).message });
    }
  }

  counters(date: string): { total: number; byDataset: Record<string, number>; byStatus: Record<string, number> } {
    const byDataset: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const dsPrefix = `${keys.callsByDataset(date)}|`;
    const stPrefix = `${keys.callsByStatus(date)}|`;
    for (const [k, v] of this.memCounters) {
      if (k.startsWith(dsPrefix)) byDataset[k.slice(dsPrefix.length)] = v;
      else if (k.startsWith(stPrefix)) byStatus[k.slice(stPrefix.length)] = v;
    }
    return { total: this.memCounters.get(keys.callsTotal(date)) ?? 0, byDataset, byStatus };
  }

  /** Drop counters for previous days from memory. */
  pruneCounters(today: string): void {
    for (const k of this.memCounters.keys()) {
      if (!k.includes(today)) this.memCounters.delete(k);
    }
  }

  // ---- misc ---------------------------------------------------------------

  async setRaw(key: string, value: string, ttlMs: number): Promise<void> {
    if (!this.redisReady || !this.redis) return;
    await this.redis.set(key, value, "PX", ttlMs).catch(() => undefined);
  }

  async close(): Promise<void> {
    if (this.redis) {
      this.redis.removeAllListeners("error");
      this.redis.on("error", () => undefined);
      await this.redis.quit().catch(() => this.redis?.disconnect());
    }
  }
}

function redactUrl(url: string): string {
  return url.replace(/\/\/([^@/]*)@/, "//***@");
}
