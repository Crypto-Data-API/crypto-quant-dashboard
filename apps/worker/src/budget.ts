import { utcDate, type BudgetMode } from "@cqd/schemas";
import type { WorkerCache } from "./cache";

const DAY_MS = 86_400_000;

/**
 * Daily budget governor. CDA Pro allows 10,000 keyed requests per day; we assume the day
 * rolls over at 00:00 UTC.
 *
 *  - normal:    calls so far are within the pace line (budget spread evenly over the day,
 *               plus slack for the startup burst).
 *  - throttled: ahead of the pace line. Every interval is stretched x2 (x4 past 95% of the
 *               budget) until usage falls back under the line.
 *  - paused:    within `reserve` calls of the budget. No keyed calls until the UTC day rolls.
 */
export class BudgetGovernor {
  constructor(
    private readonly cache: WorkerCache,
    readonly dailyBudget: number,
    private readonly slack = 400,
    private readonly reserve = 25,
  ) {}

  today(now = Date.now()): string {
    return utcDate(now);
  }

  callsToday(now = Date.now()): number {
    return this.cache.counters(this.today(now)).total;
  }

  paceLimit(now = Date.now()): number {
    const msIntoDay = now % DAY_MS;
    return Math.round(this.dailyBudget * (msIntoDay / DAY_MS) + this.slack);
  }

  mode(now = Date.now()): BudgetMode {
    const calls = this.callsToday(now);
    if (calls >= this.dailyBudget - this.reserve) return "paused";
    if (calls >= this.paceLimit(now)) return "throttled";
    return "normal";
  }

  /** Multiplier applied to every polling interval. */
  stretch(now = Date.now()): number {
    const m = this.mode(now);
    if (m === "normal") return 1;
    return this.callsToday(now) >= this.dailyBudget * 0.95 ? 4 : 2;
  }

  resetsAt(now = Date.now()): number {
    return now - (now % DAY_MS) + DAY_MS;
  }
}
