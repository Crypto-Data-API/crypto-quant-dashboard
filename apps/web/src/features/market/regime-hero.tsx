"use client";

import type { QuantProbabilityObject } from "@cqd/schemas";
import { Timer } from "lucide-react";
import { ProbBar } from "@/components/charts/basic";
import { Panel } from "@/components/panel";
import { Badge, Tip } from "@/components/ui/primitives";
import { headBuckets, hmmMeta } from "@/lib/domain";
import { duration, frac, pct } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { finite, isRecord, toMs } from "@/lib/utils";

/** Simulated 24h return range: p5..p95 whisker, p25..p75 box, p50 tick, on a symmetric axis. */
function ReturnRange({ q }: { q: Record<string, number | null> }) {
  const p5 = q.p5 ?? null;
  const p95 = q.p95 ?? null;
  const p50 = q.p50 ?? null;
  if (p5 === null || p95 === null || p50 === null) return <div className="text-xs text-muted-foreground">Range unavailable (24h horizon only).</div>;
  const p25 = q.p25 ?? p5;
  const p75 = q.p75 ?? p95;
  const lim = Math.max(Math.abs(p5), Math.abs(p95), 0.01) * 1.15;
  const x = (v: number) => `${((v + lim) / (2 * lim)) * 100}%`;
  return (
    <div>
      <div className="relative h-7" role="img" aria-label={`Simulated 24h return: 5th percentile ${frac(p5)}, median ${frac(p50)}, 95th percentile ${frac(p95)}`}>
        <div className="absolute top-1/2 left-1/2 h-4 w-px -translate-y-1/2 bg-axis" />
        <div className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/60" style={{ left: x(p5), width: `calc(${x(p95)} - ${x(p5)})` }} />
        <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-primary/35" style={{ left: x(p25), width: `calc(${x(p75)} - ${x(p25)})` }} />
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-primary" style={{ left: x(p50) }} />
      </div>
      <div className="num flex justify-between text-[11px] text-muted-foreground">
        <span>
          p5 <span className="text-foreground">{frac(p5, { sign: true })}</span>
        </span>
        <span>
          median <span className="text-foreground">{frac(p50, { sign: true, digits: 2 })}</span>
        </span>
        <span>
          p95 <span className="text-foreground">{frac(p95, { sign: true })}</span>
        </span>
      </div>
    </div>
  );
}

export function RegimeHeroBody({ d, compact = false }: { d: QuantProbabilityObject; compact?: boolean }) {
  const now = useNow() || Date.now();
  const reg = d.current ?? d.regime ?? null;
  const meta = hmmMeta(reg?.label);
  const since = toMs(reg?.in_regime_since);
  const tomorrow = isRecord(d.tomorrow) ? d.tomorrow : {};
  const quantiles = isRecord(tomorrow.cum_return_quantiles) ? (tomorrow.cum_return_quantiles as Record<string, number | null>) : {};
  const volSpike = finite(tomorrow.p_visit_vol_spike);
  const drawdown = finite(tomorrow.p_drawdown_gt_5pct);
  const probs = d.probabilities ?? {};
  const pending = isRecord(reg?.pending) ? reg.pending : null;

  if (!reg) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Model warming up: no regime yet ({d.meta.status}).</div>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold">{reg.name}</span>
              <Badge variant="outline">{meta.short}</Badge>
              {reg.label_raw && reg.label_raw !== reg.label ? (
                <Tip content="Argmax label before hysteresis. The headline label lags until the challenger confirms.">
                  <Badge variant="warning">raw: {hmmMeta(reg.label_raw).short}</Badge>
                </Tip>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Confidence <span className="num font-medium text-foreground">{frac(reg.confidence, { digits: 0 })}</span>
                <span className="text-muted-foreground/70"> (raw {frac(reg.confidence_raw, { digits: 0 })})</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3.5" aria-hidden />
                In regime {since ? duration((now - since) / 1000) : `${reg.candles_in_regime}h`}
              </span>
              {pending ? (
                <span>
                  Challenger {hmmMeta(String(pending.label ?? "")).short} {String(pending.count ?? "?")}/{String(pending.needed ?? "?")}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Tip content="Share of 1,000 seeded Monte Carlo paths that visit the vol-spike regime in the next 24h.">
            <div tabIndex={0} className="rounded-md border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Vol spike odds 24h</div>
              <div className="text-lg font-semibold">{frac(volSpike, { digits: 1 })}</div>
            </div>
          </Tip>
          <Tip content="Share of simulated paths with a drawdown greater than 5% within 24h.">
            <div tabIndex={0} className="rounded-md border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <div className="text-[10px] tracking-wide text-muted-foreground uppercase">&gt;5% drop odds 24h</div>
              <div className="text-lg font-semibold">{frac(drawdown, { digits: 1 })}</div>
            </div>
          </Tip>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Simulated 24h return range</div>
          <ReturnRange q={quantiles} />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-[11px] font-medium text-muted-foreground">
            <span>24h outcome distribution</span>
            {probs.directional?.confidence !== undefined ? <span>head confidence {pct((probs.directional.confidence ?? 0) * 100, { digits: 0 })}</span> : null}
          </div>
          <ProbBar buckets={headBuckets("directional", probs.directional)} height={12} />
        </div>
        {!compact ? (
          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Regime in 24h</div>
            <ProbBar buckets={headBuckets("regime_transitions", probs.regime_transitions)} height={8} />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {(["volatility", "liquidation_risk"] as const).map((h) =>
            probs[h] ? (
              <div key={h}>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground capitalize">{h.replace("_", " ")}</div>
                <ProbBar buckets={headBuckets(h, probs[h])} height={8} />
              </div>
            ) : null,
          )}
        </div>
        <div className="text-[10px] text-muted-foreground/80">
          {d.meta.model_family.toUpperCase()} v{d.meta.model_version} &middot; status {d.meta.status}
          {d.meta.data_staleness_ms != null ? <> &middot; bar age {duration(d.meta.data_staleness_ms / 1000)}</> : null}
        </div>
      </div>
    </div>
  );
}

export function RegimeHeroCard({ compact = false, className }: { compact?: boolean; className?: string }) {
  const q = useDataset("quant-market");
  return (
    <Panel title="Market regime (short-term HMM)" dataset="quant-market" env={q.data} isLoading={q.isLoading} className={className} skeletonHeight={220}>
      {(d) => <RegimeHeroBody d={d} compact={compact} />}
    </Panel>
  );
}
