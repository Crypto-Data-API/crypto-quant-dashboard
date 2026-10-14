/**
 * Schemas for CDA endpoints whose OpenAPI entry has no response schema
 * (/quant/gex, /quant/gex/history, /quant/positioning, /quant/whales) or types the payload
 * loosely (/market-intelligence/liquidations and /liquidations/by-exchange are `data: any`,
 * /hyperliquid/l2-book levels are `array<object>`).
 *
 * Field names were written from the endpoint descriptions and then checked against real Pro
 * responses captured on 2026-10-14 (docs/samples/). They stay deliberately loose: objects
 * pass unknown keys through and most fields are nullish, so an additive change upstream
 * never blanks a panel. `pnpm --filter @cqd/schemas check-samples` re-validates the samples.
 *
 * TODO(samples): make the fields that were present in every sample required once a few
 * days of samples (including warming / thin-coverage coins) have been collected.
 */
import { z } from "zod";

const num = z.number().nullish();
const str = z.string().nullish();
const bool = z.boolean().nullish();
const anyRecord = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// /api/v1/quant/gex: dealer positioning / gamma exposure (perp analog). `coins` is keyed
// by symbol.
// ---------------------------------------------------------------------------
export const GexProfileBin = z.looseObject({
  price_lo: z.number(),
  price_hi: z.number(),
  long_usd: num,
  short_usd: num,
  total_usd: num,
});

export const GexLevel = z.looseObject({
  price: z.number(),
  dist_pct: num,
  total_usd: num,
  side: str,
  n_accounts: num,
});

export const GexRegime = z.looseObject({
  /** amplify | dampen | transitional */
  state: str,
  score: num,
  confidence: num,
  /** full | funding_only | none */
  coverage: str,
  insufficient_mm_coverage: bool,
  rules_version: str,
  fuel_side: str,
  flip_price: num,
  dist_to_flip_pct: num,
  rationale: str,
  inputs: anyRecord.nullish(),
  since: str,
});

export const GexDistributionContext = z.looseObject({
  window_days: num,
  history_days: num,
  sample_count: num,
  /** "warming" until 2 days of hourly samples exist (all *_pctile null), then "ok". */
  status: str,
  sample_ts: num,
  near_density_pctile: num,
  abs_dist_to_flip_pctile: num,
  mm_skew_pctile: num,
  regime_score_pctile: num,
  funding_rate_pctile: num,
  mm_skew: num,
  mm_skew_z: num,
  funding_pinned: bool,
});

export const GexCoin = z.looseObject({
  mark: num,
  positions_as_of: num,
  mm_net_delta: num,
  mm_long_usd: num,
  mm_short_usd: num,
  mm_gross: num,
  mm_n_accounts: num,
  gamma_flip: num,
  gamma_profile: z.array(GexProfileBin).nullish(),
  coverage: z.looseObject({ bands: num, mm_n_accounts: num, has_flip: bool, history_days: num }).nullish(),
  levels: z.array(GexLevel).nullish(),
  funding_rate: num,
  oracle_price: num,
  premium: num,
  open_interest: num,
  open_interest_usd: num,
  oi_change_pct: num,
  dist_to_flip_pct: num,
  regime: GexRegime.nullish(),
  distribution_context: GexDistributionContext.nullish(),
});

export const GexResponse = z.looseObject({
  scope: str,
  note: str,
  timestamp: str,
  positions_as_of: num,
  meta: anyRecord.nullish(),
  coins: z.record(z.string(), GexCoin),
});
export type GexResponse = z.infer<typeof GexResponse>;
export type GexCoin = z.infer<typeof GexCoin>;
export type GexProfileBin = z.infer<typeof GexProfileBin>;
export type GexLevel = z.infer<typeof GexLevel>;

// /api/v1/quant/gex/history: hourly ring of the /quant/gex scalars for one coin (<= 720 points).
export const GexHistoryPoint = z.looseObject({
  ts: num,
  near_density: num,
  abs_dist_to_flip: num,
  dist_to_flip_pct: num,
  mm_skew: num,
  mm_gross: num,
  mm_n_accounts: num,
  regime_score: num,
  funding_rate: num,
  oi_change_pct: num,
});
export const GexHistoryResponse = z.looseObject({
  scope: str,
  symbol: str,
  grain: str,
  timestamp: str,
  count: num,
  meta: anyRecord.nullish(),
  points: z.array(GexHistoryPoint),
});
export type GexHistoryResponse = z.infer<typeof GexHistoryResponse>;
export type GexHistoryPoint = z.infer<typeof GexHistoryPoint>;

