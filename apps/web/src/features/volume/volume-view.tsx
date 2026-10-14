"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Freshness, Panel, PanelBody, SecHead } from "@/components/panel";
import { bubbleRows, volRows } from "@/cq/adapters";
import { Bubbles3DView, SparkView } from "@/cq/react";
import { A, BAND, bandColor, C, fmt } from "@/cq/theme";
import type { VolRow } from "@/cq/types";
import { SearchInput } from "@/features/market/perp-regimes-view";
import { fundingHourly } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { toMs } from "@/lib/utils";

const BANDS = ["extreme", "surging", "elevated", "normal", "quiet"] as const;
type SortKey = "coin" | "price" | "chg" | "n24" | "dDay" | "mean" | "med" | "mult" | "oi";
const COLS = "0.9fr 0.9fr 0.7fr 0.9fr 0.8fr 1.1fr 0.9fr 0.9fr 1.4fr 0.8fr 0.8fr";

function Detail({ row }: { row: VolRow }) {
  const q = useDataset("volume-detail", { param: row.coin });
  const bc = bandColor(row.band);
  return (
    <div className="flex flex-wrap" style={{ gap: 20, padding: "14px 16px 18px", background: "#080b10", borderBottom: "1px solid #131a23" }}>
      <div className="min-w-0" style={{ flex: "1 1 520px" }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 8, gap: 8 }}>
          <span className="cq-kicker">30-DAY DAILY NOTIONAL · {row.coin}</span>
          <Freshness env={q.data} />
        </div>
        <div style={{ height: 120 }}>
          <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={120} compact>
            {(d) => {
              const hist = [...(d.history ?? [])].sort((a, b) => (toMs(a.date) ?? 0) - (toMs(b.date) ?? 0));
              const vals = hist.map((h) => h.notional).filter((v): v is number => typeof v === "number");
              return vals.length >= 2 ? (
                <SparkView values={vals} mode="bars" mean={d.avg_volume_30d ?? undefined} color={bc} label={`${row.coin} daily notional, ${vals.length} days`} />
              ) : (
                <div style={{ fontSize: 12, color: "#5b6878" }}>No daily history yet.</div>
              );
            }}
          </PanelBody>
        </div>
      </div>
      <div className="grid content-start" style={{ flex: "0 1 220px", gridTemplateColumns: "1fr auto", gap: "8px 14px", fontSize: 12 }}>
        <span style={{ color: "#8b98a9" }}>Multiplier</span>
        <span className="cq-mono" style={{ color: (row.mult ?? 0) >= 2 ? bc : "#e6edf5", fontWeight: 600 }}>
          {row.mult !== null ? `${row.mult.toFixed(2)}×` : "—"}
        </span>
        <span style={{ color: "#8b98a9" }}>24h notional</span>
        <span className="cq-mono">{fmt.usd(row.n24)}</span>
        <span style={{ color: "#8b98a9" }}>30d mean</span>
        <span className="cq-mono">{fmt.usd(row.mean)}</span>
        <span style={{ color: "#8b98a9" }}>30d median</span>
        <span className="cq-mono">{fmt.usd(row.med)}</span>
        <span style={{ color: "#8b98a9" }}>Open interest</span>
        <span className="cq-mono">{fmt.usd(row.oi)}</span>
        {q.data?.data ? (
          <>
            <span style={{ color: "#8b98a9" }}>Funding</span>
            <span className="cq-mono">{fundingHourly(q.data.data.funding_rate)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function VolumeView() {
  const params = useSearchParams();
  const q = useDataset("volume-scanner");
  const [search, setSearch] = useState("");
  const [band, setBand] = useState("All bands");
  const [vmin, setVmin] = useState("0");
  const [sort, setSort] = useState<SortKey>("mult");
  const [dir, setDir] = useState(-1);
  const [open, setOpen] = useState(params.get("open")?.toUpperCase() ?? "");
  useEffect(() => {
    const onVol = (e: Event) => {
      const coin = String((e as CustomEvent).detail ?? "");
      setOpen((o) => (o === coin ? "" : coin));
    };
    window.addEventListener("cq:vol", onVol);
    return () => window.removeEventListener("cq:vol", onVol);
  }, []);

  const rows = useMemo(() => volRows(q.data?.data), [q.data]);
  const bubbles = useMemo(() => ({ rows: bubbleRows(rows), band, sel: open }), [rows, band, open]);
  const d = q.data?.data;
  const rated = rows.filter((r) => r.mult !== null);
  const top = [...rated].sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0))[0];
  const stats = d
    ? [
        { k: "Total 24h notional", v: fmt.usd(d.total_volume_24h), s: `${d.count} perps, ${d.rated_size} with a baseline` },
        { k: "Market multiplier", v: d.market_multiplier != null ? `${d.market_multiplier.toFixed(2)}×` : "—", s: "Universe 24h vs 30-day mean" },
        { k: "At 2× or more", v: String(rated.filter((r) => (r.mult ?? 0) >= 2).length), s: "Perps trading 2× their 30d mean" },
        { k: "Surging or extreme", v: String(d.surging_count ?? rows.filter((r) => r.band === "surging" || r.band === "extreme").length), s: "CDA band count" },
        { k: "Most active vs normal", v: top ? `${top.coin} ${(top.mult ?? 0).toFixed(1)}×` : "—", s: top ? `${fmt.usd(top.n24)} vs ${fmt.usd(top.mean)} mean` : "" },
      ]
    : [];

  const query = search.trim().toUpperCase();
  const min = Number(vmin) || 0;
  const shown = rows
    .filter((r) => (!query || r.coin.toUpperCase().includes(query)) && (band === "All bands" || r.band === band) && (r.mult ?? 0) >= min)
    .sort((a, b) => {
      const x = a[sort];
      const y = b[sort];
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y)) * dir;
      return ((x ?? -Infinity) - (y ?? -Infinity)) * dir;
    });
  const arrow = (k: SortKey) => (sort === k ? (dir < 0 ? "↓" : "↑") : "↕");
  const sortBy = (k: SortKey) => () => {
    setDir((d0) => (sort === k ? -d0 : -1));
    setSort(k);
  };
  const head = (k: SortKey, label: string, left = false) => (
    <button type="button" className="cq-sort" onClick={sortBy(k)} style={{ textAlign: left ? "left" : "right", color: k === "mult" ? "#c9d3df" : undefined }} aria-label={`Sort by ${label.toLowerCase()}`}>
      {label} {arrow(k)}
    </button>
  );

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {stats.length
          ? stats.map((s) => (
              <div key={s.k} className="min-w-0" style={{ background: "#0b0f14", border: "1px solid #17202b", borderRadius: 12, padding: "14px 16px" }}>
                <div className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b6878" }}>
                  {s.k}
                </div>
                <div className="cq-mono truncate" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6 }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 11, color: "#5b6878", marginTop: 3 }}>{s.s}</div>
              </div>
            ))
          : null}
      </div>
      <section className="cq-card cq-sec">
        <SecHead
          title="Volume anomaly field"
          sub={
            <span style={{ display: "block", maxWidth: 620 }}>
              Each sphere is a perp: across = 24h price change, height = multiplier vs its 30-day mean, depth = open interest, size = 24h notional (log). Anything floating above the orange plane trades 2× normal.
            </span>
          }
          mb={12}
          right={
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {BANDS.map((b) => {
                const c = BAND[b]!.c;
                const on = band === b;
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBand((x) => (x === b ? "All bands" : b))}
                    className="cq-mono flex items-center"
                    style={{ gap: 6, padding: "5px 10px", background: on ? A(c, 0.15) : "transparent", border: `1px solid ${on ? c : "#1c2531"}`, borderRadius: 7, cursor: "pointer", fontSize: 10.5, color: "#c9d3df" }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
                    {b}
                    <span style={{ color: "#5b6878" }}>{rows.filter((r) => r.band === b).length}</span>
                  </button>
                );
              })}
            </div>
          }
        />
        <div className="cq-stage" style={{ height: "clamp(480px, 62vh, 680px)" }}>
          <div className="absolute inset-0" style={{ padding: q.data?.data ? 0 : 14 }}>
            <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight="100%" fill>
              {() => <Bubbles3DView data={bubbles} label="Volume anomaly field: every perp by price change, multiplier and open interest" />}
            </PanelBody>
          </div>
          <div className="cq-stage-hint">drag to orbit · hover a sphere · click for its 30-day series</div>
        </div>
      </section>
      <Panel title="Volume scanner · every Hyperliquid perp" dataset="volume-scanner" env={q.data} isLoading={q.isLoading} skeletonHeight={420}>
        {() => (
          <>
            <div className="flex flex-wrap items-center" style={{ gap: 12, marginBottom: 12 }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Find perp" width={150} upper label="Find perp" />
              <label className="cq-field">
                Band
                <select className="cq-select" value={band} onChange={(e) => setBand(e.target.value)}>
                  <option>All bands</option>
                  {BANDS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="cq-field">
                Min multiplier
                <select className="cq-select" value={vmin} onChange={(e) => setVmin(e.target.value)}>
                  <option value="0">Any</option>
                  <option value="1">1×</option>
                  <option value="1.5">1.5×</option>
                  <option value="2">2×</option>
                  <option value="5">5×</option>
                </select>
              </label>
              <span className="cq-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "#5b6878" }}>
                {shown.length} shown · click a row or bubble for the 30-day series
              </span>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 1080 }}>
                <div className="cq-th" style={{ gridTemplateColumns: COLS }}>
                  {head("coin", "PERP", true)}
                  {head("price", "PRICE")}
                  {head("chg", "24H PX")}
                  {head("n24", "24H NOTIONAL")}
                  {head("dDay", "VS LAST DAY")}
                  <span style={{ paddingLeft: 6 }}>7D NOTIONAL</span>
                  {head("mean", "30D MEAN")}
                  {head("med", "30D MEDIAN")}
                  {head("mult", "MULTIPLIER")}
                  {head("oi", "OI")}
                  <span style={{ paddingLeft: 8 }}>BAND</span>
                </div>
                {shown.map((r) => {
                  const bc = bandColor(r.band);
                  const isOpen = open === r.coin;
                  const m = r.mult ?? 0;
                  const multW = m > 0 ? Math.max(2, Math.min(100, (Math.log(m / 0.35) / Math.log(14 / 0.35)) * 100)) : 0;
                  return (
                    <div key={r.coin}>
                      <button type="button" className="cq-tr" style={{ gridTemplateColumns: COLS, background: isOpen ? "rgba(76,155,255,0.07)" : undefined }} onClick={() => setOpen((o) => (o === r.coin ? "" : r.coin))} aria-expanded={isOpen}>
                        <span style={{ textAlign: "left", fontWeight: 600, fontFamily: "var(--font-sans)", fontSize: 12.5 }}>{r.coin}</span>
                        <span>{fmt.px(r.price)}</span>
                        <span style={{ color: (r.chg ?? 0) >= 0 ? C.long : C.short }}>{fmt.pct(r.chg)}</span>
                        <span style={{ fontWeight: 600 }}>{fmt.usd(r.n24)}</span>
                        <span style={{ color: (r.dDay ?? 0) >= 0 ? C.long : C.short }}>{fmt.pct(r.dDay)}</span>
                        <div style={{ height: 24, paddingLeft: 6 }}>{r.s7.length >= 2 ? <SparkView values={r.s7} color={m >= 2 ? bc : "#4c9bff"} label={`${r.coin} 7-day notional`} /> : null}</div>
                        <span style={{ color: "#9aa8b8" }}>{fmt.usd(r.mean)}</span>
                        <span style={{ color: "#9aa8b8" }}>{fmt.usd(r.med)}</span>
                        <div className="flex items-center justify-end" style={{ gap: 8 }}>
                          <div style={{ flex: 1, maxWidth: 90, height: 4, background: "#121922", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${multW}%`, background: bc, borderRadius: 4 }} />
                          </div>
                          <span style={{ color: m >= 2 ? bc : "#e6edf5", fontWeight: 600, minWidth: 46 }}>{r.mult !== null ? `${r.mult.toFixed(2)}×` : "—"}</span>
                        </div>
                        <span style={{ color: "#9aa8b8" }}>{fmt.usd(r.oi)}</span>
                        <span style={{ textAlign: "left", paddingLeft: 8 }}>
                          <span style={{ fontSize: 10, color: bc, background: A(bc, 0.1), border: `1px solid ${A(bc, 0.4)}`, padding: "1px 7px", borderRadius: 5 }}>{r.band}</span>
                        </span>
                      </button>
                      {isOpen ? <Detail row={r} /> : null}
                    </div>
                  );
                })}
                {shown.length === 0 ? <div style={{ padding: 28, textAlign: "center", fontSize: 12, color: "#5b6878" }}>No perps match these filters.</div> : null}
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
