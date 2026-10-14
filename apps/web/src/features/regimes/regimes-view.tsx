"use client";

import type { DatasetId, RegimeHistoryResponse, RegimesResponse } from "@cqd/schemas";
import { useMemo } from "react";
import { Freshness, Panel, PanelBody, SecHead } from "@/components/panel";
import { cycleGroup, cycleSlice } from "@/cq/adapters";
import { CycleView, GaugeView } from "@/cq/react";
import { A } from "@/cq/theme";
import { duration, humanize, num, usd } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { finite, isRecord, toMs } from "@/lib/utils";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMon = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
};

const sentimentColor = (s: string | null | undefined) => {
  const v = (s ?? "").toLowerCase();
  if (/bull|greed/.test(v)) return "#2ee6a6";
  if (/bear|fear/.test(v)) return "#ff5c6c";
  if (/neutral/.test(v)) return "#4c9bff";
  return "#8b98a9";
};

/** Durations: "17h", "3d", "41d". */
const span = (sec: number) => (sec < 86400 ? `${Math.max(1, Math.round(sec / 3600))}h` : `${Math.round(sec / 86400)}d`);

function CycleRing() {
  const q = useDataset("regimes");
  const health = useDataset("market-health");
  const now = useNow() || Date.now();
  const slice = useMemo(() => cycleSlice(q.data?.data), [q.data]);
  return (
    <Panel title="Cycle ring" path="/regimes · long-horizon model" env={q.data} isLoading={q.isLoading} mb={16} skeletonHeight={600}>
      {(d) => {
        const c = d.current;
        const info = d.regimes.find((r) => r.id === c.id);
        const g = cycleGroup(c.id);
        const since = toMs(c.in_regime_since);
        const elapsed = since ? (now - since) / 1000 : null;
        const st = c.stability;
        const h = health.data?.data;
        const tiles = h
          ? [
              { k: "Combined", v: h.total_score, tag: h.sentiment },
              { k: "Long-term", v: h.long_term_score, tag: h.long_term_sentiment },
              { k: "Short-term", v: h.short_term_score, tag: h.short_term_sentiment },
            ]
          : [];
        const playbook = [
          { k: "Bias", v: info?.directional_bias },
          { k: "Horizon", v: info?.typical_duration ? `Typically ${info.typical_duration.toLowerCase()} in this phase` : null },
          { k: "Read", v: info?.description },
          { k: "Why now", v: c.rationale },
        ].filter((p): p is { k: string; v: string } => Boolean(p.v));
        return (
          <div className="flex flex-wrap" style={{ gap: 22 }}>
            <div className="cq-stage min-w-0" style={{ flex: "3 1 640px", height: "clamp(600px, 72vh, 820px)" }}>
              {slice ? <CycleView data={slice} label={`Cycle ring: phase ${c.id ?? "none"} of ${d.regimes.length}`} /> : null}
              <div style={{ position: "absolute", left: 16, top: 14, pointerEvents: "none" }}>
                <div className="cq-kicker">PHASE</div>
                <div className="cq-mono" style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.04em", color: g.c, textShadow: `0 0 24px ${A(g.c, 0.5)}` }}>
                  {c.id ?? "—"}
                  <span style={{ fontSize: 16, color: "#5b6878" }}> / {d.regimes.length}</span>
                </div>
              </div>
              <div className="cq-stage-hint">drag to orbit · hover a segment</div>
            </div>
            <div className="flex min-w-0 flex-col" style={{ flex: "2 1 320px", gap: 18 }}>
              <div>
                <span className="cq-mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", color: g.c, background: A(g.c, 0.1), border: `1px solid ${A(g.c, 0.4)}`, padding: "2px 7px", borderRadius: 5 }}>
                  {g.group.toUpperCase()}
                </span>
                <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.15, marginTop: 12, textWrap: "pretty" }}>{c.name ?? "Unclassified (cold start)"}</div>
                <div style={{ fontSize: 13, color: "#9aa8b8", marginTop: 6 }}>
                  {[c.stage_label, since ? `since ${dayMon(since)}` : null, elapsed !== null ? (elapsed >= 86400 ? `day ${Math.floor(elapsed / 86400)}` : `${span(elapsed)} in`) : null].filter(Boolean).join(" · ")}
                </div>
                {c.raw && !c.raw.matches_committed ? (
                  <div style={{ fontSize: 11.5, color: "#ffb547", marginTop: 6 }} title="The live, ungated classification disagrees with the committed regime; the dwell gate holds it until the candidate confirms.">
                    Live read: {c.raw.name}
                  </div>
                ) : null}
              </div>
              {st ? (
                <div title={`Dwell floor ${duration(st.dwell_floor_s)}, held ${duration(st.held_s ?? 0)}. A successor needs ${st.confirmations_needed} confirmations${st.candidate ? `; ${humanize(st.candidate)} has ${st.confirmations_against}` : ""}.`}>
                  <div className="cq-mono flex justify-between" style={{ fontSize: 10, color: "#5b6878", marginBottom: 6 }}>
                    <span>STABILITY · LIVE AGREEMENT, LAST {st.raw_window} READS</span>
                    <span style={{ color: "#e6edf5" }}>{Math.round(st.raw_agreement * 100)}%</span>
                  </div>
                  <div style={{ height: 6, background: "#151c26", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${st.raw_agreement * 100}%`, background: g.c, boxShadow: `0 0 12px ${A(g.c, 0.7)}`, borderRadius: 6 }} />
                  </div>
                </div>
              ) : null}
              {tiles.length ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
                  {tiles.map((t) => {
                    const col = sentimentColor(t.tag);
                    return (
                      <div key={t.k} className="cq-tile" style={{ padding: "10px 12px" }}>
                        <div style={{ fontSize: 10.5, color: "#8b98a9" }}>{t.k}</div>
                        <div className="flex items-baseline" style={{ gap: 6, marginTop: 4 }}>
                          <span className="cq-mono" style={{ fontSize: 20, fontWeight: 600, color: col }}>
                            {t.v}
                          </span>
                          <span className="cq-mono" style={{ fontSize: 9, color: col }}>
                            {t.tag}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div>
                <div className="cq-kicker" style={{ marginBottom: 8 }}>
                  PLAYBOOK
                </div>
                <div className="flex flex-col">
                  {playbook.map((p) => (
                    <div key={p.k} className="grid" style={{ gridTemplateColumns: "92px minmax(0,1fr)", gap: 12, padding: "9px 0", borderTop: "1px solid #121922", fontSize: 12, lineHeight: 1.5 }}>
                      <span style={{ color: g.c, fontWeight: 500 }}>{p.k}</span>
                      <span style={{ color: "#c9d3df", textWrap: "pretty" }}>{p.v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: "#4f5b6a", marginTop: 6 }}>Leverage guidance is not part of the CDA payload; the playbook shows what CDA publishes.</div>
              </div>
            </div>
          </div>
        );
      }}
    </Panel>
  );
}

/** The last six committed runs with their held durations (the open run is measured to now). */
function recentRuns(h: RegimeHistoryResponse | null | undefined) {
  const now = Date.now();
  return (h?.transitions ?? [])
    .filter((t) => t.id)
    .map((t) => ({ id: t.id!, name: t.name ?? "", sec: t.dwell_seconds ?? Math.max(0, ((toMs(t.ended_at) ?? now) - (toMs(t.committed_at) ?? now)) / 1000), open: !t.ended_at }))
    .slice(-6);
}

function PhaseMap() {
  const q = useDataset("regimes");
  const hist = useDataset("regimes-history");
  const shown = recentRuns(hist.data?.data);
  const coveredSec = shown.length ? shown.reduce((a, r) => a + r.sec, 0) : null;
  return (
    <section className="cq-card cq-sec">
      <SecHead
        title="Phase map"
        sub="Ten phases, grouped into accumulation → markup → peak → distribution → markdown."
        right={coveredSec ? <span className="cq-asof">last {span(coveredSec)}</span> : <Freshness env={q.data} />}
      />
      <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={120}>
        {(d: RegimesResponse) => (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8 }}>
            {[...d.regimes]
              .sort((a, b) => a.id - b.id)
              .map((p) => {
                const g = cycleGroup(p.id);
                const on = p.id === d.current.id;
                const cur = d.current.id ?? 0;
                return (
                  <div key={p.id} className="min-w-0" title={`${p.name}: ${p.directional_bias} (${p.typical_duration})`} style={{ padding: "11px 12px", background: on ? A(g.c, 0.1) : "transparent", border: `1px solid ${on ? A(g.c, 0.6) : "#17202b"}`, borderRadius: 10, opacity: on ? 1 : p.id < cur ? 0.8 : 0.55 }}>
                    <div style={{ height: 3, borderRadius: 3, background: on ? g.c : A(g.c, 0.45), marginBottom: 10 }} />
                    <div className="cq-mono" style={{ fontSize: 11, color: "#8b98a9" }}>
                      {String(p.id).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3, lineHeight: 1.3, textWrap: "pretty" }}>{p.name}</div>
                    <div style={{ fontSize: 10.5, color: g.c, marginTop: 5 }}>{g.group}</div>
                  </div>
                );
              })}
          </div>
        )}
      </PanelBody>
      <div className="flex items-baseline justify-between" style={{ margin: "20px 0 8px", gap: 10 }}>
        <span className="cq-kicker">RECENT PHASE DURATIONS</span>
        <Freshness env={hist.data} />
      </div>
      <PanelBody env={hist.data} isLoading={hist.isLoading} skeletonHeight={34} compact>
        {(h) => {
          const now = Date.now();
          const runs = recentRuns(h);
          if (!runs.length) return <div style={{ fontSize: 12, color: "#5b6878" }}>No committed runs in the window.</div>;
          const total = runs.reduce((a, r) => a + r.sec, 0);
          return (
            <>
              <div className="flex" style={{ gap: 3, height: 34 }}>
                {runs.map((r, i) => {
                  const g = cycleGroup(r.id);
                  return (
                    <div
                      key={`${r.id}-${i}`}
                      className="flex min-w-0 items-center justify-between overflow-hidden cq-mono"
                      title={`Phase ${r.id} · ${r.name}: ${duration(r.sec)}${r.open ? " (current, still running)" : ""}`}
                      style={{ flex: `${Math.max(r.sec, total * 0.06)} 1 0%`, background: A(g.c, r.open ? 0.55 : 0.22), borderRadius: 5, padding: "0 10px", fontSize: 10.5, whiteSpace: "nowrap" }}
                    >
                      <span style={{ color: "#e6edf5", fontWeight: 600 }}>P{String(r.id).padStart(2, "0")}</span>
                      <span style={{ color: "#c9d3df" }}>{span(r.sec)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="cq-mono" style={{ fontSize: 10, color: "#4f5b6a", marginTop: 8 }}>
                last {runs.length} committed runs · {span(total)} · /regimes/history (recorded since {h.coverage_start ? dayMon(toMs(h.coverage_start) ?? now) : "Aug 2026"})
              </div>
            </>
          );
        }}
      </PanelBody>
    </section>
  );
}

interface ScoreSpec {
  id: DatasetId;
  label: string;
  high: string;
  pick: (d: Record<string, unknown>) => { value: number | null; badge: string };
}

const SCORES: ScoreSpec[] = [
  { id: "score-volatility", label: "Volatility", high: "Higher = more market-wide vol stress", pick: (r) => ({ value: finite(r.composite_score), badge: String(r.sentiment ?? "") }) },
  { id: "liquidity-regime", label: "Liquidity", high: "Higher = healthier market structure", pick: (r) => ({ value: finite(r.composite_score), badge: String(r.sentiment ?? "") }) },
  { id: "score-policy", label: "Policy", high: "Higher = more policy risk", pick: (r) => ({ value: finite(r.policy_risk_score), badge: String(r.band ?? "") }) },
  { id: "score-security", label: "Security", high: "Higher = more hack / depeg stress", pick: (r) => ({ value: finite(r.security_stress_score), badge: String(r.band ?? "") }) },
  { id: "score-event", label: "Event", high: "Higher = heavier catalyst calendar", pick: (r) => ({ value: finite(r.event_risk_score), badge: String(r.band ?? "") }) },
  { id: "score-meme", label: "Meme", high: "Higher = more meme froth", pick: (r) => ({ value: finite(r.composite_score), badge: String(r.sentiment ?? "") }) },
];

function ScoreTile({ spec }: { spec: ScoreSpec }) {
  const q = useDataset(spec.id);
  return (
    <div className="cq-tile flex flex-col items-center" style={{ padding: "12px 10px 10px", gap: 6 }} title={spec.high}>
      <PanelBody env={q.data as never} isLoading={q.isLoading} skeletonHeight={110} compact>
        {(d: unknown) => {
          const v = spec.pick(d as Record<string, unknown>);
          return (
            <>
              <div style={{ width: "100%", maxWidth: 140, height: 104 }}>{v.value !== null ? <GaugeView value={v.value} color="#4c9bff" label={`${spec.label} score ${v.value}`} /> : null}</div>
              <div style={{ fontSize: 11.5, color: "#9aa8b8" }}>{spec.label}</div>
              {v.badge ? (
                <span className="cq-mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", color: "#8b98a9", border: "1px solid #1c2531", padding: "1px 7px", borderRadius: 5 }}>
                  {v.badge.toUpperCase()}
                </span>
              ) : null}
            </>
          );
        }}
      </PanelBody>
      <Freshness env={q.data as never} />
    </div>
  );
}

function fmtSignal(key: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return humanize(v);
  const n = finite(v);
  if (n === null) return "—";
  if (/liq|usd|oi_usd/.test(key) && Math.abs(n) > 1000) return usd(n);
  if (/confidence/.test(key) && n <= 1) return `${(n * 100).toFixed(0)}%`;
  return num(n, Math.abs(n) >= 100 ? 0 : 1);
}

function MoreDetail() {
  const q = useDataset("regimes");
  const health = useDataset("market-health");
  return (
    <>
      <section className="cq-card cq-sec">
        <SecHead title="Supporting regime scores" sub="0-100, each from its own /score endpoint." />
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {SCORES.map((s) => (
            <ScoreTile key={s.id} spec={s} />
          ))}
        </div>
      </section>
      <Panel title="Health components" dataset="market-health" env={health.data} isLoading={health.isLoading} skeletonHeight={240}>
        {(d) => (
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { title: "Long-term (50%)", rows: d.long_term_components, color: "#a98bff" },
              { title: "Short-term (50%)", rows: d.short_term_components, color: "#2ee6a6" },
            ].map((g) => (
              <div key={g.title}>
                <div className="cq-kicker" style={{ marginBottom: 10 }}>
                  {g.title.toUpperCase()}
                </div>
                <div className="flex flex-col" style={{ gap: 12 }}>
                  {g.rows.map((c) => (
                    <div key={c.name} title={c.description}>
                      <div className="flex justify-between" style={{ fontSize: 12, marginBottom: 6 }}>
                        <span style={{ color: "#9aa8b8" }}>
                          {humanize(c.name)} <span className="cq-mono" style={{ color: "#5b6878", fontSize: 10.5 }}>w {(c.weight * 100).toFixed(0)}%</span>
                        </span>
                        <span className="cq-mono" style={{ fontWeight: 600 }}>
                          {c.score}
                        </span>
                      </div>
                      <div style={{ height: 5, background: "#151c26", borderRadius: 5, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, c.score))}%`, background: g.color, boxShadow: `0 0 10px ${A(g.color, 0.6)}`, borderRadius: 5 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Classifier signals" sub="Read live while the regime is committed through a dwell gate, so they can disagree mid-turn." dataset="regimes" env={q.data} isLoading={q.isLoading} skeletonHeight={200}>
          {(d) => {
            const sig = isRecord(d.current.signals) ? d.current.signals : {};
            return (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0 20px" }}>
                {Object.entries(sig).map(([k, v]) => (
                  <div key={k} className="flex justify-between" style={{ gap: 8, padding: "6px 0", borderTop: "1px solid #10161e", fontSize: 11.5 }}>
                    <span className="cq-mono truncate" style={{ color: "#5b6878", fontSize: 10.5 }}>
                      {k}
                    </span>
                    <span className="cq-mono" style={{ fontWeight: 500 }}>
                      {fmtSignal(k, v)}
                    </span>
                  </div>
                ))}
              </div>
            );
          }}
        </Panel>
        <Panel title="Distance to every cutoff" dataset="regimes" env={q.data} isLoading={q.isLoading} skeletonHeight={200}>
          {(d) => {
            const t = d.current.thresholds;
            if (!t) return <div style={{ fontSize: 12, color: "#5b6878" }}>No threshold data yet.</div>;
            const checks = [...t.checks].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
            const cols = "1.4fr 0.9fr 0.7fr 0.7fr 0.4fr 1.4fr";
            return (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 560 }}>
                  {t.nearest ? (
                    <div style={{ fontSize: 11.5, color: "#ffb547", marginBottom: 10 }}>
                      Nearest: {t.nearest.signal} {t.nearest.op} {num(t.nearest.cutoff, 1)} (now {num(t.nearest.value, 1)}, distance {num(t.nearest.distance, 1)}) gates {humanize(t.nearest.gates)}.
                    </div>
                  ) : null}
                  <div className="cq-th" style={{ gridTemplateColumns: cols, textAlign: "right" }}>
                    <span style={{ textAlign: "left" }}>SIGNAL</span>
                    <span>RULE</span>
                    <span>VALUE</span>
                    <span>DISTANCE</span>
                    <span>HOLDS</span>
                    <span style={{ textAlign: "left", paddingLeft: 8 }}>GATES</span>
                  </div>
                  {checks.map((ch, i) => (
                    <div key={`${ch.signal}-${ch.gates}-${i}`} className="cq-tr" style={{ gridTemplateColumns: cols }}>
                      <span style={{ textAlign: "left", fontSize: 10.5 }}>{ch.signal}</span>
                      <span style={{ color: "#9aa8b8" }}>
                        {ch.op} {num(ch.cutoff, 1)}
                      </span>
                      <span>{num(ch.value, 1)}</span>
                      <span style={{ color: "#9aa8b8" }}>{num(ch.distance, 1)}</span>
                      <span style={{ color: ch.holds ? "#2ee6a6" : "#5b6878" }}>{ch.holds ? "yes" : "no"}</span>
                      <span style={{ textAlign: "left", paddingLeft: 8, color: "#8b98a9", fontFamily: "var(--font-sans)" }}>{humanize(ch.gates)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        </Panel>
      </div>
    </>
  );
}

export function RegimesView() {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <CycleRing />
      <PhaseMap />
      <MoreDetail />
    </div>
  );
}
