"use client";

import type { RelayedEvent } from "@cqd/schemas";
import { Pause, Play, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, NativeSelect, Tip } from "@/components/ui/primitives";
import { clock, price, usd } from "@/lib/format";
import { useFilteredEvents, useStream } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const MIN_USD_OPTIONS = [0, 1_000, 10_000, 50_000, 100_000, 500_000];

function StreamBadge({ status, connection }: { status: ReturnType<typeof useStream>["status"]; connection: ReturnType<typeof useStream>["connection"] }) {
  if (connection !== "open" && !status) return <Badge variant="outline">connecting</Badge>;
  if (!status) return <Badge variant="outline">{connection}</Badge>;
  if (status.source === "live" && status.state === "open") {
    return (
      <Badge variant="good">
        <Radio aria-hidden />
        LIVE
      </Badge>
    );
  }
  if (status.source === "delayed") {
    return (
      <Tip content="No Pro key: replaying CryptoDataApi's free /stream/delayed preview at its original pace, about 31 minutes behind real time.">
        <Badge variant="info" tabIndex={0}>
          <Radio aria-hidden />
          DELAYED PREVIEW
        </Badge>
      </Tip>
    );
  }
  return (
    <Tip content={status.message ?? status.state}>
      <Badge variant={status.state === "error" ? "serious" : "outline"} tabIndex={0}>
        {status.source === "off" ? "stream off" : status.state}
      </Badge>
    </Tip>
  );
}

/** Scrolling liquidation feed from our SSE fan-out, filterable by coin and minimum size. */
export function LiquidationTape({ className, maxRows = 60, height = 420 }: { className?: string; maxRows?: number; height?: number }) {
  const { events, status, connection } = useStream({ types: ["liquidation"], max: 500 });
  const [symbol, setSymbol] = useState("");
  const [minUsd, setMinUsd] = useState(0);
  const [paused, setPaused] = useState<RelayedEvent[] | null>(null);
  const live = useFilteredEvents(events, { symbol, minUsd });
  const shown = useMemo(() => (paused ?? live).slice(0, maxRows), [paused, live, maxRows]);
  const totals = useMemo(() => {
    let l = 0;
    let s = 0;
    for (const e of live) {
      if (e.side === "long") l += e.usd ?? 0;
      else if (e.side === "short") s += e.usd ?? 0;
    }
    return { l, s };
  }, [live]);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            Live liquidation tape <StreamBadge status={status} connection={connection} />
          </CardTitle>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">/stream (type=liquidation) via worker fan-out</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPaused(paused ? null : live)} aria-pressed={paused !== null}>
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {paused ? "Resume" : "Pause"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <Label>
            Coin
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="All" className="w-24 uppercase" aria-label="Filter by coin" />
          </Label>
          <Label>
            Min size
            <NativeSelect value={minUsd} onChange={(e) => setMinUsd(Number(e.target.value))} aria-label="Minimum USD size">
              {MIN_USD_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "Any" : `${usd(v, { digits: 0 })}+`}
                </option>
              ))}
            </NativeSelect>
          </Label>
          <div className="ml-auto text-right text-[11px] text-muted-foreground">
            <div>
              {live.length} events buffered{status?.eventsPerMin !== undefined ? `, ${status.eventsPerMin}/min (all types)` : ""}
            </div>
            <div className="num">
              <span className="text-long">L</span> {usd(totals.l)} &middot; <span className="text-short">S</span> {usd(totals.s)}
            </div>
          </div>
        </div>

        <div className="scrollbar-thin overflow-y-auto rounded-md border" style={{ height }} aria-live="off">
          {shown.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-xs text-muted-foreground">
              {connection === "open" || status ? (
                <>
                  <span>No liquidations match yet.</span>
                  <span className="text-muted-foreground/70">
                    {status?.source === "delayed" ? "The delayed preview carries few liquidations; they appear as the window replays." : "Waiting for the next event."}
                  </span>
                </>
              ) : (
                <span>Connecting to the stream…</span>
              )}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-left font-medium">Time</th>
                  <th className="px-2 py-1.5 text-left font-medium">Coin</th>
                  <th className="px-2 py-1.5 text-left font-medium">Side</th>
                  <th className="px-2 py-1.5 text-right font-medium">Size</th>
                  <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Price</th>
                  <th className="hidden px-2 py-1.5 text-left font-medium md:table-cell">Venue</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const isLong = e.side === "long";
                  const big = (e.usd ?? 0) >= 100_000;
                  return (
                    <tr key={String(e.id)} className={cn("tape-in border-b border-border/50", big && "font-semibold")}>
                      <td className="num px-2 py-1 text-muted-foreground">{clock(e.ts)}</td>
                      <td className="px-2 py-1">{e.symbol}</td>
                      <td className="px-2 py-1">
                        <span className={isLong ? "text-long" : "text-short"}>{isLong ? "L long" : "S short"}</span>
                      </td>
                      <td className="num px-2 py-1 text-right">{usd(e.usd)}</td>
                      <td className="num hidden px-2 py-1 text-right text-muted-foreground sm:table-cell">{e.px ? price(e.px) : "—"}</td>
                      <td className="hidden px-2 py-1 text-muted-foreground capitalize md:table-cell">
                        {e.venue}
                        {e.preview ? <span className="ml-1 text-[10px] text-muted-foreground/60">(delayed)</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/80">Side is the liquidated position: a long liquidation is a forced sell, a short liquidation a forced buy.</p>
      </CardContent>
    </Card>
  );
}
