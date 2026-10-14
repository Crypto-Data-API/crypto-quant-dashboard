"use client";

import type { DatasetId, RegimeInfo, RegimesResponse } from "@cqd/schemas";
import { Check, Lock, TriangleAlert, X } from "lucide-react";
import { Gauge, MeterBar } from "@/components/charts/basic";
import { Freshness, Panel, PanelBody } from "@/components/panel";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip } from "@/components/ui/primitives";
import { HealthCard } from "@/features/market/health-card";
import { C, riskBandTone, sentimentTone, type Tone } from "@/lib/domain";
import { duration, humanize, num, usd } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { cn, finite, isRecord, toMs } from "@/lib/utils";

/** Cycle order: 2 -> 10 then back to 2. Phase 1 (structural shock) is an override outside the cycle. */
const CYCLE = [2, 3, 4, 5, 6, 7, 8, 9, 10];

function CycleRing({ regimes, currentId, rawId }: { regimes: RegimeInfo[]; currentId: number | null; rawId: number | null }) {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 128;
  const rInner = 92;
  const n = CYCLE.length;
  const gap = 0.025;
  const byId = new Map(regimes.map((r) => [r.id, r]));
  const seg = (i: number) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + gap;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - gap;
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    return `M${p(rOuter, a0)} A${rOuter},${rOuter} 0 0 1 ${p(rOuter, a1)} L${p(rInner, a1)} A${rInner},${rInner} 0 0 0 ${p(rInner, a0)} Z`;
  };
  const labelPos = (i: number) => {
    const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + (rInner + rOuter) / 2 * Math.cos(a), y: cy + (rInner + rOuter) / 2 * Math.sin(a) };
  };
  const shock = byId.get(1);
  const current = currentId !== null ? byId.get(currentId) : undefined;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px]" role="img" aria-label={`Cycle ring. Current phase: ${current?.name ?? "unknown"}`}>
        {CYCLE.map((id, i) => {
          const r = byId.get(id);
          const active = id === currentId;
          const isRaw = rawId !== null && id === rawId && rawId !== currentId;
          const { x, y } = labelPos(i);
          return (
            <Tip key={id} content={r ? `${id}. ${r.name}: ${r.directional_bias} (${r.typical_duration})` : `Phase ${id}`}>
              <g tabIndex={0} className="cursor-default outline-none">
                <path d={seg(i)} fill={active ? C.blue : isRaw ? "#2a3b52" : "#1e1f23"} stroke={isRaw ? C.blue : "transparent"} strokeWidth={1.5} strokeDasharray={isRaw ? "3 2" : undefined} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill={active ? "#0b0c0e" : C.muted}>
                  {id}
                </text>
              </g>
            </Tip>
          );
        })}
        <text x={cx} y={cy - 18} textAnchor="middle" fontSize={10} fill={C.muted}>
          CURRENT PHASE
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={22} fontWeight={700} fill={C.ink}>
          {currentId ?? "—"}
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" fontSize={10} fill={C.muted}>
          of {regimes.length}
        </text>
      </svg>
      <ol className="mt-2 grid w-full grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
        {CYCLE.map((id) => {
          const r = byId.get(id);
          return (
            <li key={id} className={cn("flex gap-1.5 text-muted-foreground", id === currentId && "font-semibold text-foreground")}>
              <span className="num w-4 text-right">{id}</span>
              <span className="truncate">{r?.name ?? "—"}</span>
            </li>
          );
        })}
      </ol>
      {shock ? (
        <div className={cn("mt-2 w-full rounded-md border px-2 py-1.5 text-[11px]", currentId === 1 ? "border-critical/60 bg-critical/10" : "text-muted-foreground")}>
          <span className="font-semibold">1. {shock.name}</span>: override outside the cycle ({shock.typical_duration}).
        </div>
      ) : null}
    </div>
  );
}

function fmtSignal(key: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return humanize(v);
  const n = finite(v);
  if (n === null) return "—";
  if (/liq|usd|oi_usd/.test(key) && Math.abs(n) > 1000) return usd(n);
  if (/confidence/.test(key) && n <= 1) return `${(n * 100).toFixed(0)}%`;
  return num(n, Math.abs(n) >= 100 ? 0 : 1);
}

