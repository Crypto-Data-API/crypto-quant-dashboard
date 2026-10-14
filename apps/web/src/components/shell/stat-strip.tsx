"use client";

import { isStale, type DatasetId, type Envelope } from "@cqd/schemas";
import { KeyRound, Lock } from "lucide-react";
import { Tip } from "@/components/ui/primitives";
import { btcOiAllVenues, healthIndicator, hlOpenInterest, regimeSignal, stablecoinMcap, whaleShortShare } from "@/lib/derive";
import { ago, num, pct, usd } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";

interface Stat {
  label: string;
  value: string;
  source: string;
  env: Envelope | undefined;
  hint?: string;
}

function StatTile({ stat, now }: { stat: Stat; now: number }) {
  const env = stat.env;
  const stale = env?.fetchedAt && !env.demo ? isStale(env, now || Date.now()) : false;
  const missing = stat.value === "—";
  const lockIcon = env?.status === "no_api_key" ? KeyRound : env?.status === "pro_required" ? Lock : null;
  const LockIcon = lockIcon;
  return (
    <Tip
      side="bottom"
      content={
        <div className="space-y-0.5">
          <div className="font-medium">{stat.label}</div>
          {stat.hint ? <div className="text-muted-foreground">{stat.hint}</div> : null}
          <div className="font-mono text-[10px] text-muted-foreground">{stat.source}</div>
          {env?.fetchedAt ? <div>Updated {ago(toMs(env.fetchedAt), now || Date.now())}</div> : null}
          {env && env.status !== "ok" ? <div className="text-warning">Status: {env.status.replace(/_/g, " ")}</div> : null}
        </div>
      }
    >
      <div tabIndex={0} className="flex min-w-[104px] shrink-0 cursor-default flex-col gap-0.5 rounded-md px-2.5 py-1.5 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50">
        <span className="flex items-center gap-1 text-[10px] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase">
          {stat.label}
          {stale ? <span className="size-1.5 rounded-full bg-warning" aria-label="stale" /> : null}
        </span>
        <span className={cn("flex items-center gap-1 text-sm font-semibold whitespace-nowrap", missing && "text-muted-foreground")}>
          {LockIcon && missing ? <LockIcon className="size-3.5" aria-hidden /> : null}
          {stat.value}
        </span>
      </div>
    </Tip>
  );
}

const src = (id: DatasetId, path: string) => `${id}: ${path}`;

/** The header strip shared across every page. Each tile reads the same cached datasets the pages use. */
export function StatStrip() {
  const now = useNow();
  const regimes = useDataset("regimes");
  const health = useDataset("market-health");
  const deriv = useDataset("derivatives-summary");
  const volume = useDataset("volume-scanner");
  const whales = useDataset("quant-whales");

  const r = regimes.data?.data;
  const h = health.data?.data;
  const stats: Stat[] = [
    { label: "BTC dominance", value: pct(regimeSignal(r, "btc_dom")), source: src("regimes", "current.signals.btc_dom"), env: regimes.data },
    {
      label: "Stablecoin mcap",
      value: usd(stablecoinMcap(h)),
      source: src("market-health", "stablecoin_flow details"),
      env: health.data,
      hint: "Total crypto market cap is not exposed by the Phase 1 endpoints; stablecoin supply is the dry-powder proxy CDA scores.",
    },
    { label: "HL 24h volume", value: usd(volume.data?.data?.total_volume_24h), source: src("volume-scanner", "total_volume_24h"), env: volume.data },
    { label: "BTC OI (all venues)", value: usd(btcOiAllVenues(deriv.data?.data)), source: src("derivatives-summary", "cross_exchange.open_interest[All]"), env: deriv.data },
    {
      label: "HL open interest",
      value: usd(hlOpenInterest(volume.data?.data)),
      source: src("volume-scanner", "sum of items[].open_interest_usd"),
      env: volume.data,
      hint: "Sum of per-perp OI across the Hyperliquid universe in one scanner response.",
    },
    { label: "24h liquidations", value: usd(regimeSignal(r, "liq_24h")), source: src("regimes", "current.signals.liq_24h"), env: regimes.data },
    {
      label: "L/S ratio",
      value: num(healthIndicator(h, "long_short_ratio"), 2),
      source: src("market-health", "indicators.long_short_ratio"),
      env: health.data,
      hint: "BTC long/short account ratio on Binance perps, used by CDA as a market-wide sentiment read.",
    },
    {
      label: "Whale short share",
      value: pct(whaleShortShare(whales.data?.data)),
      source: src("quant-whales", "100 - summary.long_pct"),
      env: whales.data,
      hint: "Share of notional held short by Hyperliquid accounts worth $100k or more.",
    },
    { label: "Fear & Greed", value: num(healthIndicator(h, "fear_greed_value"), 0), source: src("market-health", "indicators.fear_greed_value"), env: health.data },
  ];

  return (
    <div className="scrollbar-thin flex items-stretch gap-0.5 overflow-x-auto" role="list" aria-label="Market stats">
      {stats.map((s) => (
        <div role="listitem" key={s.label}>
          <StatTile stat={s} now={now} />
        </div>
      ))}
    </div>
  );
}
