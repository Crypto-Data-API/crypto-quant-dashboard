import {
  computeKpis,
  KPI_HISTORY_INTERVAL_MS,
  KPI_HISTORY_MAX_POINTS,
  KPI_KEYS,
  keys,
  type CrossExchangeSummary,
  type KpiHistory,
  type KpiPoint,
  type MarketHealthResponse,
  type RegimesResponse,
  type VolumeScannerResponse,
  type WhalesResponse,
} from "@cqd/schemas";
import type { WorkerCache } from "./cache";
import type { Logger } from "./log";

/** Redis copy outlives a worker restart by a day, so the sparklines survive restarts. */
const REDIS_TTL_MS = 48 * 3600_000;

/**
 * Records the nine header KPIs every few minutes from the latest cached envelopes, so the
 * header sparklines show real values this worker observed (no CDA calls of its own). The
 * history lives in memory and is mirrored to Redis as one JSON document.
 */
export class KpiRecorder {
  private points: KpiPoint[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private demo: KpiHistory["demo"] = null;

  constructor(
    private readonly cache: WorkerCache,
    private readonly log: Logger,
    private readonly intervalMs = KPI_HISTORY_INTERVAL_MS,
    private readonly maxPoints = KPI_HISTORY_MAX_POINTS,
  ) {}

  /** Warm start from the Redis copy a previous worker left. */
  async restore(): Promise<void> {
    const raw = await this.cache.getRaw(keys.kpiHistory);
    if (!raw) return;
    try {
      const h = JSON.parse(raw) as KpiHistory;
      if (h.demo) return;
      const cutoff = Date.now() - this.maxPoints * this.intervalMs;
      this.points = (h.points ?? []).filter((p) => p.t >= cutoff).slice(-this.maxPoints);
      this.log.info("kpi history restored", { points: this.points.length });
    } catch {
      /* ignore a corrupt copy */
    }
  }

  /** Demo mode: serve a saved history instead of recording static samples. */
  seed(history: KpiHistory, capturedAt: string): void {
    this.points = history.points.slice(-this.maxPoints);
    this.demo = { capturedAt };
    void this.cache.setRaw(keys.kpiHistory, JSON.stringify(this.history()), REDIS_TTL_MS);
  }

  start(): void {
    if (this.timer || this.demo) return;
    // First sample once the first polls have landed, then on the cadence.
    setTimeout(() => this.sample(), 60_000).unref();
    this.timer = setInterval(() => this.sample(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  sample(now = Date.now()): KpiPoint | null {
    const read = <T>(id: string): T | null => (this.cache.getEnvelope<T>(keys.data(id))?.data ?? null) as T | null;
    const values = computeKpis({
      regimes: read<RegimesResponse>("regimes"),
      health: read<MarketHealthResponse>("market-health"),
      deriv: read<CrossExchangeSummary>("derivatives-summary"),
      volume: read<VolumeScannerResponse>("volume-scanner"),
      whales: read<WhalesResponse>("quant-whales"),
    });
    if (KPI_KEYS.every((k) => values[k] === null)) return null;
    const point: KpiPoint = { t: now, v: values };
    this.points.push(point);
    if (this.points.length > this.maxPoints) this.points.splice(0, this.points.length - this.maxPoints);
    void this.cache.setRaw(keys.kpiHistory, JSON.stringify(this.history()), REDIS_TTL_MS);
    return point;
  }

  history(): KpiHistory {
    return { points: this.points, intervalMs: this.intervalMs, demo: this.demo };
  }
}
