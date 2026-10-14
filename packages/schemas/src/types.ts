/**
 * Zod-free runtime constants and types that browser code imports. Keeping zod out of this
 * module keeps the validators out of the client bundle.
 */
import type { StreamEvent } from "./stream";

/** Agreement between CDA's signed news bias and Jev's directional choice (bullish/bearish/neutral). */
export function jevAgrees(cdaBias: number, jevChoice: string): boolean {
  const cda = cdaBias > 0 ? "bullish" : cdaBias < 0 ? "bearish" : "neutral";
  return cda === jevChoice;
}

/** Demo mode (no key): panels show the committed samples in docs/samples/. */
export interface DemoStatus {
  /** CryptoDataApi datasets come from samples (CDA_API_KEY empty). */
  cda: boolean;
  /** Jev datasets come from samples (TYPESAFE_API_KEY empty, or CDA itself in demo). */
  jev: boolean;
  /** Static GitHub Pages build: no server at all. */
  static: boolean;
  capturedFrom: string | null;
  capturedTo: string | null;
}

export interface JevStatus {
  /** JEV_ENABLED (default true). */
  enabled: boolean;
  /** TYPESAFE_API_KEY present and enabled. */
  configured: boolean;
  /** Configured model (JEV_MODEL), e.g. "jev-latest". */
  model: string;
  /** Version the API resolved it to, e.g. "jev-1.13.0" (null before the first call). */
  resolvedModel: string | null;
  callsToday: number;
  inputTokensToday: number;
  outputTokensToday: number;
  errorsToday: number;
  budget: { dailyCalls: number; dailyInputTokens: number; mode: BudgetMode };
  ratePerMinute: number;
  lastCallAt: string | null;
  lastError: { kind: string; message: string; at: string } | null;
}

/** Windows CDA measures market response over after a news event (Pro Plus). */
export const NEWS_RESPONSE_WINDOWS = ["15m", "1h", "4h"] as const;

export const STREAM_EVENT_TYPES = ["liquidation", "whale_transfer", "whale_position", "funding", "oi_delta", "price_move"] as const;
export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

/** Status of the worker's stream relay, pushed to browsers as `event: status`. */
export interface StreamStatus {
  /**
   * live = CDA /stream (Pro); delayed = keyless 30-minute-delayed preview; replay = saved events
   * looped at their original pace (demo, when the preview is unreachable); off = disabled.
   */
  source: "live" | "delayed" | "replay" | "off";
  state: "connecting" | "open" | "error" | "disabled" | "idle";
  message?: string | null;
  lastEventAt: number | null;
  eventsPerMin: number;
  /**
   * Events per minute for recent whole minutes, oldest first (up to 40, since the worker
   * started), followed by the rolling count for the last 60 seconds.
   */
  rateHist?: number[];
  clients: number;
  bufferSize: number;
  /** For the delayed preview: how far behind real time the events are. */
  delayMs?: number | null;
}

/** Envelope pushed to browsers on our own /api/stream. */
export interface RelayedEvent extends StreamEvent {
  /** Set when the event came from the delayed preview rather than the live stream. */
  preview?: boolean;
  /** Set when the event is a saved sample replayed in demo mode (timestamps shifted to now). */
  replay?: boolean;
}

export type BudgetMode = "normal" | "throttled" | "paused";

export interface DatasetRuntimeStatus {
  id: string;
  param?: string | null;
  status: string;
  fetchedAt: string | null;
  nextDueAt: string | null;
  intervalMs: number;
  lastError?: string | null;
}

/** Published by the worker every few seconds (heartbeat key + GET /status). */
export interface WorkerStatus {
  workerId: string;
  version: string;
  startedAt: string;
  ts: string;
  keyConfigured: boolean;
  cache: "redis" | "memory";
  leader: boolean;
  /** From /auth/keys/me: the key's tier and account-wide usage (all tooling on this key). */
  account: {
    tier: string | null;
    requestsToday: number | null;
    dailyLimit: number | null;
    perMinuteLimit: number | null;
    checkedAt: string;
  } | null;
  budget: {
    date: string;
    callsToday: number;
    dailyBudget: number;
    /** Calls allowed by now if spent evenly across the UTC day (plus slack). */
    paceLimit: number;
    mode: BudgetMode;
    stretch: number;
    scheduledPerHour: number;
    byDataset: Record<string, number>;
    byStatus: Record<string, number>;
    resetsAt: string;
  };
  limiter: { ratePerMinute: number; burst: number; tokens: number; queued: number; pausedUntil: number | null };
  stream: StreamStatus;
  onDemand: { active: number; max: number; keys: string[] };
  /** TypeSafe Jev classifier (PLAN.md 3.9). */
  jev: JevStatus;
  /** Null when everything is live. */
  demo: DemoStatus | null;
  datasets: DatasetRuntimeStatus[];
}
