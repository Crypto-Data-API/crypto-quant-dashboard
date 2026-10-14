"use client";

import type { KpiHistory, RelayedEvent, StreamStatus } from "@cqd/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { tapeEvents } from "@/cq/adapters";
import type { TapeEvent } from "@/cq/types";
import { useStream, type StreamConnection } from "./hooks";
import { IS_STATIC, samplesUrl } from "./mode";
import { useUi } from "./settings";

interface LiveTape {
  /** Liquidation events, newest first (frozen while the live feed setting is off). */
  events: RelayedEvent[];
  tape: TapeEvent[];
  status: StreamStatus | null;
  connection: StreamConnection;
  /** Live feed setting is off: the tape shows a frozen snapshot. */
  frozen: boolean;
}

const Ctx = createContext<LiveTape | null>(null);

/**
 * One liquidation stream for the whole app (sidebar rate badge, tapes, the 3D flow), so pages
 * never open a second EventSource for the same feed.
 */
export function LiveTapeProvider({ children }: { children: ReactNode }) {
  const ui = useUi();
  const { events, status, connection } = useStream({ types: ["liquidation"], max: 600, backfill: 300 });
  const latest = useRef(events);
  latest.current = events;
  const [frozenAt, setFrozenAt] = useState<RelayedEvent[] | null>(null);
  useEffect(() => {
    setFrozenAt(ui.live ? null : latest.current);
  }, [ui.live]);
  const shown = frozenAt ?? events;
  const tape = useMemo(() => tapeEvents(shown), [shown]);
  const value = useMemo(() => ({ events: shown, tape, status, connection, frozen: frozenAt !== null }), [shown, tape, status, connection, frozenAt]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveTape(): LiveTape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLiveTape outside LiveTapeProvider");
  return v;
}

/** Header-KPI history recorded by the worker (or the saved demo history in static mode). */
export function useKpiHistory() {
  return useQuery<KpiHistory>({
    queryKey: ["kpi-history"],
    queryFn: async ({ signal }) => {
      if (IS_STATIC) {
        const res = await fetch(samplesUrl("kpi-history.json"), { signal });
        return res.ok ? ((await res.json()) as KpiHistory) : { points: [], intervalMs: 0 };
      }
      const res = await fetch("/api/kpi-history", { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`/api/kpi-history answered ${res.status}`);
      return (await res.json()) as KpiHistory;
    },
    refetchInterval: IS_STATIC ? false : 60_000,
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
  });
}
