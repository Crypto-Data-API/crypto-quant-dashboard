"use client";

import { ArrowDown, ArrowUp, Siren } from "lucide-react";
import { MeterBar } from "@/components/charts/basic";
import { Panel } from "@/components/panel";
import { Badge, Tip } from "@/components/ui/primitives";
import { C } from "@/lib/domain";
import { duration, frac, multiple, pct, usd } from "@/lib/format";
import { JevCascadePill } from "@/features/jev/jev-parts";
import { useDataset } from "@/lib/hooks";

/**
 * One-sided, abnormal forced-liquidation flow right now. `direction` names the side being
 * LIQUIDATED: a short squeeze is forced buying (upward pressure), a long flush is forced selling.
 */
export function SqueezeAlerts({ className }: { className?: string }) {
  const q = useDataset("squeeze-alerts");
  return (
    <Panel title="Squeeze alerts" dataset="squeeze-alerts" env={q.data} isLoading={q.isLoading} className={className} skeletonHeight={90}>
      {(d) =>
        d.alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            <Siren className="size-4 shrink-0" aria-hidden />
            <span>
              No one-sided cascades in the last {duration(d.window_s)}. {d.evaluated} coins evaluated at severity {frac(d.min_severity, { digits: 0 })} or more
              {d.coverage ? ` (${d.coverage.replace(/_/g, " ")})` : ""}.
            </span>
          </div>
        ) : (
          <ul className="space-y-2">
            {d.alerts.map((a) => {
              const up = a.direction.includes("short");
              const Icon = up ? ArrowUp : ArrowDown;
              return (
                <li key={`${a.symbol}-${a.direction}`} className="rounded-md border border-l-4 px-3 py-2" style={{ borderLeftColor: a.triggered ? C.serious : C.axis }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.symbol}</span>
                    <Badge variant={a.triggered ? "serious" : "outline"}>
                      <Icon aria-hidden />
                      {a.direction.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      liquidated side: <span className={up ? "text-short" : "text-long"}>{up ? "shorts (S)" : "longs (L)"}</span>
                    </span>
                    {!a.triggered && a.suppressed_by?.length ? <Badge variant="outline">suppressed: {a.suppressed_by.join(", ")}</Badge> : null}
                    <JevCascadePill symbol={a.symbol} direction={a.direction} />
                    <span className="ml-auto num text-sm font-semibold">{usd(a.total_liq_usd)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                    <Tip content="Composite of spike ratio and asymmetry (80% of the weight) plus notional.">
                      <div tabIndex={0}>
                        Severity <span className="num text-foreground">{frac(a.severity, { digits: 0 })}</span>
                        <MeterBar value={a.severity} max={1} color={a.triggered ? C.serious : C.blue} height={4} />
                      </div>
                    </Tip>
                    <div>
                      Spike vs 24h mean <span className="num text-foreground">{multiple(a.spike_ratio)}</span>
                    </div>
                    <div>
                      Asymmetry <span className="num text-foreground">{frac(a.asymmetry, { digits: 0 })}</span>
                    </div>
                    <div>
                      OI {a.oi_state ?? "n/a"} <span className="num text-foreground">{pct(a.oi_change_pct, { sign: true })}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      }
    </Panel>
  );
}
