import createClient from "openapi-fetch";
import { CdaError, classifyStatus, extractErrorMessage, isTerminalStatus, type CdaErrorKind } from "./errors";
import type { paths } from "./generated/openapi";
import { TokenBucket } from "./limiter";

export const DEFAULT_BASE_URL = "https://cryptodataapi.com";
export const DEFAULT_USER_AGENT = "crypto-quant-dashboard/0.1 (+https://github.com/Crypto-Data-API/crypto-quant-dashboard)";

/** Endpoints CDA serves without a key. Calls to these never carry X-API-Key and never touch the keyed budget. */
export const KEYLESS_PATHS: ReadonlySet<string> = new Set(["/api/v1", "/api/v1/health", "/api/v1/stream/delayed"]);

/** Every path in the spec that has a GET operation. Typos in the dataset registry fail at compile time. */
export type GetPath = {
  [P in keyof paths]-?: [NonNullable<paths[P]["get"]>] extends [never] ? never : P;
}[keyof paths];

export type QueryValue = string | number | boolean | null | undefined;

export interface AttemptEvent {
  path: string;
  authed: boolean;
  attempt: number;
  status: number | null;
  durationMs: number;
  kind?: CdaErrorKind;
}

export interface CdaClientOptions {
  baseUrl?: string;
  /** CDA_API_KEY. When missing, keyed endpoints short-circuit to `no_api_key` without a network call. */
  apiKey?: string | null;
  userAgent?: string;
  /** Shared limiter for keyed calls. Default: 28/min, burst 1. */
  limiter?: TokenBucket;
  /** Separate, gentler limiter for keyless calls (they do not count against the key). */
  keylessLimiter?: TokenBucket;
  /** Retries for 429 / 5xx / network errors. 4xx other than 429 are never retried. Default 3. */
  maxRetries?: number;
  timeoutMs?: number;
  backoffBaseMs?: number;
  maxBackoffMs?: number;
  /** Called once per HTTP attempt that actually left the process (feeds the daily call counter). */
  onAttempt?: (e: AttemptEvent) => void;
  fetch?: typeof fetch;
}

export interface GetOptions {
  /** Values for `{name}` placeholders in the path template. */
  pathParams?: Record<string, string>;
  query?: Record<string, QueryValue>;
  priority?: number;
  signal?: AbortSignal;
}

export interface CdaOk<T> {
  ok: true;
  status: number;
  data: T;
  receivedAt: number;
  durationMs: number;
}

export interface CdaFail {
  ok: false;
  status: number | null;
  kind: CdaErrorKind;
  message: string;
  body?: unknown;
  receivedAt: number;
}

export type CdaResult<T = unknown> = CdaOk<T> | CdaFail;

interface SendMeta {
  priority?: number;
  signal?: AbortSignal;
  /** Streams: no retries (the caller owns reconnect) and no timeout once headers arrive. */
  stream?: boolean;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CdaError("aborted", "Aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new CdaError("aborted", "Aborted"));
      },
      { once: true },
    );
  });
}

export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export function buildPath(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = params[name];
    if (v === undefined) throw new CdaError("bad_request", `Missing path parameter "${name}" for ${template}`);
    return encodeURIComponent(v);
  });
}

