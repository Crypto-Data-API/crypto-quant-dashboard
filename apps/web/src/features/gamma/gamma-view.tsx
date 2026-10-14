"use client";

import { normalizeParam, type GexCoin, type GexHistoryPoint, type PositionBucket } from "@cqd/schemas";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Freshness, Panel, PanelBody, SecHead } from "@/components/panel";
import { gammaCoinSlice, gammaSlice } from "@/cq/adapters";
import { CumView, Gamma3DView, SparkView } from "@/cq/react";
import { A, C, fmt } from "@/cq/theme";
import { dateTime, fundingHourly, humanize, int, num, pct, usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { finite, toMs } from "@/lib/utils";

const STATE: Record<string, { label: string; c: string }> = {
  amplify: { label: "Amplify", c: "#ff7a3d" },
  dampen: { label: "Dampen", c: "#4c9bff" },
  transitional: { label: "Transitional", c: "#ffb547" },
};
const stateOf = (s: string | null | undefined) => STATE[s ?? ""] ?? { label: humanize(s ?? "n/a"), c: "#8b98a9" };

function LsBar({ L, S, height = 4 }: { L: number; S: number; height?: number }) {
  const t = L + S || 1;
  const lp = Math.round((L / t) * 100);
  return (
    <div>
      <div className="cq-mono flex justify-between" style={{ fontSize: 9.5, marginBottom: 4 }}>
        <span style={{ color: C.long }}>
          L {fmt.usd(L)} · {lp}%
        </span>
        <span style={{ color: C.short }}>
          {100 - lp}% · {fmt.usd(S)} S
        </span>
      </div>
      <div className="flex" style={{ gap: 2, height }}>
        <div style={{ width: `${lp}%`, minWidth: 2, background: C.long, borderRadius: "3px 0 0 3px" }} />
        <div style={{ flex: 1, background: C.short, borderRadius: "0 3px 3px 0" }} />
      </div>
    </div>
  );
}

function CoinCard({ coin, c, on, onClick, onRemove }: { coin: string; c: GexCoin; on: boolean; onClick: () => void; onRemove?: () => void }) {
  const s = stateOf(c.regime?.state);
  const inv = finite(c.mm_net_delta) ?? 0;
  const dist = finite(c.dist_to_flip_pct);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" ? onClick() : undefined)}
      aria-pressed={on}
      className="flex min-w-0 flex-col text-left outline-none hover:border-[#2f3d50] focus-visible:border-[#2f3d50]"
      style={{
        padding: "10px 12px",
        background: on ? "rgba(76,155,255,0.06)" : "#0b0f14",
        border: `1px solid ${on ? A(C.blue, 0.65) : "#17202b"}`,
        boxShadow: on ? "0 0 0 1px rgba(76,155,255,0.25), 0 14px 40px -14px rgba(76,155,255,0.45)" : "none",
        borderRadius: 10,
        cursor: "pointer",
        color: "#e6edf5",
        transition: "border-color .25s, box-shadow .25s, background .25s",
        gap: 6,
      }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{coin}</span>
        <span className="cq-mono" title={c.regime?.rationale ?? undefined} style={{ fontSize: 9, color: s.c, background: A(s.c, 0.1), border: `1px solid ${A(s.c, 0.35)}`, padding: "0 5px", borderRadius: 4 }}>
          {s.label}
        </span>
        {onRemove ? (
          <button
            type="button"
            aria-label={`Remove ${coin}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#5b6878", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >
            ×
          </button>
        ) : (
          <span className="cq-mono" style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600 }}>
            {fmt.px(finite(c.mark))}
          </span>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr auto", gap: "3px 10px", fontSize: 10.5 }}>
        <span style={{ color: "#8b98a9" }}>MM net inventory</span>
        <span className="cq-mono" style={{ color: inv < 0 ? C.short : C.long, textAlign: "right" }}>
          {inv < 0 ? "S −" : "L +"}
          {fmt.usd(Math.abs(inv))}
        </span>
        <span style={{ color: "#8b98a9" }}>Gamma flip</span>
        <span className="cq-mono" style={{ textAlign: "right" }}>
          {fmt.px(finite(c.gamma_flip))} <span style={{ color: C.amber }}>{dist !== null ? `${dist > 0 ? "+" : ""}${dist.toFixed(1)}%` : ""}</span>
        </span>
        <span style={{ color: "#8b98a9" }}>Dealers</span>
        <span className="cq-mono" style={{ textAlign: "right" }}>
          {int(c.mm_n_accounts)}
        </span>
        <span style={{ color: "#8b98a9" }}>Funding</span>
        <span className="cq-mono" style={{ textAlign: "right" }}>
          {fundingHourly(c.funding_rate)}
        </span>
      </div>
      <LsBar L={finite(c.mm_long_usd) ?? 0} S={finite(c.mm_short_usd) ?? 0} />
    </div>
  );
}

const PCT_TILES: Array<{ label: string; key: "near_density_pctile" | "abs_dist_to_flip_pctile" | "mm_skew_pctile" | "regime_score_pctile" | "funding_rate_pctile"; hint?: string }> = [
  { label: "Near-mark density", key: "near_density_pctile" },
  { label: "|Distance to flip|", key: "abs_dist_to_flip_pctile", hint: "Low = unusually close to the flip line" },
  { label: "MM skew", key: "mm_skew_pctile" },
  { label: "Regime score", key: "regime_score_pctile" },
  { label: "Funding", key: "funding_rate_pctile", hint: "Null when funding is pinned to Hyperliquid's baseline" },
];

function Percentiles({ c }: { c: GexCoin }) {
  const dc = c.distribution_context;
  return (
    <>
      <div className="flex items-baseline justify-between" style={{ margin: "22px 0 10px" }}>
        <span className="cq-kicker">TODAY VS 30 DAYS</span>
        <span className="cq-mono" style={{ fontSize: 10, color: "#4f5b6a" }}>
          {dc?.status === "warming" ? "warming up · percentiles after 2 days" : `${num(dc?.history_days, 0)} days · ${int(dc?.sample_count)} samples`}
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {PCT_TILES.map((t) => {
          const v = finite(dc?.[t.key]);
          const col = v !== null && (v > 80 || v < 20) ? C.amber : C.blue;
          return (
            <div key={t.key} className="cq-tile" style={{ padding: "11px 13px 14px" }} title={t.hint}>
              <div className="flex items-baseline justify-between">
                <span style={{ fontSize: 11, color: "#8b98a9" }}>{t.label}</span>
                <span className="cq-mono" style={{ fontSize: 14, fontWeight: 600, color: v === null ? "#5b6878" : col }}>
                  {v === null ? "—" : `p${Math.round(v)}`}
                </span>
              </div>
              <div style={{ position: "relative", height: 4, background: "#151c26", borderRadius: 4, marginTop: 12 }}>
                {v !== null ? (
                  <>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${v}%`, background: col, opacity: 0.35, borderRadius: 4, transition: "width .6s" }} />
                    <div style={{ position: "absolute", top: "50%", left: `${v}%`, width: 10, height: 10, margin: "-5px 0 0 -5px", borderRadius: "50%", background: col, boxShadow: `0 0 10px ${col}`, transition: "left .6s" }} />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Clusters({ c }: { c: GexCoin }) {
  const levels = [...(c.levels ?? [])].sort((a, b) => b.price - a.price);
  if (!levels.length) return null;
  const cmax = Math.max(...levels.map((l) => l.total_usd ?? 0), 1);
  const cols = "1fr 1.4fr 0.8fr 1.6fr 0.6fr";
  return (
    <>
      <div className="cq-kicker" style={{ margin: "24px 0 8px" }}>
        NEAREST LIQUIDATION CLUSTERS · ALL ACCOUNTS
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 620 }}>
          <div className="cq-th" style={{ gridTemplateColumns: cols, gap: 14, padding: "8px 10px", letterSpacing: "0.08em" }}>
            <span>PRICE</span>
            <span style={{ textAlign: "right" }}>FROM MARK</span>
            <span>SIDE</span>
            <span style={{ textAlign: "right" }}>NOTIONAL</span>
            <span style={{ textAlign: "right" }}>ACCTS</span>
          </div>
          {levels.map((l, i) => {
            const col = l.side === "long" ? C.long : C.short;
            const dd = finite(l.dist_pct) ?? 0;
            const w = Math.min(50, (Math.abs(dd) / 2.5) * 50);
            return (
              <div key={i} className="grid items-center cq-mono" style={{ gridTemplateColumns: cols, gap: 14, padding: "9px 10px", fontSize: 12, borderBottom: "1px solid #0f141b" }}>
                <span>{fmt.px(l.price)}</span>
                <div className="flex items-center justify-end" style={{ gap: 10 }}>
                  <div style={{ position: "relative", width: 90, height: 6, background: "#121922", borderRadius: 3 }}>
                    <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 1, background: "#3a4553" }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: dd < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: col, borderRadius: 3 }} />
                  </div>
                  <span style={{ width: 52, textAlign: "right" }}>{`${dd > 0 ? "+" : ""}${dd.toFixed(2)}%`}</span>
                </div>
                <span style={{ color: col }}>{l.side === "long" ? "L long" : "S short"}</span>
                <div className="relative flex items-center justify-end" style={{ height: 18 }}>
                  <div style={{ position: "absolute", right: 0, top: 3, bottom: 3, width: `${((l.total_usd ?? 0) / cmax) * 100}%`, background: A(col, 0.35), borderRadius: 3 }} />
                  <span style={{ position: "relative", paddingRight: 6, fontWeight: 600 }}>{fmt.usd(l.total_usd)}</span>
                </div>
                <span style={{ textAlign: "right", color: "#9aa8b8" }}>{int(l.n_accounts)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

const HISTORY: Array<{ key: keyof GexHistoryPoint; label: string; f: (v: number | null) => string }> = [
  { key: "near_density", label: "Near-mark density", f: (v) => pct(v) },
  { key: "dist_to_flip_pct", label: "Distance to flip", f: (v) => pct(v, { sign: true }) },
  { key: "mm_skew", label: "MM skew", f: (v) => num(v, 2) },
  { key: "regime_score", label: "Regime score", f: (v) => num(v, 2) },
  { key: "funding_rate", label: "Funding /h", f: (v) => fundingHourly(v) },
  { key: "mm_gross", label: "MM gross", f: (v) => usd(v) },
];

function History({ coin }: { coin: string }) {
  const q = useDataset("gex-history", { param: coin });
  return (
    <section className="cq-card cq-sec">
      <div className="flex items-baseline justify-between" style={{ marginBottom: 12, gap: 10 }}>
        <span className="cq-kicker">30-DAY HISTORY · HOURLY · {coin}</span>
        <Freshness env={q.data} />
      </div>
      <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={120}>
        {(d) => {
          const pts = [...d.points].sort((a, b) => a.ts - b.ts);
          return (
            <>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                {HISTORY.map((m) => {
                  const vals = pts.map((p) => finite(p[m.key])).filter((v): v is number => v !== null);
                  const last = vals.length ? vals[vals.length - 1]! : null;
                  return (
                    <div key={String(m.key)} className="cq-tile" style={{ padding: "11px 13px 10px" }}>
                      <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#8b98a9" }}>{m.label}</span>
                        <span className="cq-mono" style={{ fontSize: 13, fontWeight: 600 }}>
                          {m.f(last)}
                        </span>
                      </div>
                      <div style={{ height: 34, marginTop: 8 }}>{vals.length >= 2 ? <SparkView values={vals} color="#4c9bff" fill label={`${coin} ${m.label}, 30 days`} /> : null}</div>
                    </div>
                  );
                })}
              </div>
              <div className="cq-note">
                {pts.length} hourly samples{pts[0] ? ` since ${dateTime(pts[0].ts * (pts[0].ts > 1e12 ? 1 : 1000))}` : ""}. Forward-only ring kept by CDA.
              </div>
            </>
          );
        }}
      </PanelBody>
    </section>
  );
}

const CLASS_ORDER = ["market_maker", "whale", "other", "all"];

function Positioning({ coin }: { coin: string }) {
  const q = useDataset("quant-positioning");
  return (
    <Panel title={`Positioning by trader group · ${coin}`} dataset="quant-positioning" env={q.data} isLoading={q.isLoading} skeletonHeight={200}>
      {(d) => {
        const c = d.coins[coin];
        if (!c) return <div style={{ fontSize: 12, color: "#5b6878" }}>{coin} is not in the scheduled positioning set ({Object.keys(d.coins).join(", ")}). Add it to GEX_SYMBOLS to poll it.</div>;
        const rows: Array<{ name: string; tag: boolean; b: PositionBucket }> = [
          ...CLASS_ORDER.filter((k) => c.by_type?.[k]).map((k) => ({ name: humanize(k), tag: false, b: c.by_type![k]! })),
          ...Object.entries(c.by_tag ?? {}).map(([k, b]) => ({ name: humanize(k), tag: true, b })),
        ];
        const cols = "1.6fr 1fr 1fr 1fr 1fr 0.7fr";
        const max = Math.max(...rows.map((r) => Math.abs(r.b.net_usd ?? 0)), 1);
        return (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 640 }}>
              <div className="cq-th" style={{ gridTemplateColumns: cols, textAlign: "right" }}>
                <span style={{ textAlign: "left" }}>TRADER GROUP</span>
                <span>LONG</span>
                <span>SHORT</span>
                <span>NET</span>
                <span>GROSS</span>
                <span>ACCTS</span>
              </div>
              {rows.map((r) => {
                const net = r.b.net_usd ?? 0;
                const col = net >= 0 ? C.long : C.short;
                return (
                  <div key={r.name} className="cq-tr" style={{ gridTemplateColumns: cols }}>
                    <span style={{ textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 12 }}>
                      {r.name} {r.tag ? <span style={{ color: "#5b6878", fontSize: 10 }}>(tag)</span> : null}
                    </span>
                    <span style={{ color: C.long }}>{fmt.usd(r.b.long_usd)}</span>
                    <span style={{ color: C.short }}>{fmt.usd(r.b.short_usd)}</span>
                    <div className="relative flex items-center justify-end" style={{ height: 18 }}>
                      <div style={{ position: "absolute", right: 0, top: 3, bottom: 3, width: `${(Math.abs(net) / max) * 100}%`, background: A(col, 0.3), borderRadius: 3 }} />
                      <span style={{ position: "relative", paddingRight: 6, fontWeight: 600, color: col }}>
                        {net >= 0 ? "+" : "−"}
                        {fmt.usd(Math.abs(net))}
                      </span>
                    </div>
                    <span style={{ color: "#9aa8b8" }}>{fmt.usd(r.b.gross_usd)}</span>
                    <span style={{ color: "#9aa8b8" }}>{int(r.b.n_accounts)}</span>
                  </div>
                );
              })}
              <div className="cq-note">Classes partition every Hyperliquid account worth $100k or more; tags overlap them. The market-maker class is the dealer basis for the GEX view. Positions as of {dateTime(d.positions_as_of)}.</div>
            </div>
          </div>
        );
      }}
    </Panel>
  );
}

function ExtraCoin({ coin, on, onClick, onRemove, onData }: { coin: string; on: boolean; onClick: () => void; onRemove: () => void; onData: (sym: string, c: GexCoin | null) => void }) {
  const q = useDataset("quant-gex-coin", { param: coin });
  const c = q.data?.data?.coins?.[coin] ?? (q.data?.data ? Object.values(q.data.data.coins)[0] : undefined) ?? null;
  // Hand the fetched coin to the page so the 3D landscape can include it.
  useEffect(() => onData(coin, c), [coin, c, onData]);
  if (c) return <CoinCard coin={coin} c={c} on={on} onClick={onClick} onRemove={onRemove} />;
  return (
    <div className="flex flex-col" style={{ padding: "10px 12px", border: "1px dashed #1c2531", borderRadius: 10, gap: 8 }}>
      <div className="flex items-center">
        <span style={{ fontSize: 13, fontWeight: 600 }}>{coin}</span>
        <button type="button" aria-label={`Remove ${coin}`} onClick={onRemove} style={{ marginLeft: "auto", background: "none", border: "none", color: "#5b6878", cursor: "pointer", fontSize: 14 }}>
          ×
        </button>
      </div>
      <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={80} compact>
        {() => <div style={{ fontSize: 12, color: "#5b6878" }}>No GEX entry for {coin}.</div>}
      </PanelBody>
    </div>
  );
}

export function GammaView() {
  const q = useDataset("quant-gex");
  const [sel, setSel] = useState("BTC");
  const [tab, setTab] = useState<"3d" | "curve">("3d");
  const [extra, setExtra] = useState<string[]>([]);
  const [extraData, setExtraData] = useState<Record<string, GexCoin>>({});
  const [input, setInput] = useState("");
  const base = q.data?.data?.coins ?? {};
  const all: Record<string, GexCoin> = { ...base, ...extraData };
  const coin = all[sel] ?? null;
  const slice = useMemo(() => gammaSlice(q.data?.data, sel, extraData), [q.data, sel, extraData]);
  const curve = useMemo(() => (coin ? gammaCoinSlice(sel, coin) : null), [coin, sel]);
  const setExtraCoin = useCallback(
    (sym: string, c: GexCoin | null) =>
      setExtraData((prev) => {
        if (!c) {
          if (!(sym in prev)) return prev;
          const next = { ...prev };
          delete next[sym];
          return next;
        }
        return prev[sym] === c ? prev : { ...prev, [sym]: c };
      }),
    [],
  );
  const add = () => {
    const s = normalizeParam(input);
    if (s && !(s in base) && !extra.includes(s)) setExtra((e) => [...e, s].slice(-4));
    if (s) setSel(s);
    setInput("");
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <section className="cq-card cq-sec">
        <SecHead
          title={`${sel} · gamma profile and positioning`}
          mb={12}
          right={
            <>
              <div className="cq-seg">
                <button type="button" aria-pressed={tab === "3d"} onClick={() => setTab("3d")}>
                  3D landscape
                </button>
                <button type="button" aria-pressed={tab === "curve"} onClick={() => setTab("curve")}>
                  Cumulative fuel
                </button>
              </div>
            </>
          }
        />
        <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={560}>
          {() =>
            !coin ? (
              <div style={{ fontSize: 12, color: "#5b6878", padding: "40px 0", textAlign: "center" }}>No GEX entry for {sel}. Pick a coin card below.</div>
            ) : (
              <>
                {tab === "3d" ? (
                  <div className="cq-stage" style={{ height: "clamp(560px, 68vh, 760px)" }}>
                    {slice ? <Gamma3DView data={slice} label={`Gamma landscape for ${slice.order.join(", ")}; ${sel} selected`} /> : null}
                    <div className="cq-mono flex flex-wrap" style={{ position: "absolute", left: 14, top: 12, gap: 14, fontSize: 10.5, color: "#9aa8b8", pointerEvents: "none" }}>
                      <span className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: C.long }} />
                        Long liquidations
                      </span>
                      <span className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: C.short }} />
                        Short liquidations
                      </span>
                      <span className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ width: 2, height: 11, background: C.amber }} />
                        Gamma flip
                      </span>
                      <span className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ width: 2, height: 11, background: "#eef3f8" }} />
                        Mark
                      </span>
                    </div>
                    <div className="cq-stage-hint">bar height = √ notional · drag to orbit · hover a bar</div>
                  </div>
                ) : (
                  <div className="cq-stage" style={{ height: "clamp(460px, 56vh, 620px)" }}>
                    {curve ? <CumView data={curve} label={`${sel} cumulative liquidation fuel by distance from mark`} /> : null}
                  </div>
                )}
                {coin.regime?.rationale ? (
                  <div style={{ fontSize: 12, color: "#8b98a9", marginTop: 12 }}>
                    <span className="cq-mono" style={{ color: stateOf(coin.regime.state).c }}>
                      {stateOf(coin.regime.state).label}
                    </span>{" "}
                    · score {num(coin.regime.score, 2)} · confidence {num(coin.regime.confidence, 2)} · fuel {coin.regime.fuel_side ?? "n/a"}
                    {coin.regime.since ? ` · since ${dateTime(toMs(coin.regime.since))}` : ""} · {coin.regime.rationale}
                  </div>
                ) : null}
                <Percentiles c={coin} />
                <Clusters c={coin} />
              </>
            )
          }
        </PanelBody>
      </section>
      <Panel
        title="Dealer gamma · perp GEX analog"
        env={q.data}
        isLoading={q.isLoading}
        skeletonHeight={170}
        actions={
          <form
            className="flex items-center"
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input className="cq-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="ADD COIN" aria-label="Add coin" style={{ width: 96, padding: "5px 9px", textTransform: "uppercase" }} />
            <button type="submit" className="cq-btn" aria-label="Add coin">
              +
            </button>
          </form>
        }
      >
        {(d) => (
          <>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
              {Object.entries(d.coins).map(([sym, c]) => (
                <CoinCard key={sym} coin={sym} c={c} on={sym === sel} onClick={() => setSel(sym)} />
              ))}
              {extra.map((sym) => (
                <ExtraCoin
                  key={sym}
                  coin={sym}
                  on={sym === sel}
                  onClick={() => setSel(sym)}
                  onData={setExtraCoin}
                  onRemove={() => {
                    setExtra((e) => e.filter((x) => x !== sym));
                    setExtraCoin(sym, null);
                    if (sel === sym) setSel("BTC");
                  }}
                />
              ))}
            </div>
            <div className="cq-note">
              Behavioral analog built from market-maker inventory and liquidation-driven flow, not options dealer gamma. {int(Number(d.meta?.mm_accounts ?? NaN))} MM accounts classified. Added coins are fetched on demand.
            </div>
          </>
        )}
      </Panel>
      <History coin={sel} />
      <Positioning coin={sel} />
    </div>
  );
}
