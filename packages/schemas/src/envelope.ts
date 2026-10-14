/**
 * Every dataset is stored in the cache, and served by /api/data/[dataset], wrapped in an
 * Envelope. The envelope carries the freshness and error metadata every panel needs to show
 * "data as of", a stale indicator, and an intentional Pro-required / no-key / error state.
 */
export type EnvelopeStatus =
  /** Latest fetch succeeded. */
  | "ok"
  /** Worker is up but has not fetched this dataset yet (or an on-demand fetch is queued). */
  | "pending"
  /** CDA_API_KEY is not configured on the worker. */
  | "no_api_key"
  /** CDA answered 403 (or 402 with a key): this endpoint is above the key's tier. */
  | "pro_required"
  /** CDA answered 401: the key was rejected. */
  | "unauthorized"
  /** CDA kept answering 429 after backoff. */
  | "rate_limited"
  /** The daily call budget governor paused polling until the UTC day rolls over. */
  | "budget_paused"
  /** Network / 5xx / invalid response. */
  | "error"
  /** The web app could not reach the cache or the worker. */
  | "worker_offline";

export interface EnvelopeError {
  kind: string;
  message: string;
  httpStatus?: number | null;
}

export interface Envelope<T = unknown> {
  dataset: string;
  /** Symbol / coin for on-demand datasets. */
  param?: string | null;
  status: EnvelopeStatus;
  /** Last good payload. Kept when a later fetch fails so panels can show stale data. */
  data: T | null;
  /** When `data` was fetched from CDA (ISO). */
  fetchedAt: string | null;
  /** Source timestamp reported inside the payload, when CDA provides one (ISO). */
  asOf: string | null;
  /** Last attempt, successful or not (ISO). */
  checkedAt: string | null;
  /** Polling interval in ms (after any budget throttling). */
  intervalMs: number;
  /** Data older than this is shown as stale. */
  staleAfterMs: number;
  error?: EnvelopeError | null;
  /** Zod drift report. Data is still served when validation fails. */
  validation?: { ok: boolean; issues?: string[] } | null;
}

export const isProblemStatus = (s: EnvelopeStatus) => s !== "ok" && s !== "pending";

/** True when the payload is older than its stale threshold. */
export function isStale(env: Pick<Envelope, "fetchedAt" | "staleAfterMs">, now = Date.now()): boolean {
  if (!env.fetchedAt) return false;
  return now - Date.parse(env.fetchedAt) > env.staleAfterMs;
}

export function emptyEnvelope<T>(
  dataset: string,
  status: EnvelopeStatus,
  opts: { param?: string | null; intervalMs?: number; staleAfterMs?: number; error?: EnvelopeError | null } = {},
): Envelope<T> {
  return {
    dataset,
    param: opts.param ?? null,
    status,
    data: null,
    fetchedAt: null,
    asOf: null,
    checkedAt: null,
    intervalMs: opts.intervalMs ?? 0,
    staleAfterMs: opts.staleAfterMs ?? 0,
    error: opts.error ?? null,
    validation: null,
  };
}