export function createCdaClient(options: CdaClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = options.apiKey?.trim() || null;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const limiter = options.limiter ?? new TokenBucket({ ratePerMinute: 28, burst: 1 });
  const keylessLimiter = options.keylessLimiter ?? new TokenBucket({ ratePerMinute: 10, burst: 2 });
  const maxRetries = options.maxRetries ?? 3;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const backoffBaseMs = options.backoffBaseMs ?? 2_000;
  const maxBackoffMs = options.maxBackoffMs ?? 120_000;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  /** Exponential backoff with "equal jitter": half fixed, half random. */
  const backoff = (attempt: number) => {
    const exp = Math.min(maxBackoffMs, backoffBaseMs * 2 ** attempt);
    return Math.round(exp / 2 + Math.random() * (exp / 2));
  };

  /** The single transport every CDA request goes through: auth, limiter, retries, accounting. */
  async function send(input: Request, meta: SendMeta = {}): Promise<Response> {
    const url = new URL(input.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const authed = !KEYLESS_PATHS.has(path);
    if (authed && !apiKey) {
      throw new CdaError("no_api_key", `CDA_API_KEY is not configured; skipped ${path}`);
    }
    const bucket = authed ? limiter : keylessLimiter;
    const retries = meta.stream ? 0 : maxRetries;

    for (let attempt = 0; ; attempt++) {
      await bucket.acquire({ priority: meta.priority, signal: meta.signal });
      const headers = new Headers(input.headers);
      headers.set("User-Agent", userAgent);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      if (authed && apiKey) headers.set("X-API-Key", apiKey);
      else headers.delete("X-API-Key");

      const signals: AbortSignal[] = [];
      if (meta.signal) signals.push(meta.signal);
      if (!meta.stream) signals.push(AbortSignal.timeout(timeoutMs));
      const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

      const started = Date.now();
      let res: Response;
      try {
        res = await doFetch(new Request(input.url, { method: input.method, headers, signal }));
      } catch (err) {
        const aborted = meta.signal?.aborted === true;
        const timedOut = !aborted && err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        const kind: CdaErrorKind = aborted ? "aborted" : timedOut ? "timeout" : "network";
        options.onAttempt?.({ path, authed, attempt, status: null, durationMs: Date.now() - started, kind });
        if (aborted) throw new CdaError("aborted", `Aborted ${path}`);
        if (attempt < Math.min(retries, 2)) {
          await sleep(backoff(attempt), meta.signal);
          continue;
        }
        throw new CdaError(kind, `${kind === "timeout" ? "Timed out" : "Network error"} calling ${path}: ${(err as Error).message}`);
      }
      const durationMs = Date.now() - started;
      options.onAttempt?.({
        path,
        authed,
        attempt,
        status: res.status,
        durationMs,
        kind: res.ok ? undefined : classifyStatus(res.status),
      });

      if (res.status === 429) {
        // Freeze the whole bucket, not just this request: every other caller would hit the same wall.
        const wait = parseRetryAfter(res.headers.get("retry-after")) ?? backoff(attempt + 1);
        bucket.pauseUntil(Date.now() + wait);
        if (attempt < retries) {
          await res.body?.cancel().catch(() => undefined);
          await sleep(wait, meta.signal);
          continue;
        }
        return res;
      }
      if (res.status >= 500 && !isTerminalStatus(res.status) && attempt < Math.min(retries, 2)) {
        await res.body?.cancel().catch(() => undefined);
        await sleep(backoff(attempt), meta.signal);
        continue;
      }
      // 2xx, terminal 4xx (401/402/403/404/422 are never retried), or retries exhausted.
      return res;
    }
  }

  /** Fully typed client for hand-written calls: `api.GET("/api/v1/health")`. Shares the transport above. */
  const api = createClient<paths>({ baseUrl, fetch: (req: Request) => send(req) });

  /**
   * Registry-driven GET used by the poller. Never throws for HTTP or network failures:
   * every outcome is a CdaResult so the caller can turn it into a cache envelope.
   */
  async function get<T = unknown>(pathTemplate: GetPath, opts: GetOptions = {}): Promise<CdaResult<T>> {
    let url: URL;
    try {
      url = new URL(baseUrl + buildPath(pathTemplate, opts.pathParams));
    } catch (err) {
      return { ok: false, status: null, kind: "bad_request", message: (err as Error).message, receivedAt: Date.now() };
    }
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const started = Date.now();
    let res: Response;
    try {
      res = await send(new Request(url, { method: "GET" }), { priority: opts.priority, signal: opts.signal });
    } catch (err) {
      const e = err instanceof CdaError ? err : new CdaError("network", (err as Error).message);
      return { ok: false, status: e.status, kind: e.kind, message: e.message, receivedAt: Date.now() };
    }
    const text = await res.text().catch(() => "");
    let body: unknown = text;
    try {
      body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      if (res.ok) {
        return {
          ok: false,
          status: res.status,
          kind: "invalid_response",
          message: `Non-JSON response from ${url.pathname}`,
          receivedAt: Date.now(),
        };
      }
    }
    if (res.ok) {
      return { ok: true, status: res.status, data: body as T, receivedAt: Date.now(), durationMs: Date.now() - started };
    }
    return {
      ok: false,
      status: res.status,
      kind: classifyStatus(res.status),
      message: extractErrorMessage(body, `HTTP ${res.status} from ${url.pathname}`),
      body,
      receivedAt: Date.now(),
    };
  }

  /**
   * Open the CDA SSE stream (`/api/v1/stream`). Returns the raw Response so the caller can
   * parse events and own reconnect logic. Consumes one limiter token per connection attempt.
   */
  async function openStream(
    opts: { query?: Record<string, QueryValue>; lastEventId?: string | null; signal?: AbortSignal } = {},
  ): Promise<Response> {
    const url = new URL(`${baseUrl}/api/v1/stream`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers = new Headers({ Accept: "text/event-stream", "Cache-Control": "no-cache" });
    if (opts.lastEventId) headers.set("Last-Event-ID", opts.lastEventId);
    return send(new Request(url, { method: "GET", headers }), { stream: true, priority: 100, signal: opts.signal });
  }

  return {
    api,
    get,
    openStream,
    baseUrl,
    hasKey: apiKey !== null,
    limiter,
    keylessLimiter,
  };
}

export type CdaClient = ReturnType<typeof createCdaClient>;
