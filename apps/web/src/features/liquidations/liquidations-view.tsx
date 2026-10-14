"use client";

import type { LiquidationsResponse } from "@cqd/schemas";
import { useEffect, useMemo, useState } from "react";
import { Panel, SecHead } from "@/components/panel";
import { LiqStreamView, Pulse } from "@/cq/react";
import { A, C, fmt } from "@/cq/theme";
import type { TapeEvent } from "@/cq/types";
import { squeezeMessage } from "@/features/overview/overview-view";
import { JevCascadeDot } from "@/features/jev/jev-parts";
import { liquidationTotals } from "@/lib/derive";
import { useDataset, useNow, useWorkerStatus } from "@/lib/hooks";
import { useLiveTape } from "@/lib/live";
import { useUi } from "@/lib/settings";
import { finite } from "@/lib/utils";

function LiveChip({ live }: { live: boolean }) {
  const c = live ? C.long : "#8b98a9";
  return (
    <span className="cq-mono flex items-center" style={{ gap: 6, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", color: c, background: A(c, 0.08), border: `1px solid ${A(c, 0.35)}`, padding: "2px 7px", borderRadius: 5 }}>
      {live ? <Pulse color={C.long} /> : null}
      {live ? "LIVE" : "PAUSED"}
    </span>
  );
}

function TapeStats({ rows, rate }: { rows: TapeEvent[]; rate: number | null }) {
  let L = 0;
  let S = 0;
  for (const e of rows) {
    if (e.side === "L") L += e.size;
    else S += e.size;
  }
  return (
    <div className="cq-mono" style={{ textAlign: "right", fontSize: 10.5, color: "#8b98a9", lineHeight: 1.5 }}>
      {rows.length} buffered · {rate ?? "—"}/min all types
      <br />
      <span style={{ color: C.long }}>L {fmt.usd(L)}</span> · <span style={{ color: C.short }}>S {fmt.usd(S)}</span>
    </div>
  );
}

/** Tape filters shared by the 3D flow and the table: coin substring + minimum USD. */
function useTape(paused: boolean, coin: string, min: number) {
  const { tape } = useLiveTape();
  const [frozen, setFrozen] = useState<TapeEvent[] | null>(null);
  useEffect(() => {
    setFrozen(paused ? tape : null);
    // Freeze the tape as it was when Pause was pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
  const src = frozen ?? tape;
  const cf = coin.trim().toUpperCase();
  const filtered = useMemo(() => src.filter((e) => (!cf || cf === "ALL" || e.coin.toUpperCase().includes(cf)) && e.size >= min), [src, cf, min]);
  return { src, filtered };
}

function Flow({ coin, min, live, rate, rows, label }: { coin: string; min: number; live: boolean; rate: number | null; rows: TapeEvent[]; label: string }) {
  const { tape } = useLiveTape();
  const data = useMemo(() => ({ tape, coin, min }), [tape, coin, min]);
  return (
    <section className="cq-card cq-sec" style={{ flex: "1 1 100%" }}>
      <SecHead title="Liquidation flow · last 6 minutes" extra={<LiveChip live={live} />} path="/stream (type=liquidation) · every forced close as it prints" right={<TapeStats rows={rows} rate={rate} />} />
      <div className="cq-stage" style={{ height: "clamp(460px, 58vh, 660px)" }}>
        <LiqStreamView data={data} label={label} />
        <div className="cq-mono flex" style={{ position: "absolute", left: 14, top: 12, gap: 16, fontSize: 10.5, color: "#9aa8b8", pointerEvents: "none" }}>
          <span className="flex items-center" style={{ gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.long, boxShadow: `0 0 8px ${C.long}` }} />
            Long liq · forced sell
          </span>
          <span className="flex items-center" style={{ gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.short, boxShadow: `0 0 8px ${C.short}` }} />
            Short liq · forced buy
          </span>
        </div>
        <div className="cq-stage-hint">height = log size · coin and min-size filters on the tape apply here · drag to orbit</div>
      </div>
    </section>
  );
}

function Squeeze() {
  const q = useDataset("squeeze-alerts");
  return (
    <Panel title="Squeeze alerts" dataset="squeeze-alerts" env={q.data} isLoading={q.isLoading} skeletonHeight={70}>
      {(d) =>
        d.alerts.length === 0 ? (
          <div className="flex items-center" style={{ gap: 10, border: "1px dashed #222c39", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#8b98a9" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b6878" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l7-7" />
            </svg>
            {squeezeMessage(d)}
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 8 }}>
            {d.alerts.map((a) => {
              const up = a.long_liq_usd < a.short_liq_usd;
              const col = up ? C.short : C.long;
              return (
                <div key={`${a.symbol}-${a.direction}`} className="cq-tile" style={{ padding: "10px 12px", borderLeft: `3px solid ${a.triggered ? C.orange : "#2a3442"}` }}>
                  <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{a.symbol}</span>
                    <span className="cq-mono" style={{ fontSize: 10, color: a.triggered ? C.orange : "#8b98a9", border: `1px solid ${A(a.triggered ? C.orange : "#8b98a9", 0.4)}`, padding: "1px 7px", borderRadius: 5 }}>
                      {a.direction.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontSize: 11, color: "#8b98a9" }}>
                      liquidated: <span style={{ color: col }}>{up ? "shorts (S)" : "longs (L)"}</span>
                    </span>
                    {!a.triggered && a.suppressed_by?.length ? <span className="cq-mono" style={{ fontSize: 10, color: "#5b6878" }}>suppressed: {a.suppressed_by.join(", ")}</span> : null}
                    <JevCascadeDot symbol={a.symbol} direction={a.direction} />
                    <span className="cq-mono" style={{ marginLeft: "auto", fontWeight: 600 }}>
                      {fmt.usd(a.total_liq_usd)}
                    </span>
                  </div>
                  <div className="cq-mono flex flex-wrap" style={{ gap: "4px 16px", marginTop: 8, fontSize: 10.5, color: "#8b98a9" }}>
                    <span>
                      severity <b style={{ color: "#e6edf5" }}>{Math.round(a.severity * 100)}%</b>
                    </span>
                    <span>
                      spike <b style={{ color: "#e6edf5" }}>{a.spike_ratio != null ? `${a.spike_ratio.toFixed(1)}×` : "—"}</b>
                    </span>
                    <span>
                      asymmetry <b style={{ color: "#e6edf5" }}>{Math.round(a.asymmetry * 100)}%</b>
                    </span>
                    <span>
                      OI {a.oi_state ?? "n/a"} <b style={{ color: "#e6edf5" }}>{a.oi_change_pct != null ? `${a.oi_change_pct > 0 ? "+" : ""}${a.oi_change_pct.toFixed(1)}%` : "—"}</b>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </Panel>
  );
}

function Rolling() {
  const q = useDataset("liquidations");
  return (
    <Panel title="Rolling totals · all tracked coins" dataset="liquidations" env={q.data} isLoading={q.isLoading} skeletonHeight={110}>
      {(d) => (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {liquidationTotals(d).map((w) => {
              const t = w.long + w.short || 1;
              const lp = Math.round((w.long / t) * 100);
              return (
                <div key={w.window} style={{ background: "#0d1219", border: "1px solid #151c26", borderRadius: 11, padding: "13px 14px" }}>
                  <div className="flex items-baseline justify-between">
                    <span className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878", textTransform: "uppercase" }}>
                      Last {w.window}
                    </span>
                    <span className="cq-mono" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
                      {fmt.usd(w.total)}
                    </span>
                  </div>
                  <div className="cq-mono flex justify-between" style={{ gap: 6, fontSize: 10, margin: "10px 0 5px", whiteSpace: "nowrap" }}>
                    <span style={{ color: C.long }}>
                      L {fmt.usd(w.long)} · {lp}%
                    </span>
                    <span style={{ color: C.short }}>
                      {100 - lp}% · {fmt.usd(w.short)} S
                    </span>
                  </div>
                  <div className="flex" style={{ gap: 2, height: 6 }}>
                    <div style={{ width: `${lp}%`, minWidth: 2, background: C.long, borderRadius: "3px 0 0 3px", transition: "width .8s" }} />
                    <div style={{ flex: 1, background: C.short, borderRadius: "0 3px 3px 0" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cq-note">Each window is a trailing level from one response, summed across {d.data.length} coins; never summed across polls. Venues: {(d.coverage as { venues?: string[] } | undefined)?.venues?.join(", ") ?? "okx, bybit, hyperliquid"}. Binance geo-blocks its stream, so totals run under an all-exchange figure.</div>
        </>
      )}
    </Panel>
  );
}

interface HeatItem {
  coin: string;
  v: number;
  l: number;
  a: number;
}

function squarify(items: HeatItem[], W: number, H: number) {
  const out: Array<HeatItem & { x: number; y: number; w: number; h: number }> = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  const rest = items.slice();
  while (rest.length) {
    const short = Math.min(w, h);
    let row: HeatItem[] = [];
    let best = Infinity;
    while (rest.length) {
      const cand = row.concat([rest[0]!]);
      const s = cand.reduce((a, b) => a + b.a, 0);
      const mx = Math.max(...cand.map((c) => c.a));
      const mn = Math.min(...cand.map((c) => c.a));
      const worst = Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn));
      if (worst <= best) {
        best = worst;
        row = cand;
        rest.shift();
      } else break;
    }
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      row.forEach((r) => {
        const rh = r.a / cw;
        out.push({ ...r, x, y: cy, w: cw, h: rh });
        cy += rh;
      });
      x += cw;
      w -= cw;
    } else {
      const ch = s / w;
      let cx = x;
      row.forEach((r) => {
        const rw = r.a / ch;
        out.push({ ...r, x: cx, y, w: rw, h: ch });
        cx += rw;
      });
      y += ch;
      h -= ch;
    }
  }
  return out;
}

function heatItems(d: LiquidationsResponse): HeatItem[] {
  return d.data
    .map((r) => {
      const rr = r as Record<string, unknown>;
      const v = finite(rr.liquidation_usd_24h) ?? 0;
      const L = finite(rr.long_liquidation_usd_24h) ?? 0;
      const S = finite(rr.short_liquidation_usd_24h) ?? 0;
      return { coin: String(rr.symbol), v, l: L + S > 0 ? Math.round((L / (L + S)) * 100) : 50, a: 0 };
    })
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 24);
}

function Heatmap() {
  const q = useDataset("liquidations");
  return (
    <Panel title="Heatmap · top coins by 24h liquidations" dataset="liquidations" env={q.data} isLoading={q.isLoading} skeletonHeight={420}>
      {(d) => {
        const items = heatItems(d).map((h) => ({ ...h, a: Math.pow(h.v, 0.6) }));
        if (!items.length) return <div style={{ fontSize: 12, color: "#5b6878" }}>No liquidations in the last 24h.</div>;
        const VW = 240;
        const VH = 100;
        const sA = items.reduce((a, b) => a + b.a, 0);
        items.forEach((it) => {
          it.a = (it.a / sA) * VW * VH;
        });
        const hmax = items[0]!.v;
        const tiles = squarify(items, VW, VH);
        return (
          <>
            <div style={{ position: "relative", height: 420, margin: -2 }}>
              {tiles.map((r) => {
                const c = r.l >= 50 ? C.long : C.short;
                const k = Math.sqrt(r.v / hmax);
                const big = r.w > 26 && r.h > 17;
                return (
                  <div key={r.coin} style={{ position: "absolute", left: `${(r.x / VW) * 100}%`, top: `${(r.y / VH) * 100}%`, width: `${(r.w / VW) * 100}%`, height: `${(r.h / VH) * 100}%`, padding: 2 }}>
                    <div
                      className="flex h-full w-full flex-col justify-between overflow-hidden transition-transform duration-200 hover:scale-[1.02]"
                      title={`${r.coin}: ${fmt.usd(r.v)} in 24h, ${r.l}% longs liquidated`}
                      style={{ background: A(c, 0.06 + k * 0.3), border: `1px solid ${A(c, 0.22 + k * 0.45)}`, borderRadius: 8, padding: "8px 10px" }}
                    >
                      <div className="min-w-0">
                        <div className="truncate" style={{ fontWeight: 600, fontSize: r.w > 50 ? 15 : 12 }}>
                          {r.coin}
                        </div>
                        <div className="cq-mono truncate" style={{ fontSize: 11, color: "#c9d3df", marginTop: 2 }}>
                          {fmt.usd(r.v)}
                        </div>
                      </div>
                      {big ? (
                        <div className="min-w-0">
                          <div className="flex" style={{ gap: 2, height: 4 }}>
                            <div style={{ width: `${r.l}%`, background: C.long, borderRadius: "2px 0 0 2px" }} />
                            <div style={{ flex: 1, background: C.short, borderRadius: "0 2px 2px 0" }} />
                          </div>
                          <div className="cq-mono flex justify-between overflow-hidden whitespace-nowrap" style={{ gap: 4, fontSize: 9.5, color: "#c9d3df", marginTop: 4 }}>
                            <span>L {r.l}%</span>
                            <span>S {100 - r.l}%</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="cq-note">Tile area and brightness scale with 24h notional (compressed). Tint marks the dominant side: aqua = long liquidations, red = short. The bar splits long (L) and short (S).</div>
          </>
        );
      }}
    </Panel>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 4 ? 4 : m <= 5 ? 5 : 10) * p;
};

function ByExchange() {
  const q = useDataset("liquidations-by-exchange");
  return (
    <Panel title="By exchange · BTC, trailing 4h" dataset="liquidations-by-exchange" env={q.data} isLoading={q.isLoading} skeletonHeight={200} mb={16}>
      {(d) => {
        const rows = d.data.map((e) => ({ k: e.exchange, L: e.long_usd ?? 0, S: e.short_usd ?? 0 }));
        const exMax = niceMax(Math.max(...rows.map((e) => e.L + e.S), 1));
        return (
          <>
            <div className="flex flex-col" style={{ gap: 12 }}>
              {rows.map((e) => (
                <div key={e.k} className="grid items-center" style={{ gridTemplateColumns: "92px minmax(0,1fr)", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#c9d3df", textAlign: "right" }}>{e.k}</span>
                  <div className="flex overflow-hidden" style={{ height: 18, background: "#0d1219", borderRadius: 4 }} title={`${e.k}: L ${fmt.usd(e.L)}, S ${fmt.usd(e.S)}`}>
                    <div style={{ width: `${(e.L / exMax) * 100}%`, background: C.long, opacity: 0.9, transition: "width .8s" }} />
                    <div style={{ width: `${(e.S / exMax) * 100}%`, background: C.short, opacity: 0.9, transition: "width .8s" }} />
                  </div>
                </div>
              ))}
              <div className="grid" style={{ gridTemplateColumns: "92px minmax(0,1fr)", gap: 12 }}>
                <span />
                <div className="cq-mono flex justify-between" style={{ fontSize: 10, color: "#5b6878" }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i}>{fmt.usd((exMax * i) / 4)}</span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, borderTop: "1px solid #131a23" }}>
              <div className="grid cq-mono" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 12, padding: "9px 4px", fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878", textAlign: "right", borderBottom: "1px solid #131a23" }}>
                <span style={{ textAlign: "left" }}>EXCHANGE</span>
                <span>LONG</span>
                <span>SHORT</span>
                <span>TOTAL</span>
              </div>
              {rows.map((e) => (
                <div key={e.k} className="grid cq-mono" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 12, padding: "9px 4px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #0f141b" }}>
                  <span style={{ textAlign: "left", fontFamily: "var(--font-sans)" }}>{e.k}</span>
                  <span style={{ color: C.long }}>{fmt.usd(e.L)}</span>
                  <span style={{ color: C.short }}>{fmt.usd(e.S)}</span>
                  <span style={{ fontWeight: 600 }}>{fmt.usd(e.L + e.S)}</span>
                </div>
              ))}
            </div>
          </>
        );
      }}
    </Panel>
  );
}

const TAPE_COLS = "66px minmax(0,1fr) 62px minmax(0,1fr) 72px";

function Tape({ rows, coin, setCoin, min, setMin, paused, setPaused, rate }: { rows: TapeEvent[]; coin: string; setCoin: (v: string) => void; min: string; setMin: (v: string) => void; paused: boolean; setPaused: (f: (p: boolean) => boolean) => void; rate: number | null }) {
  const ui = useUi();
  const now = useNow() || Date.now();
  const [, force] = useState(0);
  useEffect(() => {
    // Re-render so the "fresh" highlight fades on time.
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const live = !paused && ui.live;
  const shown = rows.slice(0, ui.rows);
  return (
    <section className="cq-card flex min-w-0 flex-col overflow-hidden" style={{ flex: "1 1 380px" }}>
      <div className="flex items-start justify-between" style={{ padding: "16px 18px 12px", gap: 10 }}>
        <div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <span className="cq-title">Live liquidation tape</span>
            <LiveChip live={live} />
          </div>
          <div className="cq-path">/stream (type=liquidation) via worker fan-out</div>
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="flex items-center hover:border-[#2a3748] hover:text-white"
          style={{ gap: 6, padding: "6px 11px", background: "#0d1219", border: "1px solid #1c2531", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#c9d3df" }}
        >
          {paused ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 5v14l12-7z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          )}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: 10, padding: "12px 18px", borderBottom: "1px solid #131a23" }}>
        <label className="cq-field">
          Coin
          <input className="cq-input" value={coin} onChange={(e) => setCoin(e.target.value)} placeholder="ALL" aria-label="Filter coin" style={{ width: 84, padding: "6px 9px", textTransform: "uppercase" }} />
        </label>
        <label className="cq-field">
          Min size
          <select className="cq-select" value={min} onChange={(e) => setMin(e.target.value)}>
            <option value="0">Any</option>
            <option value="500">$500+</option>
            <option value="1000">$1K+</option>
            <option value="5000">$5K+</option>
            <option value="10000">$10K+</option>
          </select>
        </label>
        <div style={{ marginLeft: "auto" }}>
          <TapeStats rows={rows} rate={rate} />
        </div>
      </div>
      <div className="grid cq-mono" style={{ gridTemplateColumns: TAPE_COLS, gap: 8, padding: "9px 18px", fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878", borderBottom: "1px solid #131a23" }}>
        <span>TIME</span>
        <span>COIN</span>
        <span>SIDE</span>
        <span style={{ textAlign: "right" }}>SIZE</span>
        <span style={{ textAlign: "right" }}>VENUE</span>
      </div>
      <div style={{ maxHeight: 900, overflow: "auto" }}>
        {shown.map((e) => {
          const c = e.side === "L" ? C.long : C.short;
          const fresh = live && (now - e.ts) / 1000 < 2.2;
          const w = Math.max(4, Math.min(100, (Math.log10(Math.max(1, e.size) / 100) / 3.4) * 100));
          return (
            <div key={e.id} className="grid items-center cq-mono" style={{ gridTemplateColumns: TAPE_COLS, gap: 8, padding: "7px 18px", fontSize: 11.5, borderBottom: "1px solid #0f141b", background: fresh ? A(c, 0.15) : "rgba(0,0,0,0)", transition: "background 1.4s" }}>
              <span style={{ color: "#8b98a9" }}>{fmt.time(e.ts)}</span>
              <span className="truncate" style={{ fontWeight: 600, color: "#e6edf5" }}>
                {e.coin}
              </span>
              <span style={{ color: c }}>{e.side === "L" ? "L long" : "S short"}</span>
              <div className="relative flex items-center justify-end" style={{ height: 18 }}>
                <div style={{ position: "absolute", right: 0, top: 2, bottom: 2, width: `${w}%`, background: A(c, e.size >= 10000 ? 0.3 : 0.12), borderRadius: 3 }} />
                <span style={{ position: "relative", fontWeight: e.size >= 10000 ? 600 : 400, paddingRight: 5 }}>{fmt.usd(e.size)}</span>
              </div>
              <span className="truncate" style={{ textAlign: "right", color: "#9aa8b8" }}>
                {e.venue}
              </span>
            </div>
          );
        })}
        {shown.length === 0 ? <div style={{ padding: "28px 18px", textAlign: "center", fontSize: 12, color: "#5b6878" }}>No events match this filter yet.</div> : null}
      </div>
      <div style={{ padding: "11px 18px", fontSize: 10.5, color: "#4f5b6a", borderTop: "1px solid #131a23" }}>Side is the liquidated position: a long liquidation is a forced sell, a short liquidation a forced buy.</div>
    </section>
  );
}

export function LiquidationsView() {
  const ui = useUi();
  const { data } = useWorkerStatus();
  const { status, frozen } = useLiveTape();
  const [coin, setCoin] = useState("");
  const [min, setMin] = useState("0");
  const [paused, setPaused] = useState(false);
  const minN = Number(min) || 0;
  const { filtered } = useTape(paused, coin, minN);
  const rate = data?.worker?.stream?.eventsPerMin ?? status?.eventsPerMin ?? null;
  const live = !paused && ui.live && !frozen;
  return (
    <div className="flex flex-wrap items-start" style={{ gap: 16 }}>
      <Flow coin={coin} min={minN} live={live} rate={rate} rows={filtered} label="Liquidation flow over the last six minutes: longs and shorts by size" />
      <div className="flex min-w-0 flex-col" style={{ flex: "999 1 640px", gap: 16 }}>
        <Squeeze />
        <Rolling />
        <Heatmap />
        <ByExchange />
      </div>
      <Tape rows={filtered} coin={coin} setCoin={setCoin} min={min} setMin={setMin} paused={paused} setPaused={setPaused} rate={rate} />
      <div className="w-full" style={{ fontSize: 11, color: "#4f5b6a" }}>
        Stream source: {data?.worker?.stream?.source ?? status?.source ?? "—"}
        {data?.worker?.stream?.source === "delayed" ? " (keyless preview, about 30 minutes behind)" : ""}.
      </div>
    </div>
  );
}
