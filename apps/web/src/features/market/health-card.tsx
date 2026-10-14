"use client";

import { Gauge } from "@/components/charts/basic";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/primitives";
import { C, sentimentTone } from "@/lib/domain";
import { useDataset } from "@/lib/hooks";

/** Market health 0-100 with the long-term and short-term halves. */
export function HealthCard({ className }: { className?: string }) {
  const q = useDataset("market-health");
  return (
    <Panel title="Market health" dataset="market-health" env={q.data} isLoading={q.isLoading} className={className} skeletonHeight={170}>
      {(d) => (
        <div className="flex flex-wrap items-end justify-around gap-4">
          <Gauge
            value={d.total_score}
            label="Combined"
            size={150}
            sub={<Badge variant={sentimentTone(d.sentiment)}>{d.sentiment}</Badge>}
          />
          <Gauge value={d.long_term_score} label="Long-term" size={110} color={C.violet} sub={<Badge variant={sentimentTone(d.long_term_sentiment)}>{d.long_term_sentiment}</Badge>} />
          <Gauge value={d.short_term_score} label="Short-term" size={110} color={C.aqua} sub={<Badge variant={sentimentTone(d.short_term_sentiment)}>{d.short_term_sentiment}</Badge>} />
        </div>
      )}
    </Panel>
  );
}
