"use client";

import type { CoinDepthSnapshot } from "@cqd/schemas";
import { useEffect, useMemo, useState } from "react";
import { Freshness, Panel, PanelBody, SecHead } from "@/components/panel";
import { depthSlice, ladderSlice } from "@/cq/adapters";
import { Depth3DView, GaugeView, LadderView, Pulse } from "@/cq/react";
import { A, C, fmt, REG, regCode } from "@/cq/theme";
import type { LadderSlice } from "@/cq/types";
import { SearchInput } from "@/features/market/perp-regimes-view";
import { humanize, num } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { useUi } from "@/lib/settings";
import { finite } from "@/lib/utils";

const CHIPS = ["BTC", "ETH", "SOL", "HYPE", "XRP", "SUI", "ZEC", "PUMP"];

const LIQ: Record<string, { label: string; c: string }> = {
  deep_book: { label: "Deep book", c: C.long },
  neutral: { label: "Neutral", c: "#8b98a9" },
  oi_price_divergence: { label: "OI/price divergence", c: C.amber },
  depth_withdrawal: { label: "Depth withdrawal", c: C.orange },
  post_cascade_impaired: { label: "Post-cascade", c: C.short },
};
const liqOf = (r: string | null | undefined) => LIQ[r ?? ""] ?? { label: humanize(r ?? "—"), c: "#8b98a9" };

function band(s: CoinDepthSnapshot, side: "bid" | "ask", b: string): number | null {
  const v = s.depth_usd?.[side]?.[b];
  return typeof v === "number" ? v : null;
}
function sat(s: CoinDepthSnapshot, b: string): boolean {
  const t = s.levels_truncated as Record<string, Record<string, boolean>> | null | undefined;
  return Boolean(t?.bid?.[b] || t?.ask?.[b]);
}
const both = (s: CoinDepthSnapshot, b: string) => {
  const x = band(s, "bid", b);
  const y = band(s, "ask", b);
  return x === null && y === null ? null : (x ?? 0) + (y ?? 0);
};

function useLookups() {
  const liq = useDataset("liquidity-regime");
  const risk = useDataset("quant-coins-risk");
  const depth = useDataset("liquidity-depth");
  return useMemo(
    () => ({
      liqBy: new Map((liq.data?.data?.coins ?? []).map((c) => [c.coin, c])),
      hmmBy: new Map((risk.data?.data?.items ?? []).map((c) => [c.symbol, c])),
      depthBy: new Map((depth.data?.data?.coins ?? []).map((c) => [c.coin, c])),
    }),
    [liq.data, risk.data, depth.data],
  );
}

function LadderCard({ coin, imb, hmmColor }: { coin: string; imb: number | null; hmmColor: string }) {
  const ui = useUi();
  const q = useDataset("l2-book", { param: coin, paused: !ui.live });
  const [ladder, setLadder] = useState<LadderSlice | null>(null);
  const book = q.data?.data ?? null;
  useEffect(() => {
    setLadder((prev) => ladderSlice(book, prev, imb));
  }, [book, imb]);
  const mid = ladder ? (ladder.asks[0]!.p + ladder.bids[0]!.p) / 2 : null;
  return (
    <section className="cq-card flex flex-col" style={{ flex: "0 1 380px", minWidth: 300, padding: "16px 16px 12px" }}>
      <div className="flex items-start justify-between" style={{ gap: 10, marginBottom: 10 }}>
        <div className="flex min-w-0 items-center" style={{ gap: 12 }}>
          <div className="relative flex flex-none items-center justify-center" style={{ width: 42, height: 42, borderRadius: "50%", background: A(hmmColor, 0.1), border: `1px solid ${A(hmmColor, 0.4)}`, boxShadow: `0 0 24px -6px ${hmmColor}` }}>
            <span className="cq-mono" style={{ fontSize: 13, fontWeight: 600, color: hmmColor }}>
              {coin.slice(0, 3)}
            </span>
            <div aria-hidden style={{ position: "absolute", left: 5, top: 5, width: 30, height: 30, borderRadius: "50%", backgroundImage: `url(https://app.hyperliquid.xyz/coins/${encodeURIComponent(coin)}.svg)`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline" style={{ gap: 9 }}>
              <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1 }}>{coin}</span>
              <span className="cq-mono" style={{ fontSize: 13, color: "#c9d3df" }}>
                {fmt.px(mid)}
              </span>
            </div>
            <div className="cq-mono" style={{ fontSize: 10.5, color: "#4f5b6a", marginTop: 5 }}>
              L2 ladder · /hyperliquid/l2-book
            </div>
          </div>
        </div>
        {q.data?.demo ? (
          <Freshness env={q.data} />
        ) : ui.live ? (
          <span className="cq-mono flex items-center" style={{ gap: 6, fontSize: 10, color: C.long }}>
            <Pulse color={C.long} />
            live
          </span>
        ) : (
          <span className="cq-mono" style={{ fontSize: 10, color: "#5b6878" }}>
            paused
          </span>
        )}
      </div>
      <div style={{ height: 580, position: "relative" }}>
        {ladder ? (
          <LadderView ladder={ladder} label={`${coin} order book, 12 levels a side`} />
        ) : (
          <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={580}>
            {() => <div style={{ fontSize: 12, color: "#5b6878" }}>Empty book.</div>}
          </PanelBody>
        )}
      </div>
    </section>
  );
}

