/**
 * Domain vocabulary shared by the pages: regime colours and labels, probability-head bucket
 * orderings, and band/status mappings. Colours follow the prototype palette (src/cq/theme.ts).
 */

export const C = {
  long: "#2ee6a6",
  short: "#ff5c6c",
  neutral: "#56606d",
  grid: "#131a23",
  axis: "#1c2531",
  muted: "#8b98a9",
  ink: "#e6edf5",
  blue: "#4c9bff",
  orange: "#ff7a3d",
  aqua: "#2ee6a6",
  yellow: "#ffb547",
  magenta: "#d36bff",
  violet: "#a98bff",
  red: "#ff5c6c",
  good: "#2ee6a6",
  warning: "#ffb547",
  serious: "#ff7a3d",
  critical: "#ff5c6c",
} as const;

// ---- short-term HMM regimes (/quant) --------------------------------------------

export const HMM_REGIMES = ["strong_trend_bull", "strong_trend_bear", "range_low_vol", "choppy_high_vol", "vol_spike", "squeeze"] as const;
export type HmmRegime = (typeof HMM_REGIMES)[number];

/** Six nominal classes cannot all separate by colour alone, so every use also carries the short code. */
export const HMM_META: Record<string, { color: string; short: string; name: string }> = {
  strong_trend_bull: { color: C.aqua, short: "BULL", name: "Strong trend (bull)" },
  strong_trend_bear: { color: C.red, short: "BEAR", name: "Strong trend (bear)" },
  range_low_vol: { color: C.blue, short: "RANGE", name: "Range / low vol" },
  choppy_high_vol: { color: C.yellow, short: "CHOP", name: "Choppy / high vol" },
  vol_spike: { color: C.orange, short: "SPIKE", name: "Vol spike" },
  squeeze: { color: C.violet, short: "SQZ", name: "Squeeze" },
};

export function hmmMeta(label: string | null | undefined) {
  return (label && HMM_META[label]) || { color: C.neutral, short: "N/A", name: label ?? "Unknown" };
}

// ---- probability heads -------------------------------------------------------------

type Scale = "diverging-price" | "diverging" | "ordinal" | "regime";

const RAMP_ORDINAL = ["#2f6fd6", "#4c9bff", "#7fb6ff", "#9fd0ff"];

export const HEADS: Record<string, { label: string; order: string[]; scale: Scale; note?: string }> = {
  directional: {
    label: "Direction",
    order: ["strong_down", "mild_down", "flat", "mild_up", "strong_up"],
    scale: "diverging-price",
  },
  volatility: { label: "Volatility", order: ["low", "medium", "high"], scale: "ordinal" },
  liquidation_risk: { label: "Liquidation risk", order: ["low", "medium", "high"], scale: "ordinal" },
  funding: { label: "Funding", order: ["falls", "stable", "rises"], scale: "diverging" },
  open_interest: { label: "Open interest", order: ["contracting", "neutral", "expanding"], scale: "diverging" },
  breadth: { label: "Breadth", order: ["contracting", "neutral", "expanding"], scale: "diverging" },
  regime_transitions: { label: "Regime next", order: [], scale: "regime" },
};

export interface Bucket {
  key: string;
  label: string;
  p: number;
  color: string;
}

