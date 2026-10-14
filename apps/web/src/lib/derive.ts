/**
 * Small, explicit derivations from CDA payloads for display. These only pick, label and
 * (where CDA has no aggregate) sum values from a single response; they never model.
 * The header KPI derivations live in @cqd/schemas (kpis.ts), shared with the worker.
 */
import type { LiquidationsResponse } from "@cqd/schemas";
import { finite } from "./utils";

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