function TerrainCard({ coin }: { coin: string }) {
  const q = useDataset("depth-history", { param: coin });
  const t = useMemo(() => depthSlice(q.data?.data, coin), [q.data, coin]);
  return (
    <section className="cq-card flex min-w-0 flex-col" style={{ flex: "1 1 560px", padding: "16px 18px" }}>
      <SecHead title={`Liquidity terrain ±50 bps · last 6h · ${coin}`} mb={12} right={<Freshness env={q.data} />} />
      <div className="cq-stage flex-1" style={{ minHeight: 500 }}>
        <div className="absolute inset-0" style={{ padding: t.slice.cols.length ? 0 : 14 }}>
          <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight="100%" fill>
            {() =>
              t.slice.cols.length ? (
                <Depth3DView data={t.slice} label={`${coin} depth within 50 bps of mid over the last 6 hours`} />
              ) : (
                <div className="flex h-full items-center justify-center" style={{ fontSize: 12, color: "#5b6878" }}>
                  No depth snapshots in the window yet.
                </div>
              )
            }
          </PanelBody>
        </div>
        <div className="cq-mono flex" style={{ position: "absolute", left: 14, top: 12, gap: 16, fontSize: 10.5, pointerEvents: "none" }}>
          <span style={{ color: C.long }}>
            Bid depth 25 bps <b style={{ color: "#e6edf5" }}>{fmt.usd(t.bid25)}</b>
          </span>
          <span style={{ color: C.short }}>
            Ask depth 25 bps <b style={{ color: "#e6edf5" }}>{fmt.usd(t.ask25)}</b>
          </span>
        </div>
        <div className="cq-stage-hint">height = depth (compressed) · live edge streams in at right · drag to orbit</div>
      </div>
      {t.slice.sat ? (
        <div className="flex items-start" style={{ gap: 8, marginTop: 12, fontSize: 11.5, color: C.amber, lineHeight: 1.5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" style={{ flex: "none", marginTop: 2 }} aria-hidden>
            <path d="M12 3 2 21h20L12 3zM12 10v5M12 18h.01" />
          </svg>
          <span style={{ textWrap: "pretty" }}>Bands beyond 10 bps are saturated: Hyperliquid returns ~20 levels, which fit inside 10 bps on this book, so outer depth is a lower bound (flat slate area).</span>
        </div>
      ) : null}
    </section>
  );
}

const COLS = "0.7fr 0.9fr 0.7fr 0.9fr 0.9fr 0.9fr 1.3fr 0.8fr 1.2fr 0.7fr";

function DepthTable({ focus, onFocus }: { focus: string; onFocus: (c: string) => void }) {
  const q = useDataset("liquidity-depth");
  const { liqBy, hmmBy } = useLookups();
  const [search, setSearch] = useState("");
  return (
    <Panel title="Depth across the top 25 perps" dataset="liquidity-depth" env={q.data} isLoading={q.isLoading} skeletonHeight={420} mb={12}>
      {(d) => {
        const query = search.trim().toUpperCase();
        const rows = d.coins.filter((c) => !query || c.coin.toUpperCase().includes(query));
        return (
          <>
            <div className="flex flex-wrap items-center" style={{ gap: 12, marginBottom: 12 }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Find coin" upper label="Find coin" />
              <span className="cq-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "#5b6878" }}>
                {rows.length} of {d.coins.length} books · click a row to focus
              </span>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 1020 }}>
                <div className="cq-th" style={{ gridTemplateColumns: COLS, textAlign: "right" }}>
                  <span style={{ textAlign: "left" }}>COIN</span>
                  <span>MID</span>
                  <span>SPREAD BPS</span>
                  <span>±10 BPS</span>
                  <span>±25 BPS</span>
                  <span>±100 BPS</span>
                  <span style={{ textAlign: "center" }}>IMBALANCE 10 BPS</span>
                  <span>OI</span>
                  <span style={{ textAlign: "left", paddingLeft: 10 }}>LIQUIDITY</span>
                  <span style={{ textAlign: "left" }}>HMM</span>
                </div>
                {rows.map((b) => {
                  const on = b.coin === focus;
                  const imb = finite(b.imbalance_10bps) ?? 0;
                  const ic = imb >= 0 ? C.long : C.short;
                  const iw = Math.min(50, Math.abs(imb) * 80);
                  const lq = liqOf(liqBy.get(b.coin)?.regime);
                  const h = hmmBy.get(b.coin);
                  const code = regCode(h?.regime?.label);
                  const hc = code ? REG[code].color : "#5b6878";
                  return (
                    <button key={b.coin} type="button" className="cq-tr relative" style={{ gridTemplateColumns: COLS, background: on ? "rgba(76,155,255,0.08)" : undefined }} onClick={() => onFocus(b.coin)} aria-pressed={on}>
                      <span style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 2, background: on ? C.blue : "transparent" }} />
                      <span style={{ textAlign: "left", fontWeight: 600, fontFamily: "var(--font-sans)", fontSize: 12.5 }}>{b.coin}</span>
                      <span>{fmt.px(b.mid_price)}</span>
                      <span style={{ color: "#9aa8b8" }}>{num(b.spread_bps, 2)}</span>
                      {(["10bps", "25bps", "100bps"] as const).map((k) => (
                        <span key={k} title={sat(b, k) ? "The ~20 returned levels sat inside this band, so the true depth is at least this much." : undefined}>
                          {sat(b, k) ? "≥" : ""}
                          {fmt.usd(both(b, k))}
                        </span>
                      ))}
                      <div className="flex items-center justify-center" style={{ gap: 8 }}>
                        <div style={{ position: "relative", width: 110, height: 6, background: "#121922", borderRadius: 3 }}>
                          <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 1, background: "#3a4553" }} />
                          <div style={{ position: "absolute", top: 0, bottom: 0, left: imb >= 0 ? "50%" : `${50 - iw}%`, width: `${iw}%`, background: ic, borderRadius: 3 }} />
                        </div>
                        <span style={{ color: ic, width: 40, textAlign: "right", fontSize: 10.5 }}>
                          {imb > 0 ? "+" : ""}
                          {imb.toFixed(2)}
                        </span>
                      </div>
                      <span style={{ color: "#9aa8b8" }}>{fmt.usd(b.open_interest_usd)}</span>
                      <span style={{ textAlign: "left", paddingLeft: 10 }}>
                        <span style={{ fontSize: 10, color: lq.c, background: A(lq.c, 0.1), border: `1px solid ${A(lq.c, 0.4)}`, padding: "1px 7px", borderRadius: 5, whiteSpace: "nowrap" }}>{lq.label}</span>
                      </span>
                      <span className="flex items-center" style={{ textAlign: "left", gap: 6, fontSize: 10.5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: hc, boxShadow: `0 0 6px ${hc}` }} />
                        {code ?? "—"}
                      </span>
                    </button>
                  );
                })}
                {rows.length === 0 ? <div style={{ padding: 28, textAlign: "center", fontSize: 12, color: "#5b6878" }}>No books match this search.</div> : null}
              </div>
            </div>
            <div className="cq-note">Depth is bid plus ask USD within the band. Click a row to focus its live ladder and terrain. Each book carries its HMM regime from the Market Regimes model as corroboration.</div>
          </>
        );
      }}
    </Panel>
  );
}

