const DASH = "—";

/** $1.23B, $456.7M, $12.3K, $950 */
export function usd(v: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const sign = v < 0 ? "-" : opts.sign && v > 0 ? "+" : "";
  const a = Math.abs(v);
  const d = opts.digits ?? 1;
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(d + 1)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(d + 1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(d)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(d)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

/** Price with sensible precision for anything from BTC to sub-cent memecoins. */
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  const digits = a >= 1000 ? 0 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Percent from a value already in percent units (12.3 -> "12.3%"). */
export function pct(v: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const d = opts.digits ?? 1;
  const sign = opts.sign && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(d)}%`;
}

/** Percent from a fraction (0.123 -> "12.3%"). */
export function frac(v: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return pct(v * 100, opts);
}

export function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function int(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return Math.round(v).toLocaleString("en-US");
}

/** Funding: hourly fraction -> "0.0013%/h" */
export function fundingHourly(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${(v * 100).toFixed(4)}%/h`;
}

export function multiple(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}x`;
}

/** "12s ago", "4m ago", "3h ago", "2d ago" */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Duration from seconds: "47m", "13h 12m", "3d 4h" */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return DASH;
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function clock(ms: number | null | undefined, withSeconds = true): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, hour12: false });
}

export function dateShort(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function dateTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  return new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** strong_trend_bull -> "Strong trend bull" */
export function humanize(s: string | null | undefined): string {
  if (!s) return DASH;
  const t = s.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export { DASH };
