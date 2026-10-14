/**
 * Design tokens and helpers ported from the Claude Design prototype (docs/design): palette,
 * regime vocabulary, number formats and the deterministic random helpers the scenes use for
 * layout (star fields, orbits). Values only drive presentation; data always comes from CDA.
 */

export const MONO = "'Geist Mono', ui-monospace, monospace";
export const SANS = "'Geist', system-ui, sans-serif";

export const C = {
  long: "#2ee6a6",
  short: "#ff5c6c",
  blue: "#4c9bff",
  amber: "#ffb547",
  violet: "#a98bff",
  orange: "#ff7a3d",
  ink: "#e6edf5",
  mute: "#8b98a9",
  dim: "#5b6878",
} as const;

export type RegCode = "BULL" | "BEAR" | "RANGE" | "CHOP" | "SQZ" | "SPIKE";

export const REG: Record<RegCode, { label: string; color: string }> = {
  BULL: { label: "Strong trend (bull)", color: C.long },
  BEAR: { label: "Strong trend (bear)", color: C.short },
  RANGE: { label: "Range / low vol", color: C.blue },
  CHOP: { label: "Choppy / high vol", color: C.amber },
  SQZ: { label: "Squeeze / coiled", color: C.violet },
  SPIKE: { label: "Vol spike", color: C.orange },
};

export const REG_ORDER: RegCode[] = ["BULL", "BEAR", "RANGE", "CHOP", "SQZ", "SPIKE"];

/** CDA short-term HMM labels to the prototype's regime codes. */
export const HMM_CODE: Record<string, RegCode> = {
  strong_trend_bull: "BULL",
  strong_trend_bear: "BEAR",
  range_low_vol: "RANGE",
  choppy_high_vol: "CHOP",
  squeeze: "SQZ",
  vol_spike: "SPIKE",
};

export const regCode = (label: string | null | undefined): RegCode | null => (label ? (HMM_CODE[label] ?? null) : null);

/** Volume-scanner activity bands. CDA also sends dormant/unknown for perps without a baseline. */
export const BAND: Record<string, { c: string }> = {
  extreme: { c: "#ff5c6c" },
  surging: { c: "#ff7a3d" },
  elevated: { c: "#ffb547" },
  normal: { c: "#4c9bff" },
  quiet: { c: "#5b6878" },
  dormant: { c: "#3f4a57" },
  unknown: { c: "#3f4a57" },
};
export const bandColor = (b: string | null | undefined) => (b && BAND[b] ? BAND[b].c : "#3f4a57");

/** "#4c9bff", 0.1 -> "rgba(76,155,255,0.1)" */
export function A(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** FNV-1a hash of a string to [0, 1): stable angles and offsets per coin. */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Deterministic PRNG seeded from a string (mulberry32). */
export function seeded(str: string): () => number {
  let s = Math.floor(hash(str) * 1e9);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller). */
export function gauss(r: () => number = Math.random): number {
  let u = 0;
  let v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Prototype number formats. */
export const fmt = {
  usd(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    const s = v < 0 ? "-" : "";
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
    return `${s}$${Math.round(a)}`;
  },
  px(p: number | null | undefined): string {
    if (p === null || p === undefined || !Number.isFinite(p)) return "—";
    if (p >= 1000) return Math.round(p).toLocaleString("en-US");
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(4);
    return p.toFixed(6);
  },
  pct(v: number | null | undefined, dp = 1): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    return `${v > 0 ? "+" : ""}${v.toFixed(dp)}%`;
  },
  time(ts: number): string {
    const d = new Date(ts);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  },
  dur(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  },
  ago(sec: number): string {
    if (sec < 60) return `${Math.max(0, Math.floor(sec))}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 172800) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  },
};

export type Fmt = typeof fmt;
