import type { CdaClient, CdaErrorKind, CdaResult } from "@cqd/cda-client";
import {
  DATASETS,
  DATASET_IDS,
  emptyEnvelope,
  extractAsOf,
  isJevDef,
  isOnDemandDef,
  keys,
  resolveQuery,
  staleAfter,
  TIER_LABEL,
  tierAllows,
  type DatasetDef,
  type DatasetId,
  type DatasetRuntimeStatus,
  type Envelope,
  type EnvelopeStatus,
} from "@cqd/schemas";
import { validateDataset } from "@cqd/schemas/validators";
import type { BudgetGovernor } from "./budget";
import { DEMO_TTL_MS, type DemoSamples } from "./demo";
import type { WorkerCache } from "./cache";
import type { Logger } from "./log";

const SEC = 1_000;
const MIN = 60 * SEC;
/** How long to wait before re-checking an endpoint that answered 401/402/403. */
const TIER_RECHECK_MS = 60 * MIN;
/** Cached envelopes live this long in Redis regardless of interval, so the UI can show stale data. */
const ENVELOPE_TTL_MS = 24 * 60 * MIN;

const PRIORITY_SCHEDULED = 0;
const PRIORITY_ON_DEMAND = 10;

interface Slot {
  id: DatasetId;
  def: DatasetDef;
  param: string | null;
  key: string;
  nextDueAt: number;
  inFlight: boolean;
  failures: number;
  lastError: string | null;
}

export interface PollerOptions {
  client: CdaClient;
  cache: WorkerCache;
  budget: BudgetGovernor;
  log: Logger;
  gexSymbols: string;
  onDemandMax: number;
  /** The key's tier from /auth/keys/me (null until known: no gating). */
  keyTier: () => string | null;
  /** Whether the Jev classifier is configured (for Jev datasets not yet written). */
  jevConfigured: () => boolean;
  /** Demo samples, used for keyed datasets when CDA_API_KEY is empty. */
  demo: DemoSamples | null;
}

/** Demand-set member for a dataset (paramless on-demand datasets use an empty param). */
const memberKey = (id: string, param: string | null) => `${id}|${param ?? ""}`;

/**
 * Dataset poller. One loop (500 ms tick) dispatches every due scheduled dataset and every
 * active on-demand request. All fetches funnel through the client's token bucket, so the
 * loop can dispatch freely: the limiter decides when each request actually leaves.
 */
export class Poller {
  private readonly slots = new Map<string, Slot>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private demandTimer: ReturnType<typeof setInterval> | null = null;
  private readonly abort = new AbortController();
  private activeDemandKeys: string[] = [];
  private running = false;

  constructor(private readonly o: PollerOptions) {}

