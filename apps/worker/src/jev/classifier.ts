import {
  DATASETS,
  jevAgrees,
  keys,
  staleAfter,
  type DatasetDef,
  type DatasetId,
  type Envelope,
  type EnvelopeError,
  type EnvelopeStatus,
  type JevAnswer,
  type JevChoiceRead,
  type JevMarketVerdict,
  type JevNewsRead,
  type JevNewsReads,
  type JevScoreRead,
  type JevSqueezeRead,
  type JevSqueezeReads,
  type LiquidityRegimeResponse,
  type NewsCoinResponse,
  type NewsEvent,
  type NewsEventsResponse,
  type QuantCoinsRiskResponse,
  type SqueezeAlertsResponse,
} from "@cqd/schemas";
import type { WorkerCache } from "../cache";
import type { Logger } from "../log";
import type { JevClient, JevFailKind } from "./client";
import { NEWS_QUESTIONS, SQUEEZE_QUESTIONS, VERDICT_QUESTIONS } from "./questions";
import { newsState, squeezeState, VERDICT_INPUTS, verdictState, type VerdictInputId } from "./state";

const SEC = 1_000;
const MIN = 60 * SEC;
const ENVELOPE_TTL_MS = 24 * 60 * MIN;
const SQUEEZE_READ_TTL_S = 7 * 24 * 3600;
/** Max news events classified per pass (newest first); the rest wait for the next minute. */
const NEWS_PER_PASS = 25;
const CONCURRENCY = 3;
/** Failures that end a pass: retrying the next event would hit the same wall. */
const STOP_KINDS: ReadonlySet<JevFailKind> = new Set(["not_configured", "budget_paused", "auth_backoff", "unauthorized", "forbidden", "rate_limited", "aborted"]);

type JevDatasetId = "jev-news" | "jev-squeeze" | "jev-market-verdict";

function choiceRead(a: JevAnswer | undefined): JevChoiceRead | null {
  return a?.type === "choice" ? { choice: a.choice, confidence: a.confidence, probabilities: a.probabilities } : null;
}
function scoreRead(a: JevAnswer | undefined, levels: number): JevScoreRead | null {
  return a?.type === "score" ? { score: a.score, confidence: a.confidence, probabilities: a.probabilities, levels } : null;
}
function noulRead(a: JevAnswer | undefined): number | null {
  return a?.type === "noul" ? a.noul : null;
}

function statusForFail(kind: JevFailKind): EnvelopeStatus {
  switch (kind) {
    case "not_configured":
      return "classifier_off";
    case "budget_paused":
      return "budget_paused";
    case "unauthorized":
    case "forbidden":
    case "auth_backoff":
      return "unauthorized";
    case "rate_limited":
      return "rate_limited";
    default:
      return "error";
  }
}

/** ISO hour bucket, e.g. "2026-10-14T08". */
const hourBucket = (ms: number) => new Date(ms).toISOString().slice(0, 13);

/**
 * Runs the three Jev classifications from datasets the poller already cached:
 *   news     every 60 s: each new event on the news tape or an open coin drill-down, once per
 *            (event id, model version), stored permanently;
 *   squeeze  every 60 s: each active squeeze alert, once per (symbol, direction, UTC hour);
 *   verdict  every 15 min: one market-wide read from six cached inputs.
 * Results are written as jev-* envelopes, so the web app reads them like any other dataset.
 */
export class JevClassifier {
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private readonly abort = new AbortController();
  private readonly running = new Set<string>();
  private readonly retryAt = new Map<string, number>();
  private readonly loaded = new Set<string>();
  private stopped = false;

  constructor(private readonly o: { jev: JevClient; cache: WorkerCache; log: Logger; verdictIntervalMs: number }) {}

