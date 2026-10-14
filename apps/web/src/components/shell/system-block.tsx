"use client";

import { TIER_LABEL, type Tier } from "@cqd/schemas";
import { useEffect, useState, type ReactNode } from "react";
import { Tip } from "@/components/ui/primitives";
import { Pulse } from "@/cq/react";
import { JevRow } from "@/features/jev/jev-status";
import { ago, dateTime, int } from "@/lib/format";
import { useNow, useWorkerStatus } from "@/lib/hooks";

const Dot = ({ color }: { color: string }) => <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flex: "none" }} aria-hidden />;

/** One SYSTEM line: label left, value right, details in a tooltip beside the sidebar. */
function Row({ tip, label, value, children }: { tip: ReactNode; label: ReactNode; value: ReactNode; children?: ReactNode }) {
  return (
    <Tip side="right" content={tip}>
      <div tabIndex={0} className="flex cursor-default flex-col rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[#4c9bff]/50" style={{ gap: 5 }}>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span className="flex min-w-0 items-center" style={{ gap: 7, whiteSpace: "nowrap" }}>
            {label}
          </span>
          <span style={{ whiteSpace: "nowrap" }}>{value}</span>
        </div>
        {children}
      </div>
    </Tip>
  );
}

function useUtcClock(): string {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return "--:--:--";
  const d = new Date(now);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** The sidebar SYSTEM block: worker and cache, plan, the daily API budget, the UTC clock and Jev's read. */
export function SystemBlock({ popLeft }: { popLeft: number }) {
  const { data } = useWorkerStatus();
  const now = useNow() || Date.now();
  const clock = useUtcClock();
  const w = data?.worker ?? null;
  const online = data?.workerOnline ?? false;
  const isStatic = data?.via === "static";
  const keyed = Boolean(w?.keyConfigured);
  const demo = Boolean(w?.demo?.cda);
  const budget = w?.budget;
  const account = w?.account ?? null;
  const tier = account?.tier ? (TIER_LABEL[account.tier as Tier] ?? account.tier) : null;
  const used = keyed && budget ? Math.min(1, budget.callsToday / Math.max(1, budget.dailyBudget)) : 0;
  const barColor = budget?.mode === "paused" ? "#ff5c6c" : budget?.mode === "throttled" ? "#ffb547" : "#4c9bff";

  const worker = isStatic ? (
    <Row tip="Static GitHub Pages build: no server and no live calls. Every panel shows saved CryptoDataApi responses." label={<><Dot color="#4c9bff" />Static build</>} value={<span style={{ color: "#4c9bff" }}>no worker</span>} />
  ) : online && w ? (
    <Row
      tip={
        <div className="space-y-0.5">
          <div>
            Worker {w.workerId} online, cache: {w.cache}
          </div>
          <div>
            Heartbeat {ago(Date.parse(w.ts), now)} via {data?.via}
          </div>
          <div>Redis from web: {data?.redis}</div>
        </div>
      }
      label={
        <>
          <Pulse color="#2ee6a6" />
          Worker · {w.cache}
        </>
      }
      value={<span style={{ color: "#2ee6a6" }}>ok</span>}
    />
  ) : (
    <Row tip="Worker offline. Start it with pnpm dev:worker." label={<><Dot color="#ff5c6c" />Worker</>} value={<span style={{ color: "#ff5c6c" }}>offline</span>} />
  );

  const plan = isStatic ? (
    <Row tip="The static build has no API key: panels show saved CryptoDataApi responses." label={<><Dot color="#4c9bff" />Plan</>} value={<span style={{ color: "#e6edf5" }}>demo data</span>} />
  ) : w && keyed ? (
    <Row
      tip={
        <div className="space-y-0.5">
          <div>CDA_API_KEY is configured on the worker{tier ? ` (tier ${tier})` : ""}.</div>
          {account?.perMinuteLimit ? (
            <div>
              Key limits: {int(account.perMinuteLimit)}/min, {int(account.dailyLimit)}/day
            </div>
          ) : null}
          {account ? <div>Checked {ago(Date.parse(account.checkedAt), now)}</div> : <div>Tier not read yet (/auth/keys/me).</div>}
        </div>
      }
      label={<><Dot color="#2ee6a6" />Plan</>}
      value={<span style={{ color: "#e6edf5" }}>{tier ?? "key set"}</span>}
    />
  ) : w ? (
    <Row tip={demo ? "No CDA_API_KEY: panels show saved demo responses. See Setup." : "CDA_API_KEY is not set. See Setup."} label={<><Dot color="#ffb547" />Plan</>} value={<span style={{ color: "#e6edf5" }}>{demo ? "demo data" : "no API key"}</span>} />
  ) : (
    <Row tip="Plan unknown while the worker is offline." label={<><Dot color="#3f4a57" />Plan</>} value="—" />
  );

  const budgetValue =
    keyed && budget ? (
      <>
        <b style={{ color: "#e6edf5", fontWeight: 600 }}>{int(budget.callsToday)}</b>
        <span style={{ color: "#5b6878" }}> / {compact(budget.dailyBudget)}</span>
      </>
    ) : isStatic ? (
      "no calls"
    ) : w ? (
      "no key"
    ) : (
      "—"
    );
  const budgetTip =
    keyed && budget ? (
      <div className="space-y-0.5">
        <div>
          {int(budget.callsToday)} of {int(budget.dailyBudget)} keyed calls used today by this dashboard (UTC)
        </div>
        {account?.requestsToday != null ? (
          <div>
            Whole key, all tooling: about {int(account.requestsToday)} of {int(account.dailyLimit)}
          </div>
        ) : null}
        <div>
          Pace line now: {int(budget.paceLimit)}; governor: {budget.mode}
          {budget.stretch > 1 ? ` (intervals x${budget.stretch})` : ""}
        </div>
        <div>Scheduled load: ~{int(budget.scheduledPerHour)} calls/hour</div>
        <div>Resets {dateTime(Date.parse(budget.resetsAt))}</div>
      </div>
    ) : isStatic ? (
      "The static build makes no API calls."
    ) : w ? (
      "No CDA_API_KEY, so the worker makes no keyed calls."
    ) : (
      "Budget unknown while the worker is offline."
    );

  return (
    <div className="cq-mono flex flex-col" style={{ gap: 8, padding: "0 4px 10px", borderBottom: "1px solid #111821", fontSize: 10.5, color: "#9aa8b8" }} role="group" aria-label="System status">
      <span style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#5b6878" }}>SYSTEM</span>
      {worker}
      {plan}
      <Row tip={budgetTip} label="API budget" value={budgetValue}>
        <span
          style={{ display: "block", height: 4, borderRadius: 4, background: "#18202b", overflow: "hidden" }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={budget?.dailyBudget ?? 0}
          aria-valuenow={keyed ? (budget?.callsToday ?? 0) : 0}
          aria-label="Daily CDA calls used"
        >
          <span style={{ display: "block", height: "100%", width: `${used > 0 ? Math.max(2, used * 100) : 0}%`, background: barColor, transition: "width .6s" }} />
        </span>
      </Row>
      <Row tip="Current time in UTC. The daily API budget counts UTC days." label="UTC" value={<b style={{ color: "#e6edf5", fontWeight: 500 }}>{clock}</b>} />
      <JevRow popLeft={popLeft} />
    </div>
  );
}
