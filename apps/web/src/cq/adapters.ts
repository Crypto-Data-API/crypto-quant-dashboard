/**
 * Real datasets -> view slices. Pure functions: every number shown comes from a CDA payload,
 * re-shaped (bucketed, re-ordered, unit-converted) but never invented.
 */
import type {
  CoinDepthHistoryResponse,
  EventCatalystModel,
  EventRegimeResponse,
  GexCoin,
  GexResponse,
  L2BookResponse,
  QuantCoinsRiskResponse,
  QuantProbabilityObject,
  RegimesResponse,
  RelayedEvent,
  SqueezeAlertsResponse,
  VolumeScannerResponse,
} from "@cqd/schemas";
import { DEPTH_LEVELS } from "./scenes";
import { REG_ORDER, regCode, type RegCode } from "./theme";
import type { CalEvent, CycleSlice, GalaxySlice, GammaCoinSlice, GammaSlice, LadderLevel, LadderSlice, RegimeCoin, RegimeFlow, SqueezeSlice, TapeEvent, VolRow } from "./types";

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const pct100 = (v: number) => Math.round(v * 100);

// ---- short-term HMM ----------------------------------------------------------------

export function marketRegimeState(m: QuantProbabilityObject | null | undefined) {
  return m?.current ?? m?.regime ?? null;
}

export function regimeCoins(risk: QuantCoinsRiskResponse | null | undefined, opts: { includeWarming?: boolean } = {}): Array<RegimeCoin & { warming: boolean }> {
  const out: Array<RegimeCoin & { warming: boolean }> = [];
  for (const c of risk?.items ?? []) {
    const code = regCode(c.regime?.label);
    if (!code || !c.regime) continue;
    const warming = Boolean(c.meta?.insufficient_history || c.meta?.new_listing);
    if (warming && !opts.includeWarming) continue;
    out.push({ coin: c.symbol, code, conf: pct100(c.regime.confidence), warming });
  }
  return out;
}

/** Regime-in-24h odds: "stays" first (the current regime), then the most likely transitions. */
export function regimeFlows(m: QuantProbabilityObject | null | undefined): RegimeFlow[] {
  const cur = regCode(marketRegimeState(m)?.label);
  const probs = m?.probabilities?.regime_transitions;
  if (!cur || !probs) return [];
  const out: RegimeFlow[] = [];
  const stays = finite(probs.stays_same);
  if (stays !== null) out.push({ k: "Stays", code: cur, v: pct100(stays) });
  const others: RegimeFlow[] = [];
  for (const [k, v] of Object.entries(probs)) {
    if (k === "stays_same" || k === "confidence") continue;
    const code = regCode(k.replace(/^to_/, ""));
    const p = finite(v);
    if (!code || p === null || code === cur) continue;
    others.push({ k: code, code, v: pct100(p) });
  }
  return [...out, ...others.sort((a, b) => b.v - a.v)];
}

export function galaxySlice(risk: QuantCoinsRiskResponse | null | undefined, market: QuantProbabilityObject | null | undefined): GalaxySlice | null {
  const current = regCode(marketRegimeState(market)?.label);
  if (!risk || !current) return null;
  return { coins: regimeCoins(risk).map(({ coin, code, conf }) => ({ coin, code, conf })), current, next24: regimeFlows(market) };
}

/** 24h cumulative return quantiles from the seeded Monte Carlo, in percent. */
export function fanQuantiles(m: QuantProbabilityObject | null | undefined): { p5: number; p50: number; p95: number } | null {
  const t = m?.tomorrow;
  const q = isRecord(t) && isRecord(t.cum_return_quantiles) ? t.cum_return_quantiles : null;
  const p5 = finite(q?.p5);
  const p50 = finite(q?.p50);
  const p95 = finite(q?.p95);
  if (p5 === null || p50 === null || p95 === null) return null;
  return { p5: p5 * 100, p50: p50 * 100, p95: p95 * 100 };
}