  async start(): Promise<void> {
    const { jev, log } = this.o;
    await jev.restore();
    if (!jev.configured) {
      const error: EnvelopeError = { kind: "classifier_off", message: "TYPESAFE_API_KEY is not set or JEV_ENABLED=false on the worker." };
      for (const id of ["jev-news", "jev-squeeze", "jev-market-verdict"] as const) this.write(id, null, { status: "classifier_off", error });
      log.warn("Jev classifier not configured: set TYPESAFE_API_KEY (and leave JEV_ENABLED on) to enable it");
      return;
    }
    log.info("Jev classifier starting", { model: jev.status().model, resolvedModel: jev.status().resolvedModel });
    // Warm start: pick up the envelopes a previous worker left in Redis, so a restart neither
    // blanks the panels nor re-runs the 15-minute verdict early.
    await this.o.cache.restore(["jev-news", "jev-squeeze", "jev-market-verdict"].map((id) => keys.data(id)));
    this.every(60 * SEC, 5 * SEC, () => this.guard("news", () => this.newsPass()));
    this.every(60 * SEC, 8 * SEC, () => this.guard("squeeze", () => this.squeezePass()));
    // Warm start: reuse a verdict a previous worker wrote within the interval.
    const prev = this.o.cache.getEnvelope(keys.data("jev-market-verdict"));
    const age = prev?.fetchedAt ? Date.now() - Date.parse(prev.fetchedAt) : Infinity;
    const first = Math.max(15 * SEC, this.o.verdictIntervalMs - age);
    this.every(this.o.verdictIntervalMs, first, () => this.guard("verdict", () => this.verdictPass()));
  }

  stop(): void {
    this.stopped = true;
    this.abort.abort();
    for (const t of this.timers) clearTimeout(t);
  }

  private every(intervalMs: number, firstDelayMs: number, fn: () => Promise<void>): void {
    const tick = async () => {
      if (this.stopped) return;
      await fn();
      if (!this.stopped) this.timers.push(setTimeout(() => void tick(), intervalMs));
    };
    this.timers.push(setTimeout(() => void tick(), firstDelayMs));
  }

