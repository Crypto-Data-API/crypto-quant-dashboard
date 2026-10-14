"use client";

/**
 * Small hand-rolled SVG/HTML marks used across pages: stacked probability bars, long/short
 * split bars, sparklines, gauges and percentile chips. Thin marks, 2px surface gaps between
 * segments, recessive chrome, and a tooltip on every mark (values are also printed or in a
 * table, so tooltips never gate information).
 */
import type * as React from "react";
import { Tip } from "@/components/ui/primitives";
import { C, type Bucket } from "@/lib/domain";
import { frac, usd } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";

// ---- stacked probability bar ----------------------------------------------------

export function ProbBar({ buckets, height = 10, showLabels = true, className }: { buckets: Bucket[]; height?: number; showLabels?: boolean; className?: string }) {
  const total = buckets.reduce((s, b) => s + b.p, 0) || 1;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex w-full gap-[2px] overflow-hidden rounded" style={{ height }} role="img" aria-label={buckets.map((b) => `${b.label} ${frac(b.p, { digits: 0 })}`).join(", ")}>
        {buckets.map((b) => (
          <Tip key={b.key} content={`${b.label}: ${frac(b.p)}`}>
            <div className="h-full min-w-[2px] first:rounded-l last:rounded-r" style={{ width: `${(b.p / total) * 100}%`, background: b.color }} />
          </Tip>
        ))}
      </div>
      {showLabels ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {buckets.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-[2px]" style={{ background: b.color }} aria-hidden />
              <span className="capitalize">{b.label}</span>
              <span className="num text-foreground">{frac(b.p, { digits: 0 })}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---- long / short split ------------------------------------------------------------

/** Long vs short split. Colour is paired with L/S labels (the aqua/red pair needs secondary encoding). */
export function LongShortBar({ long, short, height = 6, labels = true, className }: { long: number; short: number; height?: number; labels?: boolean; className?: string }) {
  const total = long + short;
  const lp = total > 0 ? (long / total) * 100 : 50;
  return (
    <div className={cn("space-y-1", className)}>
      {labels ? (
        <div className="flex justify-between text-[11px]">
          <span className="num text-muted-foreground">
            <span className="font-semibold text-long">L</span> {usd(long)} <span className="text-muted-foreground/70">({lp.toFixed(0)}%)</span>
          </span>
          <span className="num text-muted-foreground">
            <span className="text-muted-foreground/70">({(100 - lp).toFixed(0)}%)</span> {usd(short)} <span className="font-semibold text-short">S</span>
          </span>
        </div>
      ) : null}
      <Tip content={`Long ${usd(long)} (${lp.toFixed(1)}%) / Short ${usd(short)} (${(100 - lp).toFixed(1)}%)`}>
        <div className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height }} role="img" aria-label={`Long ${lp.toFixed(0)} percent, short ${(100 - lp).toFixed(0)} percent`}>
          <div className="h-full rounded-l-full bg-long" style={{ width: `${lp}%` }} />
          <div className="h-full flex-1 rounded-r-full bg-short" />
        </div>
      </Tip>
    </div>
  );
}

// ---- sparkline ---------------------------------------------------------------------

export function Sparkline({
  values,
  width = 96,
  height = 24,
  color = C.blue,
  className,
  label,
  baseline,
  stretch = false,
}: {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  label?: string;
  /** Optional reference value drawn as a hairline (e.g. 30-day mean). */
  baseline?: number | null;
  /** Fill the container width (non-uniform scaling; strokes stay 1.5px). */
  stretch?: boolean;
}) {
  const pts = values.map((v, i) => ({ i, v: typeof v === "number" && Number.isFinite(v) ? v : null })).filter((p): p is { i: number; v: number } => p.v !== null);
  if (pts.length < 2) return <span className="text-[10px] text-muted-foreground">{"—"}</span>;
  const vs = pts.map((p) => p.v).concat(baseline != null && Number.isFinite(baseline) ? [baseline] : []);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const n = values.length - 1 || 1;
  const x = (i: number) => (i / n) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg
      width={stretch ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? "none" : undefined}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={label ?? "trend"}
    >
      {baseline != null && Number.isFinite(baseline) ? <line x1={0} x2={width} y1={y(baseline)} y2={y(baseline)} stroke={C.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {stretch ? null : <circle cx={x(last.i)} cy={y(last.v)} r={2} fill={color} />}
    </svg>
  );
}

// ---- gauge ---------------------------------------------------------------------------

/** Semicircular 0-100 gauge. The number is the chart; the arc gives position at a glance. */
export function Gauge({
  value,
  label,
  sub,
  size = 120,
  color = C.blue,
  max = 100,
}: {
  value: number | null | undefined;
  label: React.ReactNode;
  sub?: React.ReactNode;
  size?: number;
  color?: string;
  max?: number;
}) {
  const v = typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, max) : null;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const p0 = [cx + r * Math.cos(a0), cy - r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy - r * Math.sin(a1)];
    return `M${p0[0]!.toFixed(2)},${p0[1]!.toFixed(2)} A${r},${r} 0 0 1 ${p1[0]!.toFixed(2)},${p1[1]!.toFixed(2)}`;
  };
  const f = v === null ? 0 : v / max;
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + 6} viewBox={`0 0 ${size} ${size / 2 + 6}`} role="img" aria-label={`${typeof label === "string" ? label : "score"}: ${v === null ? "no data" : v.toFixed(0)}`}>
        <path d={arc(0, 1)} fill="none" stroke={C.grid} strokeWidth={7} strokeLinecap="round" />
        {v !== null && f > 0.001 ? <path d={arc(0, f)} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" /> : null}
      </svg>
      <div className="-mt-7 text-center">
        <div className="text-xl leading-none font-semibold">{v === null ? "—" : Math.round(v)}</div>
      </div>
      <div className="mt-1.5 text-center text-[11px] font-medium text-muted-foreground">{label}</div>
      {sub ? <div className="mt-1">{sub}</div> : null}
    </div>
  );
}

