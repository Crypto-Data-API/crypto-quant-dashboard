"use client";

import type { VolumeScannerItem } from "@cqd/schemas";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts/basic";
import { TimeSeriesChart, type TsSeries } from "@/components/charts/time-series";
import { Freshness, Panel, PanelBody } from "@/components/panel";
import { Badge, Input, Label, NativeSelect, Sheet, SheetContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip } from "@/components/ui/primitives";
import { C, VOLUME_BANDS, volumeBandTone } from "@/lib/domain";
import { fundingHourly, int, multiple, pct, price, usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";

type SortKey = "symbol" | "price" | "change_24h" | "volume_24h" | "volume_change_24h" | "avg_volume_30d" | "median_volume_30d" | "multiplier" | "open_interest_usd";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right"; hint?: string }> = [
  { key: "symbol", label: "Perp" },
  { key: "price", label: "Price", align: "right" },
  { key: "change_24h", label: "24h px", align: "right", hint: "Price change, 24h" },
  { key: "volume_24h", label: "24h notional", align: "right", hint: "Live rolling-24h notional" },
  { key: "volume_change_24h", label: "vs last day", align: "right", hint: "Change vs the last settled day's notional" },
  { key: "avg_volume_30d", label: "30d mean", align: "right" },
  { key: "median_volume_30d", label: "30d median", align: "right" },
  { key: "multiplier", label: "Multiplier", align: "right", hint: "24h notional / 30-day mean (settled days). Median-based multiple in the tooltip." },
  { key: "open_interest_usd", label: "OI", align: "right" },
];

