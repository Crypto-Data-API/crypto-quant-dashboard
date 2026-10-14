"use client";

import {
  DATASETS,
  STREAM_EVENT_TYPES,
  type DataOf,
  type DatasetDef,
  type DatasetId,
  type Envelope,
  type RelayedEvent,
  type StreamStatus,
  type WorkerStatus,
} from "@cqd/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { clamp } from "./utils";

// ---- datasets ----------------------------------------------------------------

/**
 * Read one dataset envelope from our own cache (/api/data). This never reaches CDA, so the
 * browser can refetch more often than the worker polls: a quarter of the dataset interval,
 * between 5 s and 60 s, and every 2 s while an on-demand fetch is pending.
 */
export function useDataset<K extends DatasetId>(id: K, opts: { param?: string | null; enabled?: boolean } = {}) {
  const def = DATASETS[id] as DatasetDef;
  const param = opts.param ?? null;
  const enabled = (opts.enabled ?? true) && (!def.param || !!param);
  return useQuery<Envelope<DataOf<K>>>({
    queryKey: ["dataset", id, param],
    enabled,
    queryFn: async ({ signal }) => {
      const qs = param ? `?param=${encodeURIComponent(param)}` : "";
      const res = await fetch(`/api/data/${id}${qs}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`/api/data/${id} answered ${res.status}`);
      return (await res.json()) as Envelope<DataOf<K>>;
    },
    // Reads only hit our cache, so scheduled datasets keep polling in background tabs (a
    // dashboard often sits on a second screen). On-demand datasets stop polling while the tab
    // is hidden once loaded: their reads keep the worker spending CDA budget on that symbol.
    refetchIntervalInBackground: true,
    refetchInterval: (q) => {
      const env = q.state.data;
      if (!env || env.status === "pending") return 2_000;
      if (def.param && typeof document !== "undefined" && document.hidden) return false;
      if (env.status === "worker_offline") return 5_000;
      return clamp(Math.round(def.intervalMs / 4), 5_000, 60_000);
    },
    // Scheduled datasets keep the last render while refetching (no skeleton flash). On-demand
    // datasets must not show the previous symbol's data under a new symbol's header.
    placeholderData: def.param ? undefined : keepPreviousData,
  });
}

export interface StatusResponse {
  worker: WorkerStatus | null;
  via: "redis" | "worker" | "none";
  workerOnline: boolean;
  redis: "disabled" | "connecting" | "up" | "down";
  now: string;
}

export function useWorkerStatus() {
  return useQuery<StatusResponse>({
    queryKey: ["status"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/status", { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`/api/status answered ${res.status}`);
      return (await res.json()) as StatusResponse;
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
  });
}

// ---- shared clock ------------------------------------------------------------

let nowValue = Date.now();
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  if (!nowTimer) {
    nowTimer = setInterval(() => {
      nowValue = Date.now();
      nowListeners.forEach((l) => l());
    }, 5_000);
  }
  return () => {
    nowListeners.delete(cb);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

/** Re-renders every 5 s so "12s ago" labels and stale badges stay honest. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeNow,
    () => nowValue,
    () => 0,
  );
}

// ---- live stream ---------------------------------------------------------------

export type StreamConnection = "connecting" | "open" | "closed";

const streamBase = () => (process.env.NEXT_PUBLIC_STREAM_URL || "/api/stream").replace(/\/+$/, "");

/**
 * Subscribe to our SSE fan-out. Server-side filtering is limited to event types (one
 * connection per distinct type set); coin and size filters run client-side so changing
 * them never reconnects. The worker replays recent events on connect (backfill) and on
 * reconnect (Last-Event-ID), so the tape is never empty after a refresh.
 */
export function useStream(opts: { types?: readonly string[]; max?: number; backfill?: number } = {}) {
  const max = opts.max ?? 400;
  const typesKey = (opts.types ?? STREAM_EVENT_TYPES).join(",");
  const backfill = opts.backfill ?? 150;
  const [events, setEvents] = useState<RelayedEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [connection, setConnection] = useState<StreamConnection>("connecting");
  const pending = useRef<RelayedEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    pending.current = [];
    const url = `${streamBase()}?types=${encodeURIComponent(typesKey)}&backfill=${backfill}`;
    const es = new EventSource(url);
    setConnection("connecting");
    es.onopen = () => setConnection("open");
    es.onerror = () => setConnection(es.readyState === EventSource.CLOSED ? "closed" : "connecting");
    es.onmessage = (msg) => {
      try {
        pending.current.push(JSON.parse(msg.data) as RelayedEvent);
      } catch {
        /* ignore malformed */
      }
    };
    es.addEventListener("status", (msg) => {
      try {
        setStatus(JSON.parse((msg as MessageEvent<string>).data) as StreamStatus);
      } catch {
        /* ignore */
      }
    });
    // Batch renders: a busy tape can deliver dozens of events per second.
    const flush = setInterval(() => {
      if (pending.current.length === 0) return;
      const batch = pending.current;
      pending.current = [];
      setEvents((prev) => {
        const next = [...batch.reverse(), ...prev];
        return next.length > max ? next.slice(0, max) : next;
      });
    }, 250);
    return () => {
      clearInterval(flush);
      es.close();
    };
  }, [typesKey, max, backfill]);

  return { events, status, connection };
}

/** Client-side tape filter (coin + minimum USD). */
export function useFilteredEvents(events: RelayedEvent[], filter: { symbol?: string; minUsd?: number }) {
  const symbol = filter.symbol?.trim().toUpperCase() ?? "";
  const minUsd = filter.minUsd ?? 0;
  return useMemo(
    () =>
      events.filter((e) => {
        if (symbol && String(e.symbol ?? "").toUpperCase() !== symbol) return false;
        if (minUsd > 0 && typeof e.usd === "number" && Math.abs(e.usd) < minUsd) return false;
        return true;
      }),
    [events, symbol, minUsd],
  );
}
