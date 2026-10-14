/**
 * The nine header KPIs, derived from cached CDA payloads. Shared by the web app (current
 * values) and the worker, which samples them on a timer into a rolling history so the header
 * sparklines show real, recorded values. Browser-safe: type-only imports, no zod.
 *
 * Every derivation picks, labels or (where CDA has no aggregate) sums values from ONE
 * response. Nothing is modelled.
 */
import type { CrossExchangeSummary, MarketHealthResponse, RegimesResponse, VolumeScannerResponse } from "./generated/cda";
import type { WhalesResponse } from "./permissive";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const KPI_KEYS = ["btcDom", "stable", "hlVol", "btcOi", "hlOi", "liq24", "ls", "whale", "fg"] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

export type KpiUnit = "pct" | "usd" | "ratio" | "index";

export interface KpiDef {
  key: KpiKey;
  label: string;
  unit: KpiUnit;
  /** Dataset and field the value comes from. */
  source: string;
  hint?: string;
}

export const KPI_DEFS: readonly KpiDef[] = [
  { key: "btcDom", label: "BTC dominance", unit: "pct", source: "regimes: current.signals.btc_dom" },
  {
    key: "stable",
    label: "Stablecoin mcap",
    unit: "usd",
    source: "market-health: stablecoin_flow details",
    hint: "Total crypto market cap is not exposed by the Phase 1 endpoints; stablecoin supply is the dry-powder proxy CDA scores.",
  },
  { key: "hlVol", label: "HL 24h volume", unit: "usd", source: "volume-scanner: total_volume_24h" },
  { key: "btcOi", label: "BTC OI · all venues", unit: "usd", source: "derivatives-summary: cross_exchange.open_interest[All]" },
  {
    key: "hlOi",
    label: "HL open interest",
    unit: "usd",
    source: "volume-scanner: sum of items[].open_interest_usd",
    hint: "Sum of per-perp OI across the Hyperliquid universe in one scanner response.",
  },
  { key: "liq24", label: "24h liquidations", unit: "usd", source: "regimes: current.signals.liq_24h" },
  {
    key: "ls",
    label: "L/S ratio",
    unit: "ratio",
    source: "market-health: indicators.long_short_ratio",
    hint: "BTC long/short account ratio on Binance perps, used by CDA as a market-wide sentiment read.",
  },
  {
    key: "whale",
    label: "Whale short share",
    unit: "pct",
    source: "quant-whales: 100 - summary.long_pct",
    hint: "Share of notional held short by Hyperliquid accounts worth $100k or more.",
  },
  { key: "fg", label: "Fear & greed", unit: "index", source: "market-health: indicators.fear_greed_value" },
];

/** Datasets the KPIs read. */
export const KPI_DATASETS = ["regimes", "market-health", "derivatives-summary", "volume-scanner", "quant-whales"] as const;

export interface KpiSources {
  regimes?: RegimesResponse | null;
  health?: MarketHealthResponse | null;
  deriv?: CrossExchangeSummary | null;
  volume?: VolumeScannerResponse | null;
  whales?: WhalesResponse | null;
}

export type KpiValues = Record<KpiKey, number | null>;

export function regimeSignal(r: RegimesResponse | null | undefined, key: string): number | null {
  const signals = r?.current?.signals;
  return isRecord(signals) ? finite(signals[key]) : null;
}

export function healthIndicator(h: MarketHealthResponse | null | undefined, key: string): number | null {
  return isRecord(h?.indicators) ? finite((h.indicators as Record<string, unknown>)[key]) : null;
}

/** Stablecoin market cap in USD, from the stablecoin-flow component details. */
export function stablecoinMcap(h: MarketHealthResponse | null | undefined): number | null {
  for (const c of h?.components ?? []) {
    const d = c.details;
    if (isRecord(d)) {
      const b = finite(d.current_mcap_billions);
      if (b !== null) return b * 1e9;
    }
  }
  return null;
}

/** BTC open interest across venues: the "All" row CDA returns in cross_exchange.open_interest. */
export function btcOiAllVenues(d: CrossExchangeSummary | null | undefined): number | null {
  const ce = d?.cross_exchange;
  if (!isRecord(ce) || !Array.isArray(ce.open_interest)) return null;
  const rows = ce.open_interest as Array<Record<string, unknown>>;
  const all = rows.find((r) => String(r.exchange).toLowerCase() === "all");
  return all ? finite(all.open_interest_usd) : null;
}

/** Hyperliquid perps OI: CDA reports it per coin, so the universe total is a sum of one response. */
export function hlOpenInterest(v: VolumeScannerResponse | null | undefined): number | null {
  if (!v?.items?.length) return null;
  let total = 0;
  let seen = 0;
  for (const it of v.items) {
    const oi = finite(it.open_interest_usd);
    if (oi !== null) {
      total += oi;
      seen++;
    }
  }
  return seen > 0 ? total : null;
}

export function whaleShortShare(w: WhalesResponse | null | undefined): number | null {
  const lp = finite(w?.summary?.long_pct);
  if (lp !== null) return 100 - lp;
  const l = finite(w?.summary?.total_long_usd);
  const s = finite(w?.summary?.total_short_usd);
  return l !== null && s !== null && l + s > 0 ? (s / (l + s)) * 100 : null;
}

export function computeKpis(src: KpiSources): KpiValues {
  return {
    btcDom: regimeSignal(src.regimes, "btc_dom"),
    stable: stablecoinMcap(src.health),
    hlVol: finite(src.volume?.total_volume_24h),
    btcOi: btcOiAllVenues(src.deriv),
    hlOi: hlOpenInterest(src.volume),
    liq24: regimeSignal(src.regimes, "liq_24h"),
    ls: healthIndicator(src.health, "long_short_ratio"),
    whale: whaleShortShare(src.whales),
    fg: healthIndicator(src.health, "fear_greed_value"),
  };
}

/** One recorded sample of every KPI (null where the source was missing). */
export interface KpiPoint {
  /** Epoch ms. */
  t: number;
  v: Partial<KpiValues>;
}

/** Rolling KPI history the worker records (and the demo replays from docs/samples). */
export interface KpiHistory {
  points: KpiPoint[];
  /** Sampling cadence in ms. */
  intervalMs: number;
  /** Set when the points are a saved sample (demo mode), not this worker's own recording. */
  demo?: { capturedAt: string } | null;
}

/** Recorder defaults: one point every 5 minutes, 24 hours kept. */
export const KPI_HISTORY_INTERVAL_MS = 5 * 60_000;
export const KPI_HISTORY_MAX_POINTS = 288;
