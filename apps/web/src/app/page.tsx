"use client";

import Link from "next/link";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/primitives";
import { HealthCard } from "@/features/market/health-card";
import { JevVerdictCard } from "@/features/jev/verdict-card";
import { RegimeHeroCard } from "@/features/market/regime-hero";
import { LiquidationTape } from "@/features/liquidations/liquidation-tape";
import { SqueezeAlerts } from "@/features/liquidations/squeeze-alerts";
import { LongShortBar } from "@/components/charts/basic";
import { liquidationTotals } from "@/lib/derive";
import { usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";

function CycleChip() {
  const q = useDataset("regimes");
  return (
    <Panel title="Cycle phase" dataset="regimes" env={q.data} isLoading={q.isLoading} skeletonHeight={70}>
      {(d) => (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{d.current.name ?? "Unclassified"}</span>
            {d.current.id ? <Badge variant="outline">phase {d.current.id} of {d.count}</Badge> : null}
          </div>
          {d.current.stage_label ? <div className="text-xs text-muted-foreground">{d.current.stage_label}</div> : null}
          <Link href="/regimes" className="text-xs text-primary hover:underline">
            Cycle ring and playbook
          </Link>
        </div>
      )}
    </Panel>
  );
}

function LiqTotalsMini() {
  const q = useDataset("liquidations");
  return (
    <Panel title="Liquidations (all tracked coins)" dataset="liquidations" env={q.data} isLoading={q.isLoading} skeletonHeight={110}>
      {(d) => (
        <div className="space-y-2.5">
          {liquidationTotals(d).map((t) => (
            <div key={t.window} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{t.window}</span>
              <LongShortBar long={t.long} short={t.short} labels={false} />
              <span className="num w-16 text-right text-xs font-medium">{usd(t.total)}</span>
            </div>
          ))}
          <Link href="/liquidations" className="text-xs text-primary hover:underline">
            Heatmap, exchanges and full tape
          </Link>
        </div>
      )}
    </Panel>
  );
}

export default function OverviewPage() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <RegimeHeroCard compact />
          <JevVerdictCard />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <HealthCard />
          <div className="space-y-4">
            <CycleChip />
            <LiqTotalsMini />
          </div>
        </div>
        <SqueezeAlerts />
      </div>
      <LiquidationTape className="xl:col-span-1" height={640} maxRows={80} />
    </div>
  );
}
