import { utcDate, type BudgetMode } from "@cqd/schemas";
import type { WorkerCache } from "./cache";

const DAY_MS = 86_400_000;

/** What /api/v1/auth/keys/me reports for the key (account-wide, all tooling sharing it). */
export interface AccountInfo {
  tier: string | null;
  requestsToday: number | null;
  dailyLimit: number | null;
  perMinuteLimit: number | null;
  checkedAt: number;
  /** Our own call count when `requestsToday` was read, to extrapolate between checks. */
  ourCallsAtCheck: number;
}

/**
 * Daily budget governor. The day rolls over at 00:00 UTC.
 *
 * Our budget is CDA_DAILY_BUDGET (default 28,000), capped at 95% of the key's reported daily
 * limit, so a Pro key (10,000/day) is automatically held to 9,500.
 *
 *  - normal:    calls so far are within the pace line (budget spread evenly over the day,
 *               plus slack for the startup burst).
 *  - throttled: ahead of the pace line. Every interval is stretched x2 (x4 past 95% of the
 *               budget) until usage falls back under the line.
 *  - paused:    within `reserve` calls of our budget, or the whole account (including other
 *               tooling on the same key) is within 1% of the key's hard limit. No keyed calls
 *               until the UTC day rolls.
 */
export class BudgetGovernor {
  private account: AccountInfo | null = null;

  constructor(
    private readonly cache: WorkerCache,
    private readonly configuredBudget: number,
    private readonly reserve = 25,
  ) {}

  setAccount(a: AccountInfo): void {
    this.account = a;
  }

  get accountInfo(): AccountInfo | null {
    return this.account;
  }

  get dailyBudget(): number {
    const lim = this.account?.dailyLimit;
    return lim && lim > 0 ? Math.min(this.configuredBudget, Math.floor(lim * 0.95)) : this.configuredBudget;
  }

  today(now = Date.now()): string {
    return utcDate(now);
  }

  callsToday(now = Date.now()): number {
    return this.cache.counters(this.today(now)).total;
  }

  /** Account-wide requests today: the last /auth/keys/me reading plus our calls since then. */
  accountRequestsToday(now = Date.now()): number | null {
    const a = this.account;
    if (!a || a.requestsToday === null) return null;
    if (utcDate(a.checkedAt) !== utcDate(now)) return null;
    return a.requestsToday + Math.max(0, this.callsToday(now) - a.ourCallsAtCheck);
  }

  paceLimit(now = Date.now()): number {
    const budget = this.dailyBudget;
    const msIntoDay = now % DAY_MS;
    return Math.round(budget * (msIntoDay / DAY_MS) + Math.max(400, budget * 0.04));
  }

  private accountExhausted(now: number): boolean {
    const used = this.accountRequestsToday(now);
    const lim = this.account?.dailyLimit;
    return used !== null && !!lim && used >= lim - Math.max(50, lim * 0.01);
  }

  mode(now = Date.now()): BudgetMode {
    const calls = this.callsToday(now);
    if (calls >= this.dailyBudget - this.reserve || this.accountExhausted(now)) return "paused";
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
