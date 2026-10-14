"use client";

import type { EventCatalystModel } from "@cqd/schemas";
import { useMemo, useState } from "react";
import { Gauge, MeterBar } from "@/components/charts/basic";
import { Freshness, Panel, PanelBody } from "@/components/panel";
import { Badge, Input, Label, NativeSelect, Sheet, SheetContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip } from "@/components/ui/primitives";
import { biasTone, C, EVENT_TYPES, riskBandTone } from "@/lib/domain";
import { dateShort, humanize, int, num, pct, usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = { unlock: C.violet, macro_print: C.yellow, depeg: C.red, mint: C.blue };

function EventRisk() {
  const q = useDataset("score-event");
  return (
    <Panel title="Event risk" dataset="score-event" env={q.data} isLoading={q.isLoading} skeletonHeight={180}>
      {(d) => {
        const counts = (d.counts ?? {}) as Record<string, number>;
        const totalCount = Object.values(counts).reduce((s, v) => s + (Number(v) || 0), 0) || 1;
        return (
          <div className="flex flex-wrap items-start gap-6">
            <Gauge value={d.event_risk_score} label="Event risk score" size={140} sub={<Badge variant={riskBandTone(d.band)}>{humanize(d.band)}</Badge>} />
            <div className="min-w-[200px] flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border px-3 py-2">
                  <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Next 7 days</div>
                  <div className="text-lg font-semibold">{int(d.events_7d)}</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Next 30 days</div>
                  <div className="text-lg font-semibold">{int(d.events_30d)}</div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">Feed mix</div>
                <div className="flex h-2 gap-[2px] overflow-hidden rounded" role="img" aria-label="Catalyst feed mix">
                  {Object.entries(counts).map(([k, v]) =>
                    Number(v) > 0 ? <div key={k} style={{ width: `${(Number(v) / totalCount) * 100}%`, background: TYPE_COLORS[k] ?? C.neutral }} /> : null,
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  {Object.entries(counts).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-[2px]" style={{ background: TYPE_COLORS[k] ?? C.neutral }} aria-hidden />
                      {EVENT_TYPES[k] ?? humanize(k)} <span className="num text-foreground">{int(Number(v))}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="min-w-[200px] flex-1 space-y-2">
              {(
                [
                  ["Unlock subscore", d.unlock_subscore],
                  ["Macro subscore", d.macro_subscore],
                  ["Depeg subscore", d.depeg_subscore],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="num font-medium">{num(v, 1)}</span>
                  </div>
                  <MeterBar value={v} />
                </div>
              ))}
              {d.partial ? <Badge variant="warning">partial: some inputs unavailable</Badge> : null}
            </div>
          </div>
        );
      }}
    </Panel>
  );
}

function detail(e: EventCatalystModel): string {
  if (e.event_type === "unlock") return [e.unlocked_value_usd ? usd(e.unlocked_value_usd) : null, e.pct_of_fdv ? `${pct(e.pct_of_fdv * 100, { digits: 2 })} of FDV` : null].filter(Boolean).join(", ");
  if (e.event_type === "mint") return [e.delta_usd ? usd(e.delta_usd, { sign: true }) : null, e.pct_of_supply ? `${pct(e.pct_of_supply * 100, { digits: 2 })} of supply` : null].filter(Boolean).join(", ");
  if (e.event_type === "depeg") return e.deviation_bps ? `${num(e.deviation_bps, 0)} bps off peg` : "";
  if (e.event_type === "macro_print") return e.macro_class ?? "";
  return "";
}

function CatalystTable({ items, onSymbol, empty }: { items: EventCatalystModel[]; onSymbol: (s: string) => void; empty: string }) {
  if (items.length === 0) return <div className="py-6 text-center text-xs text-muted-foreground">{empty}</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Symbols</TableHead>
          <TableHead>Bias</TableHead>
          <TableHead className="w-28">Magnitude</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((e, i) => (
          <TableRow key={`${e.title}-${e.date}-${i}`}>
            <TableCell>
              <div>{dateShort(toMs(e.date))}</div>
              <div className="text-[10px] text-muted-foreground">{e.days_until === 0 ? "today" : e.days_until > 0 ? `in ${e.days_until}d` : `${-e.days_until}d ago`}</div>
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: TYPE_COLORS[e.event_type] ?? C.neutral }} aria-hidden />
                {EVENT_TYPES[e.event_type] ?? e.event_type}
              </span>
            </TableCell>
            <TableCell className="max-w-[320px] truncate whitespace-nowrap" title={e.title}>
              {e.title}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {(e.symbols ?? []).length === 0 ? <span className="text-muted-foreground">market-wide</span> : null}
                {(e.symbols ?? []).slice(0, 4).map((s) => (
                  <button key={s} type="button" onClick={() => onSymbol(s)} className="rounded border px-1 py-0.5 text-[10px] font-semibold hover:border-foreground/40 hover:bg-accent">
                    {s}
                  </button>
                ))}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={biasTone(e.bias)}>{e.bias.replace("_", " ")}</Badge>
            </TableCell>
            <TableCell>
              <Tip content={`Magnitude ${num(e.magnitude, 2)} (0-1)`}>
                <div className="flex items-center gap-1.5">
                  <div className="w-16">
                    <MeterBar value={e.magnitude} max={1} height={4} />
                  </div>
                  <span className="num text-[11px]">{num(e.magnitude, 2)}</span>
                </div>
              </Tip>
            </TableCell>
            <TableCell className="text-muted-foreground">{detail(e) || "—"}</TableCell>
            <TableCell className="text-muted-foreground">{e.source ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Catalysts({ onSymbol }: { onSymbol: (s: string) => void }) {
  const q = useDataset("event-calendar");
  const [type, setType] = useState("all");
  const [bias, setBias] = useState("all");
  const [symbol, setSymbol] = useState("");
  const [minMag, setMinMag] = useState(0);
  const items = q.data?.data?.items;
  const filtered = useMemo(() => {
    const sym = symbol.trim().toUpperCase();
    return (items ?? []).filter(
      (e) =>
        (type === "all" || e.event_type === type) &&
        (bias === "all" || e.bias === bias) &&
        (!sym || (e.symbols ?? []).some((s) => s.toUpperCase() === sym)) &&
        (e.magnitude ?? 0) >= minMag,
    );
  }, [items, type, bias, symbol, minMag]);
  const upcoming = filtered.filter((e) => e.days_until >= 0).sort((a, b) => a.days_until - b.days_until || (b.magnitude ?? 0) - (a.magnitude ?? 0));
  const recent = filtered.filter((e) => e.days_until < 0).sort((a, b) => b.days_until - a.days_until);

  return (
    <Panel title="Catalysts (30-day window)" dataset="event-calendar" env={q.data} isLoading={q.isLoading} skeletonHeight={420}>
      {(d) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Label>
              Type
              <NativeSelect value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">All types</option>
                {Object.entries(EVENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <Label>
              Bias
              <NativeSelect value={bias} onChange={(e) => setBias(e.target.value)}>
                <option value="all">Any bias</option>
                {["long", "short", "neutral", "risk_flag", "mixed"].map((b) => (
                  <option key={b} value={b}>
                    {b.replace("_", " ")}
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <Label>
              Symbol
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Any" className="w-24 uppercase" aria-label="Filter by symbol" />
            </Label>
            <Label>
              Min magnitude
              <NativeSelect value={minMag} onChange={(e) => setMinMag(Number(e.target.value))}>
                {[0, 0.25, 0.5, 0.75].map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? "Any" : v.toFixed(2)}
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {d.count} catalysts &middot; risk score {num(d.event_risk_score, 1)} ({d.band})
            </span>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Upcoming ({upcoming.length})</h3>
            <CatalystTable items={upcoming} onSymbol={onSymbol} empty="No upcoming catalysts match these filters." />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent ({recent.length})</h3>
            <CatalystTable items={recent} onSymbol={onSymbol} empty="No recent catalysts match these filters." />
          </div>
          <p className="text-[10px] text-muted-foreground">Unlocks bias short (supply overhang); macro prints are risk flags because the surprise is unknown ahead of time. Filters run on the cached 30-day calendar, so they cost no API calls.</p>
        </div>
      )}
    </Panel>
  );
}

function Unlocks({ onSymbol }: { onSymbol: (s: string) => void }) {
  const q = useDataset("supply-unlocks");
  return (
    <Panel title="Token unlock cliffs (30 days)" dataset="supply-unlocks" env={q.data} isLoading={q.isLoading} skeletonHeight={240}>
      {(d) =>
        d.items.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No unlock cliffs in the window.</div>
        ) : (
          <div className="space-y-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">% of float</TableHead>
                  <TableHead className="text-right">% of mcap</TableHead>
                  <TableHead>Categories</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.items.map((u) => (
                  <TableRow key={`${u.symbol}-${u.date}`}>
                    <TableCell>
                      <button type="button" onClick={() => onSymbol(u.symbol)} className="font-semibold hover:underline">
                        {u.symbol}
                      </button>{" "}
                      <span className="text-muted-foreground">{u.name}</span>
                    </TableCell>
                    <TableCell>
                      {dateShort(toMs(u.date))} <span className="text-[10px] text-muted-foreground">in {u.days_until}d</span>
                    </TableCell>
                    <TableCell className="text-right">{usd(u.usd)}</TableCell>
                    <TableCell className={cn("text-right", (u.pct_of_float ?? 0) >= 0.05 && "font-semibold text-warning")}>{pct((u.pct_of_float ?? 0) * 100, { digits: 2 })}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{pct((u.pct_of_market_cap ?? 0) * 100, { digits: 2 })}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{(u.categories ?? []).join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground">Cliffs only (no linear vesting drips), soonest cliff per coin, sized against circulating float. Source: DefiLlama emissions via CDA ({d.tier_scope}).</p>
          </div>
        )
      }
    </Panel>
  );
}

function SymbolDrawer({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const q = useDataset("event-symbol", { param: symbol });
  const cal = useDataset("event-calendar");
  const items = (cal.data?.data?.items ?? []).filter((e) => symbol && (e.symbols ?? []).includes(symbol));
  return (
    <Sheet open={symbol !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      {symbol ? (
        <SheetContent title={`${symbol} catalysts`} description="Per-symbol overlay: pending catalysts within 7 days and the net bias CDA assigns.">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Freshness env={q.data} />
            </div>
            <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={120}>
              {(d) => (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md border px-2.5 py-2">
                      <div className="text-[10px] text-muted-foreground uppercase">Net bias</div>
                      <Badge variant={biasTone(d.net_bias)}>{d.net_bias ?? "neutral"}</Badge>
                    </div>
                    <div className="rounded-md border px-2.5 py-2">
                      <div className="text-[10px] text-muted-foreground uppercase">Net magnitude</div>
                      <div className="num font-semibold">{num(d.net_magnitude, 2)}</div>
                    </div>
                    <div className="rounded-md border px-2.5 py-2">
                      <div className="text-[10px] text-muted-foreground uppercase">Nearest event</div>
                      <div className="num font-semibold">{d.nearest_event_days != null ? `${d.nearest_event_days}d` : "none"}</div>
                    </div>
                  </div>
                  {d.hl_symbol && d.hl_symbol !== d.symbol ? <div className="text-xs text-muted-foreground">Hyperliquid name: {d.hl_symbol}</div> : null}
                </div>
              )}
            </PanelBody>
            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">In the 30-day calendar</h3>
              <CatalystTable items={items} onSymbol={() => undefined} empty={`No calendar entries name ${symbol}.`} />
            </div>
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

export function CalendarView() {
  const [symbol, setSymbol] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <EventRisk />
      <Catalysts onSymbol={setSymbol} />
      <Unlocks onSymbol={setSymbol} />
      <SymbolDrawer symbol={symbol} onClose={() => setSymbol(null)} />
    </div>
  );
}
