"use client";

import type { NewsPulseRow, NewsSource } from "@cqd/schemas";
import { Megaphone, Rss, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { DivergingBar, MeterBar } from "@/components/charts/basic";
import { Panel } from "@/components/panel";
import { Badge, Button, Input, Label, NativeSelect, Sheet, SheetContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip } from "@/components/ui/primitives";
import { C } from "@/lib/domain";
import { ago, dateTime, int, num } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";
import { CoinNews, NewsTable, SymbolChip } from "./news-parts";

const HOURS = [6, 12, 24, 72, 168];
const MIN_IMPACT = [0.45, 0.5, 0.6, 0.7, 0.8];
/** "Talked about but nothing happening": this many headlines with zero news pressure. */
const LOUD_HEADLINES = 3;

function CatalystTape({ onSymbol }: { onSymbol: (s: string) => void }) {
  const q = useDataset("news-market-moving");
  const [symbol, setSymbol] = useState("");
  const [hours, setHours] = useState(168);
  const [minImpact, setMinImpact] = useState(0.45);
  const now = useNow() || Date.now();
  const events = q.data?.data?.events;
  const filtered = useMemo(() => {
    const sym = symbol.trim().toUpperCase();
    const since = now - hours * 3_600_000;
    return (events ?? [])
      .filter((e) => (!sym || e.symbol.toUpperCase() === sym) && e.impact_score >= minImpact && (toMs(e.published) ?? 0) >= since)
      .sort((a, b) => (toMs(b.published) ?? 0) - (toMs(a.published) ?? 0));
  }, [events, symbol, hours, minImpact, now]);

  return (
    <Panel title="Catalyst tape" dataset="news-market-moving" env={q.data} isLoading={q.isLoading} skeletonHeight={360}>
      {(d) => (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Label>
              Symbol
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="All" className="w-24 uppercase" aria-label="Filter by symbol or MARKET" />
            </Label>
            <Button size="sm" variant={symbol.toUpperCase() === "MARKET" ? "default" : "outline"} onClick={() => setSymbol(symbol.toUpperCase() === "MARKET" ? "" : "MARKET")} aria-pressed={symbol.toUpperCase() === "MARKET"}>
              MARKET
            </Button>
            <Label>
              Lookback
              <NativeSelect value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h < 48 ? `${h}h` : `${h / 24}d`}
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <Label>
              Min impact
              <NativeSelect value={minImpact} onChange={(e) => setMinImpact(Number(e.target.value))}>
                {MIN_IMPACT.map((v) => (
                  <option key={v} value={v}>
                    {v.toFixed(2)}
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {filtered.length} of {d.count} qualified events &middot; {num(d.window_hours / 24, 0)}-day window &middot; threshold {num(d.impact_threshold, 2)} &middot; tier {d.tier_scope.replace("_", " ")}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">No qualified catalysts match these filters.</div>
          ) : (
            <NewsTable events={filtered} onSymbol={onSymbol} />
          )}
          <p className="text-[10px] text-muted-foreground">
            Only events that cleared CDA&apos;s impact threshold. Corroboration counts independent sources carrying the same symbol and category; market response is the measured move after publication (hover for OI, funding, volume and abnormality). Filters run on the cached 7-day tape, so they cost no API calls.
          </p>
        </div>
      )}
    </Panel>
  );
}

function PulseTable({ onSymbol }: { onSymbol: (s: string) => void }) {
  const q = useDataset("news-pulse");
  const [hideQuiet, setHideQuiet] = useState(true);
  return (
    <Panel title="News pulse (24h)" dataset="news-pulse" env={q.data} isLoading={q.isLoading} skeletonHeight={320}>
      {(d) => {
        const loud = (r: NewsPulseRow) => r.news_pressure === 0 && r.headlines >= LOUD_HEADLINES;
        const rows = [...d.rows].sort((a, b) => a.rank - b.rank).filter((r) => !hideQuiet || r.news_pressure > 0 || r.headlines > 0);
        const loudCount = d.rows.filter(loud).length;
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="cursor-pointer">
                <input type="checkbox" checked={hideQuiet} onChange={(e) => setHideQuiet(e.target.checked)} className="accent-[var(--primary)]" />
                Hide coins with no pressure and no headlines
              </Label>
              {loudCount > 0 ? (
                <Badge variant="warning">
                  <Megaphone aria-hidden />
                  {loudCount} talked about, nothing happening
                </Badge>
              ) : null}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {rows.length} of {d.count} rows (universe {d.universe_size} perps plus MARKET)
              </span>
            </div>
            <div className="scrollbar-thin max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-right">Rank</TableHead>
                    <TableHead>Coin</TableHead>
                    <TableHead className="w-32">Pressure</TableHead>
                    <TableHead className="w-36">Tilt</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Top impact</TableHead>
                    <TableHead className="text-right">Headlines</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.symbol} className={cn(loud(r) && "bg-warning/5")}>
                      <TableCell className="text-right text-muted-foreground">{r.rank}</TableCell>
                      <TableCell>
                        <SymbolChip symbol={r.symbol} onClick={onSymbol} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16">
                            <MeterBar value={r.news_pressure} max={1} height={4} />
                          </div>
                          <span className="num text-[11px]">{num(r.news_pressure, 2)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className="w-14">
                            <DivergingBar value={r.news_tilt} maxAbs={1} height={6} />
                          </div>
                          <span className={cn("num text-[11px]", r.news_tilt > 0 ? "text-long" : r.news_tilt < 0 ? "text-short" : "text-muted-foreground")}>
                            {r.news_tilt > 0 ? "+" : ""}
                            {num(r.news_tilt, 2)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{r.event_count}</TableCell>
                      <TableCell className="text-right">{r.top_impact > 0 ? num(r.top_impact, 2) : "—"}</TableCell>
                      <TableCell className={cn("text-right", loud(r) && "font-semibold text-warning")}>{r.headlines}</TableCell>
                      <TableCell>
                        {loud(r) ? (
                          <Tip content={`${r.headlines} headlines name ${r.symbol} but none qualified as a catalyst: attention without an event.`}>
                            <Badge variant="warning" tabIndex={0}>
                              <Megaphone aria-hidden />
                              no catalyst
                            </Badge>
                          </Tip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Pressure (0 to 1) is a recency-weighted, saturating sum of impact scores; tilt (-1 to +1) is the impact-weighted direction, negative is risk-off. Headlines count raw coverage whether or not it qualified. Rows are ranked by pressure, then headlines.
            </p>
          </div>
        );
      }}
    </Panel>
  );
}

function feedState(s: NewsSource): { tone: "good" | "info" | "critical" | "warning"; label: string } {
  if (!s.ok) return { tone: "critical", label: "failing" };
  if (s.not_modified) return { tone: "info", label: "304, nothing new" };
  if (s.items_in_window === 0) return { tone: "warning", label: "no items" };
  return { tone: "good", label: "ok" };
}

const FUNNEL: Array<{ key: "ingested" | "dropped_noise" | "dropped_no_catalyst" | "dropped_no_entity" | "dropped_below_threshold" | "qualified"; label: string; color: string }> = [
  { key: "ingested", label: "Ingested", color: C.blue },
  { key: "dropped_noise", label: "Dropped: noise", color: C.neutral },
  { key: "dropped_no_catalyst", label: "Dropped: no catalyst", color: C.neutral },
  { key: "dropped_no_entity", label: "Dropped: no entity", color: C.neutral },
  { key: "dropped_below_threshold", label: "Dropped: below threshold", color: C.neutral },
  { key: "qualified", label: "Qualified", color: C.aqua },
];

function FeedHealth() {
  const q = useDataset("news-sources");
  const now = useNow() || Date.now();
  return (
    <Panel title="Feed health" dataset="news-sources" env={q.data} isLoading={q.isLoading} skeletonHeight={220}>
      {(d) => {
        const states = d.sources.map(feedState);
        const failing = states.filter((s) => s.tone === "critical").length;
        const notModified = d.sources.filter((s) => s.ok && s.not_modified).length;
        const totals = Object.fromEntries(FUNNEL.map((f) => [f.key, d.funnel_24h.reduce((s, h) => s + (h[f.key] ?? 0), 0)])) as Record<(typeof FUNNEL)[number]["key"], number>;
        const max = Math.max(totals.ingested, 1);
        const sorted = [...d.sources].sort((a, b) => Number(a.ok) - Number(b.ok) || b.items_in_window - a.items_in_window);
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={failing > 0 ? "critical" : "good"}>
                <Rss aria-hidden />
                {d.sources.length - failing}/{d.sources.length} feeds answering
              </Badge>
              <Badge variant="info">{notModified} answered 304 (nothing new)</Badge>
              {failing > 0 ? (
                <Badge variant="critical">
                  <TriangleAlert aria-hidden />
                  {failing} failing
                </Badge>
              ) : null}
              <span className="ml-auto text-[11px] text-muted-foreground">
                Last refresh {d.last_refresh ? ago(toMs(d.last_refresh), now) : "—"} &middot; threshold {num(d.impact_threshold, 2)} &middot; {int(d.store.events_in_memory)} events in memory, {int(d.store.responses_pending)} responses pending
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">24h funnel ({d.funnel_24h.length} hourly samples)</div>
                <ul className="space-y-1.5">
                  {FUNNEL.map((f) => (
                    <li key={f.key} className="grid grid-cols-[9.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{f.label}</span>
                      <MeterBar value={totals[f.key]} max={max} color={f.color} height={6} />
                      <span className="num text-right font-medium">{int(totals[f.key])}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] text-muted-foreground">Counts only, no titles: shows whether the filter is swallowing real catalysts.</p>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Feeds</div>
                <div className="flex flex-wrap gap-1.5">
                  {sorted.map((s) => {
                    const st = feedState(s);
                    return (
                      <Tip
                        key={s.name}
                        content={
                          <div className="space-y-0.5">
                            <div className="font-medium">
                              {s.name} ({s.kind})
                            </div>
                            <div>Status: {st.label}</div>
                            <div>{s.items_in_window} items in window</div>
                            <div>Newest item: {s.newest_item_age_hours != null ? `${num(s.newest_item_age_hours, 1)}h old` : "none"}</div>
                            <div>Weight {num(s.weight, 2)}{s.entity_hint ? `, project feed for ${s.entity_hint}` : ""}</div>
                          </div>
                        }
                      >
                        <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                          <span className={cn("size-1.5 rounded-full", { good: "bg-good", info: "bg-primary", critical: "bg-critical", warning: "bg-warning" }[st.tone])} aria-hidden />
                          {s.name}
                          <span className="num text-muted-foreground">{s.items_in_window}</span>
                        </span>
                      </Tip>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">Green ok, blue answered 304 (nothing new, not dead), amber no items, red failing. The number is items in the current window.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">Unresolvable tickers ({d.unresolvable.length})</div>
                <div className="flex flex-wrap gap-1">
                  {d.unresolvable.map((s) => (
                    <SymbolChip key={s} symbol={s} />
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Tickers that are common words with no safe project name: matched only by cashtag, so news about them can be missed.</p>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">Missing project names ({d.missing_names.length})</div>
                <div className="flex flex-wrap gap-1">
                  {d.missing_names.map((s) => (
                    <SymbolChip key={s} symbol={s} />
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {d.project_feed_symbols.length} perps also have a dedicated project feed. Last refresh {d.last_refresh ? dateTime(toMs(d.last_refresh)) : "—"}.
                </p>
              </div>
            </div>
          </div>
        );
      }}
    </Panel>
  );
}

export function NewsView() {
  const [symbol, setSymbol] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <CatalystTape onSymbol={setSymbol} />
      <PulseTable onSymbol={setSymbol} />
      <FeedHealth />
      <Sheet open={symbol !== null} onOpenChange={(o) => (!o ? setSymbol(null) : undefined)}>
        {symbol ? (
          <SheetContent title={`${symbol} news`} description="Qualified events and news features for one symbol over 7 days, fetched on demand while this drawer is open." className="sm:max-w-5xl">
            <CoinNews symbol={symbol} />
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  );
}
