/**
 * Market-moving news (/api/v1/news/*), PLAN.md section 3.8.
 *
 * The OpenAPI spec types these responses, but leaves `market_response`, `sources[]`,
 * `funnel_24h[]` and `store` as bare objects. These schemas replace the generated ones and were
 * tightened from real Pro Plus responses captured on 2026-10-14 (docs/samples/news-*.json):
 *  - fields present in every sample are required, including `published` and `headlines`, which the
 *    spec marks optional;
 *  - the Pro Plus-only score components (`severity`, `confidence`, `match_mode`, `sources`) and
 *    `market_response` stay optional, because a Pro key does not receive them;
 *  - `market_response` is null until measured, and always null for MARKET-scope events (no single
 *    instrument to measure); otherwise it is keyed by window ("15m", "1h", "4h").
 */
import { z } from "zod";

const num = z.number();

/** Measured market reaction over one window after publication. */
export const NewsResponseWindow = z.looseObject({
  /** Price return over the window, percent. */
  ret_pct: num,
  oi_change_pct: num,
  /** Change in the hourly funding rate (fraction). */
  funding_shift: num,
  volume_multiplier: num,
  /** How unusual the move was versus the coin's own baseline (0..1). */
  abnormality: num,
});
export type NewsResponseWindow = z.infer<typeof NewsResponseWindow>;

export const NewsEvent = z.looseObject({
  event_id: z.string(),
  /** A Hyperliquid perp, or MARKET for market-wide catalysts. */
  symbol: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  published: z.string(),
  category: z.string(),
  impact_score: num,
  /** Signed: negative is risk-off. Observed values -1, -0.8, 0, 0.8, 1. */
  bias: num,
  /** Independent sources carrying the same (symbol, category) inside the window. */
  corroboration: num,
  // Pro Plus score components
  severity: num.optional(),
  confidence: num.optional(),
  /** market | name | ticker_context */
  match_mode: z.string().optional(),
  sources: z.array(z.string()).optional(),
  market_response: z.record(z.string(), NewsResponseWindow).nullable().optional(),
});
export type NewsEvent = z.infer<typeof NewsEvent>;

export const NewsEventsResponse = z.looseObject({
  events: z.array(NewsEvent),
  count: num,
  window_hours: num,
  impact_threshold: num,
  tier_scope: z.string(),
  as_of: z.string(),
});
export type NewsEventsResponse = z.infer<typeof NewsEventsResponse>;

export const NewsPulseRow = z.looseObject({
  /** Every active perp, plus a MARKET row. */
  symbol: z.string(),
  /** 0..1, recency-weighted sum of impact scores, saturating. */
  news_pressure: num,
  /** -1..+1, impact-weighted direction; negative is risk-off. */
  news_tilt: num,
  event_count: num,
  top_impact: num,
  /** Raw high-confidence coverage in the feed window, qualified or not. */
  headlines: num,
  rank: num,
});
export const NewsPulseResponse = z.looseObject({
  rows: z.array(NewsPulseRow),
  count: num,
  universe_size: num,
  window_hours: num,
  tier_scope: z.string(),
  as_of: z.string(),
});
export type NewsPulseRow = z.infer<typeof NewsPulseRow>;
export type NewsPulseResponse = z.infer<typeof NewsPulseResponse>;

export const NewsSource = z.looseObject({
  name: z.string(),
  /** rss | atom | discourse | okx_announcements, ... */
  kind: z.string(),
  weight: num,
  entity_hint: z.string().nullable(),
  ok: z.boolean(),
  /** Answered 304: nothing new, which is not the same as dead. */
  not_modified: z.boolean(),
  items_in_window: num,
  /** Null when the feed has no item in the window. */
  newest_item_age_hours: num.nullable(),
});
export const NewsFunnelHour = z.looseObject({
  at: z.string(),
  ingested: num,
  dropped_noise: num,
  dropped_no_catalyst: num,
  dropped_no_entity: num,
  dropped_below_threshold: num,
  qualified: num,
});
export const NewsSourcesResponse = z.looseObject({
  sources: z.array(NewsSource),
  universe_size: num,
  project_feed_symbols: z.array(z.string()),
  /** Perps whose ticker is a common word with no safe project name: cashtag-only matching. */
  unresolvable: z.array(z.string()),
  missing_names: z.array(z.string()),
  impact_threshold: num,
  funnel_24h: z.array(NewsFunnelHour),
  store: z.looseObject({ events_in_memory: num, responses_pending: num, ledger_size: num }),
  last_refresh: z.string().nullish(),
});
export type NewsSource = z.infer<typeof NewsSource>;
export type NewsFunnelHour = z.infer<typeof NewsFunnelHour>;
export type NewsSourcesResponse = z.infer<typeof NewsSourcesResponse>;

export const NewsCoinResponse = z.looseObject({
  symbol: z.string(),
  news_pressure: num,
  news_tilt: num,
  events: z.array(NewsEvent),
  count: num,
  window_hours: num,
  as_of: z.string(),
});
export type NewsCoinResponse = z.infer<typeof NewsCoinResponse>;
