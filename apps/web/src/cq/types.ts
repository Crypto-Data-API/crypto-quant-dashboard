/**
 * Data slices the ported views draw. Each mirrors the part of the prototype's mock engine state
 * (docs/design/cq-engine.js) a view read, and is built from real datasets in ./adapters.
 */
import type { RegCode } from "./theme";

/** Short-term HMM regime per perp (from /quant/coins/risk). */
export interface RegimeCoin {
  coin: string;
  code: RegCode;
  /** Confidence, percent. */
  conf: number;
}

/** Odds of each regime in 24h, percent (from the market regime_transitions head). */
export interface RegimeFlow {
  k: string;
  code: RegCode;
  v: number;
}

export interface GalaxySlice {
  coins: RegimeCoin[];
  /** Current market regime: drawn at the centre, flows leave from it. */
  current: RegCode;
  next24: RegimeFlow[];
}

export interface CyclePhase {
  n: number;
  name: string;
  group: string;
  c: string;
}

export interface CycleSlice {
  phases: CyclePhase[];
  /** Current phase id (1-10), or null before the model commits one. */
  phase: number | null;
  /** Where the marker sits inside the current segment, 0-1. */
  progress: number;
  sub: string;
}

/** One 1%-of-mark bucket of market-maker liquidation notional. */
export interface ProfileBin {
  L: number;
  S: number;
}

export interface GammaCoinSlice {
  coin: string;
  /** 101 buckets, -50% .. +50% from mark. */
  profile: ProfileBin[];
  flip: number | null;
  mark: number | null;
}

export interface GammaSlice {
  order: string[];
  coins: Record<string, GammaCoinSlice>;
  /** Selected coin. */
  sel: string;
}

export interface VolRow {
  coin: string;
  price: number | null;
  chg: number | null;
  n24: number | null;
  dDay: number | null;
  mean: number | null;
  med: number | null;
  mult: number | null;
  oi: number | null;
  band: string;
  s7: number[];
}

export interface BubblesSlice {
  rows: VolRow[];
  band: string;
  sel: string;
}

export interface DepthSlice {
  coin: string;
  /** Columns (oldest first) of 50 levels each: rows 0-24 asks +50..+2 bps, 25-49 bids -2..-50 bps. */
  cols: Float32Array[];
  /** Snapshot time of each column, epoch ms. */
  times: number[];
  /** Outer bands are a lower bound (the ~20 returned levels sat inside 10 bps). */
  sat: boolean;
}

export interface CalEvent {
  id: string;
  /** Days from today (0 = today). */
  day: number;
  date: string;
  rel: string;
  type: "Unlock" | "Macro" | "Depeg" | "Mint";
  name: string;
  sym: string;
  bias: string;
  mag: number;
  size: string;
  src: string;
}

export interface HorizonSlice {
  events: CalEvent[];
  filter: string;
  /** Today at 00:00 local, epoch ms (axis labels). */
  today: number;
}

export interface TapeEvent {
  id: string;
  /** When it reached our tape (epoch ms): keeps the 6-minute window right for the delayed preview. */
  ts: number;
  coin: string;
  side: "L" | "S";
  size: number;
  venue: string;
}

export interface LiqStreamSlice {
  tape: TapeEvent[];
  coin: string;
  min: number;
}

export interface SqueezeCoin {
  coin: string;
  /** Severity, percent. */
  sev: number;
  /** Side being liquidated: L = longs (forced selling), S = shorts (forced buying). */
  side: "L" | "S";
}

export interface SqueezeSlice {
  /** Alert threshold, percent. */
  threshold: number;
  coins: SqueezeCoin[];
}

export interface LadderLevel {
  p: number;
  size: number;
  usd: number;
  o: number | null;
  /** Last change time (epoch ms) for the flash. */
  ch: number;
  dir: number;
}

export interface LadderSlice {
  coin: string;
  /** Tick size (price step between levels). */
  t: number;
  asks: LadderLevel[];
  bids: LadderLevel[];
  imb: number | null;
}
