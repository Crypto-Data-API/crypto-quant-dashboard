"use client";

/**
 * React wrappers for the ported views. A view is created once per mount on a host <div> and
 * receives new data through setData(); it never re-mounts on data changes, so animations and
 * the 3D camera keep their state across polls.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { Cum, Fan, Gauge, Ladder, Radar, Spark, type FanData, type GaugeData, type SparkData } from "./charts";
import { Bubbles3D, Cycle, Depth3D, Galaxy, Gamma3D, Horizon3D, LiqStream, type GalaxyData } from "./scenes";
import type { BubblesSlice, CycleSlice, DepthSlice, GammaCoinSlice, GammaSlice, HorizonSlice, LadderSlice, LiqStreamSlice, SqueezeSlice } from "./types";

interface View<D> {
  setData(d: D): void;
  destroy(): void;
}

interface HostProps {
  className?: string;
  style?: CSSProperties;
  label?: string;
}

function useView<D>(create: (host: HTMLDivElement, data: D) => View<D>, data: D) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useRef<View<D> | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const createRef = useRef(create);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const v = createRef.current(host, latest.current);
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    view.current?.setData(data);
  }, [data]);
  return ref;
}

function Host({ hostRef, className, style, label }: HostProps & { hostRef: React.RefObject<HTMLDivElement | null> }) {
  return <div ref={hostRef} className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }} role={label ? "img" : undefined} aria-label={label} />;
}

// ---- canvas charts ----

export function SparkView({ className, style, label, ...data }: SparkData & HostProps) {
  const key = `${data.values.join(",")}|${data.color}|${data.live}|${data.fill}|${data.mode}|${data.mean}|${data.lw}`;
  // Rebuild the data object only when something visible changed.
  const ref = useView<SparkData>((h, d) => new Spark(h, d), useStable(key, data));
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function GaugeView({ className, style, label, ...data }: GaugeData & HostProps) {
  const ref = useView<GaugeData>((h, d) => new Gauge(h, d), useStable(`${data.value}:${data.color}:${data.max}`, data));
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function FanView({ className, style, label, ...data }: FanData & HostProps) {
  const ref = useView<FanData>((h, d) => new Fan(h, d, { fullscreen: true }), useStable(`${data.p5}:${data.p50}:${data.p95}`, data));
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function RadarView({ data, className, style, label }: { data: SqueezeSlice } & HostProps) {
  const ref = useView<SqueezeSlice>((h, d) => new Radar(h, d, { fullscreen: true }), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function CumView({ data, className, style, label }: { data: GammaCoinSlice } & HostProps) {
  const ref = useView<GammaCoinSlice>((h, d) => new Cum(h, d, { fullscreen: true }), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function LadderView({ ladder, className, style, label }: { ladder: LadderSlice | null } & HostProps) {
  const ref = useView<{ ladder: LadderSlice | null }>((h, d) => new Ladder(h, d), useStable(ladder, { ladder }));
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

// ---- three.js scenes ----

export function GalaxyView({ data, className, style, label }: { data: GalaxyData } & HostProps) {
  const ref = useView<GalaxyData>((h, d) => new Galaxy(h, d), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function CycleView({ data, className, style, label }: { data: CycleSlice } & HostProps) {
  const ref = useView<CycleSlice>((h, d) => new Cycle(h, d), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function Gamma3DView({ data, className, style, label }: { data: GammaSlice } & HostProps) {
  const ref = useView<GammaSlice>((h, d) => new Gamma3D(h, d), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function Depth3DView({ data, className, style, label }: { data: DepthSlice } & HostProps) {
  const ref = useView<DepthSlice>((h, d) => new Depth3D(h, d), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function Bubbles3DView({ data, className, style, label }: { data: BubblesSlice } & HostProps) {
  const ref = useView<BubblesSlice>((h, d) => new Bubbles3D(h, d), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function Horizon3DView({ data, className, style, label }: { data: HorizonSlice } & HostProps) {
  const ref = useView<HorizonSlice>((h, d) => new Horizon3D(h, d), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

export function LiqStreamView({ data, className, style, label }: { data: LiqStreamSlice } & HostProps) {
  const ref = useView<LiqStreamSlice>((h, d) => new LiqStream(h, d), data);
  return <Host hostRef={ref} className={className} style={style} label={label} />;
}

/** Keep the same object while `key` is unchanged, so views only see real changes. */
function useStable<T>(key: unknown, value: T): T {
  const ref = useRef<{ key: unknown; value: T } | null>(null);
  if (!ref.current || ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}

/** The prototype's live dot: a solid 7px dot with an expanding ring. */
export function Pulse({ color = "#2ee6a6" }: { color?: string }) {
  return (
    <span className="cq-pulse" style={{ ["--c" as string]: color }} aria-hidden>
      <i />
      <i />
    </span>
  );
}