  private async guard(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.running.has(name)) return;
    this.running.add(name);
    try {
      await fn();
    } catch (err) {
      this.o.log.error("jev pass crashed", { pass: name, error: (err as Error).message });
    } finally {
      this.running.delete(name);
    }
  }

  private write<T>(id: JevDatasetId, data: T | null, opts: { status?: EnvelopeStatus; error?: EnvelopeError | null; asOf?: string | null } = {}): void {
    const def = DATASETS[id as DatasetId] as DatasetDef;
    const key = keys.data(id);
    const prev = this.o.cache.getEnvelope<T>(key);
    const now = new Date().toISOString();
    const env: Envelope<T> = {
      dataset: id,
      param: null,
      status: opts.status ?? "ok",
      data: data ?? prev?.data ?? null,
      fetchedAt: data !== null ? now : (prev?.fetchedAt ?? null),
      asOf: opts.asOf !== undefined ? opts.asOf : data !== null ? now : (prev?.asOf ?? null),
      checkedAt: now,
      intervalMs: def.intervalMs,
      staleAfterMs: staleAfter(def),
      error: opts.error ?? null,
      validation: null,
    };
    this.o.cache.setEnvelope(key, env as Envelope, ENVELOPE_TTL_MS);
  }

  private async ensureLoaded(model: string | null): Promise<void> {
    if (!model || this.loaded.has(model)) return;
    this.loaded.add(model);
    const n = (await this.o.cache.hashLoad(keys.jevNews(model))) + (await this.o.cache.hashLoad(keys.jevSqueeze(model)));
    if (n > 0) this.o.log.info("restored cached Jev reads from redis", { model, count: n });
  }

  private data<T>(id: DatasetId, param?: string | null): Envelope<T> | null {
    return this.o.cache.getEnvelope<T>(keys.data(id, param ?? null));
  }

  // ---- 1. news catalysts ---------------------------------------------------------

  private collectNews(): NewsEvent[] {
    const tape = this.data<NewsEventsResponse>("news-market-moving")?.data?.events ?? [];
    const coins = this.o.cache.envelopesWithPrefix<NewsCoinResponse>(`${keys.data("news-coin")}:`).flatMap((e) => e.data?.events ?? []);
    const seen = new Map<string, NewsEvent>();
    for (const e of [...tape, ...coins]) if (!seen.has(e.event_id)) seen.set(e.event_id, e);
    return [...seen.values()].sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  }

  private newsRead(model: string | null, eventId: string): JevNewsRead | null {
    if (!model) return null;
    const raw = this.o.cache.hashGet(keys.jevNews(model), eventId);
    return raw ? (JSON.parse(raw) as JevNewsRead) : null;
  }

  private async newsPass(): Promise<void> {
    const { jev, cache, log } = this.o;
    const events = this.collectNews();
    await this.ensureLoaded(jev.modelKey());
    const now = Date.now();
    const todo = events.filter((e) => !this.newsRead(jev.modelKey(), e.event_id) && (this.retryAt.get(`news|${e.event_id}`) ?? 0) <= now).slice(0, NEWS_PER_PASS);
    let stop: JevFailKind | null = null;
    let lastMessage = "";
    for (let i = 0; i < todo.length && !stop; i += CONCURRENCY) {
      const batch = todo.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((e) =>
          jev.ask(newsState(e), NEWS_QUESTIONS, { priority: 2, signal: this.abort.signal }),
        ),
      );
      results.forEach((r, k) => {
        const e = batch[k]!;
        if (!r.ok) {
          if (STOP_KINDS.has(r.kind)) stop = r.kind;
          lastMessage = r.message;
          this.retryAt.set(`news|${e.event_id}`, Date.now() + 10 * MIN);
          return;
        }
        const bias = choiceRead(r.answers.bias);
        const severity = scoreRead(r.answers.severity, NEWS_QUESTIONS.severity.criteria.length);
        const actionable = noulRead(r.answers.actionable);
        if (!bias || !severity || actionable === null) {
          lastMessage = "Answer types did not match the questions";
          this.retryAt.set(`news|${e.event_id}`, Date.now() + 60 * MIN);
          return;
        }
        const read: JevNewsRead = {
          eventId: e.event_id,
          model: r.model,
          classifiedAt: new Date().toISOString(),
          bias,
          actionable,
          severity,
          cdaBias: e.bias,
          agrees: jevAgrees(e.bias, bias.choice),
          inputTokens: r.usage.input_tokens,
        };
        // Permanent: one classification per (event id, model version).
        cache.hashSet(keys.jevNews(r.model), e.event_id, JSON.stringify(read));
        this.loaded.add(r.model);
      });
    }
    if (todo.length > 0) log.debug("jev news pass", { candidates: todo.length, stoppedBy: stop });

    const model = jev.modelKey();
    const reads: Record<string, JevNewsRead> = {};
    let latest = 0;
    for (const e of events) {
      const r = this.newsRead(model, e.event_id);
      if (r) {
        reads[e.event_id] = r;
        latest = Math.max(latest, Date.parse(r.classifiedAt));
      }
    }
    const classified = Object.keys(reads).length;
    const failed = events.filter((e) => !reads[e.event_id] && (this.retryAt.get(`news|${e.event_id}`) ?? 0) > Date.now()).length;
    const payload: JevNewsReads = { model, reads, eventsSeen: events.length, classified, pending: events.length - classified - failed, failed };
    const blocking = stop && stop !== "aborted" && stop !== "rate_limited" ? stop : null;
    this.write("jev-news", payload, {
      status: blocking ? statusForFail(blocking) : "ok",
      error: blocking ? { kind: blocking, message: lastMessage } : null,
      asOf: latest ? new Date(latest).toISOString() : null,
    });
  }

  // ---- 2. squeeze alerts ------------------------------------------------------------

  private async squeezePass(): Promise<void> {
    const { jev, cache } = this.o;
    const env = this.data<SqueezeAlertsResponse>("squeeze-alerts");
    const alerts = env?.data?.alerts ?? [];
    const asOfMs = env?.data?.as_of ? env.data.as_of * 1000 : Date.now();
    const risk = this.data<QuantCoinsRiskResponse>("quant-coins-risk")?.data?.items ?? [];
    const liq = this.data<LiquidityRegimeResponse>("liquidity-regime")?.data?.coins ?? [];
    await this.ensureLoaded(jev.modelKey());

    const active: Record<string, string> = {};
    let stop: JevFailKind | null = null;
    let lastMessage = "";
    for (const a of alerts) {
      const pair = `${a.symbol}|${a.direction}`;
      const alertId = `${pair}|${hourBucket(asOfMs)}`;
      active[pair] = alertId;
      const model = jev.modelKey();
      if (stop || (model && cache.hashGet(keys.jevSqueeze(model), alertId)) || (this.retryAt.get(`sq|${alertId}`) ?? 0) > Date.now()) continue;
      const coin = risk.find((r) => r.symbol === a.symbol);
      const liquidity = liq.find((c) => c.coin === a.symbol);
      const r = await jev.ask(squeezeState(a, asOfMs, coin, liquidity), SQUEEZE_QUESTIONS, { priority: 4, signal: this.abort.signal });
      if (!r.ok) {
        if (STOP_KINDS.has(r.kind)) stop = r.kind;
        lastMessage = r.message;
        this.retryAt.set(`sq|${alertId}`, Date.now() + 5 * MIN);
        continue;
      }
      const cascade = noulRead(r.answers.cascade);
      if (cascade === null) continue;
      const read: JevSqueezeRead = {
        alertId,
        symbol: a.symbol,
        direction: a.direction,
        model: r.model,
        classifiedAt: new Date().toISOString(),
        cascade,
        inputTokens: r.usage.input_tokens,
      };
      cache.hashSet(keys.jevSqueeze(r.model), alertId, JSON.stringify(read), SQUEEZE_READ_TTL_S);
      this.loaded.add(r.model);
    }

    const model = jev.modelKey();
    const reads: Record<string, JevSqueezeRead> = {};
    for (const id of Object.values(active)) {
      const raw = model ? cache.hashGet(keys.jevSqueeze(model), id) : null;
      if (raw) reads[id] = JSON.parse(raw) as JevSqueezeRead;
    }
    const payload: JevSqueezeReads = { model, reads, active };
    const blocking = stop && stop !== "aborted" && stop !== "rate_limited" ? stop : null;
    this.write("jev-squeeze", payload, { status: blocking ? statusForFail(blocking) : "ok", error: blocking ? { kind: blocking, message: lastMessage } : null });
  }

  // ---- 3. market verdict --------------------------------------------------------------

  private async verdictPass(): Promise<void> {
    const { jev, log } = this.o;
    const envs = Object.fromEntries(VERDICT_INPUTS.map((id) => [id, this.data(id)])) as Record<VerdictInputId, Envelope | null>;
    const { state, inputs, hasCore } = verdictState(envs);
    if (!hasCore) {
      this.write("jev-market-verdict", null, { status: "pending", error: { kind: "inputs", message: "Waiting for CDA inputs (quant-market, market-health, regimes)." } });
      return;
    }
    const r = await jev.ask(state, VERDICT_QUESTIONS, { priority: 6, signal: this.abort.signal });
    if (!r.ok) {
      if (r.kind === "aborted") return;
      log.warn("jev verdict failed", { kind: r.kind, message: r.message });
      this.write("jev-market-verdict", null, { status: statusForFail(r.kind), error: { kind: r.kind, message: r.message } });
      return;
    }
    const stance = choiceRead(r.answers.stance);
    const conviction = scoreRead(r.answers.conviction, VERDICT_QUESTIONS.conviction.criteria.length);
    const vol = noulRead(r.answers.vol_expansion_24h);
    if (!stance || !conviction || vol === null) {
      this.write("jev-market-verdict", null, { status: "error", error: { kind: "invalid_response", message: "Answer types did not match the questions" } });
      return;
    }
    const verdict: JevMarketVerdict = { model: r.model, classifiedAt: new Date().toISOString(), stance, volExpansion24h: vol, conviction, inputs, usage: r.usage };
    this.write("jev-market-verdict", verdict);
    log.info("jev market verdict", { stance: stance.choice, confidence: stance.confidence, volExpansion24h: vol, conviction: conviction.score, inputTokens: r.usage.input_tokens });
  }
}
