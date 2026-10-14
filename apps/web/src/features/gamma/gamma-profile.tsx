"use client";

import type { GexProfileBin } from "@cqd/schemas";
import { useEffect, useRef, useState } from "react";
import { C } from "@/lib/domain";
import { pct, price, usd } from "@/lib/format";

interface Bar {
  lo: number;
  hi: number;
  /** Bin centre as % distance from mark. */
  x: number;
  long: number;
  short: number;
}

/**
 * Market-maker liquidation density by price bin (~0.5% of mark), mirrored around the mark:
 * long liquidations stack below the mark, short liquidations above. The gamma flip is drawn
 * as a vertical line. Custom SVG so bins sit at their exact distance from mark.
 */
export function GammaProfile({ bins, mark, flip, height = 240, range = 50 }: { bins: GexProfileBin[]; mark: number; flip: number | null; height?: number; range?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<Bar | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const bars: Bar[] = bins
    .map((b) => ({ lo: b.price_lo, hi: b.price_hi, x: (((b.price_lo + b.price_hi) / 2 - mark) / mark) * 100, long: b.long_usd ?? 0, short: b.short_usd ?? 0 }))
    .filter((b) => Math.abs(b.x) <= range);
  const max = Math.max(...bars.map((b) => b.long + b.short), 1);
  const pad = { l: 52, r: 12, t: 10, b: 24 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const sx = (p: number) => pad.l + ((p + range) / (2 * range)) * iw;
  const sy = (v: number) => pad.t + ih - (v / max) * ih;
  // Bin width on screen: 0.5% of mark, minus a 2px surface gap, never under 2px.
  const bw = Math.max(2, (0.5 / (2 * range)) * iw - 2);
  const flipPct = flip ? ((flip - mark) / mark) * 100 : null;
  const ticks = [-range, -range / 2, 0, range / 2, range];
  const yTicks = [0, max / 2, max];

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={`Liquidation density by price, ${bars.length} bins around mark ${price(mark)}${flipPct !== null ? `, gamma flip ${pct(flipPct, { sign: true })} from mark` : ""}`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(v)} y2={sy(v)} stroke={C.grid} />
            <text x={pad.l - 6} y={sy(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill={C.muted}>
              {usd(v, { digits: 0 })}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={sx(t)} y={height - 6} textAnchor="middle" fontSize={10} fill={C.muted}>
            {t === 0 ? "mark" : `${t > 0 ? "+" : ""}${t}%`}
          </text>
        ))}
        {bars.map((b, i) => {
          const x = sx(b.x) - bw / 2;
          const hLong = (b.long / max) * ih;
          const hShort = (b.short / max) * ih;
          return (
            <g key={i} onMouseEnter={() => setHover(b)} onMouseLeave={() => setHover(null)}>
              {/* Generous invisible hit area */}
              <rect x={x - 2} y={pad.t} width={bw + 4} height={ih} fill="transparent" />
              {hLong > 0 ? <rect x={x} y={sy(b.long)} width={bw} height={hLong} rx={Math.min(2, bw / 2)} fill={C.long} /> : null}
              {hShort > 0 ? <rect x={x} y={sy(b.long + b.short)} width={bw} height={Math.max(0, hShort - (hLong > 0 ? 2 : 0))} rx={Math.min(2, bw / 2)} fill={C.short} /> : null}
            </g>
          );
        })}
        <line x1={sx(0)} x2={sx(0)} y1={pad.t} y2={pad.t + ih} stroke={C.ink} strokeOpacity={0.6} />
        {flipPct !== null && Math.abs(flipPct) <= range ? (
          <g>
            <line x1={sx(flipPct)} x2={sx(flipPct)} y1={pad.t} y2={pad.t + ih} stroke={C.yellow} strokeWidth={1.5} />
            <text x={sx(flipPct) + (flipPct > 0 ? -4 : 4)} y={pad.t + 10} textAnchor={flipPct > 0 ? "end" : "start"} fontSize={10} fill={C.yellow}>
              flip {price(flip)}
            </text>
          </g>
        ) : null}
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke={C.axis} />
      </svg>
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-lg shadow-black/40"
          style={{ left: Math.min(width - 190, Math.max(0, sx(hover.x) + 8)), top: 8 }}
        >
          <div className="font-medium">
            {price(hover.lo)} to {price(hover.hi)}
          </div>
          <div className="text-muted-foreground">{pct(hover.x, { sign: true })} from mark</div>
          <div className="num">
            <span className="text-long">L</span> {usd(hover.long)} &middot; <span className="text-short">S</span> {usd(hover.short)}
          </div>
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-long" aria-hidden />
          Long liquidations (L)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-short" aria-hidden />
          Short liquidations (S)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-warning" aria-hidden />
          Gamma flip
        </span>
        {flipPct !== null && Math.abs(flipPct) > range ? <span>Flip at {pct(flipPct, { sign: true })} is outside the &plusmn;{range}% window.</span> : null}
      </div>
    </div>
  );
}
