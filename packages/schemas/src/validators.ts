/**
 * Runtime validators per dataset (server-side only: imports zod). The worker runs every CDA
 * response through these. A failure is recorded on the envelope and logged, but the data is
 * still cached: validation is a drift alarm, not a gate that blanks the dashboard.
 */
import type { z } from "zod";
import type { DatasetId } from "./datasets";
import * as Cda from "./generated/cda";
import * as P from "./permissive";

export const VALIDATORS: Record<DatasetId, z.ZodType> = {
  "cda-health": Cda.HealthCheckResponse,
  "quant-market": Cda.QuantProbabilityObject,
  "quant-coins-risk": Cda.QuantCoinsRiskResponse,
  "quant-model": Cda.QuantModelCardResponse,
  "quant-coin": Cda.QuantCoinDetailResponse,
  regimes: Cda.RegimesResponse,
  "market-health": Cda.MarketHealthResponse,
  "score-volatility": Cda.VolatilityRegimeScoreResponse,
  "score-policy": Cda.PolicyRegimeScoreResponse,
  "score-security": Cda.SecurityRegimeScoreResponse,
  "score-event": Cda.EventRegimeScoreResponse,
  "score-meme": Cda.MemeRegimeScoreResponse,
  "derivatives-summary": Cda.CrossExchangeSummary,
  "quant-gex": P.GexResponse,
  "quant-gex-coin": P.GexResponse,
  "gex-history": P.GexHistoryResponse,
  "quant-positioning": P.PositioningResponse,
  "quant-whales": P.WhalesResponse,
  "volume-scanner": Cda.VolumeScannerResponse,
  "volume-detail": Cda.VolumeScannerDetailResponse,
  "liquidity-depth": Cda.DepthResponse,
  "liquidity-regime": Cda.LiquidityRegimeResponse,
  "oi-divergence": Cda.OIDivergenceResponse,
  "l2-book": P.L2BookResponse,
  "depth-history": Cda.CoinDepthHistoryResponse,
  liquidations: P.LiquidationsResponse,
  "liquidations-by-exchange": P.ExchangeLiquidationsResponse,
  "squeeze-alerts": Cda.SqueezeAlertsResponse,
  "event-calendar": Cda.EventRegimeResponse,
  "supply-unlocks": Cda.SupplyUnlocksResponse,
  "event-symbol": Cda.EventSymbolOverlayResponse,
};

/** Validate a payload; returns at most `maxIssues` readable issue strings. */
export function validateDataset(id: DatasetId, data: unknown, maxIssues = 8): { ok: boolean; issues?: string[] } {
  const result = VALIDATORS[id].safeParse(data);
  if (result.success) return { ok: true };
  const issues = result.error.issues.slice(0, maxIssues).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, issues };
}

export * as CdaSchemas from "./generated/cda";
export * as PermissiveSchemas from "./permissive";
export { StreamEvent, DelayedStreamResponse } from "./stream";
