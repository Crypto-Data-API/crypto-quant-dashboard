"use client";

import type { Envelope } from "@cqd/schemas";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { PanelBody, Tag } from "@/components/panel";
import { calEvents, depthSlice, fanQuantiles, galaxySlice, gammaSlice, marketRegimeState, squeezeSlice, volRows, bubbleRows, cycleSlice } from "@/cq/adapters";
import { Bubbles3DView, CycleView, Depth3DView, FanView, GalaxyView, Gamma3DView, GaugeView, Horizon3DView, RadarView } from "@/cq/react";
import { A, fmt } from "@/cq/theme";
import { useDataset, useNow } from "@/lib/hooks";
import { useUi } from "@/lib/settings";
import { isStale } from "@cqd/schemas";

/** One overview tile: title, mono caption, "Open →" and a 320px stage. */
export function ViewCard({ title, sub, href, env, children }: { title: string; sub: ReactNode; href: string; env?: Envelope; children: ReactNode }) {
  const now = useNow() || Date.now();
  const stale = env?.fetchedAt && !env.demo ? isStale(env, now) : false;
  return (
    <div className="flex min-w-0 flex-col" style={{ background: "#0b0f14", border: "1px solid #17202b", borderRadius: 14, padding: 12, gap: 10 }}>
      <div className="flex items-center justify-between" style={{ gap: 10, padding: "2px 4px 0" }}>
        <div className="min-w-0">
          <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>
            {title}
          </div>
          <div className="cq-mono truncate" style={{ fontSize: 10.5, color: "#5b6878", marginTop: 2 }}>
            {sub}
          </div>
        </div>
        <div className="flex shrink-0 items-center" style={{ gap: 6 }}>
          {env?.demo ? <Tag color="#4c9bff">DEMO</Tag> : stale ? <Tag color="#ffb547">STALE</Tag> : null}
          <Link href={href} className="cq-btn">
            Open →
          </Link>
        </div>
      </div>
      <div className="cq-stage" style={{ height: 320 }}>
        {children}
      </div>
    </div>
  );
}

/** Data or an explicit state, filling a stage. */
function Fill<T>({ env, isLoading, children }: { env?: Envelope<T>; isLoading?: boolean; children: (d: T) => ReactNode }) {
  return (
    <div className="absolute inset-0" style={{ padding: env?.data ? 0 : 10 }}>
      <PanelBody env={env} isLoading={isLoading} skeletonHeight="100%" compact fill>
        {(d) => <>{children(d)}</>}
      </PanelBody>
    </div>
  );
}

const sentimentColor = (s: string | null | undefined) => {
  const v = (s ?? "").toLowerCase();
  if (/bull|greed/.test(v)) return "#2ee6a6";
  if (/bear|fear/.test(v)) return "#ff5c6c";
  if (/neutral/.test(v)) return "#4c9bff";
  return "#8b98a9";
};

