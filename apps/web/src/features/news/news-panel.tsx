"use client";

import Link from "next/link";
import { Panel } from "@/components/panel";
import { useDataset, useNow } from "@/lib/hooks";
import { toMs } from "@/lib/utils";
import { useJevNews } from "@/features/jev/jev-parts";
import { CompactNewsItem } from "./news-parts";

/**
 * Compact market-moving news beside the liquidation tape, so cause and effect sit together.
 * Reads the same cached tape as /news (no extra API calls).
 */
export function NewsPanel({ hours = 24, max = 8, className }: { hours?: number; max?: number; className?: string }) {
  const q = useDataset("news-market-moving");
  const jev = useJevNews();
  const now = useNow() || Date.now();
  return (
    <Panel title="Market-moving news" dataset="news-market-moving" env={q.data} isLoading={q.isLoading} skeletonHeight={200} className={className}>
      {(d) => {
        const since = now - hours * 3_600_000;
        const recent = d.events.filter((e) => (toMs(e.published) ?? 0) >= since).sort((a, b) => (toMs(b.published) ?? 0) - (toMs(a.published) ?? 0));
        const shown = (recent.length > 0 ? recent : d.events).slice(0, max);
        return (
          <div className="space-y-2">
            {recent.length === 0 ? <div className="text-[11px] text-muted-foreground">No qualified catalysts in the last {hours}h; showing the latest from the week.</div> : null}
            {shown.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No qualified catalysts in the last 7 days.</div>
            ) : (
              <ul className="space-y-2">
                {shown.map((e) => (
                  <CompactNewsItem key={e.event_id} e={e} jev={jev.reads[e.event_id]} jevStatus={jev.env?.status} />
                ))}
              </ul>
            )}
            <Link href="/news" className="text-xs text-primary hover:underline">
              Full catalyst tape, news pulse and feed health
            </Link>
          </div>
        );
      }}
    </Panel>
  );
}
