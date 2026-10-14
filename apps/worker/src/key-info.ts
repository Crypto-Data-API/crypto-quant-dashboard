import type { CdaClient, TokenBucket } from "@cqd/cda-client";
import type { BudgetGovernor } from "./budget";
import type { Logger } from "./log";

const REFRESH_MS = 10 * 60_000;

interface KeyInfoPayload {
  tier?: string;
  is_active?: boolean;
  requests_today?: number;
  daily_limit?: number;
  per_minute_limit?: number | null;
}

/**
 * Reads GET /api/v1/auth/keys/me (any valid key; about 144 calls/day at a 10-minute cadence)
 * and feeds it to the rest of the worker:
 *  - the key's tier gates registry datasets, so a lower-tier key never spends calls on 403s;
 *  - the limiter rate becomes min(CDA_RATE_PER_MIN, per_minute_limit - 2);
 *  - the budget governor caps our daily budget at 95% of the key's daily limit and pauses if
 *    the whole account (other tooling included) nears that limit.
 * Only tier and limits are read; the payload's email is never logged or stored.
 */
export function createKeyInfoMonitor(opts: { client: CdaClient; budget: BudgetGovernor; limiter: TokenBucket; configuredRate: number; log: Logger }) {
  const { client, budget, limiter, configuredRate, log } = opts;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTier: string | null = null;

  async function refresh(): Promise<void> {
    if (!client.hasKey) return;
    const res = await client.get<KeyInfoPayload>("/api/v1/auth/keys/me", { priority: 50 });
    if (!res.ok) {
      log.warn("could not read key info; tier gating and limit adaptation are off until it succeeds", { kind: res.kind, httpStatus: res.status });
      return;
    }
    const d = res.data ?? {};
    const perMinute = typeof d.per_minute_limit === "number" && d.per_minute_limit > 0 ? d.per_minute_limit : null;
    budget.setAccount({
      tier: typeof d.tier === "string" ? d.tier : null,
      requestsToday: typeof d.requests_today === "number" ? d.requests_today : null,
      dailyLimit: typeof d.daily_limit === "number" && d.daily_limit > 0 ? d.daily_limit : null,
      perMinuteLimit: perMinute,
      checkedAt: Date.now(),
      ourCallsAtCheck: budget.callsToday(),
    });
    const rate = perMinute ? Math.max(1, Math.min(configuredRate, perMinute - 2)) : configuredRate;
    limiter.setRate(rate);
    const fields = {
      tier: d.tier,
      active: d.is_active,
      requestsToday: d.requests_today,
      dailyLimit: d.daily_limit,
      perMinuteLimit: perMinute,
      limiterRate: rate,
      ourDailyBudget: budget.dailyBudget,
    };
    if (d.tier !== lastTier) log.info("key info", fields);
    else log.debug("key info", fields);
    lastTier = d.tier ?? null;
  }

  timer = setInterval(() => void refresh(), REFRESH_MS);
  timer.unref();

  return {
    refresh,
    stop: () => {
      if (timer) clearInterval(timer);
    },
  };
}
