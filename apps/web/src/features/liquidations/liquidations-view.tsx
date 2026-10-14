"use client";

import type { LiquidationRow } from "@cqd/schemas";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LongShortBar } from "@/components/charts/basic";
import { axisProps, gridProps, tooltipProps } from "@/components/charts/recharts-theme";
import { Panel } from "@/components/panel";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip } from "@/components/ui/primitives";
import { C } from "@/lib/domain";
import { liquidationTotals, LIQ_WINDOWS } from "@/lib/derive";
import { int, multiple, usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { finite } from "@/lib/utils";
import { NewsPanel } from "@/features/news/news-panel";
import { LiquidationTape } from "./liquidation-tape";
import { SqueezeAlerts } from "./squeeze-alerts";

const w = (r: LiquidationRow, kind: "" | "long_" | "short_", win: string) => finite((r as Record<string, unknown>)[`${kind}liquidation_usd_${win}`]) ?? 0;

function Totals() {
  const q = useDataset("liquidations");
  return (
    <Panel title="Rolling totals (all tracked coins)" dataset="liquidations" env={q.data} isLoading={q.isLoading} skeletonHeight={160}>
      {(d) => (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {liquidationTotals(d).map((t) => (
              <div key={t.window} className="rounded-md border px-3 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Last {t.window}</span>
                  <span className="text-lg font-semibold">{usd(t.total)}</span>
                </div>
                <LongShortBar long={t.long} short={t.short} className="mt-1.5" />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Each window is a trailing level from one response, summed across {d.data.length} coins; never summed across polls. Venues:{" "}
            {Array.isArray(d.coverage?.venues) ? (d.coverage.venues as string[]).join(", ") : "OKX, Bybit, Hyperliquid"}. Binance geo-blocks its stream, so totals run under an all-exchange figure.
          </p>
        </div>
      )}
    </Panel>
  );
}

function Heatmap() {
  const q = useDataset("liquidations");
  return (
    <Panel title="Heatmap: top coins by 24h liquidations" dataset="liquidations" env={q.data} isLoading={q.isLoading} skeletonHeight={260}>
      {(d) => {
        const rows = [...d.data].sort((a, b) => w(b, "", "24h") - w(a, "", "24h")).slice(0, 24);
        const max = Math.max(...rows.map((r) => w(r, "", "24h")), 1);
        return (
          <div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {rows.map((r) => {
                const total = w(r, "", "24h");
                const long = w(r, "long_", "24h");
                const short = w(r, "short_", "24h");
                // Brightness by size (square-root scale), single hue (orange).
                const intensity = Math.sqrt(total / max);
                const ratio = finite(r.liq_1h_vs_7d_median?.total);
                return (
                  <Tip
                    key={r.symbol}
                    content={
                      <div className="space-y-0.5">
                        <div className="font-medium">{r.symbol}</div>
                        {LIQ_WINDOWS.map((win) => (
                          <div key={win} className="num">
                            {win}: {usd(w(r, "", win))} (L {usd(w(r, "long_", win))} / S {usd(w(r, "short_", win))})
                          </div>
                        ))}
                        <div>{int(r.count)} events in 24h &middot; {r.source}</div>
                      </div>
                    }
                  >
                    <div
                      tabIndex={0}
                      className="rounded-md border px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      style={{ background: `color-mix(in srgb, ${C.orange} ${Math.round(4 + intensity * 40)}%, transparent)`, borderColor: `color-mix(in srgb, ${C.orange} ${Math.round(15 + intensity * 40)}%, transparent)` }}
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="truncate text-xs font-semibold">{r.symbol}</span>
                        <span className="num text-xs font-medium">{usd(total)}</span>
                      </div>
                      <LongShortBar long={long} short={short} labels={false} height={4} className="mt-1.5" />
                      <div className="num mt-1 flex justify-between text-[10px] text-foreground/70">
                        <span>
                          L {total > 0 ? Math.round((long / total) * 100) : 0}%
                        </span>
                        {ratio !== null ? <span>1h {multiple(ratio)} of normal</span> : null}
                        <span>S {total > 0 ? Math.round((short / total) * 100) : 0}%</span>
                      </div>
                    </div>
                  </Tip>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Tile brightness scales with 24h notional (square root). The bar splits long (L, aqua) and short (S, red) liquidations.</p>
          </div>
        );
      }}
    </Panel>
  );
}

function ByExchange() {
  const q = useDataset("liquidations-by-exchange");
  return (
    <Panel title="By exchange (BTC, trailing 4h)" dataset="liquidations-by-exchange" env={q.data} isLoading={q.isLoading} skeletonHeight={180}>
      {(d) => {
        const rows = d.data.map((r) => ({ exchange: r.exchange, long: finite(r.long_usd) ?? 0, short: finite(r.short_usd) ?? 0, total: finite(r.total_usd) ?? finite(r.total) ?? 0 }));
        if (rows.length === 0) return <div className="py-6 text-center text-xs text-muted-foreground">No venue-tagged events in the 4h window yet (cold start after a CDA deploy).</div>;
        return (
          <div className="space-y-3">
            <div style={{ height: 40 + rows.length * 38 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barCategoryGap={8}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v: number) => usd(v, { digits: 0 })} />
                  <YAxis type="category" dataKey="exchange" {...axisProps} width={84} />
                  <Tooltip {...tooltipProps} formatter={(v) => usd(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
                  <Bar dataKey="long" name="Long (L)" stackId="s" fill={C.long} isAnimationActive={false} />
                  <Bar dataKey="short" name="Short (S)" stackId="s" fill={C.short} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exchange</TableHead>
                  <TableHead className="text-right">Long</TableHead>
                  <TableHead className="text-right">Short</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.exchange}>
                    <TableCell>{r.exchange}</TableCell>
                    <TableCell className="text-right">{usd(r.long)}</TableCell>
                    <TableCell className="text-right">{usd(r.short)}</TableCell>
                    <TableCell className="text-right font-medium">{usd(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      }}
    </Panel>
  );
}

function TopTable() {
  const q = useDataset("liquidations");
  return (
    <Panel title="Top coins by 24h liquidations" dataset="liquidations" env={q.data} isLoading={q.isLoading} skeletonHeight={300}>
      {(d) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coin</TableHead>
              {LIQ_WINDOWS.map((win) => (
                <TableHead key={win} className="text-right">
                  {win}
                </TableHead>
              ))}
              <TableHead className="text-right">L / S 24h</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">1h vs 7d</TableHead>
              <TableHead>Venues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.data.slice(0, 40).map((r) => {
              const ratio = finite(r.liq_1h_vs_7d_median?.total);
              return (
                <TableRow key={r.symbol}>
                  <TableCell className="font-semibold">{r.symbol}</TableCell>
                  {LIQ_WINDOWS.map((win) => (
                    <TableCell key={win} className="text-right">
                      {usd(w(r, "", win))}
                    </TableCell>
                  ))}
                  <TableCell className="w-32">
                    <LongShortBar long={w(r, "long_", "24h")} short={w(r, "short_", "24h")} labels={false} height={4} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{int(r.count)}</TableCell>
                  <TableCell className="text-right">{ratio !== null ? <Badge variant={ratio >= 3 ? "serious" : "outline"}>{multiple(ratio)}</Badge> : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.source}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

export function LiquidationsView() {
  return (
    <div className="space-y-4">
      <SqueezeAlerts />
      <Totals />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Heatmap />
          <ByExchange />
        </div>
        <div className="space-y-4">
          <LiquidationTape height={440} maxRows={120} />
          <NewsPanel />
        </div>
      </div>
      <TopTable />
    </div>
  );
}
