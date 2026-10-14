"use client";

import { useMemo, useState } from "react";
import { Freshness, Panel, PanelBody, SecHead } from "@/components/panel";
import { fanQuantiles, galaxySlice, marketRegimeState, ordinalMix, outcomeMix, regimeCoins, regimeFlows, type MixPart } from "@/cq/adapters";
import { FanView, GalaxyView } from "@/cq/react";
import { A, REG, REG_ORDER, regCode, type RegCode } from "@/cq/theme";
import { dateTime, duration, int, num } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { finite, isRecord, toMs } from "@/lib/utils";

/** Regime filter chips (dot, code, count) shared by the regime map and the perp grid. */
export function RegimeChips({ counts, focus, onFocus }: { counts: Record<RegCode, number>; focus: string; onFocus: (c: RegCode) => void }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 6 }}>
      {REG_ORDER.map((code) => {
        const c = REG[code].color;
        const on = focus === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onFocus(code)}
            aria-pressed={on}
            title={`${REG[code].label}: ${counts[code]} perps`}
            className="cq-mono flex items-center"
            style={{ gap: 6, padding: "5px 10px", background: on ? A(c, 0.16) : "transparent", border: `1px solid ${on ? c : "#1c2531"}`, borderRadius: 7, cursor: "pointer", fontSize: 10.5, color: "#c9d3df", transition: "all .2s" }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, boxShadow: `0 0 8px ${c}` }} />
            {code}
            <span style={{ color: "#5b6878" }}>{counts[code]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MixBar({ parts, height = 10, title }: { parts: MixPart[]; height?: number; title?: string }) {
  return (
    <div>
      <div className="flex" style={{ gap: 3, height }} role="img" aria-label={title ?? parts.map((p) => `${p.k} ${p.v}%`).join(", ")}>
        {parts.map((o) => (
          <div key={o.key} style={{ flex: `${Math.max(0.3, o.v)} 1 0%`, background: o.c, borderRadius: 3 }} />
        ))}
      </div>
    </div>
  );
}

export function MixLegend({ parts, dots = true, gap = "6px 12px" }: { parts: MixPart[]; dots?: boolean; gap?: string }) {
  return (
    <div className="flex flex-wrap" style={{ gap, marginTop: dots ? 9 : 8 }}>
      {parts.map((o) => (
        <span key={o.key} className="flex items-center" style={{ gap: 5, fontSize: 10.5, color: "#8b98a9" }}>
          {dots ? <span style={{ width: 7, height: 7, borderRadius: 2, background: o.c }} /> : null}
          {o.k} <b className="cq-mono" style={{ color: "#e6edf5" }}>{o.v}%</b>
        </span>
      ))}
    </div>
  );
}

function RegimeMap() {
  const market = useDataset("quant-market");
  const risk = useDataset("quant-coins-risk");
  const [focus, setFocus] = useState("");
  const galaxy = useMemo(() => galaxySlice(risk.data?.data, market.data?.data), [risk.data, market.data]);
  const data = useMemo(() => (galaxy ? { ...galaxy, focus } : null), [galaxy, focus]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(REG_ORDER.map((k) => [k, 0])) as Record<RegCode, number>;
    for (const x of regimeCoins(risk.data?.data)) c[x.code]++;
    return c;
  }, [risk.data]);
  return (
    <section className="cq-card cq-sec">
      <SecHead title="Regime map · every perp" mb={12} right={<RegimeChips counts={counts} focus={focus} onFocus={(c) => setFocus((f) => (f === c ? "" : c))} />} />
      <div className="cq-stage" style={{ height: "clamp(620px, 76vh, 860px)" }}>
        <div className="absolute inset-0" style={{ padding: data ? 0 : 14 }}>
          <PanelBody env={risk.data} isLoading={risk.isLoading} skeletonHeight="100%" fill>
            {() => (data ? <GalaxyView data={data} label="Regime map: every perp clustered by its short-term regime; flows show the market's odds of each regime in 24h" /> : null)}
          </PanelBody>
        </div>
        <div className="cq-stage-hint">drag to orbit · click a perp to open it in Perp Regimes</div>
      </div>
    </section>
  );
}

function MarketRegime() {
  const q = useDataset("quant-market");
  const now = useNow() || Date.now();
  return (
    <Panel title="Market regime · short-term HMM" env={q.data} isLoading={q.isLoading} mb={16} skeletonHeight={480} style={{ flex: "2 1 560px" }}>
      {(d) => {
        const reg = marketRegimeState(d);
        const code = regCode(reg?.label);
        const color = code ? REG[code].color : "#5b6878";
        const qs = fanQuantiles(d);
        const t = isRecord(d.tomorrow) ? d.tomorrow : {};
        const volSpike = finite(t.p_visit_vol_spike);
        const drop5 = finite(t.p_drawdown_gt_5pct);
        const since = toMs(reg?.in_regime_since);
        const outcome = outcomeMix(d);
        const next = regimeFlows(d).map((f) => ({ key: f.k, k: f.k, v: f.v, c: REG[f.code].color }));
        const vol = ordinalMix(d, "volatility");
        const liq = ordinalMix(d, "liquidation_risk");
        const headConf = finite(d.probabilities?.directional?.confidence);
        return (
          <>
            <div className="flex items-baseline justify-between" style={{ gap: 10, marginBottom: 8 }}>
              <span className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878" }}>
                SIMULATED 24H RETURN RANGE · MONTE CARLO
              </span>
              <span className="cq-mono" style={{ fontSize: 10, color: "#5b6878" }}>
                p5 / median / p95
              </span>
            </div>
            <div className="cq-stage" style={{ height: "clamp(300px, 40vh, 420px)", marginBottom: 20 }}>
              {qs ? (
                <FanView p5={qs.p5} p50={qs.p50} p95={qs.p95} label={`Simulated 24h return: p5 ${qs.p5.toFixed(1)}%, median ${qs.p50.toFixed(2)}%, p95 ${qs.p95.toFixed(1)}%`} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 12, color: "#5b6878" }}>
                  Range unavailable (24h horizon only).
                </div>
              )}
            </div>
            {!reg ? (
              <div style={{ fontSize: 12, color: "#8b98a9" }}>Model warming up: no regime yet ({d.meta.status}).</div>
            ) : (
              <div className="flex flex-wrap" style={{ gap: 26 }}>
                <div className="flex min-w-0 flex-col" style={{ flex: "1 1 280px", gap: 14 }}>
                  <div className="flex" style={{ gap: 14 }}>
                    <div style={{ width: 4, borderRadius: 4, background: color, boxShadow: `0 0 18px ${A(color, 0.75)}` }} />
                    <div>
                      <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                        <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.03em" }}>{reg.name}</span>
                        {code ? (
                          <span className="cq-mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color, background: A(color, 0.1), border: `1px solid ${A(color, 0.4)}`, padding: "2px 7px", borderRadius: 5 }}>
                            {code}
                          </span>
                        ) : null}
                        {reg.label_raw && reg.label_raw !== reg.label ? (
                          <span className="cq-mono" title="Argmax label before hysteresis; the headline lags until the challenger confirms." style={{ fontSize: 10, color: "#ffb547", border: "1px solid rgba(255,181,71,0.4)", padding: "2px 7px", borderRadius: 5 }}>
                            raw {regCode(reg.label_raw) ?? reg.label_raw}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: "#8b98a9", marginTop: 6 }}>
                        Confidence <b className="cq-mono" style={{ color: "#e6edf5" }}>{Math.round(reg.confidence * 100)}%</b> · in regime{" "}
                        <b className="cq-mono" style={{ color: "#e6edf5", fontWeight: 500 }}>{since ? duration((now - since) / 1000) : `${reg.candles_in_regime}h`}</b>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2" style={{ gap: 10 }}>
                    <div className="cq-tile" style={{ padding: "12px 14px" }} title="Share of 1,000 seeded Monte Carlo paths that visit the vol-spike regime in the next 24h.">
                      <div className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878" }}>
                        VOL SPIKE ODDS 24H
                      </div>
                      <div className="cq-mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>
                        {volSpike !== null ? `${(volSpike * 100).toFixed(1)}%` : "—"}
                      </div>
                    </div>
                    <div className="cq-tile" style={{ padding: "12px 14px" }} title="Share of simulated paths with a drawdown greater than 5% within 24h.">
                      <div className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878" }}>
                        &gt;5% DROP ODDS 24H
                      </div>
                      <div className="cq-mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>
                        {drop5 !== null ? `${(drop5 * 100).toFixed(1)}%` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col" style={{ flex: "1 1 300px", gap: 20 }}>
                  <div>
                    <div className="flex justify-between" style={{ marginBottom: 9 }}>
                      <span style={{ fontSize: 12, color: "#c9d3df", fontWeight: 500 }}>24h outcome distribution</span>
                      {headConf !== null ? (
                        <span className="cq-mono" style={{ fontSize: 10.5, color: "#5b6878" }}>
                          head conf {Math.round(headConf * 100)}%
                        </span>
                      ) : null}
                    </div>
                    <MixBar parts={outcome} />
                    <MixLegend parts={outcome} />
                  </div>
                  {next.length ? (
                    <div>
                      <div style={{ fontSize: 12, color: "#c9d3df", fontWeight: 500, marginBottom: 9 }}>Regime in 24h · transition odds</div>
                      <MixBar parts={next} />
                      <MixLegend parts={next} />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2" style={{ gap: 16 }}>
                    {(
                      [
                        ["Volatility", vol],
                        ["Liquidation risk", liq],
                      ] as const
                    ).map(([k, parts]) => (
                      <div key={k}>
                        <div style={{ fontSize: 12, color: "#c9d3df", fontWeight: 500, marginBottom: 9 }}>{k}</div>
                        <MixBar parts={parts} height={8} />
                        <MixLegend parts={parts} dots={false} gap="0 9px" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }}
    </Panel>
  );
}

function ModelCard() {
  const q = useDataset("quant-model");
  return (
    <section className="cq-card" style={{ padding: "16px 20px 18px" }}>
      <div className="flex items-baseline justify-between" style={{ gap: 12, marginBottom: 12 }}>
        <div className="flex items-baseline" style={{ gap: 10 }}>
          <span className="cq-kicker">METADATA · MODEL CARD</span>
          <span className="cq-mono" style={{ fontSize: 10.5, color: "#4f5b6a" }}>
            /quant/model
          </span>
        </div>
        <Freshness env={q.data} />
      </div>
      <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={140}>
        {(d) => {
          const runtime = isRecord(d.runtime) ? d.runtime : {};
          const universe = isRecord(runtime.universe) ? runtime.universe : {};
          const drift = isRecord(runtime.drift) ? runtime.drift : {};
          const cur = isRecord(drift.current) && isRecord(drift.current.market) ? drift.current.market : {};
          const base = isRecord(drift.baseline) ? drift.baseline : {};
          const live = finite(cur.loglik_7d_mean);
          const mean = finite(base.mean);
          const std = finite(base.std);
          const z = live !== null && mean !== null && std ? (live - mean) / std : null;
          const validation = isRecord(d.validation) ? d.validation : {};
          const folds = Array.isArray(validation.folds) ? validation.folds.length : null;
          const anchors = Array.isArray(validation.anchor_checks) ? (validation.anchor_checks as Array<Record<string, unknown>>) : [];
          const lastInference = toMs(runtime.last_inference);
          const retrain = toMs(d.last_retrain);
          const rows: Array<{ k: string; v: string; kind: "ok" | "bad" | "mono" | "plain" }> = [
            { k: "Status", v: d.loaded ? "loaded" : "not loaded", kind: d.loaded ? "ok" : "bad" },
            { k: "Model", v: `${(d.model_family ?? "?").toUpperCase()} v${d.model_version ?? "?"} (features ${d.feature_version ?? "?"})`, kind: "plain" },
            { k: "Last retrain", v: retrain ? `${dateTime(retrain)} (${duration((Date.now() - retrain) / 1000)} ago)` : "—", kind: "plain" },
            { k: "Last inference", v: lastInference ? dateTime(lastInference) : "—", kind: "plain" },
            { k: "Universe", v: `${int(finite(universe.active))} active / ${int(finite(universe.tracked))} tracked / ${int(finite(universe.warmed_up))} warmed up`, kind: "plain" },
            { k: "Labels", v: (d.labels ?? []).map((l) => regCode(l) ?? l).join(" · "), kind: "plain" },
            { k: "Validation", v: folds !== null ? `${folds} walk-forward folds, mean OOS loglik ${num(finite(validation.mean_oos_loglik), 2)}, max flap ${num(finite(validation.max_flap_rate), 2)}/day` : "—", kind: "plain" },
            { k: "Anchor checks", v: anchors.length ? `${anchors.filter((a) => a.ok === true).length}/${anchors.length} historical anchors matched` : "—", kind: "plain" },
            { k: "Drift (7d loglik)", v: z !== null ? `${num(live, 2)} vs baseline ${num(mean, 2)} (z ${num(z, 2)})` : "—", kind: "plain" },
            { k: "sha256", v: d.sha256 ?? "—", kind: "mono" },
          ];
          return (
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0 24px" }}>
              {rows.map((m) => (
                <div key={m.k} className="grid min-w-0 items-baseline" style={{ gridTemplateColumns: "104px minmax(0,1fr)", gap: 10, padding: "7px 0", borderTop: "1px solid #10161e", fontSize: 11.5 }}>
                  <span style={{ color: "#5b6878" }}>{m.k}</span>
                  {m.kind === "ok" || m.kind === "bad" ? (
                    <span>
                      <span className="cq-mono" style={{ fontSize: 10, color: m.kind === "ok" ? "#2ee6a6" : "#ff5c6c", background: A(m.kind === "ok" ? "#2ee6a6" : "#ff5c6c", 0.1), border: `1px solid ${A(m.kind === "ok" ? "#2ee6a6" : "#ff5c6c", 0.4)}`, padding: "1px 7px", borderRadius: 5 }}>
                        {m.v}
                      </span>
                    </span>
                  ) : m.kind === "mono" ? (
                    <span className="cq-mono truncate" style={{ fontSize: 10, color: "#8b98a9" }} title={m.v}>
                      {m.v}
                    </span>
                  ) : (
                    <span style={{ color: "#c9d3df", textWrap: "pretty" }}>{m.v}</span>
                  )}
                </div>
              ))}
            </div>
          );
        }}
      </PanelBody>
    </section>
  );
}

export function MarketRegimesView() {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <RegimeMap />
      <div className="flex flex-wrap" style={{ gap: 16 }}>
        <MarketRegime />
      </div>
      <ModelCard />
    </div>
  );
}
