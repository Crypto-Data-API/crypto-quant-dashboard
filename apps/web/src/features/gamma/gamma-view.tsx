"use client";

import type { GexCoin, GexHistoryPoint, GexResponse, PositionBucket } from "@cqd/schemas";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LongShortBar, PctileChip, Sparkline } from "@/components/charts/basic";
import { axisProps, gridProps, tooltipProps } from "@/components/charts/recharts-theme";
import { Freshness, Panel, PanelBody } from "@/components/panel";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Tip } from "@/components/ui/primitives";
import { C, GEX_STATE } from "@/lib/domain";
import { dateTime, fundingHourly, humanize, int, num, pct, price, usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { cn, finite, toMs } from "@/lib/utils";
import { normalizeParam } from "@cqd/schemas";
import { GammaProfile } from "./gamma-profile";

function regimeBadge(state: string | null | undefined) {
  const s = GEX_STATE[state ?? ""];
  return <Badge variant={s?.tone ?? "outline"}>{s?.label ?? humanize(state ?? "n/a")}</Badge>;
}

function CoinCard({ symbol, c, active, onSelect, onRemove }: { symbol: string; c: GexCoin; active: boolean; onSelect: () => void; onRemove?: () => void }) {
  const flip = finite(c.gamma_flip);
  const dist = finite(c.dist_to_flip_pct);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" ? onSelect() : undefined)}
      className={cn("flex flex-col gap-2 rounded-lg border bg-card px-3.5 py-3 text-left outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/60", active && "border-primary/70 bg-primary/5")}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold">{symbol}</span>
        {regimeBadge(c.regime?.state)}
        {onRemove ? (
          <button
            type="button"
            aria-label={`Remove ${symbol}`}
            className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <span className="ml-auto num text-sm">{price(c.mark)}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted-foreground">MM net inventory</div>
        <div className={cn("num text-right font-semibold", (c.mm_net_delta ?? 0) >= 0 ? "text-long" : "text-short")}>
          {(c.mm_net_delta ?? 0) >= 0 ? "L " : "S "}
          {usd(c.mm_net_delta, { sign: true })}
        </div>
        <div className="text-muted-foreground">Gamma flip</div>
        <div className="num text-right">
          {price(flip)} <span className="text-muted-foreground">({pct(dist, { sign: true })})</span>
        </div>
        <div className="text-muted-foreground">Dealers (MM accounts)</div>
        <div className="num text-right">{int(c.mm_n_accounts)}</div>
        <div className="text-muted-foreground">Funding</div>
        <div className="num text-right">{fundingHourly(c.funding_rate)}</div>
      </div>
      <LongShortBar long={c.mm_long_usd ?? 0} short={c.mm_short_usd ?? 0} height={4} />
      {c.regime?.coverage && c.regime.coverage !== "full" ? (
        <Tip content="Fewer than 20 market-maker accounts: the state rests mostly on funding, not positioning.">
          <span className="text-[10px] text-warning" tabIndex={0}>
            coverage: {c.regime.coverage.replace("_", " ")}
          </span>
        </Tip>
      ) : null}
    </div>
  );
}

const HISTORY_METRICS: Array<{ key: keyof GexHistoryPoint; label: string; fmt: (v: number | null) => string }> = [
  { key: "near_density", label: "Near-mark density %", fmt: (v) => pct(v) },
  { key: "dist_to_flip_pct", label: "Distance to flip %", fmt: (v) => pct(v, { sign: true }) },
  { key: "mm_skew", label: "MM skew (net/gross)", fmt: (v) => num(v, 2) },
  { key: "regime_score", label: "Regime score", fmt: (v) => num(v, 2) },
  { key: "funding_rate", label: "Funding /h", fmt: (v) => fundingHourly(v) },
  { key: "mm_gross", label: "MM gross", fmt: (v) => usd(v) },
];

function History({ symbol }: { symbol: string }) {
  const q = useDataset("gex-history", { param: symbol });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">30-day history (hourly)</h3>
        <Freshness env={q.data} />
      </div>
      <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={120} compact>
        {(d) => {
          const pts = d.points;
          const first = toMs(pts[0]?.ts);
          return (
            <div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {HISTORY_METRICS.map((m) => {
                  const vals = pts.map((p) => finite(p[m.key]));
                  const last = [...vals].reverse().find((v) => v !== null) ?? null;
                  return (
                    <div key={String(m.key)} className="rounded-md border px-2.5 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[10px] text-muted-foreground">{m.label}</span>
                        <span className="num text-xs font-semibold">{m.fmt(last)}</span>
                      </div>
                      <Sparkline values={vals} width={220} height={34} stretch className="mt-1" label={`${symbol} ${m.label}, 30 days`} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {pts.length} hourly samples{first ? ` since ${dateTime(first)}` : ""}. Forward-only ring kept by CDA; older history is Pro Plus.
              </div>
            </div>
          );
        }}
      </PanelBody>
    </div>
  );
}

function Detail({ symbol, c }: { symbol: string; c: GexCoin }) {
  const dc = c.distribution_context;
  const flip = finite(c.gamma_flip);
  const mark = finite(c.mark);
  const levels = [...(c.levels ?? [])].sort((a, b) => b.price - a.price);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{symbol}</span>
        {regimeBadge(c.regime?.state)}
        <span className="text-xs text-muted-foreground">
          score {num(c.regime?.score, 2)} &middot; confidence {num(c.regime?.confidence, 2)} &middot; fuel side {c.regime?.fuel_side ?? "n/a"}
          {c.regime?.since ? ` · since ${dateTime(toMs(c.regime.since))}` : ""}
        </span>
      </div>
      {c.regime?.rationale ? <p className="-mt-3 text-xs text-muted-foreground">{c.regime.rationale}</p> : null}

      {mark && c.gamma_profile?.length ? (
        <GammaProfile bins={c.gamma_profile} mark={mark} flip={flip} />
      ) : (
        <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">No market-maker liquidation bands for this coin (coverage {c.coverage?.bands ?? 0} bands).</div>
      )}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Today vs 30 days</h3>
          <span className="text-[10px] text-muted-foreground">
            {dc?.status === "warming" ? "warming up: percentiles appear after 2 days" : `${num(dc?.history_days, 0)} days, ${int(dc?.sample_count)} samples`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <PctileChip label="Near-mark density" value={dc?.near_density_pctile} />
          <PctileChip label="|Distance to flip|" value={dc?.abs_dist_to_flip_pctile} hint="Low = unusually close to the flip line" />
          <PctileChip label="MM skew" value={dc?.mm_skew_pctile} />
          <PctileChip label="Regime score" value={dc?.regime_score_pctile} />
          <PctileChip label="Funding" value={dc?.funding_rate_pctile} hint={dc?.funding_pinned ? "Funding pinned to Hyperliquid's baseline; percentile suppressed" : undefined} />
        </div>
      </div>

      {levels.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nearest liquidation clusters (all accounts)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Price</TableHead>
                <TableHead className="text-right">From mark</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Notional</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{price(l.price)}</TableCell>
                  <TableCell className="text-right">{pct(l.dist_pct, { sign: true, digits: 2 })}</TableCell>
                  <TableCell className={l.side === "long" ? "text-long" : "text-short"}>{l.side === "long" ? "L long" : "S short"}</TableCell>
                  <TableCell className="text-right">{usd(l.total_usd)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{int(l.n_accounts)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <History symbol={symbol} />
    </div>
  );
}

const CLASS_ORDER = ["market_maker", "whale", "other", "all"];

function Positioning({ symbol }: { symbol: string }) {
  const q = useDataset("quant-positioning");
  return (
    <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={260}>
      {(d) => {
        const coin = d.coins[symbol];
        if (!coin) return <div className="py-8 text-center text-xs text-muted-foreground">{symbol} is not in the scheduled positioning set ({Object.keys(d.coins).join(", ")}). Add it to GEX_SYMBOLS to poll it.</div>;
        const rows: Array<{ name: string; group: string; b: PositionBucket }> = [
          ...CLASS_ORDER.filter((k) => coin.by_type?.[k]).map((k) => ({ name: humanize(k), group: "class", b: coin.by_type![k]! })),
          ...Object.entries(coin.by_tag ?? {}).map(([k, b]) => ({ name: humanize(k), group: "tag", b })),
        ];
        const chart = rows.map((r) => ({ name: r.name, net: r.b.net_usd ?? 0 }));
        return (
          <div className="space-y-4">
            <div style={{ height: 40 + chart.length * 34 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v: number) => usd(v, { digits: 0 })} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={104} />
                  <ReferenceLine x={0} stroke={C.axis} />
                  <Tooltip {...tooltipProps} formatter={(v) => [usd(Number(v), { sign: true }), "Net delta"]} />
                  <Bar dataKey="net" isAnimationActive={false} radius={2}>
                    {chart.map((r) => (
                      <Cell key={r.name} fill={r.net >= 0 ? C.long : C.short} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trader group</TableHead>
                  <TableHead className="text-right">Long</TableHead>
                  <TableHead className="text-right">Short</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Accounts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell>
                      {r.name} {r.group === "tag" ? <span className="text-[10px] text-muted-foreground">(tag overlay)</span> : null}
                    </TableCell>
                    <TableCell className="text-right">{usd(r.b.long_usd)}</TableCell>
                    <TableCell className="text-right">{usd(r.b.short_usd)}</TableCell>
                    <TableCell className={cn("text-right font-semibold", (r.b.net_usd ?? 0) >= 0 ? "text-long" : "text-short")}>{usd(r.b.net_usd, { sign: true })}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{usd(r.b.gross_usd)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{int(r.b.n_accounts)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground">
              Classes partition every Hyperliquid account worth $100k or more; tags overlap them. The market-maker class is the dealer basis for the GEX view. Positions as of {dateTime(d.positions_as_of)}.
            </p>
          </div>
        );
      }}
    </PanelBody>
  );
}

function pickCoin(d: GexResponse | null | undefined, symbol: string): GexCoin | null {
  if (!d?.coins) return null;
  return d.coins[symbol] ?? Object.values(d.coins)[0] ?? null;
}

function ExtraCoin({ symbol, active, onSelect, onRemove }: { symbol: string; active: boolean; onSelect: () => void; onRemove: () => void }) {
  const q = useDataset("quant-gex-coin", { param: symbol });
  const c = pickCoin(q.data?.data, symbol);
  if (!c) {
    return (
      <div className="flex flex-col justify-between gap-2 rounded-lg border border-dashed px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{symbol}</span>
          <button type="button" aria-label={`Remove ${symbol}`} className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent" onClick={onRemove}>
            <X className="size-3.5" />
          </button>
        </div>
        <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={80} compact>
          {() => <div className="text-xs text-muted-foreground">No GEX entry for {symbol}.</div>}
        </PanelBody>
      </div>
    );
  }
  return <CoinCard symbol={symbol} c={c} active={active} onSelect={onSelect} onRemove={onRemove} />;
}

export function GammaView() {
  const q = useDataset("quant-gex");
  const [selected, setSelected] = useState("BTC");
  const [extra, setExtra] = useState<string[]>([]);
  const [input, setInput] = useState("");
  // Same query key as the ExtraCoin card, so TanStack Query shares one request.
  const extraQ = useDataset("quant-gex-coin", { param: extra.includes(selected) ? selected : null });
  const base = useMemo(() => q.data?.data?.coins ?? {}, [q.data]);
  const baseSymbols = Object.keys(base);
  const selectedCoin = base[selected] ?? (extra.includes(selected) ? pickCoin(extraQ.data?.data, selected) : null);

  const add = () => {
    const s = normalizeParam(input);
    if (s && !baseSymbols.includes(s) && !extra.includes(s)) setExtra((e) => [...e, s].slice(-4));
    if (s) setSelected(s);
    setInput("");
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Dealer gamma (perp GEX analog)"
        dataset="quant-gex"
        env={q.data}
        isLoading={q.isLoading}
        skeletonHeight={170}
        actions={
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add coin" className="h-7 w-24 uppercase" aria-label="Add coin" />
            <Button type="submit" size="sm" variant="secondary" aria-label="Add coin">
              <Plus />
            </Button>
          </form>
        }
      >
        {(d) => (
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(d.coins).map(([sym, c]) => (
                <CoinCard key={sym} symbol={sym} c={c} active={sym === selected} onSelect={() => setSelected(sym)} />
              ))}
              {extra.map((sym) => (
                <ExtraCoin
                  key={sym}
                  symbol={sym}
                  active={sym === selected}
                  onSelect={() => setSelected(sym)}
                  onRemove={() => {
                    setExtra((e) => e.filter((x) => x !== sym));
                    if (selected === sym) setSelected("BTC");
                  }}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Behavioral analog built from market-maker inventory and liquidation-driven flow, not options dealer gamma. {int(Number(d.meta?.mm_accounts ?? NaN))} MM accounts classified. Added coins are fetched on demand.
            </p>
          </div>
        )}
      </Panel>

      <Card>
        <CardHeader>
          <CardTitle>{selected}: gamma profile and positioning</CardTitle>
          <Freshness env={q.data} />
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Gamma profile</TabsTrigger>
              <TabsTrigger value="positioning">Positioning</TabsTrigger>
            </TabsList>
            <TabsContent value="profile">
              {selectedCoin ? (
                <Detail symbol={selected} c={selectedCoin} />
              ) : (
                <PanelBody env={extra.includes(selected) ? extraQ.data : q.data} isLoading={extra.includes(selected) ? extraQ.isLoading : q.isLoading} skeletonHeight={240}>
                  {() => <div className="py-8 text-center text-xs text-muted-foreground">No GEX entry for {selected}. Select a coin card above.</div>}
                </PanelBody>
              )}
            </TabsContent>
            <TabsContent value="positioning">
              <Positioning symbol={selected} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
