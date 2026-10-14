"use client";

import type { CoinDepthSnapshot, L2Level } from "@cqd/schemas";
import { Crosshair, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { DivergingBar, Gauge } from "@/components/charts/basic";
import { TimeSeriesChart, type TsSeries } from "@/components/charts/time-series";
import { Freshness, Panel, PanelBody } from "@/components/panel";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip } from "@/components/ui/primitives";
import { C, hmmMeta, LIQ_REGIME, sentimentTone } from "@/lib/domain";
import { clock, humanize, num, pct, price, usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { cn, finite, toMs } from "@/lib/utils";

const BANDS = ["10bps", "25bps", "50bps", "100bps"] as const;

function depthAt(s: CoinDepthSnapshot, side: "bid" | "ask", band: string): number | null {
  const v = s.depth_usd?.[side]?.[band];
  return typeof v === "number" ? v : null;
}

function truncated(s: CoinDepthSnapshot, band: string): boolean {
  const t = s.levels_truncated as Record<string, Record<string, boolean>> | null | undefined;
  return Boolean(t?.bid?.[band] || t?.ask?.[band]);
}

function useRegimeLookups() {
  const liq = useDataset("liquidity-regime");
  const risk = useDataset("quant-coins-risk");
  return useMemo(() => {
    const liqBy = new Map((liq.data?.data?.coins ?? []).map((c) => [c.coin, c]));
    const hmmBy = new Map((risk.data?.data?.items ?? []).map((c) => [c.symbol, c]));
    return { liqBy, hmmBy };
  }, [liq.data, risk.data]);
}

function DepthTable({ focus, onFocus }: { focus: string; onFocus: (c: string) => void }) {
  const q = useDataset("liquidity-depth");
  const { liqBy, hmmBy } = useRegimeLookups();
  return (
    <Panel title="Depth across the top 25 perps" dataset="liquidity-depth" env={q.data} isLoading={q.isLoading} skeletonHeight={420}>
      {(d) => (
        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Coin</TableHead>
                <TableHead className="text-right">Mid</TableHead>
                <TableHead className="text-right">Spread</TableHead>
                <TableHead className="text-right">&plusmn;10 bps</TableHead>
                <TableHead className="text-right">&plusmn;25 bps</TableHead>
                <TableHead className="text-right">&plusmn;100 bps</TableHead>
                <TableHead className="w-28">Imbalance 10 bps</TableHead>
                <TableHead className="text-right">OI</TableHead>
                <TableHead>Liquidity regime</TableHead>
                <TableHead>HMM regime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.coins.map((c) => {
                const liq = liqBy.get(c.coin);
                const hmm = hmmBy.get(c.coin);
                const lr = liq ? (LIQ_REGIME[liq.regime] ?? { tone: "outline" as const, label: humanize(liq.regime) }) : null;
                const imb = finite(c.imbalance_10bps);
                const sum = (band: string) => {
                  const b = depthAt(c, "bid", band);
                  const a = depthAt(c, "ask", band);
                  return b === null && a === null ? null : (b ?? 0) + (a ?? 0);
                };
                return (
                  <TableRow
                    key={c.coin}
                    data-state={c.coin === focus ? "selected" : undefined}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => onFocus(c.coin)}
                    onKeyDown={(e) => (e.key === "Enter" ? onFocus(c.coin) : undefined)}
                  >
                    <TableCell className="font-semibold">{c.coin}</TableCell>
                    <TableCell className="text-right">{price(c.mid_price)}</TableCell>
                    <TableCell className="text-right">{num(c.spread_bps, 2)} bps</TableCell>
                    {(["10bps", "25bps", "100bps"] as const).map((b) => (
                      <TableCell key={b} className="text-right">
                        {truncated(c, b) ? (
                          <Tip content="The deepest of the ~20 returned levels sat inside this band, so the true depth is at least this much.">
                            <span className="text-muted-foreground">&ge;</span>
                          </Tip>
                        ) : null}
                        {usd(sum(b))}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Tip content={`Imbalance ${imb !== null ? num(imb, 2) : "n/a"} (positive = more bid depth)`}>
                        <div className="w-24">
                          <DivergingBar value={imb ?? 0} maxAbs={1} />
                        </div>
                      </Tip>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{usd(c.open_interest_usd)}</TableCell>
                    <TableCell>{lr ? <Badge variant={lr.tone}>{lr.label}</Badge> : <span className="text-muted-foreground">{"—"}</span>}</TableCell>
                    <TableCell>
                      {hmm?.regime ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px]">
                          <span className="size-2 rounded-sm" style={{ background: hmmMeta(hmm.regime.label).color }} aria-hidden />
                          {hmmMeta(hmm.regime.label).short}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{"—"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-[10px] text-muted-foreground">Depth is bid plus ask USD within the band. Click a row to focus its live ladder and 6h depth history. Each book carries its HMM regime from the Market Regimes model as corroboration.</p>
        </div>
      )}
    </Panel>
  );
}

function Ladder({ coin }: { coin: string }) {
  const q = useDataset("l2-book", { param: coin });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>L2 ladder: {coin}</CardTitle>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">/hyperliquid/l2-book (15 s while open)</div>
        </div>
        <Freshness env={q.data} />
      </CardHeader>
      <CardContent>
        <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={420}>
          {(d) => {
            const asks = [...d.asks].slice(0, 12).reverse();
            const bids = d.bids.slice(0, 12);
            const cum = (levels: L2Level[]) => {
              let acc = 0;
              return levels.map((l) => (acc += l.price * l.size));
            };
            const askCum = cum([...d.asks].slice(0, 12)).reverse();
            const bidCum = cum(bids);
            const maxCum = Math.max(askCum[0] ?? 0, bidCum[bidCum.length - 1] ?? 0, 1);
            const bestBid = d.bids[0]?.price;
            const bestAsk = d.asks[0]?.price;
            const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
            const spreadBps = bestBid && bestAsk && mid ? ((bestAsk - bestBid) / mid) * 10_000 : null;
            const Row = ({ l, c, side }: { l: L2Level; c: number; side: "bid" | "ask" }) => (
              <div className="relative grid grid-cols-[1fr_1fr_3rem_1fr] gap-2 px-2 py-[3px] text-[11px]">
                <div
                  className="absolute inset-y-0 right-0 opacity-20"
                  style={{ width: `${(c / maxCum) * 100}%`, background: side === "bid" ? C.long : C.short }}
                  aria-hidden
                />
                <span className={cn("num relative", side === "bid" ? "text-long" : "text-short")}>{price(l.price)}</span>
                <span className="num relative text-right">{num(l.size, l.size >= 100 ? 0 : 3)}</span>
                <span className="num relative text-right text-muted-foreground">{l.count ?? ""}</span>
                <span className="num relative text-right text-muted-foreground">{usd(c)}</span>
              </div>
            );
            return (
              <div className="rounded-md border">
                <div className="grid grid-cols-[1fr_1fr_3rem_1fr] gap-2 border-b px-2 py-1.5 text-[10px] text-muted-foreground">
                  <span>Price</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Orders</span>
                  <span className="text-right">Cum. USD</span>
                </div>
                <div aria-label="Asks (S side)">
                  {asks.map((l, i) => (
                    <Row key={`a${l.price}`} l={l} c={askCum[i] ?? 0} side="ask" />
                  ))}
                </div>
                <div className="flex items-center justify-between border-y bg-muted/40 px-2 py-1.5 text-xs">
                  <span className="num font-semibold">{price(mid)}</span>
                  <span className="num text-muted-foreground">spread {num(spreadBps, 2)} bps</span>
                  <span className="text-[10px] text-muted-foreground">book {clock(toMs(d.ts))}</span>
                </div>
                <div aria-label="Bids (L side)">
                  {bids.map((l, i) => (
                    <Row key={`b${l.price}`} l={l} c={bidCum[i] ?? 0} side="bid" />
                  ))}
                </div>
              </div>
            );
          }}
        </PanelBody>
        <p className="mt-2 text-[10px] text-muted-foreground">Asks (red) above the mid, bids (aqua) below. Shaded bars show cumulative USD from the touch.</p>
      </CardContent>
    </Card>
  );
}

/** ±50 bps liquidity heatmap over 6h: incremental depth per band and side, one column per ~2-minute snapshot. */
function DepthHistory({ coin }: { coin: string }) {
  const q = useDataset("depth-history", { param: coin });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Liquidity heatmap &plusmn;50 bps, last 6h: {coin}</CardTitle>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">/liquidity/depth/{"{coin}"}?minutes=360</div>
        </div>
        <Freshness env={q.data} />
      </CardHeader>
      <CardContent>
        <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={300}>
          {(d) => {
            const hist = [...d.history].sort((a, b) => a.ts - b.ts);
            if (hist.length === 0) return <div className="py-8 text-center text-xs text-muted-foreground">No depth snapshots in the window yet.</div>;
            const rows: Array<{ label: string; side: "bid" | "ask"; lo: string | null; hi: string }> = [
              { label: "Ask 25-50", side: "ask", lo: "25bps", hi: "50bps" },
              { label: "Ask 10-25", side: "ask", lo: "10bps", hi: "25bps" },
              { label: "Ask 0-10", side: "ask", lo: null, hi: "10bps" },
              { label: "Bid 0-10", side: "bid", lo: null, hi: "10bps" },
              { label: "Bid 10-25", side: "bid", lo: "10bps", hi: "25bps" },
              { label: "Bid 25-50", side: "bid", lo: "25bps", hi: "50bps" },
            ];
            const cell = (s: CoinDepthSnapshot, r: (typeof rows)[number]) => {
              const hi = depthAt(s, r.side, r.hi);
              const lo = r.lo ? depthAt(s, r.side, r.lo) : 0;
              return hi === null ? null : Math.max(0, hi - (lo ?? 0));
            };
            const all = hist.flatMap((s) => rows.map((r) => cell(s, r) ?? 0));
            const max = Math.max(...all, 1);
            const anyTrunc = hist.some((s) => BANDS.slice(0, 3).some((b) => truncated(s, b)));
            const series: TsSeries[] = [
              { id: "bid", label: "Bid depth 25 bps", kind: "line", color: C.long, points: hist.map((s) => ({ t: s.ts * 1000, v: depthAt(s, "bid", "25bps") ?? NaN })) },
              { id: "ask", label: "Ask depth 25 bps", kind: "line", color: C.short, points: hist.map((s) => ({ t: s.ts * 1000, v: depthAt(s, "ask", "25bps") ?? NaN })) },
            ];
            const first = hist[0]!;
            const last = hist[hist.length - 1]!;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-[2px]">
                  {rows.map((r) => (
                    <div key={r.label} className="contents">
                      <span className={cn("text-right text-[10px] leading-4", r.side === "bid" ? "text-long" : "text-short")}>{r.label}</span>
                      <div className="flex h-4 gap-px" role="img" aria-label={`${r.label} bps depth over time`}>
                        {hist.map((s) => {
                          const v = cell(s, r);
                          const f = v === null ? 0 : Math.sqrt(v / max);
                          return (
                            <div
                              key={s.ts}
                              title={`${clock(s.ts * 1000, false)} ${r.label} bps: ${usd(v)}`}
                              className="h-full min-w-px flex-1"
                              style={{ background: v === null ? C.grid : `color-mix(in srgb, ${C.blue} ${Math.round(6 + f * 90)}%, #0b0c0e)` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <span />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{clock(first.ts * 1000, false)}</span>
                    <span>{hist.length} snapshots</span>
                    <span>{clock(last.ts * 1000, false)}</span>
                  </div>
                </div>
                {anyTrunc ? (
                  <div className="flex items-start gap-1.5 text-[10px] text-warning">
                    <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                    Some bands saturated the ~20 levels Hyperliquid returns, so their depth is a lower bound (common on BTC and ETH, where 20 levels fit inside 10 bps).
                  </div>
                ) : null}
                <TimeSeriesChart series={series} height={180} format={(v) => usd(v)} />
              </div>
            );
          }}
        </PanelBody>
      </CardContent>
    </Card>
  );
}

function OiDivergence() {
  const q = useDataset("oi-divergence");
  return (
    <Panel title="OI vs price divergence" dataset="oi-divergence" env={q.data} isLoading={q.isLoading} skeletonHeight={300}>
      {(d) => {
        const rows = [...d.rows].sort((a, b) => (b.divergence_4h ?? -Infinity) - (a.divergence_4h ?? -Infinity));
        const maxAbs = Math.max(...rows.map((r) => Math.abs(r.divergence_4h ?? 0)), 0.01);
        const fragile = rows.filter((r) => (r.divergence_4h ?? 0) > 0 && (r.oi_change_4h_pct ?? 0) > 0).slice(0, 3);
        return (
          <div className="space-y-3">
            {fragile.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {fragile.map((r) => (
                  <div key={r.coin} className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <TriangleAlert className="size-3.5 text-warning" aria-hidden />
                      {r.coin}: fragile positioning
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      OI {pct(r.oi_change_4h_pct, { sign: true })} vs price {pct(r.price_change_4h_pct, { sign: true })} over 4h (divergence {num(r.divergence_4h, 2)})
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coin</TableHead>
                  <TableHead className="text-right">Px 1h</TableHead>
                  <TableHead className="text-right">OI 1h</TableHead>
                  <TableHead className="text-right">Px 4h</TableHead>
                  <TableHead className="text-right">OI 4h</TableHead>
                  <TableHead className="text-right">Px 24h</TableHead>
                  <TableHead className="text-right">OI 24h</TableHead>
                  <TableHead className="w-28">Divergence 4h</TableHead>
                  <TableHead className="text-right">OI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.coin}>
                    <TableCell className="font-semibold">{r.coin}</TableCell>
                    {(
                      [
                        [r.price_change_1h_pct, r.oi_change_1h_pct],
                        [r.price_change_4h_pct, r.oi_change_4h_pct],
                        [r.price_change_24h_pct, r.oi_change_24h_pct],
                      ] as const
                    ).flatMap(([p, o], i) => [
                      <TableCell key={`p${i}`} className="text-right text-muted-foreground">
                        {pct(p, { sign: true })}
                      </TableCell>,
                      <TableCell key={`o${i}`} className="text-right">
                        {pct(o, { sign: true })}
                      </TableCell>,
                    ])}
                    <TableCell>
                      <Tip content={`Divergence ${num(r.divergence_4h, 2)}: positive = OI rising faster than price`}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16">
                            <DivergingBar value={r.divergence_4h ?? 0} maxAbs={maxAbs} pos={C.orange} neg={C.blue} />
                          </div>
                          <span className="num text-[11px]">{num(r.divergence_4h, 2)}</span>
                        </div>
                      </Tip>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{usd(r.open_interest_usd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground">Ranked by 4h divergence. Positive (orange) means open interest is growing faster than price: positioning is being added without follow-through.</p>
          </div>
        );
      }}
    </Panel>
  );
}

function LiquidityRegime() {
  const q = useDataset("liquidity-regime");
  return (
    <Panel title="Liquidity regime" dataset="liquidity-regime" env={q.data} isLoading={q.isLoading} skeletonHeight={200}>
      {(d) => {
        const keys = ["deep_book", "neutral", "oi_price_divergence", "depth_withdrawal", "post_cascade_impaired"] as const;
        const total = keys.reduce((s, k) => s + (d.aggregate[k] ?? 0), 0) || 1;
        const colors: Record<string, string> = { deep_book: C.blue, neutral: C.neutral, oi_price_divergence: C.yellow, depth_withdrawal: C.orange, post_cascade_impaired: C.red };
        return (
          <div className="flex flex-wrap items-center gap-6">
            <Gauge value={d.composite_score} label="Composite (higher = healthier)" size={130} sub={<Badge variant={sentimentTone(d.sentiment)}>{humanize(d.sentiment)}</Badge>} />
            <div className="min-w-[220px] flex-1 space-y-2">
              <div className="flex h-2.5 gap-[2px] overflow-hidden rounded" role="img" aria-label="Regime mix across tracked coins">
                {keys.map((k) =>
                  (d.aggregate[k] ?? 0) > 0 ? <div key={k} style={{ width: `${((d.aggregate[k] ?? 0) / total) * 100}%`, background: colors[k] }} /> : null,
                )}
              </div>
              <ul className="space-y-1 text-xs">
                {keys.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="size-2 rounded-[2px]" style={{ background: colors[k] }} aria-hidden />
                    <span className="flex-1">{LIQ_REGIME[k]?.label}</span>
                    <span className="num font-medium">{d.aggregate[k] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      }}
    </Panel>
  );
}

export function BooksView() {
  const [focus, setFocus] = useState("BTC");
  const { liqBy, hmmBy } = useRegimeLookups();
  const liq = liqBy.get(focus);
  const hmm = hmmBy.get(focus);
  return (
    <div className="space-y-4">
      <DepthTable focus={focus} onFocus={setFocus} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Crosshair className="size-4 text-primary" aria-hidden />
        <span className="font-semibold">Focused: {focus}</span>
        {hmm?.regime ? (
          <Badge variant="outline">
            <span className="size-2 rounded-sm" style={{ background: hmmMeta(hmm.regime.label).color }} aria-hidden />
            HMM {hmmMeta(hmm.regime.label).name} ({Math.round(hmm.regime.confidence * 100)}%)
          </Badge>
        ) : null}
        {liq ? <Badge variant={LIQ_REGIME[liq.regime]?.tone ?? "outline"}>Liquidity: {LIQ_REGIME[liq.regime]?.label ?? humanize(liq.regime)}</Badge> : null}
        <span className="text-muted-foreground">The ladder and history poll only while this page is open.</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Ladder coin={focus} />
        <DepthHistory coin={focus} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <OiDivergence />
        <LiquidityRegime />
      </div>
    </div>
  );
}
