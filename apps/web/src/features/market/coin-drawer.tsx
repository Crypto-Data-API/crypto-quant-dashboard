"use client";

import type { QuantCoinRisk } from "@cqd/schemas";
import { DivergingBar, ProbBar } from "@/components/charts/basic";
import { PanelBody } from "@/components/panel";
import { Badge, Sheet, SheetContent, Tip } from "@/components/ui/primitives";
import { biasTone, EVENT_TYPES, HEADS, headBuckets, hmmMeta } from "@/lib/domain";
import { dateShort, dateTime, frac, multiple, num, pct } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { finite, isRecord, toMs } from "@/lib/utils";
import { Freshness } from "@/components/panel";
import { CoinNews } from "@/features/news/news-parts";

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function RegimeTimeline({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return <div className="text-xs text-muted-foreground">No recent inference rows.</div>;
  return (
    <div>
      <div className="flex h-5 gap-[2px]" role="img" aria-label="Recent regime history, oldest to newest">
        {rows.map((r, i) => {
          const m = hmmMeta(String(r.regime_label ?? ""));
          const conf = finite(r.confidence);
          return (
            <Tip key={i} content={`${dateTime(toMs(r.timestamp))}: ${m.name}${conf !== null ? ` (${frac(conf, { digits: 0 })})` : ""}`}>
              <div className="h-full flex-1 rounded-[2px]" style={{ background: m.color, opacity: conf !== null ? 0.35 + conf * 0.65 : 0.6 }} />
            </Tip>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{dateTime(toMs(rows[0]?.timestamp))}</span>
        <span>now</span>
      </div>
    </div>
  );
}

function CatalystOverlay({ symbol }: { symbol: string }) {
  const q = useDataset("event-symbol", { param: symbol });
  return (
    <Section title="Catalysts (next 7d)" aside={<Freshness env={q.data} />}>
      <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={40} compact>
        {(d) =>
          (d.pending?.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">No pending catalysts for {d.symbol}. Net bias {d.net_bias ?? "neutral"}.</div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-xs">
                Net bias <Badge variant={biasTone(d.net_bias)}>{d.net_bias}</Badge> magnitude {num(d.net_magnitude, 2)}
              </div>
              <ul className="space-y-1 text-xs">
                {d.pending?.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="num w-14 text-muted-foreground">{dateShort(toMs(p.date))}</span>
                    <Badge variant="outline">{EVENT_TYPES[p.event_type] ?? p.event_type}</Badge>
                    <Badge variant={biasTone(p.bias)}>{p.bias}</Badge>
                    <span className="text-muted-foreground">in {p.days_until}d</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
      </PanelBody>
    </Section>
  );
}

/** Per-coin regime drawer: probability heads, explain z-scores, hysteresis, calibration, catalysts. */
export function CoinDrawer({ symbol, risk, onClose }: { symbol: string | null; risk?: QuantCoinRisk | null; onClose: () => void }) {
  const q = useDataset("quant-coin", { param: symbol });
  return (
    <Sheet open={symbol !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      {symbol ? (
        <SheetContent title={`${symbol} regime`} description="Per-coin HMM nowcast, conditioned on the market regime. Fetched on demand while this drawer is open.">
          <div className="space-y-5">
            <div className="flex justify-end">
              <Freshness env={q.data} />
            </div>
            <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={300}>
              {(d) => {
                const reg = d.current ?? d.regime;
                const meta = hmmMeta(reg?.label);
                const explain = isRecord(d.explain) ? d.explain : {};
                const features = isRecord(explain.features) ? (explain.features as Record<string, number>) : {};
                const hyst = isRecord(explain.hysteresis) ? explain.hysteresis : {};
                const calib = isRecord(explain.calibration) ? explain.calibration : {};
                const tomorrow = isRecord(d.tomorrow) ? d.tomorrow : {};
                const q5 = isRecord(tomorrow.cum_return_quantiles) ? (tomorrow.cum_return_quantiles as Record<string, number>) : {};
                const probs = d.probabilities ?? {};
                const heads = Object.keys(probs).sort((a, b) => Object.keys(HEADS).indexOf(a) - Object.keys(HEADS).indexOf(b));
                return (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">{reg?.name ?? "Warming up"}</span>
                          <Badge variant="outline">{meta.short}</Badge>
                          {d.meta.insufficient_history ? <Badge variant="warning">insufficient history</Badge> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Confidence {frac(reg?.confidence, { digits: 0 })} (raw {frac(reg?.confidence_raw, { digits: 0 })}) &middot; {reg?.candles_in_regime ?? "?"}h in regime &middot; status {d.meta.status}
                        </div>
                      </div>
                    </div>

                    {risk ? (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md border px-2 py-1.5">
                          <div className="text-[10px] text-muted-foreground">Vol-target size</div>
                          <div className="num font-semibold">{multiple(risk.vol_target_multiplier)}</div>
                        </div>
                        <div className="rounded-md border px-2 py-1.5">
                          <div className="text-[10px] text-muted-foreground">30d vol pctile</div>
                          <div className="num font-semibold">{pct(risk.vol_pctile_30, { digits: 0 })}</div>
                        </div>
                        <div className="rounded-md border px-2 py-1.5">
                          <div className="text-[10px] text-muted-foreground">RV (ann.)</div>
                          <div className="num font-semibold">{pct(risk.rv_24h, { digits: 0 })}</div>
                        </div>
                      </div>
                    ) : null}

                    <Section title="Recent regimes (hourly)">
                      <RegimeTimeline rows={(d.recent_regimes ?? []) as Array<Record<string, unknown>>} />
                    </Section>

                    <Section title={`Probability heads (${d.horizon})`}>
                      <div className="space-y-3">
                        {heads.map((h) => (
                          <div key={h}>
                            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                              <span>{HEADS[h]?.label ?? h}</span>
                              {probs[h]?.confidence !== undefined ? <span>conf {frac(probs[h]?.confidence, { digits: 0 })}</span> : null}
                            </div>
                            <ProbBar buckets={headBuckets(h, probs[h])} height={8} />
                          </div>
                        ))}
                      </div>
                    </Section>

                    {q5.p50 !== undefined ? (
                      <Section title="Monte Carlo (24h)">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            p5 / p50 / p95
                            <div className="num font-semibold">
                              {frac(q5.p5, { sign: true })} / {frac(q5.p50, { sign: true, digits: 2 })} / {frac(q5.p95, { sign: true })}
                            </div>
                          </div>
                          <div>
                            Vol spike odds<div className="num font-semibold">{frac(finite(tomorrow.p_visit_vol_spike))}</div>
                          </div>
                          <div>
                            &gt;5% drop odds<div className="num font-semibold">{frac(finite(tomorrow.p_drawdown_gt_5pct))}</div>
                          </div>
                        </div>
                      </Section>
                    ) : null}

                    <Section title="Explain: feature z-scores">
                      {Object.keys(features).length === 0 ? (
                        <div className="text-xs text-muted-foreground">No feature block.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {Object.entries(features).map(([k, v]) => (
                            <div key={k} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-2 text-xs">
                              <span className="truncate font-mono text-[11px] text-muted-foreground">{k}</span>
                              <DivergingBar value={v} maxAbs={3} pos="#3987e5" neg="#d95926" />
                              <span className="num text-right">{num(v, 2)}</span>
                            </div>
                          ))}
                          <div className="text-[10px] text-muted-foreground">Bars clipped at |z| = 3. Blue positive, orange negative.</div>
                        </div>
                      )}
                    </Section>

                    <Section title="Hysteresis and calibration">
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {typeof hyst.rule === "string" ? <p>{hyst.rule}</p> : null}
                        <p>
                          Pending challenger: {isRecord(hyst.pending_challenger) ? `${hmmMeta(String(hyst.pending_challenger.label)).short} ${String(hyst.pending_challenger.count ?? "")}/${String(hyst.pending_challenger.needed ?? "")}` : "none"}
                        </p>
                        <p>
                          Calibration: raw {frac(finite(calib.confidence_raw), { digits: 1 })} &rarr; calibrated {frac(finite(calib.confidence_calibrated), { digits: 1 })}
                          {finite(calib.scale_applied) !== null ? ` (scale ${num(finite(calib.scale_applied), 2)})` : ""}
                        </p>
                      </div>
                    </Section>
                  </div>
                );
              }}
            </PanelBody>
            <CatalystOverlay symbol={symbol} />
            <CoinNews symbol={symbol} compact />
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