/** Ordered, coloured buckets for one probability head (the head's own `confidence` key is excluded). */
export function headBuckets(head: string, probs: Record<string, number> | null | undefined): Bucket[] {
  if (!probs) return [];
  const meta = HEADS[head];
  const keysPresent = Object.keys(probs).filter((k) => k !== "confidence" && Number.isFinite(probs[k]));
  const ordered = meta && meta.order.length > 0 ? [...meta.order.filter((k) => keysPresent.includes(k)), ...keysPresent.filter((k) => !meta.order.includes(k))] : keysPresent;
  const n = ordered.length;
  return ordered.map((key, i) => {
    let color: string = C.neutral;
    const scale = meta?.scale ?? "ordinal";
    if (scale === "diverging-price") {
      color = ["#ff5c6c", "#c9505c", "#56606d", "#1fa67a", "#2ee6a6"][i] ?? C.neutral;
    } else if (scale === "diverging") {
      color = n === 3 ? (["#4c9bff", "#56606d", "#ff7a3d"][i] ?? C.neutral) : C.neutral;
    } else if (scale === "ordinal") {
      color = RAMP_ORDINAL[Math.min(RAMP_ORDINAL.length - 1, Math.round((i / Math.max(1, n - 1)) * (n >= 4 ? 3 : 2)))] ?? C.blue;
    } else if (scale === "regime") {
      color = key === "stays_same" ? C.neutral : hmmMeta(key.replace(/^to_/, "")).color;
    }
    const label = scale === "regime" ? (key === "stays_same" ? "Stays" : hmmMeta(key.replace(/^to_/, "")).short) : key.replace(/_/g, " ");
    return { key, label, p: probs[key] ?? 0, color };
  });
}

// ---- bands / sentiment -----------------------------------------------------------------

export type Tone = "good" | "warning" | "serious" | "critical" | "info" | "outline";

/** CDA risk bands: dormant | quiet | elevated | heavy | critical (higher = more risk). */
export function riskBandTone(band: string | null | undefined): Tone {
  switch ((band ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "heavy":
      return "serious";
    case "elevated":
      return "warning";
    case "quiet":
    case "dormant":
      return "good";
    default:
      return "outline";
  }
}

/** BULLISH / NEUTRAL / BEARISH and similar sentiment words. */
export function sentimentTone(s: string | null | undefined): Tone {
  const v = (s ?? "").toLowerCase();
  if (/bull|healthy|deep|calm|risk_on|risk-on|positive/.test(v)) return "good";
  if (/bear|stress|fragile|risk_off|risk-off|negative|shock/.test(v)) return "serious";
  if (/neutral|normal|mixed/.test(v)) return "info";
  return "outline";
}

/** Volume scanner activity bands, quiet -> extreme. */
export const VOLUME_BANDS = ["dormant", "quiet", "normal", "elevated", "surging", "extreme", "unknown"] as const;
export function volumeBandTone(band: string | null | undefined): Tone {
  switch (band) {
    case "extreme":
      return "critical";
    case "surging":
      return "serious";
    case "elevated":
      return "warning";
    case "normal":
      return "info";
    default:
      return "outline";
  }
}

/** GEX regime flag. */
export const GEX_STATE: Record<string, { tone: Tone; label: string; blurb: string }> = {
  amplify: { tone: "serious", label: "Amplify", blurb: "Short-gamma analog: forced flow follows through" },
  dampen: { tone: "info", label: "Dampen", blurb: "Long-gamma analog: balanced, mean-reverting" },
  transitional: { tone: "warning", label: "Transitional", blurb: "On the flip line or mixed signals" },
};

/** Liquidity regime per coin. */
export const LIQ_REGIME: Record<string, { tone: Tone; label: string }> = {
  deep_book: { tone: "good", label: "Deep book" },
  neutral: { tone: "outline", label: "Neutral" },
  oi_price_divergence: { tone: "warning", label: "OI/price divergence" },
  depth_withdrawal: { tone: "serious", label: "Depth withdrawal" },
  post_cascade_impaired: { tone: "critical", label: "Post-cascade" },
};

export const EVENT_TYPES: Record<string, string> = {
  unlock: "Unlock",
  macro_print: "Macro",
  depeg: "Depeg",
  mint: "Mint/burn",
};

export function biasTone(b: string | null | undefined): Tone {
  switch (b) {
    case "long":
      return "good";
    case "short":
      return "serious";
    case "risk_flag":
      return "warning";
    case "mixed":
      return "info";
    default:
      return "outline";
  }
}