// ---------------------------------------------------------------------------
// /api/v1/quant/positioning: per-coin long/short/net/gross by trader type (a partition:
// market_maker, whale, other, all) and by tag (overlays: smart_money, high_leverage).
// ---------------------------------------------------------------------------
export const PositionBucket = z.looseObject({
  long_usd: num,
  short_usd: num,
  net_usd: num,
  gross_usd: num,
  n_accounts: num,
});
export const PositioningCoin = z.looseObject({
  mark: num,
  positions_as_of: num,
  by_type: z.record(z.string(), PositionBucket).nullish(),
  by_tag: z.record(z.string(), PositionBucket).nullish(),
});
export const PositioningResponse = z.looseObject({
  scope: str,
  timestamp: str,
  positions_as_of: num,
  meta: anyRecord.nullish(),
  coins: z.record(z.string(), PositioningCoin),
});
export type PositioningResponse = z.infer<typeof PositioningResponse>;
export type PositionBucket = z.infer<typeof PositionBucket>;
export type PositioningCoin = z.infer<typeof PositioningCoin>;

// ---------------------------------------------------------------------------
// /api/v1/quant/whales: the >= $100k Hyperliquid account universe.
// ---------------------------------------------------------------------------
export const WhaleTopCoin = z.looseObject({
  coin: z.string(),
  mark: num,
  segment: str,
  positions_as_of: num,
  gross_usd: num,
  long_usd: num,
  short_usd: num,
  net_usd: num,
  /** Net excluding market-maker liquidity: the conviction read. */
  directional_net_usd: num,
  long_pct: num,
  long_pct_pctile_30d: num,
  net_bias: str,
  n_accounts: num,
  n_long: num,
  n_short: num,
  dominant_side: str,
});
export const WhalesResponse = z.looseObject({
  scope: str,
  timestamp: str,
  positions_as_of: num,
  summary: z.looseObject({
    accounts_tracked: num,
    universe_size: num,
    min_account_value_usd: num,
    by_class: z.record(z.string(), z.number()).nullish(),
    by_tag_usd: z.record(z.string(), PositionBucket).nullish(),
    coins_held: num,
    total_long_usd: num,
    total_short_usd: num,
    total_net_usd: num,
    total_gross_usd: num,
    long_pct: num,
    long_short_ratio: num,
    net_bias: str,
  }),
  top_coins: z.array(WhaleTopCoin).nullish(),
  meta: anyRecord.nullish(),
});
export type WhalesResponse = z.infer<typeof WhalesResponse>;
export type WhaleTopCoin = z.infer<typeof WhaleTopCoin>;

// ---------------------------------------------------------------------------
// /api/v1/market-intelligence/liquidations. Rows are trailing-window LEVELS
// (grain.sum_ok = false): never sum or difference them across polls.
// ---------------------------------------------------------------------------
export const LiquidationRow = z.looseObject({
  symbol: z.string(),
  liquidation_usd_1h: num,
  liquidation_usd_4h: num,
  liquidation_usd_12h: num,
  liquidation_usd_24h: num,
  long_liquidation_usd_1h: num,
  long_liquidation_usd_4h: num,
  long_liquidation_usd_12h: num,
  long_liquidation_usd_24h: num,
  short_liquidation_usd_1h: num,
  short_liquidation_usd_4h: num,
  short_liquidation_usd_12h: num,
  short_liquidation_usd_24h: num,
  /** Liquidation events in the 24h window. */
  count: num,
  source: str,
  liq_1h_vs_7d_median: z.looseObject({ long: num, short: num, total: num, hours_7d: num }).nullish(),
});
export const LiquidationsResponse = z.looseObject({
  data: z.array(LiquidationRow),
  /** Unix seconds. */
  as_of: num,
  coverage: anyRecord.nullish(),
  baseline: anyRecord.nullish(),
  grain: anyRecord.nullish(),
  row_count_meaning: str,
});
export type LiquidationRow = z.infer<typeof LiquidationRow>;
export type LiquidationsResponse = z.infer<typeof LiquidationsResponse>;

/** /liquidations/by-exchange (BTC, trailing 4h). */
export const ExchangeLiquidationRow = z.looseObject({
  exchange: z.string(),
  symbol: str,
  total: num,
  total_usd: num,
  long_usd: num,
  short_usd: num,
});
export const ExchangeLiquidationsResponse = z.looseObject({ data: z.array(ExchangeLiquidationRow) });
export type ExchangeLiquidationRow = z.infer<typeof ExchangeLiquidationRow>;
export type ExchangeLiquidationsResponse = z.infer<typeof ExchangeLiquidationsResponse>;

// ---------------------------------------------------------------------------
// /api/v1/hyperliquid/l2-book: 20 levels per side as {price, size, count}.
// ---------------------------------------------------------------------------
export const L2Level = z.looseObject({ price: z.number(), size: z.number(), count: num });
export const L2BookResponse = z.looseObject({
  coin: z.string(),
  bids: z.array(L2Level),
  asks: z.array(L2Level),
  /** Hyperliquid's own book timestamp, epoch ms. */
  ts: num,
});
export type L2Level = z.infer<typeof L2Level>;
export type L2BookResponse = z.infer<typeof L2BookResponse>;