  /** Query for a dataset, with GEX_SYMBOLS applied to the scheduled GEX / positioning sets. */
  private queryFor(def: DatasetDef, param: string | null): Record<string, string | number | boolean> {
    const q: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(resolveQuery(def.query))) {
      if (v !== undefined && v !== null) q[k] = v;
    }
    if ((def.id === "quant-gex" || def.id === "quant-positioning") && this.o.gexSymbols) q.symbol = this.o.gexSymbols;
    if (def.param && param && def.param.in === "query") q[def.param.name] = param;
    return q;
  }

  private slotFor(id: DatasetId, param: string | null): Slot {
    const key = keys.data(id, param);
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { id, def: DATASETS[id], param, key, nextDueAt: 0, inFlight: false, failures: 0, lastError: null };
      this.slots.set(key, slot);
    }
    return slot;
  }

  async start(): Promise<void> {
    const { cache, client, log } = this.o;
    // Jev datasets are written by the classifier, never polled from CDA.
    const scheduled = DATASET_IDS.filter((id) => !isOnDemandDef(DATASETS[id] as DatasetDef) && !isJevDef(DATASETS[id] as DatasetDef));

    // Warm start from Redis: datasets fetched recently by a previous worker are not refetched early.
    const restored = await cache.restore(scheduled.map((id) => keys.data(id)));
    if (restored > 0) log.info("restored cached envelopes from redis", { count: restored });

    const now = Date.now();
    scheduled.forEach((id, i) => {
      const slot = this.slotFor(id, null);
      const def = slot.def;
      const existing = cache.getEnvelope(slot.key);
      if (def.tier !== "keyless" && !client.hasKey) {
        // Demo mode: the samples were seeded already; never overwrite them with "no API key".
        if (!this.o.demo || !this.o.cache.getEnvelope(slot.key)?.demo) {
          this.write(slot, "no_api_key", null, { kind: "no_api_key", message: "CDA_API_KEY is not configured on the worker." });
        }
        slot.nextDueAt = Number.POSITIVE_INFINITY;
        return;
      }
      const fetchedAt = existing?.fetchedAt ? Date.parse(existing.fetchedAt) : 0;
      // Stagger first fetches ~0.7 s apart; the limiter spaces them anyway.
      slot.nextDueAt = Math.max(now + i * 700, fetchedAt + def.intervalMs);
      if (!existing) this.write(slot, "pending", null, null);
    });

    if (!client.hasKey) {
      log.warn("CDA_API_KEY is not set: keyed endpoints are skipped and panels show 'API key not configured'", {
        skipped: scheduled.filter((id) => (DATASETS[id] as DatasetDef).tier !== "keyless").length,
      });
    }

    this.running = true;
    this.timer = setInterval(() => this.tick(), 500);
    this.demandTimer = setInterval(() => void this.refreshDemand(), 1_000);
    void this.refreshDemand();
  }

  stop(): void {
    this.running = false;
    this.abort.abort();
    if (this.timer) clearInterval(this.timer);
    if (this.demandTimer) clearInterval(this.demandTimer);
  }

  /** Called by the HTTP API when a viewer asks for an on-demand dataset through the worker. */
  touchDemand(id: DatasetId, param: string | null): void {
    const def = DATASETS[id] as DatasetDef;
    this.o.cache.addDemand(memberKey(id, param), Date.now() + (def.demandTtlMs ?? 2 * MIN));
  }

  /** The envelope to serve for a dataset right now (never null). */
  envelopeFor(id: DatasetId, param: string | null): Envelope {
    const def = DATASETS[id] as DatasetDef;
    const env = this.o.cache.getEnvelope(keys.data(id, param));
    if (env) return env;
    if (this.o.demo && !isJevDef(def) && def.tier !== "keyless" && !this.o.client.hasKey) {
      return this.o.demo.envelope(id, param) ?? this.o.demo.unavailable(id, param);
    }
    if (isJevDef(def)) {
      return this.o.jevConfigured()
        ? emptyEnvelope(id, "pending", { param, intervalMs: def.intervalMs, staleAfterMs: staleAfter(def) })
        : emptyEnvelope(id, "classifier_off", {
            param,
            intervalMs: def.intervalMs,
            staleAfterMs: staleAfter(def),
            error: { kind: "classifier_off", message: "TYPESAFE_API_KEY is not set or JEV_ENABLED=false on the worker." },
          });
    }
    if (def.tier !== "keyless" && !this.o.client.hasKey) {
      return emptyEnvelope(id, "no_api_key", {
        param,
        intervalMs: def.intervalMs,
        staleAfterMs: staleAfter(def),
        error: { kind: "no_api_key", message: "CDA_API_KEY is not configured on the worker." },
      });
    }
    return emptyEnvelope(id, "pending", { param, intervalMs: def.intervalMs, staleAfterMs: staleAfter(def) });
  }

  private async refreshDemand(): Promise<void> {
    if (!this.running) return;
    const demands = await this.o.cache.activeDemand();
    const active = demands.slice(0, this.o.onDemandMax);
    this.activeDemandKeys = active.map((d) => memberKey(d.dataset, d.param || null));
    const now = Date.now();
    for (const d of active) {
      if (!(d.dataset in DATASETS)) continue;
      const id = d.dataset as DatasetId;
      const def = DATASETS[id] as DatasetDef;
      if (!isOnDemandDef(def) || isJevDef(def)) continue;
      const slot = this.slotFor(id, d.param || null);
      if (slot.nextDueAt === 0) {
        // Claim the slot so the tick loop does not fetch while we look for a cached copy.
        slot.nextDueAt = Number.POSITIVE_INFINITY;
        if (!this.o.client.hasKey && def.tier !== "keyless") {
          if (this.o.demo) {
            // Demo mode: the saved sample for this symbol, or "not in demo".
            this.o.cache.setEnvelope(slot.key, this.o.demo.envelope(id, slot.param) ?? this.o.demo.unavailable(id, slot.param), DEMO_TTL_MS);
          } else {
            this.write(slot, "no_api_key", null, { kind: "no_api_key", message: "CDA_API_KEY is not configured on the worker." });
          }
          slot.nextDueAt = Number.POSITIVE_INFINITY;
          continue;
        }
        // A previous worker may have left this envelope in Redis: reuse it instead of blanking it.
        if (!this.o.cache.getEnvelope(slot.key)) await this.o.cache.restore([slot.key]);
        const existing = this.o.cache.getEnvelope(slot.key);
        const fetchedAt = existing?.fetchedAt ? Date.parse(existing.fetchedAt) : 0;
        slot.nextDueAt = Math.max(now, fetchedAt + def.intervalMs);
        if (!existing) this.write(slot, "pending", null, null);
      }
    }
  }

  private tick(): void {
    const now = Date.now();
    const mode = this.o.budget.mode(now);
    const active = new Set(this.activeDemandKeys);
    for (const slot of [...this.slots.values()]) {
      if (isOnDemandDef(slot.def) && !active.has(memberKey(slot.id, slot.param))) {
        // Nobody is looking: drop the slot until the next request re-activates it.
        this.slots.delete(slot.key);
        continue;
      }
      if (slot.inFlight || slot.nextDueAt > now) continue;
      const keyTier = this.o.keyTier();
      if (!tierAllows(keyTier, slot.def.tier)) {
        // Known in advance from /auth/keys/me: do not spend a call to collect a 403.
        this.write(slot, "pro_required", null, {
          kind: "tier",
          message: `Needs a ${TIER_LABEL[slot.def.tier]} key; this key is ${TIER_LABEL[keyTier as keyof typeof TIER_LABEL] ?? keyTier}.`,
        });
        slot.nextDueAt = now + TIER_RECHECK_MS;
        continue;
      }
      if (mode === "paused" && slot.def.tier !== "keyless") {
        const resetsAt = this.o.budget.resetsAt(now);
        this.write(slot, "budget_paused", null, {
          kind: "budget_paused",
          message: `Daily CDA budget reached; polling resumes at ${new Date(resetsAt).toISOString()}.`,
        });
        slot.nextDueAt = resetsAt + 5_000;
        continue;
      }
      void this.fetch(slot);
    }
  }

  private async fetch(slot: Slot): Promise<void> {
    const { client, log, budget } = this.o;
    const path = slot.def.path;
    if (!path) return;
    slot.inFlight = true;
    const started = Date.now();
    try {
      const res: CdaResult = await client.get(path, {
        pathParams: slot.def.param?.in === "path" && slot.param ? { [slot.def.param.name]: slot.param } : undefined,
        query: this.queryFor(slot.def, slot.param),
        priority: isOnDemandDef(slot.def) ? PRIORITY_ON_DEMAND : PRIORITY_SCHEDULED,
        signal: this.abort.signal,
      });
      const stretch = budget.stretch();
      const interval = slot.def.intervalMs * stretch;
      if (res.ok) {
        const validation = validateDataset(slot.id, res.data);
        if (!validation.ok) {
          log.warn("schema drift: response failed validation (cached anyway)", {
            dataset: slot.id,
            param: slot.param,
            issues: validation.issues,
          });
        }
        this.write(slot, "ok", res.data, null, validation, interval);
        slot.failures = 0;
        slot.lastError = null;
        slot.nextDueAt = Date.now() + interval;
        log.debug("poll ok", { dataset: slot.id, param: slot.param, ms: Date.now() - started, status: res.status });
        return;
      }
      if (res.kind === "aborted") return;
      const status = statusForFailure(res.kind);
      slot.failures += 1;
      slot.lastError = `${res.kind}: ${res.message}`;
      this.write(slot, status, null, { kind: res.kind, message: res.message, httpStatus: res.status }, undefined, interval);
      slot.nextDueAt = Date.now() + retryDelay(res.kind, interval, slot.failures);
      const fields = { dataset: slot.id, param: slot.param, kind: res.kind, httpStatus: res.status, message: res.message, retryInMs: slot.nextDueAt - Date.now() };
      if (status === "pro_required" || status === "unauthorized") log.warn("endpoint not available on this key; will re-check hourly", fields);
      else log.warn("poll failed", fields);
    } catch (err) {
      slot.failures += 1;
      slot.lastError = (err as Error).message;
      slot.nextDueAt = Date.now() + 60 * SEC;
      log.error("poll crashed", { dataset: slot.id, param: slot.param, error: (err as Error).message });
    } finally {
      slot.inFlight = false;
    }
  }

  /** Write an envelope, keeping the last good payload when the new attempt failed. */
  private write(
    slot: Slot,
    status: EnvelopeStatus,
    data: unknown,
    error: Envelope["error"],
    validation?: Envelope["validation"],
    intervalMs = slot.def.intervalMs,
  ): void {
    const prev = this.o.cache.getEnvelope(slot.key);
    const now = new Date().toISOString();
    const ok = status === "ok";
    const env: Envelope = {
      dataset: slot.id,
      param: slot.param,
      status,
      data: ok ? data : (prev?.data ?? null),
      fetchedAt: ok ? now : (prev?.fetchedAt ?? null),
      asOf: ok ? extractAsOf(slot.def, data) : (prev?.asOf ?? null),
      checkedAt: status === "pending" || status === "no_api_key" ? (prev?.checkedAt ?? null) : now,
      intervalMs,
      staleAfterMs: Math.max(staleAfter(slot.def), intervalMs * 3),
      error: ok ? null : error,
      validation: ok ? (validation ?? null) : (prev?.validation ?? null),
    };
    this.o.cache.setEnvelope(slot.key, env, ENVELOPE_TTL_MS);
  }

  runtimeStatus(): DatasetRuntimeStatus[] {
    return [...this.slots.values()]
      .map((s) => {
        const env = this.o.cache.getEnvelope(s.key);
        return {
          id: s.id,
          param: s.param,
          status: env?.status ?? "pending",
          fetchedAt: env?.fetchedAt ?? null,
          nextDueAt: Number.isFinite(s.nextDueAt) && s.nextDueAt > 0 ? new Date(s.nextDueAt).toISOString() : null,
          intervalMs: env?.intervalMs ?? s.def.intervalMs,
          lastError: s.lastError,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  activeDemand(): string[] {
    return [...this.activeDemandKeys];
  }
}

export function statusForFailure(kind: CdaErrorKind): EnvelopeStatus {
  switch (kind) {
    case "no_api_key":
      return "no_api_key";
    case "pro_required":
    case "payment_required":
      return "pro_required";
    case "unauthorized":
      return "unauthorized";
    case "rate_limited":
      return "rate_limited";
    default:
      return "error";
  }
}

/** Never hammer an endpoint that cannot succeed: 401/402/403 wait an hour, 404/422 wait a while. */
export function retryDelay(kind: CdaErrorKind, interval: number, failures: number): number {
  switch (kind) {
    case "pro_required":
    case "payment_required":
    case "unauthorized":
    case "no_api_key":
      return TIER_RECHECK_MS;
    case "not_found":
    case "bad_request":
      return Math.max(interval, 15 * MIN);
    case "rate_limited":
      return Math.max(interval, 2 * MIN);
    default:
      return Math.min(interval, Math.min(15 * MIN, 30 * SEC * 2 ** Math.min(failures - 1, 5)));
  }
}
