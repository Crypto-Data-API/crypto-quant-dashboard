"use client";

import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "@/lib/domain";

export interface TsPoint {
  /** Epoch ms. */
  t: number;
  v: number;
}

export interface TsSeries {
  id: string;
  label: string;
  kind: "line" | "histogram" | "area";
  color: string;
  points: TsPoint[];
}

type Fmt = (v: number) => string;

/**
 * TradingView lightweight-charts wrapper for time-based series. One price scale only (no dual
 * axes): callers put series of different units in separate charts. The legend doubles as the
 * hover readout: it shows the crosshair values, or the latest values when not hovering.
 */
export function TimeSeriesChart({ series, height = 220, format, timeVisible = true }: { series: TsSeries[]; height?: number; format: Fmt; timeVisible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const [hover, setHover] = useState<Record<string, number> | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  const shapeKey = series.map((s) => `${s.id}:${s.kind}:${s.color}`).join("|");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      width: el.clientWidth,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: C.muted, fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.axis },
      timeScale: { borderColor: C.axis, timeVisible, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Magnet },
      localization: { priceFormatter: (p: number) => formatRef.current(p) },
    });
    chartRef.current = chart;
    const map = new Map<string, ISeriesApi<SeriesType>>();
    for (const s of series) {
      const api =
        s.kind === "histogram"
          ? chart.addSeries(HistogramSeries, { color: s.color, priceLineVisible: false, lastValueVisible: false })
          : s.kind === "area"
            ? chart.addSeries(AreaSeries, { lineColor: s.color, topColor: `${s.color}55`, bottomColor: `${s.color}05`, lineWidth: 2, priceLineVisible: false })
            : chart.addSeries(LineSeries, { color: s.color, lineWidth: 2, priceLineVisible: false });
      map.set(s.id, api as ISeriesApi<SeriesType>);
    }
    seriesRef.current = map;

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const values: Record<string, number> = {};
      for (const [id, api] of map) {
        const d = param.seriesData.get(api) as { value?: number } | undefined;
        if (d && typeof d.value === "number") values[id] = d.value;
      }
      setHover(values);
    };
    chart.subscribeCrosshairMove(onMove);
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = new Map();
    };
    // Recreate only when the series layout changes; data updates are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, height, timeVisible]);

  useEffect(() => {
    for (const s of series) {
      const api = seriesRef.current.get(s.id);
      if (!api) continue;
      const seen = new Set<number>();
      const data = [...s.points]
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
        .sort((a, b) => a.t - b.t)
        .map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.v }))
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)));
      api.setData(data);
    }
    chartRef.current?.timeScale().fitContent();
  }, [series]);

  const latest = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of series) {
      const last = s.points[s.points.length - 1];
      if (last) out[s.id] = last.v;
    }
    return out;
  }, [series]);
  const shown = hover ?? latest;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
            <span className="num font-medium text-foreground">{shown[s.id] !== undefined ? format(shown[s.id]!) : "—"}</span>
          </span>
        ))}
        {!hover ? <span className="text-muted-foreground/60">latest</span> : null}
      </div>
      <div ref={ref} style={{ height }} className="w-full" />
    </div>
  );
}
