import { TokenBucket } from "@cqd/cda-client";
import { keys, utcDate, type BudgetMode, type JevStatus } from "@cqd/schemas";
import { JevResponse } from "@cqd/schemas/validators";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  TypeSafeClient,
  type Questions,
  type SystemOneRequest,
} from "@typesafe-ai/sdk";
import type { WorkerCache } from "../cache";
import type { JevConfig } from "../config";
import type { Logger } from "../log";

export type JevFailKind =
  | "not_configured"
  | "unauthorized" // 401: key rejected
  | "forbidden" // 403: key lacks access (or the wrong auth header)
  | "rate_limited" // 429 after the SDK's retries
  | "bad_request" // 400 / 422: our request is wrong; retrying cannot help
  | "server_error"
  | "network"
  | "timeout"
  | "invalid_response"
  | "budget_paused"
  | "auth_backoff" // pausing after a 401/403
  | "aborted";

export interface JevOk {
  ok: true;
  model: string;
  answers: JevResponse["answers"];
  usage: JevResponse["usage"];
  /** Exact request body sent (for docs/samples and debugging). */
  request: SystemOneRequest<Questions> & { model: string };
}

export interface JevFail {
  ok: false;
  kind: JevFailKind;
  message: string;
  status: number | null;
}

export type JevResult = JevOk | JevFail;

/** After a 401/403 the classifier stops calling for this long instead of retrying. */
const AUTH_BACKOFF_MS = 60 * 60_000;

/**
 * Thin wrapper over the official @typesafe-ai/sdk client:
 *  - the SDK owns transport retries: 408/429/5xx with exponential backoff and Retry-After; 401
 *    and 403 are never retried (they are not in the retry set);
 *  - every HTTP attempt passes through a counting fetch, feeding the daily call counter;
 *  - input/output tokens from each response feed the daily token counters (billing is on input);
 *  - a token bucket (JEV_RATE_PER_MIN, default 60/min) bounds runaway loops far below the API's
 *    1,200/min;
 *  - a daily budget (calls and input tokens) pauses the classifier until 00:00 UTC;
 *  - responses are validated with Zod at the boundary.
 */