export function HealthGauges({ total, lt, st, sentiment, ltS, stS }: { total: number; lt: number; st: number; sentiment: string; ltS: string; stS: string }) {
  const rows = [
    { k: "Combined", v: total, tag: sentiment },
    { k: "Long-term", v: lt, tag: ltS },
    { k: "Short-term", v: st, tag: stS },
  ];
  return (
    <div className="absolute inset-0 grid items-center" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", padding: 10 }}>
      {rows.map((h) => {
        const c = sentimentColor(h.tag);
        return (
          <div key={h.k} className="flex min-w-0 flex-col items-center" style={{ gap: 6 }}>
            <div style={{ width: "100%", maxWidth: 160, height: 120 }}>
              <GaugeView value={h.v} color={c} label={`${h.k} market health ${h.v} of 100`} />
            </div>
            <div style={{ fontSize: 11.5, color: "#9aa8b8" }}>{h.k}</div>
            <span className="cq-mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", color: c, background: A(c, 0.1), border: `1px solid ${A(c, 0.35)}`, padding: "2px 8px", borderRadius: 5 }}>
              {h.tag.toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function squeezeMessage(d: { window_s?: number | null; evaluated?: number | null; min_severity?: number | null; coverage?: string | null; alerts: unknown[] } | null | undefined): string {
  if (!d) return "Squeeze alerts";
  const win = d.window_s ? `${Math.round(d.window_s / 60)}m` : "window";
  const venues = d.coverage ? ` (${d.coverage.replace(/_aggregate$/, " aggregate").replace(/_/g, " ")})` : "";
  const sev = `${Math.round((d.min_severity ?? 0.35) * 100)}%`;
  if (d.alerts.length > 0) return `${d.alerts.length} one-sided cascade${d.alerts.length === 1 ? "" : "s"} in the last ${win} at severity ${sev} or more${venues}.`;
  return `No one-sided cascades in the last ${win}. ${d.evaluated ?? 0} coins evaluated at severity ${sev} or more${venues}.`;
}

export function OverviewView() {
  const ui = useUi();
  const focus = ui.focus || "BTC";
  const market = useDataset("quant-market");
  const risk = useDataset("quant-coins-risk");
  const regimes = useDataset("regimes");
  const gex = useDataset("quant-gex");
  const volume = useDataset("volume-scanner");
  const depth = useDataset("depth-history", { param: focus });
  const health = useDataset("market-health");
  const squeeze = useDataset("squeeze-alerts");
  const calendar = useDataset("event-calendar");
  const score = useDataset("score-event");

  const reg = marketRegimeState(market.data?.data);
  const galaxy = useMemo(() => {
    const g = galaxySlice(risk.data?.data, market.data?.data);
    return g ? { ...g, focus: "" } : null;
  }, [risk.data, market.data]);
  const q = fanQuantiles(market.data?.data);
  const cycle = useMemo(() => cycleSlice(regimes.data?.data), [regimes.data]);
  const gamma = useMemo(() => gammaSlice(gex.data?.data, "BTC"), [gex.data]);
  const gSel = gamma ? gex.data?.data?.coins[gamma.sel] : undefined;
  const bubbles = useMemo(() => ({ rows: bubbleRows(volRows(volume.data?.data)), band: "All bands", sel: "" }), [volume.data]);
  const terrain = useMemo(() => depthSlice(depth.data?.data, focus), [depth.data, focus]);
  const radar = useMemo(() => squeezeSlice(squeeze.data?.data), [squeeze.data]);
  const horizon = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { events: calEvents(calendar.data?.data), filter: "All types", today: d.getTime() };
  }, [calendar.data]);
  const cur = regimes.data?.data?.current;
  const sc = score.data?.data;

  return (
    <div className="flex flex-wrap items-start" style={{ gap: 16 }}>
      <section className="min-w-0" style={{ flex: "1 1 100%" }}>
        <div className="flex flex-wrap items-baseline justify-between" style={{ margin: "0 2px 10px", gap: 8 }}>
          <span className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "#5b6878" }}>
            ALL VIEWS · LIVE
          </span>
          <span className="cq-mono" style={{ fontSize: 10, color: "#4f5b6a" }}>
            every view has fullscreen in its corner · drag 3D views to orbit
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: 14 }}>
          <ViewCard title="Market Quant Regime" href="/market-regimes" env={risk.data} sub={reg ? `${reg.name} · ${Math.round(reg.confidence * 100)}% confidence` : "short-term HMM · every perp"}>
            <Fill env={risk.data} isLoading={risk.isLoading}>
              {() => (galaxy ? <GalaxyView data={galaxy} label="Regime galaxy: every perp clustered by its short-term regime" /> : null)}
            </Fill>
          </ViewCard>
          <ViewCard
            title="Market Monte Carlo Simulation"
            href="/market-regimes"
            env={market.data}
            sub={q ? `24h return · p5 ${q.p5.toFixed(1)}% · median ${q.p50.toFixed(2)}% · p95 ${q.p95.toFixed(1)}%` : "24h return quantiles"}
          >
            <Fill env={market.data} isLoading={market.isLoading}>
              {() => (q ? <FanView p5={q.p5} p50={q.p50} p95={q.p95} label="Simulated 24h return range" /> : <Empty text="Range unavailable (24h horizon only)." />)}
            </Fill>
          </ViewCard>
          <ViewCard title="Market Regime Cycle" href="/regimes" env={regimes.data} sub={cur?.id ? `Phase ${cur.id}/${regimes.data?.data?.regimes.length ?? 10}${cur.stage_label ? ` · ${cur.stage_label}` : ""}` : "10-phase cycle model"}>
            <Fill env={regimes.data} isLoading={regimes.isLoading}>
              {() => (cycle ? <CycleView data={cycle} label="Cycle ring" /> : null)}
            </Fill>
          </ViewCard>
          <ViewCard
            title="Gex Gamma Landscape"
            href="/quant-gamma"
            env={gex.data}
            sub={gSel ? `${gamma!.sel} · score ${(gSel.regime?.score ?? 0).toFixed(2)} · fuel ${gSel.regime?.fuel_side ?? "n/a"}` : "dealer GEX analog"}
          >
            <Fill env={gex.data} isLoading={gex.isLoading}>
              {() => (gamma ? <Gamma3DView data={gamma} label="Gamma landscape: market-maker liquidation notional by distance from mark" /> : null)}
            </Fill>
          </ViewCard>
          <ViewCard title="Volume Anomaly Field" href="/volume-scanner" env={volume.data} sub="height = multiplier vs 30d mean">
            <Fill env={volume.data} isLoading={volume.isLoading}>
              {() => <Bubbles3DView data={bubbles} label="Volume anomaly field" />}
            </Fill>
          </ViewCard>
          <ViewCard
            title="Liquidity Terrain"
            href="/quant-order-books"
            env={depth.data}
            sub={`${focus} ±50 bps · bid ${terrain.bid25 !== null ? fmt.usd(terrain.bid25) : "—"} · ask ${terrain.ask25 !== null ? fmt.usd(terrain.ask25) : "—"}`}
          >
            <Fill env={depth.data} isLoading={depth.isLoading}>
              {() => (terrain.slice.cols.length ? <Depth3DView data={terrain.slice} label={`${focus} liquidity terrain, last 6 hours`} /> : <Empty text="No depth snapshots in the window yet." />)}
            </Fill>
          </ViewCard>
          <ViewCard title="Market Health" href="/regimes" env={health.data} sub="combined · long-term · short-term">
            <Fill env={health.data} isLoading={health.isLoading}>
              {(d) => <HealthGauges total={d.total_score} lt={d.long_term_score} st={d.short_term_score} sentiment={d.sentiment} ltS={d.long_term_sentiment} stS={d.short_term_sentiment} />}
            </Fill>
          </ViewCard>
          <ViewCard title="Squeeze Radar" href="/liquidations" env={squeeze.data} sub={squeezeMessage(squeeze.data?.data)}>
            <Fill env={squeeze.data} isLoading={squeeze.isLoading}>
              {() => (
                <div className="absolute inset-0 flex items-center justify-center" style={{ padding: 10 }}>
                  <div style={{ width: "min(100%, 300px)", aspectRatio: "1 / 1", maxHeight: "100%" }}>
                    <RadarView data={radar} label="Squeeze radar: alerting coins by severity" />
                  </div>
                </div>
              )}
            </Fill>
          </ViewCard>
          <ViewCard
            title="News Catalysts"
            href="/calendar"
            env={calendar.data}
            sub={sc ? `risk ${Math.round(sc.event_risk_score)} ${sc.band.charAt(0).toUpperCase()}${sc.band.slice(1)} · ${sc.events_7d} in next 7d` : "event risk · next 30 days"}
          >
            <Fill env={calendar.data} isLoading={calendar.isLoading}>
              {() => <Horizon3DView data={horizon} label="Event horizon: catalysts over the next 30 days" />}
            </Fill>
          </ViewCard>
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 12, color: "#5b6878" }}>
      {text}
    </div>
  );
}
