"use client";

import { computeKpis, isStale, KPI_DEFS, type Envelope, type KpiDef, type KpiKey } from "@cqd/schemas";
import { useMemo } from "react";
import { Tip } from "@/components/ui/primitives";
import { SparkView } from "@/cq/react";
import { C, fmt } from "@/cq/theme";
import { ago, dateTime, duration } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { useKpiHistory } from "@/lib/live";
import { useUi } from "@/lib/settings";
import { toMs } from "@/lib/utils";

function format(def: KpiDef, v: number | null): string {
  if (v === null) return "—";
  switch (def.unit) {
    case "pct":
      return `${v.toFixed(1)}%`;
    case "usd":
      return fmt.usd(v);
    case "ratio":
      return v.toFixed(2);
    default:
      return String(Math.round(v));
  }
}

const SOURCE_ENV: Record<KpiKey, "regimes" | "health" | "volume" | "deriv" | "whales"> = {
  btcDom: "regimes",
  stable: "health",
  hlVol: "volume",
  btcOi: "deriv",
  hlOi: "volume",
  liq24: "regimes",
  ls: "health",
  whale: "whales",
  fg: "health",
};

/** The header KPI row: current value, change over the recorded window and its sparkline. */
export function KpiStrip() {
  const ui = useUi();
  const now = useNow() || Date.now();
  const regimes = useDataset("regimes");
  const health = useDataset("market-health");
  const deriv = useDataset("derivatives-summary");
  const volume = useDataset("volume-scanner");
  const whales = useDataset("quant-whales");
  const history = useKpiHistory();
  const envs: Record<string, Envelope | undefined> = { regimes: regimes.data, health: health.data, deriv: deriv.data, volume: volume.data, whales: whales.data };
  const values = computeKpis({ regimes: regimes.data?.data, health: health.data?.data, deriv: deriv.data?.data, volume: volume.data?.data, whales: whales.data?.data });
  const points = history.data?.points;
  const series = useMemo(() => {
    const out = {} as Record<KpiKey, { t: number; v: number }[]>;
    for (const d of KPI_DEFS) out[d.key] = (points ?? []).flatMap((p) => (typeof p.v[d.key] === "number" ? [{ t: p.t, v: p.v[d.key] as number }] : []));
    return out;
  }, [points]);

  return (
    <div className="flex overflow-x-auto overflow-y-hidden" style={{ borderBottom: "1px solid #131a23", background: "rgba(8,11,15,0.7)", scrollbarWidth: "none" }} role="list" aria-label="Market KPIs">
      {KPI_DEFS.map((def) => {
        const v = values[def.key];
        const hist = series[def.key];
        const env = envs[SOURCE_ENV[def.key]];
        const fetched = env?.fetchedAt ? toMs(env.fetchedAt) : null;
        const last = hist[hist.length - 1];
        // Append the current value only when it was fetched after the last recorded point. A demo
        // history is recorded after the demo snapshots, so there it stays a record of its own window.
        const fresh = v !== null && (!last || fetched === null || fetched > last.t);
        const vals = hist.map((p) => p.v);
        if (fresh) vals.push(v);
        const end = fresh ? v : (last?.v ?? null);
        // A change needs at least two recorded points (one sampling interval) to mean anything.
        const first = hist.length >= 2 ? hist[0] : undefined;
        const delta = first && end !== null && first.v !== 0 ? ((end - first.v) / Math.abs(first.v)) * 100 : null;
        const color = delta === null || delta >= 0 ? C.long : C.short;
        const stale = env?.fetchedAt && !env.demo ? isStale(env, now) : false;
        const span = first ? (fresh ? now : last!.t) - first.t : 0;
        return (
          <Tip
            key={def.key}
            side="bottom"
            content={
              <div className="space-y-0.5">
                <div className="font-medium">{def.label}</div>
                {def.hint ? <div style={{ color: "#8b98a9" }}>{def.hint}</div> : null}
                <div className="cq-mono" style={{ fontSize: 10, color: "#8b98a9" }}>
                  {def.source}
                </div>
                {env?.fetchedAt ? <div>Updated {ago(toMs(env.fetchedAt), now)}</div> : null}
                {delta !== null ? (
                  <div>
                    Change over the last {duration(span / 1000)} ({hist.length} recorded points since {dateTime(first!.t)})
                  </div>
                ) : (
                  <div style={{ color: "#8b98a9" }}>The sparkline fills in as the worker records this value every 5 minutes.</div>
                )}
                {history.data?.demo ? (
                  <div style={{ color: "#7fb6ff" }}>
                    History is a saved demo recording{fresh ? "." : `, made after this snapshot: the change covers the recording, which ended at ${format(def, last?.v ?? null)}.`}
                  </div>
                ) : null}
                {env && env.status !== "ok" ? <div style={{ color: "#ffb547" }}>Status: {env.status.replace(/_/g, " ")}</div> : null}
              </div>
            }
          >
            <div
              role="listitem"
              tabIndex={0}
              className="flex cursor-default items-center outline-none focus-visible:bg-[rgba(255,255,255,0.03)]"
              style={{ flex: "1 0 auto", minWidth: ui.kpiSparks ? 168 : 120, gap: 12, padding: "12px 16px 12px 18px", borderRight: "1px solid #131a23" }}
            >
              <div className="min-w-0 flex-1">
                <div className="cq-mono flex items-center" style={{ gap: 6, fontSize: 9.5, letterSpacing: "0.1em", color: "#5b6878", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {def.label}
                  {stale ? <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffb547" }} aria-label="stale" /> : null}
                </div>
                <div className="cq-mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 5, color: v === null ? "#5b6878" : "#e6edf5", whiteSpace: "nowrap" }}>
                  {format(def, v)}
                </div>
                <div className="cq-mono" style={{ fontSize: 10, marginTop: 3, color: delta === null ? "#3f4a57" : color, whiteSpace: "nowrap" }}>
                  {delta === null ? "—" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(2)}%`}
                </div>
              </div>
              {ui.kpiSparks ? (
                <div style={{ width: 58, height: 26, flex: "none" }}>{vals.length >= 2 ? <SparkView values={vals} color={color} live label={`${def.label} recent values`} /> : null}</div>
              ) : null}
            </div>
          </Tip>
        );
      })}
    </div>
  );
}
