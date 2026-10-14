/**
 * Schemas for CDA endpoints whose OpenAPI entry has no response schema (/quant/gex,
 * /quant/gex/history, /quant/positioning, /quant/whales, and the Pro Plus /quant/whales/history
 * and /quant/positioning/ladder) or types the payload loosely (/market-intelligence/liquidations
 * and /liquidations/by-exchange are `data: any`, /hyperliquid/l2-book levels are `array<object>`).
 *
 * Tightened from real Pro Plus responses captured on 2026-10-14 (docs/samples/, see its
 * index.json):
 *  - a field present and non-null in every sampled item is required;
 *  - a field the endpoint description says can be missing (warming coins, thin market-maker
 *    coverage, empty baselines) stays nullable even if every sample had a value;
 *  - enums are used only where the description enumerates the values.
 * Objects stay loose (unknown keys pass through), and the worker treats a validation failure
 * as a drift warning, not a reason to drop data. Re-check with
 *   pnpm --filter @cqd/schemas check-samples
 */
import { z } from "zod";

const num = z.number();
const nnum = z.number().nullable();
const anyRecord = z.record(z.string(), z.unknown());

/** One 0.5%-of-mark price bin of liquidation notional (shared by /quant/gex and the ladder). */
export const LiquidationBin = z.looseObject({
  price_lo: num,
  price_hi: num,
  long_usd: num,
  short_usd: num,
  total_usd: num,
});

/** Nearest liquidation clusters around mark. `side` is the dominant liquidation side. */
export const LiquidationLevel = z.looseObject({
  price: num,
  dist_pct: num,
  total_usd: num,
  side: z.enum(["long", "short"]),
  n_accounts: num,
});

// ---------------------------------------------------------------------------
// /api/v1/quant/gex: dealer positioning / gamma exposure (perp analog), keyed by symbol.
// ---------------------------------------------------------------------------
export const GexRegime = z.looseObject({
  state: z.enum(["amplify", "dampen", "transitional"]),
  score: num,
  confidence: num,
  coverage: z.enum(["full", "funding_only", "none"]),
  insufficient_mm_coverage: z.boolean(),
  rules_version: z.string(),
  fuel_side: z.string(),
  /** Null when no flip line exists (no MM clusters on one side). */
  flip_price: nnum,
  dist_to_flip_pct: nnum,
  rationale: z.string(),
  inputs: anyRecord,
  since: z.string().nullable(),
});

export const GexDistributionContext = z.looseObject({
  window_days: num,
  history_days: num,
  sample_count: num,
  /** "warming" until 2 days of hourly samples exist (every *_pctile is null), then "ok". */
  status: z.enum(["ok", "warming"]),
  sample_ts: nnum,
  near_density_pctile: nnum,
  abs_dist_to_flip_pctile: nnum,
  mm_skew_pctile: nnum,
  regime_score_pctile: nnum,
  /** Null when funding is pinned to Hyperliquid's baseline. */
  funding_rate_pctile: nnum,
  mm_skew: nnum,
  mm_skew_z: nnum,
  funding_pinned: z.boolean(),
});

export const GexCoin = z.looseObject({
  mark: num,
  positions_as_of: num,
  mm_net_delta: num,
  mm_long_usd: num,
  mm_short_usd: num,
  mm_gross: num,
  mm_n_accounts: num,
  gamma_flip: nnum,
  gamma_profile: z.array(LiquidationBin),
  coverage: z.looseObject({ bands: num, mm_n_accounts: num, has_flip: z.boolean(), history_days: num }),
  levels: z.array(LiquidationLevel),
  funding_rate: nnum,
  oracle_price: nnum,
  premium: nnum,
  open_interest: nnum,
  open_interest_usd: nnum,
  oi_change_pct: nnum,
  dist_to_flip_pct: nnum,
  regime: GexRegime,
  distribution_context: GexDistributionContext,
});

export const GexResponse = z.looseObject({
  scope: z.literal("gamma_exposure"),
  note: z.string().nullish(),
  timestamp: z.string(),
  positions_as_of: num,
  meta: anyRecord,
  coins: z.record(z.string(), GexCoin),
});
export type GexResponse = z.infer<typeof GexResponse>;
export type GexCoin = z.infer<typeof GexCoin>;
export type GexProfileBin = z.infer<typeof LiquidationBin>;
export type GexLevel = z.infer<typeof LiquidationLevel>;