function Playbook({ d }: { d: RegimesResponse }) {
  const now = useNow() || Date.now();
  const c = d.current;
  const info = d.regimes.find((r) => r.id === c.id);
  const since = toMs(c.in_regime_since);
  const st = c.stability;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{c.name ?? "Unclassified (cold start)"}</span>
          {c.stage_label ? <Badge variant="warning">{c.stage_label}</Badge> : null}
          {c.raw && !c.raw.matches_committed ? (
            <Tip content="The live, ungated classification disagrees with the committed regime. The dwell gate holds the committed regime until the candidate confirms.">
              <Badge variant="info" tabIndex={0}>
                live read: {c.raw.name}
              </Badge>
            </Tip>
          ) : null}
        </div>
        {c.rationale ? <p className="mt-1 text-sm text-muted-foreground">{c.rationale}</p> : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ["Directional bias", info?.directional_bias ?? "—"],
          ["Typical duration", info?.typical_duration ?? "—"],
          ["In regime", since ? duration((now - since) / 1000) : "—"],
          ["Locked for", st ? (st.locked_for_s > 0 ? duration(st.locked_for_s) : "unlocked") : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border px-2.5 py-2">
            <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{k}</dt>
            <dd className="mt-0.5 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {info?.description ? <p className="text-xs leading-relaxed text-muted-foreground">{info.description}</p> : null}
      {st ? (
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Stability (live agreement with committed regime)</span>
            <span className="num text-foreground">
              {(st.raw_agreement * 100).toFixed(0)}% of last {st.raw_window} reads
            </span>
          </div>
          <MeterBar value={st.raw_agreement} max={1} />
          <div className="text-muted-foreground">
            Dwell floor {duration(st.dwell_floor_s)}, held {duration(st.held_s ?? 0)}. A successor needs {st.confirmations_needed} confirmations
            {st.candidate ? `; ${humanize(st.candidate)} has ${st.confirmations_against}` : "; no candidate accumulating"}.
          </div>
        </div>
      ) : null}
      <p className="text-[10px] text-muted-foreground">Leverage guidance is not part of the CDA payload; the playbook shows bias and horizon as published.</p>
    </div>
  );
}

function Thresholds({ d }: { d: RegimesResponse }) {
  const t = d.current.thresholds;
  if (!t) return <div className="text-xs text-muted-foreground">No threshold data yet.</div>;
  const checks = [...t.checks].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  return (
    <div className="space-y-3">
      {t.nearest ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
          <span className="font-semibold">Nearest cutoff:</span> {t.nearest.signal} {t.nearest.op} {num(t.nearest.cutoff, 1)} (now {num(t.nearest.value, 1)}, distance {num(t.nearest.distance, 1)}) gates{" "}
          <span className="font-medium">{humanize(t.nearest.gates)}</span>.
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Signal</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">Distance</TableHead>
            <TableHead>Holds</TableHead>
            <TableHead>Gates</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {checks.map((ch, i) => (
            <TableRow key={`${ch.signal}-${ch.gates}-${i}`}>
              <TableCell className="font-mono text-[11px]">{ch.signal}</TableCell>
              <TableCell>
                {ch.op} {num(ch.cutoff, 1)}
              </TableCell>
              <TableCell className="text-right">{num(ch.value, 1)}</TableCell>
              <TableCell className="text-right">{num(ch.distance, 1)}</TableCell>
              <TableCell>
                {ch.holds ? <Check className="size-3.5 text-[#4fd14f]" aria-label="holds" /> : <X className="size-3.5 text-muted-foreground" aria-label="does not hold" />}
              </TableCell>
              <TableCell className="text-muted-foreground">{humanize(ch.gates)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HealthComponents() {
  const q = useDataset("market-health");
  return (
    <Panel title="Health components" dataset="market-health" env={q.data} isLoading={q.isLoading} skeletonHeight={260}>
      {(d) => (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { title: "Long-term (50%)", rows: d.long_term_components, color: C.violet },
            { title: "Short-term (50%)", rows: d.short_term_components, color: C.aqua },
          ].map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">{g.title}</div>
              <ul className="space-y-2">
                {g.rows.map((c) => (
                  <li key={c.name}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span>
                        {humanize(c.name)} <span className="text-muted-foreground">w {(c.weight * 100).toFixed(0)}%</span>
                      </span>
                      <span className="num font-semibold">{c.score}</span>
                    </div>
                    <MeterBar value={c.score} color={g.color} height={5} />
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={c.description}>
                      {c.description}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

interface ScoreSpec {
  id: DatasetId;
  label: string;
  /** What a high reading means. */
  high: string;
  pick: (d: unknown) => { value: number | null; badge: string | null; tone: Tone };
}

const SCORES: ScoreSpec[] = [
  {
    id: "score-volatility",
    label: "Volatility",
    high: "Higher = more market-wide vol stress",
    pick: (d) => {
      const r = d as Record<string, unknown>;
      return { value: finite(r.composite_score), badge: String(r.sentiment ?? ""), tone: sentimentTone(String(r.sentiment ?? "")) };
    },
  },
  {
    id: "liquidity-regime",
    label: "Liquidity",
    high: "Higher = healthier market structure",
    pick: (d) => {
      const r = d as Record<string, unknown>;
      return { value: finite(r.composite_score), badge: String(r.sentiment ?? ""), tone: sentimentTone(String(r.sentiment ?? "")) };
    },
  },
  {
    id: "score-policy",
    label: "Policy",
    high: "Higher = more policy risk",
    pick: (d) => {
      const r = d as Record<string, unknown>;
      return { value: finite(r.policy_risk_score), badge: String(r.band ?? ""), tone: riskBandTone(String(r.band ?? "")) };
    },
  },
  {
    id: "score-security",
    label: "Security",
    high: "Higher = more hack / depeg stress",
    pick: (d) => {
      const r = d as Record<string, unknown>;
      return { value: finite(r.security_stress_score), badge: String(r.band ?? ""), tone: riskBandTone(String(r.band ?? "")) };
    },
  },
  {
    id: "score-event",
    label: "Event",
    high: "Higher = heavier catalyst calendar",
    pick: (d) => {
      const r = d as Record<string, unknown>;
      return { value: finite(r.event_risk_score), badge: String(r.band ?? ""), tone: riskBandTone(String(r.band ?? "")) };
    },
  },
  {
    id: "score-meme",
    label: "Meme",
    high: "Higher = more meme froth",
    pick: (d) => {
      const r = d as Record<string, unknown>;
      return { value: finite(r.composite_score), badge: String(r.sentiment ?? ""), tone: sentimentTone(String(r.sentiment ?? "")) };
    },
  },
];

function ScoreTile({ spec }: { spec: ScoreSpec }) {
  const q = useDataset(spec.id);
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border px-2 pt-3 pb-2">
      <PanelBody env={q.data as never} isLoading={q.isLoading} skeletonHeight={100} compact>
        {(d: unknown) => {
          const v = spec.pick(d);
          return (
            <Tip content={spec.high}>
              <div tabIndex={0} className="outline-none">
                <Gauge value={v.value} label={spec.label} size={104} sub={v.badge ? <Badge variant={v.tone}>{humanize(v.badge)}</Badge> : null} />
              </div>
            </Tip>
          );
        }}
      </PanelBody>
      <Freshness env={q.data as never} />
    </div>
  );
}

export function RegimesView() {
  const q = useDataset("regimes");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Panel title="Cycle ring" dataset="regimes" env={q.data} isLoading={q.isLoading} skeletonHeight={380}>
          {(d) => <CycleRing regimes={d.regimes} currentId={d.current.id ?? null} rawId={d.current.raw?.id ?? null} />}
        </Panel>
        <Panel title="Current phase and playbook" dataset="regimes" env={q.data} isLoading={q.isLoading} skeletonHeight={380}>
          {(d) => <Playbook d={d} />}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <HealthCard />
        <Card>
          <CardHeader>
            <CardTitle>Supporting regime scores</CardTitle>
            <span className="text-[10px] text-muted-foreground">0-100, each from its own /score endpoint</span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SCORES.map((s) => (
                <ScoreTile key={s.id} spec={s} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <HealthComponents />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Classifier signals (always live)" dataset="regimes" env={q.data} isLoading={q.isLoading} skeletonHeight={200}>
          {(d) => {
            const sig = isRecord(d.current.signals) ? d.current.signals : {};
            return (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                {Object.entries(sig).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-border/50 py-1">
                    <dt className="truncate font-mono text-[11px] text-muted-foreground">{k}</dt>
                    <dd className="num font-medium">{fmtSignal(k, v)}</dd>
                  </div>
                ))}
              </dl>
            );
          }}
        </Panel>
        <Panel title="Distance to every cutoff" dataset="regimes" env={q.data} isLoading={q.isLoading} skeletonHeight={200}>
          {(d) => <Thresholds d={d} />}
        </Panel>
      </div>
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Lock className="size-3" aria-hidden /> Regime history since 2020 needs a Pro Plus key (Phase 3).
        <TriangleAlert className="ml-2 size-3" aria-hidden /> Signals are read live while the regime is committed through a dwell gate, so they can disagree mid-turn.
      </p>
    </div>
  );
}
