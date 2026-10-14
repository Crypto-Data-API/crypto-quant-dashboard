"use client";

import type { JevNewsRead } from "@cqd/schemas";
import { Bot, TriangleAlert } from "lucide-react";
import { Badge, Tip } from "@/components/ui/primitives";
import { frac, num } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const CHOICE_STYLE: Record<string, { label: string; cls: string }> = {
  bullish: { label: "Bullish", cls: "text-long" },
  bearish: { label: "Bearish", cls: "text-short" },
  neutral: { label: "Neutral", cls: "text-muted-foreground" },
};

/** Jev reads for every event on the news tape (one shared query). */
export function useJevNews() {
  const q = useDataset("jev-news");
  return { reads: q.data?.data?.reads ?? {}, env: q.data, isLoading: q.isLoading };
}

const cdaWord = (b: number) => (b > 0 ? "bullish" : b < 0 ? "bearish" : "neutral");

/** Clear badge when CDA's signed bias and Jev's choice point different ways. */
export function DisagreeBadge({ read }: { read: JevNewsRead }) {
  if (read.agrees) return null;
  return (
    <Tip content={`CDA bias ${read.cdaBias > 0 ? "+" : ""}${num(read.cdaBias, 1)} (${cdaWord(read.cdaBias)}) vs Jev ${read.bias.choice} (${frac(read.bias.confidence, { digits: 0 })} confidence).`}>
      <Badge variant="warning" tabIndex={0}>
        <TriangleAlert aria-hidden />
        Jev disagrees
      </Badge>
    </Tip>
  );
}

/** Jev's read of a news catalyst: direction with confidence, actionable odds and severity. */
export function JevNewsCell({ read, envStatus, compact = false }: { read: JevNewsRead | undefined; envStatus?: string; compact?: boolean }) {
  if (!read) {
    const label = envStatus === "classifier_off" ? "off" : envStatus && envStatus !== "ok" ? envStatus.replace(/_/g, " ") : "queued";
    return (
      <Tip content={envStatus === "classifier_off" ? "Jev classifier not configured on the worker." : "Not classified yet; the worker classifies new events every minute."}>
        <span tabIndex={0} className="text-[11px] text-muted-foreground/60 outline-none">
          <Bot className="mr-1 inline size-3" aria-hidden />
          {label}
        </span>
      </Tip>
    );
  }
  const style = CHOICE_STYLE[read.bias.choice] ?? { label: read.bias.choice, cls: "" };
  const probs = Object.entries(read.bias.probabilities)
    .map(([k, v]) => `${k} ${frac(v, { digits: 0 })}`)
    .join(", ");
  return (
    <span className={cn("inline-flex items-center gap-2", compact ? "" : "min-w-[200px]")}>
      <Tip
        content={
          <div className="space-y-0.5">
            <div className="font-medium">Jev ({read.model})</div>
            <div>Direction: {probs}</div>
            <div>Concrete dated event: {frac(read.actionable, { digits: 0 })}</div>
            <div>
              Severity {num(read.severity.score, 2)} of {read.severity.levels - 1} (confidence {frac(read.severity.confidence, { digits: 0 })})
            </div>
          </div>
        }
      >
        <span tabIndex={0} className="inline-flex items-center gap-1 text-[11px] outline-none">
          <Bot className="size-3 text-muted-foreground" aria-hidden />
          <span className={cn("font-semibold", style.cls)}>{style.label}</span>
          <span className="num text-muted-foreground">{frac(read.bias.confidence, { digits: 0 })}</span>
          {!compact ? (
            <span className="num text-muted-foreground">
              &middot; act {frac(read.actionable, { digits: 0 })} &middot; sev {num(read.severity.score, 1)}
            </span>
          ) : null}
        </span>
      </Tip>
      <DisagreeBadge read={read} />
    </span>
  );
}

/** Small probability pill for a squeeze alert: odds the cascade continues over the next hour. */
export function JevCascadePill({ symbol, direction }: { symbol: string; direction: string }) {
  const q = useDataset("jev-squeeze");
  const d = q.data?.data;
  const id = d?.active?.[`${symbol}|${direction}`];
  const read = id ? d?.reads?.[id] : undefined;
  if (q.data?.status === "classifier_off") return null;
  if (!read) {
    return (
      <Badge variant="outline">
        <Bot aria-hidden />
        Jev: queued
      </Badge>
    );
  }
  const p = read.cascade;
  return (
    <Tip content={`Jev (${read.model}): probability this forced flow is a genuine cascade likely to continue over the next hour. Classified ${new Date(read.classifiedAt).toLocaleTimeString("en-GB", { hour12: false })}.`}>
      <Badge variant={p >= 0.6 ? "serious" : p >= 0.35 ? "warning" : "outline"} tabIndex={0}>
        <Bot aria-hidden />
        Jev cascade {frac(p, { digits: 0 })}
      </Badge>
    </Tip>
  );
}