// /api/v1/quant/gex/history: hourly ring of the /quant/gex scalars for one coin (<= 720 points).
// Every metric is documented as null for an hour where it was unavailable.
export const GexHistoryPoint = z.looseObject({
  ts: num,
  near_density: nnum,
  abs_dist_to_flip: nnum,
  dist_to_flip_pct: nnum,
  mm_skew: nnum,
  mm_gross: nnum,
  mm_n_accounts: nnum,
  regime_score: nnum,
  funding_rate: nnum,
  oi_change_pct: nnum,
});
export const GexHistoryResponse = z.looseObject({
  scope: z.literal("gamma_exposure_history"),
  symbol: z.string(),
  grain: z.string(),
  timestamp: z.string(),
  from: z.union([z.string(), z.number()]).nullable(),
  to: z.union([z.string(), z.number()]).nullable(),
  count: num,
  meta: anyRecord,
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
  by_type: z.record(z.string(), PositionBucket),
  by_tag: z.record(z.string(), PositionBucket),
});
export const PositioningResponse = z.looseObject({
  scope: z.literal("positioning"),
  timestamp: z.string(),
  positions_as_of: num,
  meta: anyRecord,
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
  segment: z.string(),
  positions_as_of: num,
  gross_usd: num,
  long_usd: num,
  short_usd: num,
  net_usd: num,
  /** Net excluding market-maker liquidity: the conviction read. */
  directional_net_usd: num,
  long_pct: num,
  /** Null until 2 days of samples exist for the coin. */
  long_pct_pctile_30d: nnum,
  net_bias: z.string(),
  n_accounts: num,
  n_long: num,
  n_short: num,
  dominant_side: z.string(),
});
export const WhalesResponse = z.looseObject({
  scope: z.literal("whale_activity"),
  timestamp: z.string(),
  positions_as_of: num,
  summary: z.looseObject({
    accounts_tracked: num,
    universe_size: num,
    min_account_value_usd: num,
    by_class: z.record(z.string(), z.number()),
    by_tag_usd: z.record(z.string(), PositionBucket),
    coins_held: num,
    total_long_usd: num,
    total_short_usd: num,
    total_net_usd: num,
    total_gross_usd: num,
    long_pct: num,
    long_short_ratio: num,
    net_bias: z.string(),
  }),
  top_coins: z.array(WhaleTopCoin),
  meta: anyRecord,
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
  /** Venues the events came from, e.g. "bybit+hyperliquid+okx". */
  source: z.string(),
  /** Null per side when the 7d median is zero, per row with under 24h of tape. */
  liq_1h_vs_7d_median: z.looseObject({ long: nnum, short: nnum, total: nnum, hours_7d: nnum }).nullable(),
});
export const LiquidationsResponse = z.looseObject({
  data: z.array(LiquidationRow),
  /** Unix seconds. */
  as_of: num,
  coverage: anyRecord,
  baseline: anyRecord.nullable(),
  grain: anyRecord,
  row_count_meaning: z.string(),
});
export type LiquidationRow = z.infer<typeof LiquidationRow>;
export type LiquidationsResponse = z.infer<typeof LiquidationsResponse>;

/** /liquidations/by-exchange (BTC, trailing 4h). */
export const ExchangeLiquidationRow = z.looseObject({
  exchange: z.string(),
  symbol: z.string(),
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
export const L2Level = z.looseObject({ price: num, size: num, count: num });
export const L2BookResponse = z.looseObject({
  coin: z.string(),
  bids: z.array(L2Level),
  asks: z.array(L2Level),
  /** Hyperliquid's own book timestamp, epoch ms; null only if Hyperliquid omitted it. */
  ts: nnum,
});
export type L2Level = z.infer<typeof L2Level>;
export type L2BookResponse = z.infer<typeof L2BookResponse>;

// ---------------------------------------------------------------------------
// Pro Plus history (registered as on-demand datasets for Phase 3; no page uses them yet).
// ---------------------------------------------------------------------------

/** /api/v1/quant/whales/history: daily aggregate whale positioning (early points may be modeled). */
export const WhalesHistoryPoint = z.looseObject({
  date: z.string(),
  ts_ms: num,
  accounts: num,
  long_usd: num,
  short_usd: num,
  net_usd: num,
  gross_usd: num,
  top_coins: z.array(z.looseObject({ coin: z.string(), net_usd: num })),
  source: z.enum(["seed", "live"]),
  estimated: z.boolean(),
});
export const WhalesHistoryResponse = z.looseObject({
  scope: z.literal("whale_activity_history"),
  timestamp: z.string(),
  meta: anyRecord,
  points: z.array(WhalesHistoryPoint),
  count: num,
});
export type WhalesHistoryResponse = z.infer<typeof WhalesHistoryResponse>;

/** /api/v1/quant/positioning/ladder: full-universe liquidation ladder for one coin, by class. */
export const PositioningLadderResponse = z.looseObject({
  scope: z.literal("positioning_ladder"),
  symbol: z.string(),
  timestamp: z.string(),
  positions_as_of: num,
  meta: anyRecord,
  mark: num,
  flip: nnum,
  bins: z.array(LiquidationBin),
  flip_directional: nnum,
  bins_directional: z.array(LiquidationBin),
  bins_by_class: z.record(z.string(), z.array(LiquidationBin)),
  levels: z.array(LiquidationLevel),
});
export type PositioningLadderResponse = z.infer<typeof PositioningLadderResponse>;
