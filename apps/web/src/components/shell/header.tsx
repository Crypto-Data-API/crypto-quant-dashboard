"use client";

import { TIER_LABEL, type Tier } from "@cqd/schemas";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Tip } from "@/components/ui/primitives";
import { A } from "@/cq/theme";
import { JevPill } from "@/features/jev/jev-status";
import { ago, dateTime, int } from "@/lib/format";
import { useNow, useWorkerStatus } from "@/lib/hooks";
import { useLiveTape } from "@/lib/live";
import { isActive, NAV } from "./nav";

const PILL: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 30,
  padding: "0 12px",
  background: "#0a0e13",
  border: "1px solid #1a2330",
  borderRadius: 8,
  fontSize: 12,
  color: "#c9d3df",
  whiteSpace: "nowrap",
};

function Pill({ tip, children, color }: { tip: ReactNode; children: ReactNode; color?: string }) {
  const style: CSSProperties = color ? { ...PILL, color, background: A(color, 0.06), borderColor: A(color, 0.4) } : PILL;
  return (
    <Tip side="bottom" content={tip}>
      <div tabIndex={0} className="cq-mono cursor-default outline-none focus-visible:ring-2 focus-visible:ring-[#4c9bff]/50" style={style}>
        {children}
      </div>
    </Tip>
  );
}

const Dot = ({ color }: { color: string }) => <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flex: "none" }} aria-hidden />;

function UtcClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const d = now ? new Date(now) : null;
  const txt = d ? [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, "0")).join(":") : "--:--:--";
  return (
    <div className="cq-mono" style={PILL} aria-label="UTC time">
      <span style={{ color: "#5b6878" }}>UTC</span>
      <b style={{ color: "#e6edf5", fontWeight: 600 }}>{txt}</b>
    </div>
  );
}

function StatusPills() {
  const { data } = useWorkerStatus();
  const { connection } = useLiveTape();
  const now = useNow() || Date.now();
  const w = data?.worker ?? null;
  const online = data?.workerOnline ?? false;

  if (data?.via === "static") {
    return (
      <>
        <Pill tip="Static GitHub Pages build: no server, no live calls. Every panel shows saved CryptoDataApi responses." color="#4c9bff">
          <Dot color="#4c9bff" />
          Static demo
        </Pill>
        <Pill tip="The liquidation tape replays saved stream events in your browser.">
          <Dot color="#4c9bff" />
          Replay
        </Pill>
        <UtcClock />
        <JevPill />
      </>
    );
  }

  const budget = w?.budget;
  const account = w?.account ?? null;
  const tier = account?.tier ? (TIER_LABEL[account.tier as Tier] ?? account.tier) : null;
  const demo = w?.demo?.cda;
  const stream = w?.stream;
  const used = budget ? Math.min(1, budget.callsToday / Math.max(1, budget.dailyBudget)) : 0;
  const barColor = budget?.mode === "paused" ? "#ff5c6c" : budget?.mode === "throttled" ? "#ffb547" : "#4c9bff";
  const streamOpen = stream?.state === "open" && connection !== "closed";
  const streamLabel = !stream ? "Stream" : stream.source === "live" ? "Live" : stream.source === "delayed" ? "Delayed" : stream.source === "replay" ? "Replay" : "Stream off";

  return (
    <>
      <Pill
        tip={
          online && w ? (
            <div className="space-y-0.5">
              <div>
                Worker {w.workerId} online, cache: {w.cache}
              </div>
              <div>
                Heartbeat {ago(Date.parse(w.ts), now)} via {data?.via}
              </div>
              <div>Redis from web: {data?.redis}</div>
            </div>
          ) : (
            <div>Worker offline. Start it with pnpm dev:worker.</div>
          )
        }
      >
        <Dot color={online ? "#2ee6a6" : "#ff5c6c"} />
        {online ? (
          <>
            Worker <span style={{ color: "#3f4a57" }}>·</span> {w?.cache ?? ""}
          </>
        ) : (
          "Worker offline"
        )}
      </Pill>
      {w ? (
        <Pill
          tip={
            w.keyConfigured ? (
              <div className="space-y-0.5">
                <div>CDA_API_KEY is configured on the worker{tier ? ` (tier ${tier})` : ""}.</div>
                {account?.perMinuteLimit ? (
                  <div>
                    Key limits: {int(account.perMinuteLimit)}/min, {int(account.dailyLimit)}/day
                  </div>
                ) : null}
                {account ? <div>Checked {ago(Date.parse(account.checkedAt), now)}</div> : <div>Tier not read yet (/auth/keys/me).</div>}
              </div>
            ) : demo ? (
              "No CDA_API_KEY: panels show saved demo responses. See Setup."
            ) : (
              "CDA_API_KEY is not set."
            )
          }
        >
          <Dot color={w.keyConfigured ? "#2ee6a6" : "#ffb547"} />
          {w.keyConfigured ? (tier ?? "Key set") : demo ? "Demo data" : "No API key"}
        </Pill>
      ) : null}
      {budget && w?.keyConfigured ? (
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
              <div>
                Pace line now: {int(budget.paceLimit)}; governor: {budget.mode}
                {budget.stretch > 1 ? ` (intervals x${budget.stretch})` : ""}
              </div>
              <div>Scheduled load: ~{int(budget.scheduledPerHour)} calls/hour</div>
              <div>Resets {dateTime(Date.parse(budget.resetsAt))}</div>
            </div>
          }
        >
          <span>Budget</span>
          <span style={{ display: "block", width: 72, height: 4, borderRadius: 4, background: "#18202b", overflow: "hidden" }} role="meter" aria-valuemin={0} aria-valuemax={budget.dailyBudget} aria-valuenow={budget.callsToday} aria-label="Daily CDA calls used">
            <span style={{ display: "block", height: "100%", width: `${Math.max(2, used * 100)}%`, background: barColor, transition: "width .6s" }} />
          </span>
          <b style={{ color: "#e6edf5", fontWeight: 600 }}>{int(budget.callsToday)}</b>
        </Pill>
      ) : null}
      {stream ? (
        <Pill
          color={streamOpen && stream.source === "live" ? "#2ee6a6" : undefined}
          tip={
            <div className="space-y-0.5">
              <div>
                Source: {stream.source}
                {stream.source === "delayed" ? " (keyless preview, ~31 min behind)" : ""}
              </div>
              <div>
                State: {stream.state}
                {stream.message ? `: ${stream.message}` : ""}
              </div>
              <div>
                {stream.eventsPerMin} events/min, {stream.clients} browser connections
              </div>
            </div>
          }
        >
          <Dot color={streamOpen ? (stream.source === "live" ? "#2ee6a6" : "#4c9bff") : "#5b6878"} />
          {streamLabel} {stream.eventsPerMin} <span style={{ opacity: 0.8 }}>/m</span>
        </Pill>
      ) : null}
      <UtcClock />
      <JevPill />
    </>
  );
}

export function Header() {
  const pathname = usePathname() ?? "/";
  const cur = NAV.find((n) => isActive(pathname, n.href)) ?? NAV[0]!;
  return (
    <header className="flex flex-wrap items-center justify-between" style={{ gap: "12px 16px", padding: "14px 22px", borderBottom: "1px solid #131a23", background: "rgba(6,8,11,0.75)" }}>
      <div className="min-w-0">
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.025em" }}>{cur.label}</h1>
        <div style={{ fontSize: 12, color: "#8b98a9", marginTop: 2 }}>{cur.description}</div>
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        <StatusPills />
      </div>
    </header>
  );
}
