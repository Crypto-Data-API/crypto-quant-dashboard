"use client";

import { Database, KeyRound, PlugZap, Radio, Server } from "lucide-react";
import type * as React from "react";
import { TIER_LABEL, type Tier } from "@cqd/schemas";
import { Tip } from "@/components/ui/primitives";
import { ago, dateTime, int } from "@/lib/format";
import { useNow, useWorkerStatus } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function Dot({ tone }: { tone: "good" | "warning" | "critical" | "muted" | "info" }) {
  const color = { good: "bg-good", warning: "bg-warning", critical: "bg-critical", muted: "bg-muted-foreground/50", info: "bg-primary" }[tone];
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", color)} aria-hidden />;
}

function Pill({ children, tip }: { children: React.ReactNode; tip: React.ReactNode }) {
  return (
    <Tip side="bottom" content={tip}>
      <div tabIndex={0} className="flex h-7 cursor-default items-center gap-1.5 rounded-md border px-2 text-[11px] whitespace-nowrap text-muted-foreground outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50">
        {children}
      </div>
    </Tip>
  );
}

/** Worker, API key, daily budget and stream state, always visible in the header. */
export function SystemStatus() {
  const { data } = useWorkerStatus();
  const now = useNow() || Date.now();
  const w = data?.worker ?? null;
  const online = data?.workerOnline ?? false;
  const budget = w?.budget;
  const used = budget ? budget.callsToday / Math.max(1, budget.dailyBudget) : 0;
  const stream = w?.stream;
  const account = w?.account ?? null;
  const tierLabel = account?.tier ? (TIER_LABEL[account.tier as Tier] ?? account.tier) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill
        tip={
          online && w ? (
            <div className="space-y-0.5">
              <div>Worker {w.workerId} online, cache: {w.cache}</div>
              <div>Heartbeat {ago(Date.parse(w.ts), now)} via {data?.via}</div>
              <div>Redis from web: {data?.redis}</div>
            </div>
          ) : (
            <div>Worker offline. Start it with pnpm dev:worker.</div>
          )
        }
      >
        {online ? <Server className="size-3.5" aria-hidden /> : <PlugZap className="size-3.5" aria-hidden />}
        <Dot tone={online ? "good" : "critical"} />
        {online ? "Worker" : "Worker offline"}
        {online && w ? (
          <span className="flex items-center gap-1 text-muted-foreground/80">
            <Database className="size-3" aria-hidden />
            {w.cache}
          </span>
        ) : null}
      </Pill>

      {w ? (
        <Pill
          tip={
            w.keyConfigured ? (
              <div className="space-y-0.5">
                <div>CDA_API_KEY is configured on the worker{tierLabel ? ` (tier ${tierLabel})` : ""}.</div>
                {account?.perMinuteLimit ? <div>Key limits: {int(account.perMinuteLimit)}/min, {int(account.dailyLimit)}/day</div> : null}
                {account ? <div>Checked {ago(Date.parse(account.checkedAt), now)}</div> : <div>Tier not read yet (/auth/keys/me).</div>}
              </div>
            ) : (
              "CDA_API_KEY is not set. Keyed panels show 'API key not configured'."
            )
          }
        >
          <KeyRound className="size-3.5" aria-hidden />
          <Dot tone={w.keyConfigured ? "good" : "warning"} />
          {w.keyConfigured ? (tierLabel ?? "Key") : "No API key"}
        </Pill>
      ) : null}

      {budget ? (
        <Pill
          tip={
            <div className="space-y-0.5">
              <div>
                {int(budget.callsToday)} of {int(budget.dailyBudget)} keyed calls used today by this dashboard (UTC)
              </div>
              {account?.requestsToday != null ? (
                <div>
                  Whole key, all tooling: about {int(account.requestsToday)} of {int(account.dailyLimit)}
                </div>
              ) : null}
              <div>Pace line now: {int(budget.paceLimit)}; governor: {budget.mode}{budget.stretch > 1 ? ` (intervals x${budget.stretch})` : ""}</div>
              <div>Scheduled load: ~{int(budget.scheduledPerHour)} calls/hour</div>
              <div>Limiter: {w?.limiter.ratePerMinute}/min, {w?.limiter.queued} queued</div>
              <div>Resets {dateTime(Date.parse(budget.resetsAt))}</div>
            </div>
          }
        >
          <span>Budget</span>
          <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={budget.dailyBudget} aria-valuenow={budget.callsToday} aria-label="Daily CDA calls used">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", budget.mode === "normal" ? "bg-primary" : budget.mode === "throttled" ? "bg-warning" : "bg-critical")}
              style={{ width: `${Math.min(100, used * 100)}%` }}
            />
          </span>
          <span className="num text-foreground">{int(budget.callsToday)}</span>
        </Pill>
      ) : null}

      {stream ? (
        <Pill
          tip={
            <div className="space-y-0.5">
              <div>
                Source: {stream.source}
                {stream.source === "delayed" ? " (keyless preview, ~31 min behind)" : ""}
              </div>
              <div>State: {stream.state}{stream.message ? `: ${stream.message}` : ""}</div>
              <div>{stream.eventsPerMin} events/min, {stream.clients} browser connections</div>
            </div>
          }
        >
          <Radio className="size-3.5" aria-hidden />
          <Dot tone={stream.state === "open" ? (stream.source === "live" ? "good" : "info") : stream.state === "error" ? "critical" : "muted"} />
          {stream.source === "live" ? "Live" : stream.source === "delayed" ? "Delayed" : "Stream off"}
          <span className="num text-muted-foreground/80">{stream.eventsPerMin}/m</span>
        </Pill>
      ) : null}
    </div>
  );
}