function SignedPct({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-muted-foreground">{"—"}</span>;
  return <span className={v > 0 ? "text-long" : v < 0 ? "text-short" : ""}>{pct(v, { sign: true })}</span>;
}

function VolumeDetail({ symbol, item, onClose }: { symbol: string | null; item: VolumeScannerItem | null; onClose: () => void }) {
  const q = useDataset("volume-detail", { param: symbol });
  return (
    <Sheet open={symbol !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      {symbol ? (
        <SheetContent title={`${symbol} volume`} description="30 settled days of daily notional against the scanner's 30-day mean and median.">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Freshness env={q.data} />
            </div>
            <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={280}>
              {(d) => {
                const hist = (d.history ?? []).map((h) => ({ t: toMs(h.date) ?? 0, v: h.notional }));
                const series: TsSeries[] = [{ id: "notional", label: "Daily notional", kind: "histogram", color: C.blue, points: hist }];
                if (d.avg_volume_30d && hist.length) series.push({ id: "mean", label: "30d mean", kind: "line", color: C.yellow, points: hist.map((p) => ({ t: p.t, v: d.avg_volume_30d! })) });
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      {[
                        ["24h notional", usd(d.volume_24h)],
                        ["Multiplier (mean)", multiple(d.multiplier)],
                        ["Multiplier (median)", multiple(d.multiplier_median)],
                        ["Band", d.band ?? "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-md border px-2.5 py-2">
                          <div className="text-[10px] text-muted-foreground uppercase">{k}</div>
                          <div className="num font-semibold capitalize">{v}</div>
                        </div>
                      ))}
                    </div>
                    <TimeSeriesChart series={series} height={240} format={(v) => usd(v)} timeVisible={false} />
                    <div className="text-[11px] text-muted-foreground">
                      {d.days_of_history ?? hist.length} days of history &middot; price {price(d.price)} ({pct(d.change_24h, { sign: true })}) &middot; funding {fundingHourly(d.funding_rate)}
                    </div>
                  </div>
                );
              }}
            </PanelBody>
            {item ? (
              <p className="text-[10px] text-muted-foreground">
                Scanner row: 30d mean {usd(item.avg_volume_30d)}, median {usd(item.median_volume_30d)}. Compare the two multiples when a coin had one blow-off day.
              </p>
            ) : null}
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

export function VolumeView() {
  const q = useDataset("volume-scanner");
  const [band, setBand] = useState<string>("all");
  const [minMult, setMinMult] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "multiplier", dir: "desc" });
  const [picked, setPicked] = useState<VolumeScannerItem | null>(null);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "symbol" ? "asc" : "desc" }));

  const items = q.data?.data?.items;
  const rows = useMemo(() => {
    const term = search.trim().toUpperCase();
    const filtered = (items ?? []).filter((it) => {
      if (band !== "all" && it.band !== band) return false;
      if (minMult > 0 && (it.multiplier ?? 0) < minMult) return false;
      if (term && !it.symbol.toUpperCase().includes(term)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.key === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      const av = (a[sort.key] as number | null | undefined) ?? -Infinity;
      const bv = (b[sort.key] as number | null | undefined) ?? -Infinity;
      return (av - bv) * dir;
    });
  }, [items, band, minMult, search, sort]);

  return (
    <div className="space-y-4">
      <Panel title="Volume scanner: every Hyperliquid perp" dataset="volume-scanner" env={q.data} isLoading={q.isLoading} skeletonHeight={480}>
        {(d) => {
          const atLeast2x = d.items.filter((i) => (i.multiplier ?? 0) >= 2).length;
          const top = [...d.items].filter((i) => i.multiplier != null).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0))[0];
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {[
                  { k: "Total 24h notional", v: usd(d.total_volume_24h), s: `${d.count} perps, ${d.rated_size} with a baseline` },
                  { k: "Market multiplier", v: multiple(d.market_multiplier), s: "Universe 24h vs 30-day mean" },
                  { k: "At 2x or more", v: int(atLeast2x), s: "Perps trading 2x their 30d mean" },
                  { k: "Surging or extreme", v: int(d.surging_count), s: "CDA band count" },
                  { k: "Most active vs normal", v: top ? `${top.symbol} ${multiple(top.multiplier)}` : "—", s: top ? `${usd(top.volume_24h)} vs ${usd(top.avg_volume_30d)} mean` : "" },
                ].map((t) => (
                  <div key={t.k} className="rounded-md border px-3 py-2">
                    <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{t.k}</div>
                    <div className="text-lg font-semibold">{t.v}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{t.s}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Label>
                  <Search className="size-3.5" aria-hidden />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find perp" className="w-32" aria-label="Find perp" />
                </Label>
                <Label>
                  Band
                  <NativeSelect value={band} onChange={(e) => setBand(e.target.value)}>
                    <option value="all">All bands</option>
                    {VOLUME_BANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </NativeSelect>
                </Label>
                <Label>
                  Min multiplier
                  <NativeSelect value={minMult} onChange={(e) => setMinMult(Number(e.target.value))}>
                    {[0, 1.5, 2, 3, 5, 10].map((v) => (
                      <option key={v} value={v}>
                        {v === 0 ? "Any" : `${v}x`}
                      </option>
                    ))}
                  </NativeSelect>
                </Label>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {rows.length} shown &middot; click a row for the 30-day series
                </span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {COLUMNS.slice(0, 5).map((c) => (
                      <SortHead key={c.key} col={c} sort={sort} onSort={toggleSort} />
                    ))}
                    <TableHead>7d notional</TableHead>
                    {COLUMNS.slice(5).map((c) => (
                      <SortHead key={c.key} col={c} sort={sort} onSort={toggleSort} />
                    ))}
                    <TableHead>Band</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((it) => (
                    <TableRow key={it.symbol} className="cursor-pointer" onClick={() => setPicked(it)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" ? setPicked(it) : undefined)}>
                      <TableCell className="font-semibold">{it.symbol}</TableCell>
                      <TableCell className="text-right">{price(it.price)}</TableCell>
                      <TableCell className="text-right">
                        <SignedPct v={it.change_24h} />
                      </TableCell>
                      <TableCell className="text-right font-medium">{usd(it.volume_24h)}</TableCell>
                      <TableCell className="text-right">
                        <SignedPct v={it.volume_change_24h} />
                      </TableCell>
                      <TableCell>
                        <Sparkline values={it.spark_7d ?? []} width={80} height={20} baseline={it.avg_volume_30d} label={`${it.symbol} 7-day notional`} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{usd(it.avg_volume_30d)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{usd(it.median_volume_30d)}</TableCell>
                      <TableCell className="text-right">
                        <Tip content={`Mean-based ${multiple(it.multiplier)}, median-based ${multiple(it.multiplier_median)}`}>
                          <span className={cn("font-semibold", (it.multiplier ?? 0) >= 2 && "text-warning")}>{multiple(it.multiplier)}</span>
                        </Tip>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{usd(it.open_interest_usd)}</TableCell>
                      <TableCell>
                        <Badge variant={volumeBandTone(it.band)}>{it.band ?? "unknown"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-[10px] text-muted-foreground">Sparkline: last 7 settled days of notional; the hairline is the 30-day mean. Perps listed under 7 days report no multiplier.</p>
            </div>
          );
        }}
      </Panel>
      <VolumeDetail symbol={picked?.symbol ?? null} item={picked} onClose={() => setPicked(null)} />
    </div>
  );
}

function SortHead({
  col,
  sort,
  onSort,
}: {
  col: (typeof COLUMNS)[number];
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === col.key;
  const Icon = active ? (sort.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead className={col.align === "right" ? "text-right" : undefined} aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(col.key)} title={col.hint} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {col.label}
        <Icon className="size-3" aria-hidden />
      </button>
    </TableHead>
  );
}
