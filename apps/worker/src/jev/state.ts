/**
 * The `state` sent to Jev for each classification. Shared by the classifier and by
 * scripts/jev-samples.ts, so the saved samples are exactly what the worker sends.
 */
import {
  DATASETS,
  type DatasetDef,
  type Envelope,
  type EventRegimeScoreResponse,
  type JevVerdictInput,
  type LiquidityRegimeResponse,
  type MarketHealthResponse,
  type NewsEvent,
  type NewsPulseResponse,
  type QuantCoinsRiskResponse,
  type QuantProbabilityObject,
  type RegimesResponse,
  type SqueezeAlertsResponse,
} from "@cqd/schemas";

/** News catalyst: headline, category, symbol, sources and CDA's own bias and impact. */
export function newsState(e: NewsEvent) {
  return {
    headline: e.title,
    category: e.category,
    symbol: e.symbol,
    published: e.published,
    sources: e.sources ?? [e.source],
    corroboration: e.corroboration,
    cda_bias: e.bias,
    cda_impact_score: e.impact_score,
  };
}

type SqueezeAlert = SqueezeAlertsResponse["alerts"][number];
type CoinRisk = QuantCoinsRiskResponse["items"][number];
type CoinLiquidity = LiquidityRegimeResponse["coins"][number];

/** Squeeze alert: the alert row plus the coin's regime probabilities and liquidity regime. */
export function squeezeState(a: SqueezeAlert, asOfMs: number, coin: CoinRisk | undefined, liquidity: CoinLiquidity | undefined) {
  return {
    alert: a,
    alerts_as_of: new Date(asOfMs).toISOString(),
    coin_regime: coin
      ? { regime: coin.regime, probabilities: coin.probabilities, vol_target_multiplier: coin.vol_target_multiplier, vol_pctile_30: coin.vol_pctile_30, rv_24h: coin.rv_24h }
      : null,
    liquidity_regime: liquidity ? { regime: liquidity.regime, confidence: liquidity.confidence, signals: liquidity.signals } : null,
  };
}

export const VERDICT_INPUTS = ["quant-market", "market-health", "regimes", "news-pulse", "squeeze-alerts", "score-event"] as const;
export type VerdictInputId = (typeof VERDICT_INPUTS)[number];

/** Market verdict: compact snapshot of six cached datasets, plus their as-of times for the UI. */
export function verdictState(envs: Record<VerdictInputId, Envelope | null>) {
  const inputs: JevVerdictInput[] = VERDICT_INPUTS.map((id) => ({
    dataset: id,
    label: (DATASETS[id] as DatasetDef).label,
    status: envs[id]?.status ?? "missing",
    asOf: envs[id]?.asOf ?? null,
    fetchedAt: envs[id]?.fetchedAt ?? null,
  }));
  const qm = envs["quant-market"]?.data as QuantProbabilityObject | null | undefined;
  const mh = envs["market-health"]?.data as MarketHealthResponse | null | undefined;
  const rg = envs.regimes?.data as RegimesResponse | null | undefined;
  const pulse = envs["news-pulse"]?.data as NewsPulseResponse | null | undefined;
  const sq = envs["squeeze-alerts"]?.data as SqueezeAlertsResponse | null | undefined;
  const ev = envs["score-event"]?.data as EventRegimeScoreResponse | null | undefined;
  const reg = qm?.current ?? qm?.regime ?? null;
  const regInfo = rg?.regimes.find((r) => r.id === rg.current.id);
  const state = {
    short_term_regime_hmm: qm
      ? {
          regime: reg ? { label: reg.label, name: reg.name, confidence: reg.confidence, hours_in_regime: reg.candles_in_regime } : null,
          probabilities_24h: qm.probabilities ?? null,
          simulated_24h: qm.tomorrow ?? null,
          as_of: qm.timestamp,
        }
      : null,
    market_health: mh
      ? {
          total_score: mh.total_score,
          long_term_score: mh.long_term_score,
          short_term_score: mh.short_term_score,
          sentiment: mh.sentiment,
          long_term_sentiment: mh.long_term_sentiment,
          short_term_sentiment: mh.short_term_sentiment,
          indicators: mh.indicators ?? null,
          as_of: mh.timestamp,
        }
      : null,
    long_term_cycle_regime: rg
      ? {
          phase: rg.current.name,
          phase_id: rg.current.id,
          stage: rg.current.stage_label ?? null,
          directional_bias: regInfo?.directional_bias ?? null,
          rationale: rg.current.rationale ?? null,
          live_read: rg.current.raw ? { name: rg.current.raw.name, matches_committed: rg.current.raw.matches_committed } : null,
          signals: rg.current.signals ?? null,
          as_of: rg.current.as_of ?? rg.as_of,
        }
      : null,
    news_pulse_top10: pulse
      ? [...pulse.rows]
          .sort((a, b) => b.news_pressure - a.news_pressure || b.headlines - a.headlines)
          .slice(0, 10)
          .map((r) => ({ symbol: r.symbol, news_pressure: r.news_pressure, news_tilt: r.news_tilt, event_count: r.event_count, top_impact: r.top_impact, headlines: r.headlines }))
      : null,
    squeeze_alerts: sq
      ? {
          active: sq.count,
          evaluated: sq.evaluated,
          window_s: sq.window_s,
          alerts: sq.alerts.map((a) => ({ symbol: a.symbol, direction: a.direction, severity: a.severity, triggered: a.triggered, total_liq_usd: a.total_liq_usd, spike_ratio: a.spike_ratio, oi_state: a.oi_state })),
        }
      : null,
    event_risk: ev
      ? {
          score: ev.event_risk_score,
          band: ev.band,
          events_7d: ev.events_7d,
          events_30d: ev.events_30d,
          counts: ev.counts ?? null,
          unlock_subscore: ev.unlock_subscore,
          macro_subscore: ev.macro_subscore,
          depeg_subscore: ev.depeg_subscore,
        }
      : null,
  };
  return { state, inputs, hasCore: Boolean(qm || mh || rg) };
}
