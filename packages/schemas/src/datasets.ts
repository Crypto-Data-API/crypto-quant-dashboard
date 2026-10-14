/**
 * Dataset registry: the single source of truth for what the worker polls, how often, where it
 * is cached, and how the UI refetches it. Zod-free so the browser can import it.
 *
 * Scheduled datasets are polled on a timer whether or not anyone is looking.
 * On-demand datasets (those with a `param`, or `onDemand: true`) are fetched only while a
 * viewer has asked for them within `demandTtlMs`, at a higher limiter priority.
 *
 * Steady-state budget (scheduled only) is 298 calls/hour = 7,152/day. The worker's default
 * daily budget is 28,000 (the key is Pro Plus: 50,000/day, shared with other tooling), so
 * on-demand reads have ample room; the L2 book alone is 240/hour while the order-book page is
 * open. Run `budgetPerHour()` to recompute after editing intervals.
 *
 * Adding a dataset (for example a Pro Plus history endpoint for Phase 3):
 *   1. add an entry below (path is type-checked against the OpenAPI spec; `tier` gates it
 *      against the key's tier so a lower-tier key never spends calls on it);
 *   2. add its payload type to DatasetDataMap and its Zod schema to validators.ts;
 *   3. read it in a page with `useDataset("<id>", { param })`.
 * The worker, cache, proxy route, panel states and budget accounting need no changes.
 */
import type { GetPath, QueryValue } from "@cqd/cda-client";
import type * as Cda from "./generated/cda";
import type * as P from "./permissive";

const SEC = 1_000;
const MIN = 60 * SEC;
const DAY = 24 * 60 * MIN;

export interface DatasetParam {
  /** Name of the path placeholder or query parameter. */
  name: string;
  in: "path" | "query";
  /** Example value, used in docs and as a UI default. */
  example: string;
}

