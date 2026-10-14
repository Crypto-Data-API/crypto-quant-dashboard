import { C } from "@/lib/domain";

/** Shared Recharts styling: recessive hairline chrome, dark tooltip, tabular axis ticks. */
export const axisProps = {
  stroke: C.axis,
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: C.axis },
} as const;

export const gridProps = {
  stroke: C.grid,
  strokeDasharray: undefined,
} as const;

export const tooltipProps = {
  contentStyle: {
    background: "#17181b",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    fontSize: 12,
    color: C.ink,
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  },
  labelStyle: { color: C.muted, marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { fill: "rgba(255,255,255,0.04)" },
} as const;
