/**
 * Small, explicit derivations from CDA payloads for display. These only pick, label and
 * (where CDA has no aggregate) sum values from a single response; they never model.
 */
import type { CrossExchangeSummary, LiquidationsResponse, MarketHealthResponse, RegimesResponse, VolumeScannerResponse, WhalesResponse } from "@cqd/schemas";
import { finite, isRecord } from "./utils";

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

export const LIQ_WINDOWS = ["1h", "4h", "12h", "24h"] as const;
export type LiqWindow = (typeof LIQ_WINDOWS)[number];

export interface LiqTotals {
  window: LiqWindow;
  long: number;
  short: number;
  total: number;
}

/**
 * Totals across coins for each trailing window, from ONE response. Rows are trailing-window
 * levels (grain.sum_ok = false), so we sum across coins within a poll, never across polls.
 */
export function liquidationTotals(d: LiquidationsResponse | null | undefined): LiqTotals[] {
  return LIQ_WINDOWS.map((w) => {
    let long = 0;
    let short = 0;
    let total = 0;
    for (const r of d?.data ?? []) {
      const rr = r as Record<string, unknown>;
      long += finite(rr[`long_liquidation_usd_${w}`]) ?? 0;
      short += finite(rr[`short_liquidation_usd_${w}`]) ?? 0;
      total += finite(rr[`liquidation_usd_${w}`]) ?? 0;
    }
    return { window: w, long, short, total: total || long + short };
  });
}
