"use client";

import type { QuantCoinRisk } from "@cqd/schemas";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/panel";
import { regimeCoins } from "@/cq/adapters";
import { A, REG, REG_ORDER } from "@/cq/theme";
import { useDataset } from "@/lib/hooks";
import { CoinDrawer } from "./coin-drawer";

const SEARCH_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5b6878" strokeWidth="2" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
);

export function SearchInput({ value, onChange, placeholder, width = 160, upper = false, label }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number; upper?: boolean; label: string }) {
  return (
    <div className="relative">
      {SEARCH_ICON}
      <input className="cq-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} style={{ width, paddingLeft: 30, textTransform: upper ? "uppercase" : undefined }} />
    </div>
  );
}

export function PerpRegimesView() {
  const params = useSearchParams();
  const q = useDataset("quant-coins-risk");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [minConf, setMinConf] = useState("0");
  const [hide, setHide] = useState(true);
  const [picked, setPicked] = useState<QuantCoinRisk | null>(null);
  useEffect(() => {
    const p = params.get("q");
    if (p) setSearch(p);
  }, [params]);

  const all = useMemo(() => regimeCoins(q.data?.data, { includeWarming: true }), [q.data]);

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <Panel title="Quant Regime Grid · every hyperliquid perp" dataset="quant-coins-risk" env={q.data} isLoading={q.isLoading} skeletonHeight={420}>
        {(d) => {
          const query = search.trim().toUpperCase();
          const rmin = Number(minConf) || 0;
          const shown = all.filter((c) => !hide || !c.warming);
          const tot = shown.length || 1;
          const groups = REG_ORDER.map((code) => {
            const col = REG[code].color;
            const members = shown.filter((c) => c.code === code);
            const tiles = members.filter((c) => c.conf >= rmin);
            return { code, col, members, tiles };
          });
          const grid = [...groups].sort((a, b) => (a.tiles.length ? 0 : 1) - (b.tiles.length ? 0 : 1));
          const byCoin = new Map(d.items.map((i) => [i.symbol, i]));
          return (
            <>
              <div className="flex flex-wrap items-center" style={{ gap: 12, marginBottom: 14 }}>
                <SearchInput value={search} onChange={setSearch} placeholder="Find coin" label="Find coin" />
                <label className="cq-field">
                  Min confidence
                  <select className="cq-select" value={minConf} onChange={(e) => setMinConf(e.target.value)}>
                    <option value="0">Any</option>
                    <option value="50">50%+</option>
                    <option value="75">75%+</option>
                    <option value="90">90%+</option>
                  </select>
                </label>
                <label className="cq-field cursor-pointer">
                  <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} style={{ accentColor: "#4c9bff" }} />
                  Hide warming / new listings
                </label>
                {query ? (
                  <button type="button" className="cq-btn" onClick={() => setSearch("")}>
                    Clear
                  </button>
                ) : null}
                <span className="cq-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "#5b6878" }}>
                  {shown.length} of {d.count} perps · universe {d.universe_size} · horizon {d.horizon}
                </span>
              </div>
              <div className="flex" style={{ gap: 2, height: 6, marginBottom: 18 }} role="img" aria-label="Share of perps in each regime">
                {groups.map((g) => (g.members.length ? <div key={g.code} style={{ flex: `${g.members.length} 1 0%`, background: g.col, borderRadius: 2, boxShadow: `0 0 10px ${A(g.col, 0.4)}` }} /> : null))}
              </div>
              <div className="grid items-start" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 480px), 1fr))", gap: 14 }}>
                {grid.map((g) => {
                  return (
                    <div key={g.code} className="min-w-0" style={{ background: "#0a0e13", border: "1px solid #151c26", borderRadius: 12, padding: 14 }}>
                      <div className="flex items-center" style={{ gap: 9, marginBottom: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.col, boxShadow: `0 0 10px ${g.col}` }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{REG[g.code].label}</span>
                        <span className="cq-mono" style={{ fontSize: 9.5, color: "#8b98a9", border: "1px solid #1c2531", padding: "1px 6px", borderRadius: 4 }}>
                          {g.code}
                        </span>
                        <span className="cq-mono" style={{ marginLeft: "auto", fontSize: 11, color: "#8b98a9" }}>
                          {g.members.length} · {Math.round((g.members.length / tot) * 100)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap" style={{ gap: 5 }}>
                        {g.tiles.map((c) => {
                          const hit = !!query && c.coin.toUpperCase().includes(query);
                          return (
                            <button
                              key={c.coin}
                              type="button"
                              onClick={() => setPicked(byCoin.get(c.coin) ?? null)}
                              title={`${c.coin}: ${REG[c.code].label}, confidence ${c.conf}%${c.warming ? " (warming / new listing)" : ""}`}
                              className="relative overflow-hidden text-left"
                              style={{
                                flex: "1 0 76px",
                                maxWidth: 120,
                                padding: "7px 8px 9px",
                                background: A(g.col, 0.05 + (c.conf / 100) * 0.18),
                                border: `1px ${c.warming ? "dashed" : "solid"} ${hit ? "#ffffff" : A(g.col, 0.18 + (c.conf / 100) * 0.3)}`,
                                borderRadius: 7,
                                opacity: query && !hit ? 0.22 : 1,
                                boxShadow: hit ? `0 0 0 1px #fff, 0 0 22px ${A(g.col, 0.7)}` : "none",
                                transition: "opacity .25s, box-shadow .25s",
                                color: "#e6edf5",
                                cursor: "pointer",
                              }}
                            >
                              <div className="truncate" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.01em" }}>
                                {c.coin}
                              </div>
                              <div className="cq-mono" style={{ fontSize: 10, color: "#9aa8b8", marginTop: 3 }}>
                                {c.conf}%
                              </div>
                              <div style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: `${c.conf}%`, background: g.col }} />
                            </button>
                          );
                        })}
                        {g.tiles.length === 0 ? <div style={{ fontSize: 12, color: "#5b6878", padding: "6px 0" }}>No perps in this regime.</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="cq-note">Tiles are grouped by regime and shaded by confidence; dashed tiles are warming up or newly listed. Click a tile for the coin drawer.</div>
            </>
          );
        }}
      </Panel>
      <CoinDrawer symbol={picked?.symbol ?? null} risk={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
