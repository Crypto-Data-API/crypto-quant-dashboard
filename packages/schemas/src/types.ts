/**
 * Zod-free runtime constants and types that browser code imports. Keeping zod out of this
 * module keeps the validators out of the client bundle.
 */
import type { StreamEvent } from "./stream";

export const STREAM_EVENT_TYPES = ["liquidation", "whale_transfer", "whale_position", "funding", "oi_delta", "price_move"] as const;
export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

/** Status of the worker's stream relay, pushed to browsers as `event: status`. */
export interface StreamStatus {
  /** live = CDA /stream (Pro); delayed = keyless 30-minute-delayed preview; off = disabled. */
  source: "live" | "delayed" | "off";
  state: "connecting" | "open" | "error" | "disabled" | "idle";
  message?: string | null;
  lastEventAt: number | null;
  eventsPerMin: number;
  clients: number;
  bufferSize: number;
  /** For the delayed preview: how far behind real time the events are. */
  delayMs?: number | null;
}

/** Envelope pushed to browsers on our own /api/stream. */
export interface RelayedEvent extends StreamEvent {
  /** Set when the event came from the delayed preview rather than the live stream. */
  preview?: boolean;
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
  datasets: DatasetRuntimeStatus[];
}