export function createJevClient(opts: { config: JevConfig; cache: WorkerCache; log: Logger }) {
  const { config, cache, log } = opts;
  const configured = config.enabled && config.apiKey !== null;
  const limiter = new TokenBucket({ ratePerMinute: config.ratePerMinute, burst: 5 });
  let resolvedModel: string | null = null;
  let lastCallAt: number | null = null;
  let lastError: JevStatus["lastError"] = null;
  let authBlockedUntil = 0;

  const counterKey = (what: "calls" | "input_tokens" | "output_tokens" | "errors") => keys.jevCounter(utcDate(), what);

  // Count every attempt that leaves the process, including SDK retries.
  const countingFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    cache.addCounter(counterKey("calls"), 1);
    const res = await fetch(input, init);
    if (res.status === 429) limiter.pauseUntil(Date.now() + (Number(res.headers.get("retry-after")) * 1000 || 5_000));
    return res;
  };

  const client = configured
    ? new TypeSafeClient({
        apiKey: config.apiKey!,
        baseURL: config.baseUrl,
        defaultModel: config.model,
        logLevel: "off",
        timeout: 20_000,
        fetch: countingFetch,
        retry: {
          maxRetries: 3,
          backoffInitialMs: 1_000,
          backoffMaxMs: 30_000,
          // 401 and 403 are deliberately absent: retrying cannot fix a rejected key.
          httpStatuses: new Set([408, 429, 500, 502, 503, 504]),
          respectRetryAfter: true,
          maxRetryAfterMs: 60_000,
        },
      })
    : null;

  function budgetMode(): BudgetMode {
    const calls = cache.counter(counterKey("calls"));
    const tokens = cache.counter(counterKey("input_tokens"));
    if (calls >= config.dailyCalls || tokens >= config.dailyInputTokens) return "paused";
    if (calls >= config.dailyCalls * 0.9 || tokens >= config.dailyInputTokens * 0.9) return "throttled";
    return "normal";
  }

  function fail(kind: JevFailKind, message: string, status: number | null = null): JevFail {
    if (kind !== "aborted" && kind !== "budget_paused" && kind !== "not_configured" && kind !== "auth_backoff") {
      lastError = { kind, message, at: new Date().toISOString() };
      cache.addCounter(counterKey("errors"), 1);
    }
    return { ok: false, kind, message, status };
  }

  /** State may be any JSON-serialisable value; it is normalised (undefined fields dropped) before sending. */
  async function ask(rawState: unknown, questions: Questions, o: { priority?: number; signal?: AbortSignal } = {}): Promise<JevResult> {
    const state = (typeof rawState === "string" ? rawState : JSON.parse(JSON.stringify(rawState ?? null))) as SystemOneRequest["state"];
    if (!client) return fail("not_configured", config.enabled ? "TYPESAFE_API_KEY is not set on the worker." : "JEV_ENABLED=false on the worker.");
    if (Date.now() < authBlockedUntil) return fail("auth_backoff", `Paused after an auth failure until ${new Date(authBlockedUntil).toISOString()}.`);
    if (budgetMode() === "paused") return fail("budget_paused", "Daily Jev budget reached; classification resumes at 00:00 UTC.");
    try {
      await limiter.acquire({ priority: o.priority, signal: o.signal });
    } catch {
      return fail("aborted", "Aborted");
    }
    const request = { state, questions, model: config.model };
    try {
      const raw: unknown = await client.systemOne(request, { signal: o.signal });
      lastCallAt = Date.now();
      const parsed = JevResponse.safeParse(raw);
      if (!parsed.success) {
        return fail("invalid_response", `Response did not match the expected shape: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      }
      const r = parsed.data;
      cache.addCounter(counterKey("input_tokens"), r.usage.input_tokens);
      cache.addCounter(counterKey("output_tokens"), r.usage.output_tokens);
      if (r.model !== resolvedModel) {
        if (resolvedModel) log.info("jev model version changed", { from: resolvedModel, to: r.model });
        resolvedModel = r.model;
        void cache.setRaw(keys.jevResolvedModel, r.model, 30 * 24 * 3600 * 1000);
      }
      return { ok: true, model: r.model, answers: r.answers, usage: r.usage, request };
    } catch (err) {
      if (err instanceof APIUserAbortError) return fail("aborted", "Aborted");
      if (err instanceof APIError) {
        const msg = `HTTP ${err.status}: ${typeof err.body === "object" && err.body ? JSON.stringify(err.body).slice(0, 200) : String(err.body ?? err.message).slice(0, 200)}`;
        if (err.status === 401 || err.status === 403) {
          authBlockedUntil = Date.now() + AUTH_BACKOFF_MS;
          log.warn("jev auth failed; pausing classification for an hour (no retries)", { status: err.status });
          return fail(err.status === 401 ? "unauthorized" : "forbidden", msg, err.status);
        }
        if (err.status === 429) return fail("rate_limited", msg, 429);
        if (err.status === 400 || err.status === 422) return fail("bad_request", msg, err.status);
        return fail("server_error", msg, err.status);
      }
      if (err instanceof APITimeoutError) return fail("timeout", err.message);
      if (err instanceof APIConnectionError) return fail("network", err.message);
      return fail("network", (err as Error).message);
    }
  }

  return {
    configured,
    ask,
    budgetMode,
    /** Load today's counters and the last resolved model from Redis (call once at startup). */
    async restore(): Promise<void> {
      await cache.restoreCounterKeys((["calls", "input_tokens", "output_tokens", "errors"] as const).map(counterKey));
      resolvedModel = (await cache.getRaw(keys.jevResolvedModel)) ?? resolvedModel;
    },
    /** Model version used to key cached classifications. A pinned JEV_MODEL keys itself. */
    modelKey(): string | null {
      return config.model === "jev-latest" ? resolvedModel : config.model;
    },
    status(): JevStatus {
      return {
        enabled: config.enabled,
        configured,
        model: config.model,
        resolvedModel,
        callsToday: cache.counter(counterKey("calls")),
        inputTokensToday: cache.counter(counterKey("input_tokens")),
        outputTokensToday: cache.counter(counterKey("output_tokens")),
        errorsToday: cache.counter(counterKey("errors")),
        budget: { dailyCalls: config.dailyCalls, dailyInputTokens: config.dailyInputTokens, mode: budgetMode() },
        ratePerMinute: config.ratePerMinute,
        lastCallAt: lastCallAt ? new Date(lastCallAt).toISOString() : null,
        lastError,
      };
    },
  };
}

export type JevClient = ReturnType<typeof createJevClient>;