function OiDivergence() {
  const q = useDataset("oi-divergence");
  return (
    <Panel title="OI vs price divergence" dataset="oi-divergence" env={q.data} isLoading={q.isLoading} skeletonHeight={300} style={{ flex: "2 1 560px" }}>
      {(d) => {
        const rows = [...d.rows].sort((a, b) => (b.divergence_4h ?? -Infinity) - (a.divergence_4h ?? -Infinity));
        const maxAbs = Math.max(...rows.map((r) => Math.abs(r.divergence_4h ?? 0)), 0.01);
        const fragile = rows.filter((r) => (r.divergence_4h ?? 0) > 0 && (r.oi_change_4h_pct ?? 0) > 0).slice(0, 3);
        const cols = "0.8fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 1.2fr 0.8fr";
        const pc = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
        return (
          <>
            {fragile.length ? (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
                {fragile.map((r) => (
                  <div key={r.coin} className="cq-tile" style={{ padding: "10px 12px", borderColor: A(C.amber, 0.35), background: A(C.amber, 0.04) }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      <span style={{ color: C.amber }}>▲</span> {r.coin}: fragile positioning
                    </div>
                    <div className="cq-mono" style={{ fontSize: 10.5, color: "#8b98a9", marginTop: 4 }}>
                      OI {pc(r.oi_change_4h_pct)} vs price {pc(r.price_change_4h_pct)} over 4h · div {num(r.divergence_4h, 2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <div style={{ minWidth: 760 }}>
                <div className="cq-th" style={{ gridTemplateColumns: cols, textAlign: "right" }}>
                  <span style={{ textAlign: "left" }}>COIN</span>
                  <span>PX 1H</span>
                  <span>OI 1H</span>
                  <span>PX 4H</span>
                  <span>OI 4H</span>
                  <span>PX 24H</span>
                  <span>OI 24H</span>
                  <span style={{ textAlign: "center" }}>DIVERGENCE 4H</span>
                  <span>OI</span>
                </div>
                {rows.map((r) => {
                  const v = r.divergence_4h ?? 0;
                  const w = Math.min(50, (Math.abs(v) / maxAbs) * 50);
                  const col = v >= 0 ? C.orange : C.blue;
                  return (
                    <div key={r.coin} className="cq-tr" style={{ gridTemplateColumns: cols }}>
                      <span style={{ textAlign: "left", fontWeight: 600, fontFamily: "var(--font-sans)", fontSize: 12.5 }}>{r.coin}</span>
                      <span style={{ color: "#9aa8b8" }}>{pc(r.price_change_1h_pct)}</span>
                      <span>{pc(r.oi_change_1h_pct)}</span>
                      <span style={{ color: "#9aa8b8" }}>{pc(r.price_change_4h_pct)}</span>
                      <span>{pc(r.oi_change_4h_pct)}</span>
                      <span style={{ color: "#9aa8b8" }}>{pc(r.price_change_24h_pct)}</span>
                      <span>{pc(r.oi_change_24h_pct)}</span>
                      <div className="flex items-center justify-center" style={{ gap: 8 }}>
                        <div style={{ position: "relative", width: 90, height: 6, background: "#121922", borderRadius: 3 }}>
                          <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 1, background: "#3a4553" }} />
                          <div style={{ position: "absolute", top: 0, bottom: 0, left: v >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: col, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 40, textAlign: "right", fontSize: 10.5, color: col }}>{num(v, 2)}</span>
                      </div>
                      <span style={{ color: "#9aa8b8" }}>{fmt.usd(r.open_interest_usd)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="cq-note">Ranked by 4h divergence. Positive (orange) means open interest is growing faster than price: positioning is being added without follow-through.</div>
          </>
        );
      }}
    </Panel>
  );
}

function LiquidityRegime() {
  const q = useDataset("liquidity-regime");
  return (
    <Panel title="Liquidity regime" dataset="liquidity-regime" env={q.data} isLoading={q.isLoading} skeletonHeight={220} style={{ flex: "1 1 320px" }}>
      {(d) => {
        const keys = ["deep_book", "neutral", "oi_price_divergence", "depth_withdrawal", "post_cascade_impaired"] as const;
        const total = keys.reduce((s, k) => s + (d.aggregate[k] ?? 0), 0) || 1;
        return (
          <div className="flex flex-wrap items-center" style={{ gap: 20 }}>
            <div className="flex flex-col items-center" style={{ gap: 6, flex: "0 0 150px" }}>
              <div style={{ width: 150, height: 120 }}>
                <GaugeView value={d.composite_score} color={C.blue} label={`Liquidity composite ${d.composite_score} of 100`} />
              </div>
              <div style={{ fontSize: 11.5, color: "#9aa8b8" }}>Composite (higher = healthier)</div>
              <span className="cq-mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", color: C.blue, background: A(C.blue, 0.1), border: `1px solid ${A(C.blue, 0.4)}`, padding: "2px 8px", borderRadius: 5 }}>
                {d.sentiment.toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
              <div className="flex" style={{ gap: 3, height: 8 }}>
                {keys.map((k) => ((d.aggregate[k] ?? 0) > 0 ? <div key={k} style={{ flex: `${d.aggregate[k]} 1 0%`, background: liqOf(k).c, borderRadius: 3 }} /> : null))}
              </div>
              <div className="flex flex-col" style={{ gap: 6, marginTop: 12 }}>
                {keys.map((k) => (
                  <div key={k} className="flex items-center" style={{ gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: liqOf(k).c }} />
                    <span style={{ flex: 1, color: "#9aa8b8" }}>{liqOf(k).label}</span>
                    <span className="cq-mono" style={{ fontWeight: 600 }}>
                      {d.aggregate[k] ?? 0}
                    </span>
                    <span className="cq-mono" style={{ fontSize: 10.5, color: "#5b6878", width: 34, textAlign: "right" }}>
                      {Math.round(((d.aggregate[k] ?? 0) / total) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </Panel>
  );
}

export function BooksView() {
  const ui = useUi();
  const [focus, setFocus] = useState(ui.focus || "BTC");
  const { liqBy, hmmBy, depthBy } = useLookups();
  const h = hmmBy.get(focus);
  const code = regCode(h?.regime?.label);
  const hc = code ? REG[code].color : "#5b6878";
  const lq = liqOf(liqBy.get(focus)?.regime);
  const row = depthBy.get(focus);
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex flex-wrap items-center" style={{ gap: 10, fontSize: 12, color: "#8b98a9" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
        </svg>
        <span>Focused</span>
        <b style={{ color: "#e6edf5", fontSize: 14 }}>{focus}</b>
        {code ? (
          <span className="cq-mono flex items-center" style={{ gap: 6, fontSize: 10.5, color: hc, background: A(hc, 0.1), border: `1px solid ${A(hc, 0.4)}`, padding: "2px 8px", borderRadius: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: hc }} />
            HMM {code} · {Math.round((h?.regime?.confidence ?? 0) * 100)}%
          </span>
        ) : null}
        <span className="cq-mono" style={{ fontSize: 10.5, color: "#c9d3df", border: "1px solid #1c2531", padding: "2px 8px", borderRadius: 6 }}>
          Liquidity: {lq.label}
        </span>
        {row ? (
          <span className="cq-mono" style={{ fontSize: 10.5, color: "#c9d3df", border: "1px solid #1c2531", padding: "2px 8px", borderRadius: 6 }}>
            mid {fmt.px(row.mid_price)} · spread {num(row.spread_bps, 2)} bps
          </span>
        ) : null}
        <div className="flex flex-wrap" style={{ gap: 4, marginLeft: "auto" }}>
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === focus}
              onClick={() => setFocus(c)}
              className="cq-mono"
              style={{ padding: "4px 9px", background: c === focus ? "#1a2230" : "transparent", border: `1px solid ${c === focus ? "#2f3d50" : "#1c2531"}`, borderRadius: 6, color: c === focus ? "#eef3f8" : "#8b98a9", cursor: "pointer", fontSize: 10.5 }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap" style={{ gap: 16 }}>
        <LadderCard key={focus} coin={focus} imb={finite(row?.imbalance_10bps)} hmmColor={hc} />
        <TerrainCard coin={focus} />
      </div>
      <DepthTable focus={focus} onFocus={setFocus} />
      <div className="flex flex-wrap" style={{ gap: 16 }}>
        <OiDivergence />
        <LiquidityRegime />
      </div>
      <div style={{ fontSize: 11, color: "#4f5b6a" }}>The ladder and terrain poll only while this page is open; turning the live feed off in Settings pauses the ladder.</div>
    </div>
  );
}