export const OUTCOME_COLORS: Record<string, string> = { strong_down: "#ff5c6c", mild_down: "#c9505c", flat: "#56606d", mild_up: "#1fa67a", strong_up: "#2ee6a6" };
const OUTCOME_ORDER = ["strong_down", "mild_down", "flat", "mild_up", "strong_up"];
const BLUES = ["#2f6fd6", "#4c9bff", "#9fd0ff"];

export interface MixPart {
  key: string;
  k: string;
  v: number;
  c: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

export function outcomeMix(m: QuantProbabilityObject | null | undefined): MixPart[] {
  const d = m?.probabilities?.directional;
  if (!d) return [];
  return OUTCOME_ORDER.filter((k) => finite(d[k]) !== null).map((k) => ({ key: k, k: cap(k), v: pct100(d[k]!), c: OUTCOME_COLORS[k]! }));
}

export function ordinalMix(m: QuantProbabilityObject | null | undefined, head: "volatility" | "liquidation_risk"): MixPart[] {
  const d = m?.probabilities?.[head];
  if (!d) return [];
  return ["low", "medium", "high"].filter((k) => finite(d[k]) !== null).map((k, i) => ({ key: k, k: cap(k), v: pct100(d[k]!), c: BLUES[i]! }));
}

// ---- long-horizon cycle -----------------------------------------------------------------

/**
 * Presentation grouping of CDA's ten cycle regimes into the prototype's five arcs
 * (accumulation, markup, peak, distribution, markdown). Ids are CDA's.
 */
const CYCLE_GROUPS: Record<number, { group: string; c: string }> = {
  1: { group: "Markdown", c: "#ff5c6c" },
  2: { group: "Markdown", c: "#ff5c6c" },
  3: { group: "Markdown", c: "#ff5c6c" },
  4: { group: "Accumulation", c: "#4c9bff" },
  5: { group: "Accumulation", c: "#4c9bff" },
  6: { group: "Markup", c: "#2ee6a6" },
  7: { group: "Markup", c: "#2ee6a6" },
  8: { group: "Markup", c: "#2ee6a6" },
  9: { group: "Peak", c: "#ffb547" },
  10: { group: "Distribution", c: "#ff7a3d" },
};

export const cycleGroup = (id: number | null | undefined) => (id ? CYCLE_GROUPS[id] : undefined) ?? { group: "Unclassified", c: "#5b6878" };

export function cycleSlice(r: RegimesResponse | null | undefined): CycleSlice | null {
  if (!r) return null;
  const phases = [...r.regimes].sort((a, b) => a.id - b.id).map((p) => ({ n: p.id, name: p.name, ...cycleGroup(p.id) }));
  // CDA publishes no progress-through-phase; the marker sits mid-segment.
  return { phases, phase: r.current.id ?? null, progress: 0.5, sub: r.current.stage_label ?? "" };
}

// ---- gamma -------------------------------------------------------------------------------

/** Market-maker liquidation bins (~0.5% of mark) summed into 1% buckets from -50% to +50%. */
export function gammaProfile(c: GexCoin): GammaCoinSlice["profile"] {
  const prof = Array.from({ length: 101 }, () => ({ L: 0, S: 0 }));
  const mark = finite(c.mark);
  if (!mark) return prof;
  for (const b of c.gamma_profile ?? []) {
    const mid = (b.price_lo + b.price_hi) / 2;
    const i = Math.round(((mid - mark) / mark) * 100) + 50;
    if (i < 0 || i > 100) continue;
    prof[i]!.L += b.long_usd ?? 0;
    prof[i]!.S += b.short_usd ?? 0;
  }
  return prof;
}

export function gammaCoinSlice(coin: string, c: GexCoin): GammaCoinSlice {
  return { coin, profile: gammaProfile(c), flip: finite(c.gamma_flip), mark: finite(c.mark) };
}

export function gammaSlice(gex: GexResponse | null | undefined, sel: string, extra: Record<string, GexCoin> = {}): GammaSlice | null {
  if (!gex?.coins) return null;
  const all = { ...gex.coins, ...extra };
  const order = Object.keys(all);
  const coins: Record<string, GammaCoinSlice> = {};
  for (const k of order) coins[k] = gammaCoinSlice(k, all[k]!);
  return { order, coins, sel: order.includes(sel) ? sel : (order[0] ?? sel) };
}

// ---- volume ------------------------------------------------------------------------------

export function volRows(v: VolumeScannerResponse | null | undefined): VolRow[] {
  return (v?.items ?? []).map((it) => ({
    coin: it.symbol,
    price: finite(it.price),
    chg: finite(it.change_24h),
    n24: finite(it.volume_24h),
    dDay: finite(it.volume_change_24h),
    mean: finite(it.avg_volume_30d),
    med: finite(it.median_volume_30d),
    mult: finite(it.multiplier),
    oi: finite(it.open_interest_usd),
    band: it.band ?? "unknown",
    s7: (it.spark_7d ?? []).filter((x): x is number => finite(x) !== null),
  }));
}

/** Perps the bubble field can place: a baseline multiplier and some 24h notional. */
export const bubbleRows = (rows: VolRow[]) => rows.filter((r) => (r.mult ?? 0) > 0 && (r.n24 ?? 0) > 0);

// ---- depth terrain -----------------------------------------------------------------------

type Side = Record<string, number | null | undefined> | null | undefined;

/** One snapshot -> 50 rows of depth per 2 bps, spread evenly inside each of CDA's bands (0-10, 10-25, 25-50 bps). */
function depthColumn(bid: Side, ask: Side): Float32Array {
  const col = new Float32Array(DEPTH_LEVELS);
  const per = (s: Side, bps: number) => {
    const d10 = finite(s?.["10bps"]) ?? 0;
    const d25 = Math.max(d10, finite(s?.["25bps"]) ?? d10);
    const d50 = Math.max(d25, finite(s?.["50bps"]) ?? d25);
    if (bps <= 10) return d10 / 5;
    if (bps <= 25) return (d25 - d10) / 7.5;
    return (d50 - d25) / 12.5;
  };
  for (let r = 0; r < DEPTH_LEVELS; r++) {
    const ask_ = r < DEPTH_LEVELS / 2;
    const dist = ask_ ? DEPTH_LEVELS / 2 - r : r - DEPTH_LEVELS / 2 + 1;
    col[r] = per(ask_ ? ask : bid, dist * 2);
  }
  return col;
}

export function depthSlice(h: CoinDepthHistoryResponse | null | undefined, coin: string) {
  const snaps = [...(h?.history ?? [])].sort((a, b) => a.ts - b.ts).slice(-180);
  const cols = snaps.map((s) => depthColumn(s.depth_usd?.bid as Side, s.depth_usd?.ask as Side));
  const last = snaps[snaps.length - 1];
  const trunc = last?.levels_truncated as Record<string, Record<string, boolean>> | null | undefined;
  return {
    slice: { coin, cols, times: snaps.map((s) => s.ts * 1000), sat: Boolean(trunc?.bid?.["10bps"] || trunc?.ask?.["10bps"]) },
    bid25: finite(last?.depth_usd?.bid?.["25bps"]),
    ask25: finite(last?.depth_usd?.ask?.["25bps"]),
  };
}

// ---- calendar ----------------------------------------------------------------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TYPE: Record<string, CalEvent["type"]> = { unlock: "Unlock", macro_print: "Macro", depeg: "Depeg", mint: "Mint" };

function usdShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(1)}K`;
  return `$${Math.round(a)}`;
}

export function catalystSize(e: EventCatalystModel): string {
  if (e.event_type === "unlock") return [e.unlocked_value_usd ? usdShort(e.unlocked_value_usd) : null, e.pct_of_fdv ? `${(e.pct_of_fdv * 100).toFixed(2)}% of FDV` : null].filter(Boolean).join(", ");
  if (e.event_type === "mint") return [e.delta_usd ? `${e.delta_usd > 0 ? "+" : "-"}${usdShort(e.delta_usd)}` : null, e.pct_of_supply ? `${(e.pct_of_supply * 100).toFixed(2)}% of supply` : null].filter(Boolean).join(", ");
  if (e.event_type === "depeg") return e.deviation_bps ? `${Math.round(e.deviation_bps)} bps off peg` : "";
  if (e.event_type === "macro_print") return e.macro_class ?? "";
  return "";
}

export function calEvents(cal: EventRegimeResponse | null | undefined): CalEvent[] {
  return (cal?.items ?? [])
    .filter((e) => e.days_until >= 0 && e.days_until <= 30)
    .sort((a, b) => a.days_until - b.days_until || (b.magnitude ?? 0) - (a.magnitude ?? 0))
    .map((e, i) => {
      const d = new Date(`${e.date}T00:00:00`);
      return {
        id: `${e.event_type}-${e.date}-${e.title}-${i}`,
        day: e.days_until,
        date: Number.isFinite(d.getTime()) ? `${d.getDate()} ${MON[d.getMonth()]}` : e.date,
        rel: e.days_until === 0 ? "today" : `in ${e.days_until}d`,
        type: TYPE[e.event_type] ?? "Unlock",
        name: e.title,
        sym: e.symbols?.length ? e.symbols.join(", ") : "market-wide",
        bias: e.bias === "risk_flag" ? "risk flag" : e.bias,
        mag: e.magnitude ?? 0,
        size: catalystSize(e),
        src: e.source ?? "",
      };
    });
}

// ---- squeeze radar -----------------------------------------------------------------------

/**
 * CDA lists only coins at or above the alert severity (triggered or suppressed); the coins it
 * evaluated below the threshold are counted, not listed, so the radar shows the listed ones.
 */
export function squeezeSlice(sq: SqueezeAlertsResponse | null | undefined): SqueezeSlice {
  return {
    threshold: Math.round((sq?.min_severity ?? 0.35) * 100),
    coins: (sq?.alerts ?? []).map((a) => ({ coin: a.symbol, sev: a.severity * 100, side: a.long_liq_usd >= a.short_liq_usd ? "L" : "S" })),
  };
}

// ---- live tape ----------------------------------------------------------------------------

const venueName = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—";
};

export function tapeEvents(events: RelayedEvent[]): TapeEvent[] {
  const out: TapeEvent[] = [];
  for (const e of events) {
    if (e.type !== "liquidation") continue;
    const size = finite(e.usd);
    if (size === null || !e.symbol) continue;
    out.push({ id: String(e.id), ts: finite(e.recv_ts) ?? finite(e.ts) ?? Date.now(), coin: String(e.symbol), side: e.side === "long" ? "L" : "S", size: Math.abs(size), venue: venueName(e.venue) });
  }
  return out;
}

// ---- L2 ladder ----------------------------------------------------------------------------

/** Ladder levels with a flash on every level whose size changed since the previous book. */
export function ladderSlice(book: L2BookResponse | null | undefined, prev: LadderSlice | null, imb: number | null): LadderSlice | null {
  if (!book || book.asks.length === 0 || book.bids.length === 0) return null;
  const now = Date.now();
  const same = prev?.coin === book.coin;
  const prevBy = new Map<number, LadderLevel>();
  if (same && prev) [...prev.asks, ...prev.bids].forEach((l) => prevBy.set(l.p, l));
  const lv = (l: { price: number; size: number; count: number | null }): LadderLevel => {
    const usd = l.price * l.size;
    const p = prevBy.get(l.price);
    const changed = !p || Math.abs(p.usd - usd) > 1e-9;
    return { p: l.price, size: l.size, usd, o: finite(l.count), ch: same && changed ? now : (p?.ch ?? 0), dir: p ? Math.sign(usd - p.usd) || p.dir : 1 };
  };
  const asks = [...book.asks].sort((a, b) => a.price - b.price).slice(0, 12).map(lv);
  const bids = [...book.bids].sort((a, b) => b.price - a.price).slice(0, 12).map(lv);
  const prices = [...asks, ...bids].map((l) => l.p).sort((a, b) => a - b);
  let t = Infinity;
  for (let i = 1; i < prices.length; i++) {
    const d = prices[i]! - prices[i - 1]!;
    if (d > 0 && d < t) t = d;
  }
  return { coin: book.coin, t: Number.isFinite(t) ? t : 1, asks, bids, imb };
}

export { REG_ORDER, type RegCode };