// ---- percentile chip ----------------------------------------------------------------

/** Percentile vs the coin's own trailing window: position marker on a 0-100 track. */
export function PctileChip({ label, value, hint }: { label: string; value: number | null | undefined; hint?: string }) {
  const v = typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 100) : null;
  const extreme = v !== null && (v >= 90 || v <= 10);
  return (
    <Tip content={hint ?? `${label}: ${v === null ? "warming up (no percentile yet)" : `${v.toFixed(0)}th percentile of 30 days`}`}>
      <div tabIndex={0} className={cn("min-w-[118px] flex-1 rounded-md border px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50", extreme && "border-warning/40")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[10px] text-muted-foreground">{label}</span>
          <span className="num text-xs font-semibold">{v === null ? "—" : `p${v.toFixed(0)}`}</span>
        </div>
        <div className="relative mt-1 h-1 rounded-full bg-muted">
          {v !== null ? <span className={cn("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full", extreme ? "bg-warning" : "bg-primary")} style={{ left: `${v}%` }} /> : null}
        </div>
      </div>
    </Tip>
  );
}

// ---- horizontal value bar -------------------------------------------------------------

export function MeterBar({ value, max = 100, color = C.blue, height = 6 }: { value: number | null | undefined; max?: number; color?: string; height?: number }) {
  const v = typeof value === "number" && Number.isFinite(value) ? clamp(value / max, 0, 1) : 0;
  return (
    <div className="w-full rounded-full bg-muted" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: color }} />
    </div>
  );
}

/** Signed bar around a centre line (diverging): negative left in `neg`, positive right in `pos`. */
export function DivergingBar({ value, maxAbs, pos = C.long, neg = C.short, height = 8 }: { value: number; maxAbs: number; pos?: string; neg?: string; height?: number }) {
  const f = maxAbs > 0 ? clamp(Math.abs(value) / maxAbs, 0, 1) : 0;
  return (
    <div className="relative w-full" style={{ height }}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-axis" />
      <div
        className="absolute inset-y-0 rounded-sm"
        style={value >= 0 ? { left: "50%", width: `${f * 50}%`, background: pos } : { right: "50%", width: `${f * 50}%`, background: neg }}
      />
    </div>
  );
}
