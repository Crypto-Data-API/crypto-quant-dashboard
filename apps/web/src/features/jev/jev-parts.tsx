"use client";

import type { JevNewsRead } from "@cqd/schemas";
import { Tip } from "@/components/ui/primitives";
import { A } from "@/cq/theme";
import { frac, num } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { useUi } from "@/lib/settings";

const CHOICE: Record<string, { label: string; c: string }> = {
  bullish: { label: "bull", c: "#2ee6a6" },
  bearish: { label: "bear", c: "#ff5c6c" },
  neutral: { label: "neutral", c: "#8b98a9" },
};

/** Jev reads for every event on the news tape (one shared query). */
export function useJevNews() {
  const q = useDataset("jev-news");
  return { reads: q.data?.data?.reads ?? {}, env: q.data, isLoading: q.isLoading };
}

const cdaWord = (b: number) => (b > 0 ? "bullish" : b < 0 ? "bearish" : "neutral");

function Mark({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="cq-mono inline-flex items-center whitespace-nowrap" style={{ gap: 5, fontSize: 10, color: "#8b98a9" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${A(color, 0.6)}`, flex: "none" }} aria-hidden />
      {children}
    </span>
  );
}

/** Small amber mark when CDA's signed bias and Jev's choice point different ways. */
export function DisagreeBadge({ read }: { read: JevNewsRead }) {
  if (read.agrees) return null;
  return (
    <Tip content={`CDA bias ${read.cdaBias > 0 ? "+" : ""}${num(read.cdaBias, 1)} (${cdaWord(read.cdaBias)}) vs Jev ${read.bias.choice} (${frac(read.bias.confidence, { digits: 0 })} confidence).`}>
      <span tabIndex={0} className="cq-mono outline-none" style={{ fontSize: 9.5, color: "#ffb547", border: "1px solid rgba(255,181,71,0.35)", padding: "0 5px", borderRadius: 4, whiteSpace: "nowrap" }}>
        ≠ CDA
      </span>
    </Tip>
  );
}

/** Jev's read of a news catalyst, kept quiet: a dot, the direction and its confidence. */
export function JevNewsCell({ read, envStatus, compact = false }: { read: JevNewsRead | undefined; envStatus?: string; compact?: boolean }) {
  const ui = useUi();
  if (!ui.jev) return null;
  if (!read) {
    if (envStatus === "classifier_off") return null;
    return (
      <Tip content="Not classified yet; the worker classifies new events every minute.">
        <span tabIndex={0} className="cq-mono outline-none" style={{ fontSize: 10, color: "#3f4a57" }}>
          jev queued
        </span>
      </Tip>
    );
  }
  const s = CHOICE[read.bias.choice] ?? { label: read.bias.choice, c: "#8b98a9" };
  const probs = Object.entries(read.bias.probabilities)
    .map(([k, v]) => `${k} ${frac(v, { digits: 0 })}`)
    .join(", ");
  return (
    <span className="inline-flex items-center" style={{ gap: 6 }}>
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
        <span tabIndex={0} className="outline-none">
          <Mark color={s.c}>
            {s.label} {frac(read.bias.confidence, { digits: 0 })}
            {!compact ? <span style={{ color: "#4f5b6a" }}> · sev {num(read.severity.score, 1)}</span> : null}
          </Mark>
        </span>
      </Tip>
      <DisagreeBadge read={read} />
    </span>
  );
}

/** Quiet mark on a squeeze alert: Jev's odds the cascade continues over the next hour. */
export function JevCascadeDot({ symbol, direction }: { symbol: string; direction: string }) {
  const ui = useUi();
  const q = useDataset("jev-squeeze");
  if (!ui.jev || q.data?.status === "classifier_off") return null;
  const d = q.data?.data;
  const id = d?.active?.[`${symbol}|${direction}`];
  const read = id ? d?.reads?.[id] : undefined;
  if (!read) {
    return (
      <span className="cq-mono" style={{ fontSize: 10, color: "#3f4a57" }}>
        jev queued
      </span>
    );
  }
  const p = read.cascade;
  const c = p >= 0.6 ? "#ff7a3d" : p >= 0.35 ? "#ffb547" : "#8b98a9";
  return (
    <Tip content={`Jev (${read.model}): probability this forced flow is a genuine cascade likely to continue over the next hour. Classified ${new Date(read.classifiedAt).toLocaleTimeString("en-GB", { hour12: false })}.`}>
      <span tabIndex={0} className="outline-none">
        <Mark color={c}>jev cascade {frac(p, { digits: 0 })}</Mark>
      </span>
    </Tip>
  );
}
