"use client";

import type { JevMarketVerdict } from "@cqd/schemas";
import { Bot } from "lucide-react";
import { MeterBar, ProbBar } from "@/components/charts/basic";
import { Panel } from "@/components/panel";
import { Badge, Tip } from "@/components/ui/primitives";
import { C } from "@/lib/domain";
import { ago, dateTime, frac, int, num } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";

const STANCE: Record<string, { label: string; color: string; cls: string }> = {
  risk_on: { label: "Risk-on", color: C.long, cls: "text-long" },
  neutral: { label: "Neutral", color: C.neutral, cls: "text-foreground" },
  risk_off: { label: "Risk-off", color: C.short, cls: "text-short" },
};

const CONVICTION = ["Very low", "Low", "Moderate", "High", "Very high"];
const ORDINAL = ["#184f95", "#2a78d6", "#3987e5", "#6da7ec", "#b7d3f6"];

function VerdictBody({ v }: { v: JevMarketVerdict }) {
  const now = useNow() || Date.now();
  const s = STANCE[v.stance.choice] ?? { label: v.stance.choice, color: C.blue, cls: "" };
  const level = Math.max(0, Math.min(CONVICTION.length - 1, Math.round(v.conviction.score)));
  const stanceBuckets = (["risk_on", "neutral", "risk_off"] as const)
    .filter((k) => v.stance.probabilities[k] !== undefined)
    .map((k) => ({ key: k, label: STANCE[k]!.label, p: v.stance.probabilities[k] ?? 0, color: STANCE[k]!.color }));
  const convictionBuckets = Object.entries(v.conviction.probabilities)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, p]) => ({ key: k, label: CONVICTION[Number(k)] ?? k, p, color: ORDINAL[Number(k)] ?? C.blue }));
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className={cn("text-xl font-semibold", s.cls)}>{s.label}</span>
        <span className="num text-xs text-muted-foreground">{frac(v.stance.confidence, { digits: 0 })} confidence</span>
      </div>
      <ProbBar buckets={stanceBuckets} height={10} />
      <div className="grid grid-cols-2 gap-2">
        <Tip content="Jev's probability that realized volatility expands materially over the next 24 hours.">
          <div tabIndex={0} className="rounded-md border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Vol expansion 24h</div>
            <div className="text-lg font-semibold">{frac(v.volExpansion24h, { digits: 0 })}</div>
            <MeterBar value={v.volExpansion24h} max={1} height={4} color={v.volExpansion24h >= 0.5 ? C.orange : C.blue} />
          </div>
        </Tip>
        <Tip content={`Expected conviction ${num(v.conviction.score, 2)} on a 0 to 4 scale (confidence ${frac(v.conviction.confidence, { digits: 0 })}).`}>
          <div tabIndex={0} className="rounded-md border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Conviction</div>
            <div className="text-lg font-semibold">
              {CONVICTION[level]} <span className="num text-xs font-normal text-muted-foreground">{num(v.conviction.score, 1)}/4</span>
            </div>
            <MeterBar value={v.conviction.score} max={4} height={4} />
          </div>
        </Tip>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">Conviction distribution</div>
        <ProbBar buckets={convictionBuckets} height={6} />
      </div>
      <details className="group rounded-md border px-3 py-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground select-none group-open:mb-2">What Jev saw</summary>
        <ul className="space-y-1">
          {v.inputs.map((i) => (
            <li key={i.dataset} className="flex items-center justify-between gap-2">
              <span>
                {i.label} <span className="font-mono text-[10px] text-muted-foreground">{i.dataset}</span>
              </span>
              <span className="num text-[11px] text-muted-foreground" title={i.asOf ? dateTime(toMs(i.asOf)) : undefined}>
                {i.status !== "ok" ? <Badge variant="warning">{i.status}</Badge> : null} {i.asOf ? `as of ${ago(toMs(i.asOf), now)}` : "no data"}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 text-[10px] text-muted-foreground">
          Model {v.model} &middot; {int(v.usage.input_tokens)} input tokens &middot; classified {dateTime(toMs(v.classifiedAt))}
        </div>
      </details>
      <p className="text-[10px] text-muted-foreground">
        A second opinion from TypeSafe&apos;s Jev classifier, run every 15 minutes in the worker over the cached CDA data. It is a model read, not advice.
      </p>
    </div>
  );
}

/** Jev's market-wide verdict: stance, 24h vol expansion odds and conviction (PLAN.md 3.9). */
export function JevVerdictCard({ className }: { className?: string }) {
  const q = useDataset("jev-market-verdict");
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Bot className="size-4 text-primary" aria-hidden />
          Jev market verdict
        </span>
      }
      dataset="jev-market-verdict"
      env={q.data}
      isLoading={q.isLoading}
      className={className}
      skeletonHeight={220}
    >
      {(v) => <VerdictBody v={v} />}
    </Panel>
  );
}