/** CDA plan tiers, lowest first. "keyless" endpoints need no key at all. */
export const TIERS = ["keyless", "free", "pro", "pro_plus"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = { keyless: "Keyless", free: "Free", pro: "Pro", pro_plus: "Pro Plus" };

/** True when a key of `keyTier` may call an endpoint that needs `required`. Unknown tiers are not gated. */
export function tierAllows(keyTier: string | null | undefined, required: Tier): boolean {
  if (!keyTier) return true;
  const have = TIERS.indexOf(keyTier as Tier);
  if (have < 0) return true;
  return have >= TIERS.indexOf(required);
}

/** A query value, or a function computing one at request time (e.g. a rolling start date). */
export type QuerySpec = QueryValue | ((now: number) => QueryValue);

export interface DatasetDef {
  id: string;
  label: string;
  /** CDA endpoint (typed against the OpenAPI spec). */
  path: GetPath;
  query?: Record<string, QuerySpec>;
  intervalMs: number;
  /** Shown as stale after this long without a successful fetch. Default 3 x interval. */
  staleAfterMs?: number;
  /** Minimum tier CDA documents for this endpoint. */
  tier: Tier;
  /** One symbol/coin parameter. Implies on-demand. */
  param?: DatasetParam;
  /** On-demand without a parameter (fetched only while a viewer asks for it). */
  onDemand?: boolean;
  /** How long a viewer's request keeps an on-demand dataset warm. */
  demandTtlMs?: number;
  /** Payload field that carries CDA's own timestamp (shown as "as of"). */
  asOfField?: string;
}

/** Resolve computed query values at request time. */
export function resolveQuery(query: Record<string, QuerySpec> | undefined, now = Date.now()): Record<string, QueryValue> {
  const out: Record<string, QueryValue> = {};
  for (const [k, v] of Object.entries(query ?? {})) out[k] = typeof v === "function" ? v(now) : v;
  return out;
}

function def<const T extends DatasetDef>(d: T): T {
  return d;
}

const GEX_DEFAULT = "BTC,ETH,SOL,HYPE";

export const DATASETS = {
  // ---- keyless -----------------------------------------------------------
  "cda-health": def({ id: "cda-health", label: "CDA API health", path: "/api/v1/health", intervalMs: 5 * MIN, tier: "keyless" }),

  // ---- 3.1 Market regimes (short-term HMM) -------------------------------
  "quant-market": def({
    id: "quant-market",
    label: "Market regime (HMM)",
    path: "/api/v1/quant/market",
    query: { horizon: "24h" },
    intervalMs: 5 * MIN,
    tier: "pro",
    asOfField: "timestamp",
  }),
  "quant-coins-risk": def({
    id: "quant-coins-risk",
    label: "Per-coin regimes + risk",
    path: "/api/v1/quant/coins/risk",
    query: { horizon: "24h" },
    intervalMs: 5 * MIN,
    tier: "pro",
    asOfField: "as_of",
  }),
  // No asOfField: the payload's timestamps are the retrain date and last inference, not a snapshot time.
  "quant-model": def({ id: "quant-model", label: "Model card", path: "/api/v1/quant/model", intervalMs: 60 * MIN, tier: "free" }),
  "quant-coin": def({
    id: "quant-coin",
    label: "Coin regime detail",
    path: "/api/v1/quant/coins/{symbol}",
    query: { horizon: "24h" },
    intervalMs: 5 * MIN,
    tier: "pro",
    param: { name: "symbol", in: "path", example: "BTC" },
    demandTtlMs: 2 * MIN,
    asOfField: "timestamp",
  }),

  // ---- 3.2 Long-term regimes + market health ------------------------------
  regimes: def({ id: "regimes", label: "Cycle regime (10-phase)", path: "/api/v1/regimes", intervalMs: 15 * MIN, tier: "pro", asOfField: "as_of" }),
  "market-health": def({
    id: "market-health",
    label: "Market health",
    path: "/api/v1/market-health",
    intervalMs: 5 * MIN,
    tier: "free",
    asOfField: "timestamp",
  }),
  "score-volatility": def({ id: "score-volatility", label: "Volatility regime score", path: "/api/v1/volatility/regime/score", intervalMs: 15 * MIN, tier: "free", asOfField: "as_of" }),
  "score-policy": def({ id: "score-policy", label: "Policy regime score", path: "/api/v1/policy/regime/score", intervalMs: 15 * MIN, tier: "free", asOfField: "as_of" }),
  "score-security": def({ id: "score-security", label: "Security regime score", path: "/api/v1/security/regime/score", intervalMs: 15 * MIN, tier: "free", asOfField: "as_of" }),
  "score-event": def({ id: "score-event", label: "Event risk score", path: "/api/v1/event/regime/score", intervalMs: 15 * MIN, tier: "free", asOfField: "as_of" }),
  "score-meme": def({ id: "score-meme", label: "Meme regime score", path: "/api/v1/meme/regime/score", intervalMs: 15 * MIN, tier: "free", asOfField: "as_of" }),
  "derivatives-summary": def({
    id: "derivatives-summary",
    label: "Cross-exchange derivatives (BTC)",
    path: "/api/v1/derivatives/summary",
    query: { coin: "BTC" },
    intervalMs: 5 * MIN,
    tier: "free",
  }),

  // ---- 3.3 Quant gamma ----------------------------------------------------
  "quant-gex": def({
    id: "quant-gex",
    label: "Dealer GEX (default coins)",
    path: "/api/v1/quant/gex",
    query: { symbol: GEX_DEFAULT },
    intervalMs: 5 * MIN,
    tier: "pro",
  }),
  "quant-gex-coin": def({
    id: "quant-gex-coin",
    label: "Dealer GEX (one coin)",
    path: "/api/v1/quant/gex",
    intervalMs: 5 * MIN,
    tier: "pro",
    param: { name: "symbol", in: "query", example: "DOGE" },
    demandTtlMs: 3 * MIN,
  }),
  "gex-history": def({
    id: "gex-history",
    label: "GEX 30-day history",
    path: "/api/v1/quant/gex/history",
    intervalMs: 30 * MIN,
    staleAfterMs: 3 * 60 * MIN,
    tier: "pro",
    param: { name: "symbol", in: "query", example: "BTC" },
    demandTtlMs: 5 * MIN,
  }),
  "quant-positioning": def({
    id: "quant-positioning",
    label: "Positioning by trader class",
    path: "/api/v1/quant/positioning",
    query: { symbol: GEX_DEFAULT },
    intervalMs: 5 * MIN,
    tier: "pro",
  }),
  "quant-whales": def({ id: "quant-whales", label: "Whale positioning", path: "/api/v1/quant/whales", intervalMs: 5 * MIN, tier: "pro" }),

  // ---- 3.4 Volume scanner -------------------------------------------------
  "volume-scanner": def({
    id: "volume-scanner",
    label: "Volume scanner",
    path: "/api/v1/volume/scanner",
    query: { limit: 500, sort: "multiplier" },
    intervalMs: 2 * MIN,
    tier: "free",
    asOfField: "as_of",
  }),
  "volume-detail": def({
    id: "volume-detail",
    label: "Volume 30-day series",
    path: "/api/v1/volume/scanner/{symbol}",
    intervalMs: 10 * MIN,
    tier: "pro",
    param: { name: "symbol", in: "path", example: "BTC" },
    demandTtlMs: 3 * MIN,
    asOfField: "as_of",
  }),

  // ---- 3.5 Order books ----------------------------------------------------
  "liquidity-depth": def({ id: "liquidity-depth", label: "Depth snapshot (top 25)", path: "/api/v1/liquidity/depth", intervalMs: 2 * MIN, tier: "pro", asOfField: "as_of" }),
  "liquidity-regime": def({ id: "liquidity-regime", label: "Liquidity regime", path: "/api/v1/liquidity/regime", intervalMs: 5 * MIN, tier: "free", asOfField: "as_of" }),
  "oi-divergence": def({ id: "oi-divergence", label: "OI vs price divergence", path: "/api/v1/liquidity/oi-divergence", intervalMs: 5 * MIN, tier: "pro", asOfField: "as_of" }),
  "l2-book": def({
    id: "l2-book",
    label: "L2 order book",
    path: "/api/v1/hyperliquid/l2-book",
    intervalMs: 15 * SEC,
    staleAfterMs: 60 * SEC,
    tier: "free",
    param: { name: "coin", in: "query", example: "BTC" },
    demandTtlMs: 45 * SEC,
    asOfField: "ts",
  }),
  "depth-history": def({
    id: "depth-history",
    label: "Depth history (6h)",
    path: "/api/v1/liquidity/depth/{coin}",
    query: { minutes: 360 },
    intervalMs: 2 * MIN,
    tier: "pro",
    param: { name: "coin", in: "path", example: "BTC" },
    demandTtlMs: 2 * MIN,
  }),

  // ---- 3.6 Liquidations ---------------------------------------------------
  liquidations: def({
    id: "liquidations",
    label: "Liquidation totals",
    path: "/api/v1/market-intelligence/liquidations",
    query: { limit: 100 },
    intervalMs: 2 * MIN,
    tier: "pro",
    asOfField: "as_of",
  }),
  "liquidations-by-exchange": def({
    id: "liquidations-by-exchange",
    label: "Liquidations by exchange (BTC, 4h)",
    path: "/api/v1/market-intelligence/liquidations/by-exchange",
    intervalMs: 5 * MIN,
    tier: "free",
  }),
  "squeeze-alerts": def({
    id: "squeeze-alerts",
    label: "Squeeze alerts",
    path: "/api/v1/market-intelligence/squeeze-alerts",
    intervalMs: 1 * MIN,
    tier: "pro",
    asOfField: "as_of",
  }),

  // ---- 3.7 Calendar -------------------------------------------------------
  "event-calendar": def({
    id: "event-calendar",
    label: "Catalyst calendar (30d)",
    path: "/api/v1/event/calendar",
    query: { window_days: 30 },
    intervalMs: 30 * MIN,
    tier: "free",
    asOfField: "timestamp",
  }),
  "supply-unlocks": def({
    id: "supply-unlocks",
    label: "Token unlocks (30d)",
    path: "/api/v1/supply/unlocks",
    query: { window_days: 30, limit: 200 },
    intervalMs: 60 * MIN,
    staleAfterMs: 4 * 60 * MIN,
    tier: "free",
    asOfField: "as_of",
  }),
  "event-symbol": def({
    id: "event-symbol",
    label: "Symbol catalyst overlay",
    path: "/api/v1/event/regime/{symbol}",
    intervalMs: 30 * MIN,
    staleAfterMs: 3 * 60 * MIN,
    tier: "pro",
    param: { name: "symbol", in: "path", example: "BTC" },
    demandTtlMs: 5 * MIN,
    asOfField: "timestamp",
  }),

  // ---- Pro Plus history (Phase 3): registered on-demand, so they cost nothing until a page
  // reads them. Unlocked by the current key (tier pro_plus).
  "quant-history": def({
    id: "quant-history",
    label: "Market regime history (7d)",
    path: "/api/v1/quant/history",
    query: { scope: "market", horizon: "24h", limit: 700, start: (now: number) => new Date(now - 7 * DAY).toISOString() },
    intervalMs: 60 * MIN,
    staleAfterMs: 3 * 60 * MIN,
    tier: "pro_plus",
    onDemand: true,
    demandTtlMs: 5 * MIN,
  }),
  "quant-whales-history": def({
    id: "quant-whales-history",
    label: "Whale positioning history (180d)",
    path: "/api/v1/quant/whales/history",
    query: { days: 180 },
    intervalMs: 60 * MIN,
    staleAfterMs: 6 * 60 * MIN,
    tier: "pro_plus",
    onDemand: true,
    demandTtlMs: 5 * MIN,
    asOfField: "timestamp",
  }),
  "positioning-ladder": def({
    id: "positioning-ladder",
    label: "Liquidation ladder by account class",
    path: "/api/v1/quant/positioning/ladder",
    intervalMs: 5 * MIN,
    tier: "pro_plus",
    param: { name: "symbol", in: "query", example: "BTC" },
    demandTtlMs: 3 * MIN,
    asOfField: "positions_as_of",
  }),
} as const satisfies Record<string, DatasetDef>;

/** Payload type of each dataset (as validated by ./validators). */
export interface DatasetDataMap {
  "cda-health": Cda.HealthCheckResponse;
  "quant-market": Cda.QuantProbabilityObject;
  "quant-coins-risk": Cda.QuantCoinsRiskResponse;
  "quant-model": Cda.QuantModelCardResponse;
  "quant-coin": Cda.QuantCoinDetailResponse;
  regimes: Cda.RegimesResponse;
  "market-health": Cda.MarketHealthResponse;
  "score-volatility": Cda.VolatilityRegimeScoreResponse;
  "score-policy": Cda.PolicyRegimeScoreResponse;
  "score-security": Cda.SecurityRegimeScoreResponse;
  "score-event": Cda.EventRegimeScoreResponse;
  "score-meme": Cda.MemeRegimeScoreResponse;
  "derivatives-summary": Cda.CrossExchangeSummary;
  "quant-gex": P.GexResponse;
  "quant-gex-coin": P.GexResponse;
  "gex-history": P.GexHistoryResponse;
  "quant-positioning": P.PositioningResponse;
  "quant-whales": P.WhalesResponse;
  "volume-scanner": Cda.VolumeScannerResponse;
  "volume-detail": Cda.VolumeScannerDetailResponse;
  "liquidity-depth": Cda.DepthResponse;
  "liquidity-regime": Cda.LiquidityRegimeResponse;
  "oi-divergence": Cda.OIDivergenceResponse;
  "l2-book": P.L2BookResponse;
  "depth-history": Cda.CoinDepthHistoryResponse;
  liquidations: P.LiquidationsResponse;
  "liquidations-by-exchange": P.ExchangeLiquidationsResponse;
  "squeeze-alerts": Cda.SqueezeAlertsResponse;
  "event-calendar": Cda.EventRegimeResponse;
  "supply-unlocks": Cda.SupplyUnlocksResponse;
  "event-symbol": Cda.EventSymbolOverlayResponse;
  "quant-history": Cda.QuantHistoryResponse;
  "quant-whales-history": P.WhalesHistoryResponse;
  "positioning-ladder": P.PositioningLadderResponse;
}

export type DatasetId = keyof typeof DATASETS;
export type DataOf<K extends DatasetId> = K extends keyof DatasetDataMap ? DatasetDataMap[K] : unknown;

// Compile-time check that the registry and the data map list the same ids.
type _MissingInMap = Exclude<DatasetId, keyof DatasetDataMap>;
type _MissingInRegistry = Exclude<keyof DatasetDataMap, DatasetId>;
const _registryInSync: [_MissingInMap, _MissingInRegistry] extends [never, never] ? true : never = true;
void _registryInSync;

export const DATASET_IDS = Object.keys(DATASETS) as DatasetId[];

export function isDatasetId(id: string): id is DatasetId {
  return Object.prototype.hasOwnProperty.call(DATASETS, id);
}

export function getDataset(id: DatasetId): DatasetDef {
  return DATASETS[id];
}

/** On-demand datasets poll only while a viewer asks for them. */
export function isOnDemandDef(d: DatasetDef): boolean {
  return d.param !== undefined || d.onDemand === true;
}

export function isOnDemand(id: DatasetId): boolean {
  return isOnDemandDef(DATASETS[id] as DatasetDef);
}

export function staleAfter(d: DatasetDef): number {
  return d.staleAfterMs ?? Math.max(3 * d.intervalMs, 45 * SEC);
}

/**
 * Normalise an on-demand parameter. Hyperliquid names are case-sensitive for the k-prefixed
 * thousand-unit tickers (kPEPE, kBONK), so only the part after a leading lowercase "k" is
 * upper-cased.
 */
export function normalizeParam(raw: string): string | null {
  const v = raw.trim();
  if (!/^[A-Za-z0-9._-]{1,24}$/.test(v)) return null;
  const k = /^k[A-Za-z]/.test(v) && v.length > 2 && v.slice(1) === v.slice(1).toUpperCase();
  return k ? `k${v.slice(1).toUpperCase()}` : v.toUpperCase();
}

/** Scheduled keyed calls per hour at the registry's base intervals. */
export function budgetPerHour(): { total: number; byDataset: Record<string, number> } {
  const byDataset: Record<string, number> = {};
  let total = 0;
  for (const d of Object.values(DATASETS) as DatasetDef[]) {
    if (isOnDemandDef(d) || d.tier === "keyless") continue;
    const n = Math.round((60 * MIN) / d.intervalMs);
    byDataset[d.id] = n;
    total += n;
  }
  return { total, byDataset };
}
