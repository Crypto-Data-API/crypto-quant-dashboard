"use client";

import type { EventCatalystModel } from "@cqd/schemas";
import { useMemo, useState } from "react";
import { Freshness, Panel, PanelBody, SecHead } from "@/components/panel";
import { Sheet, SheetContent } from "@/components/ui/primitives";
import { calEvents, catalystSize } from "@/cq/adapters";
import { GaugeView, Horizon3DView } from "@/cq/react";
import { A, C, fmt } from "@/cq/theme";
import { num } from "@/lib/format";
import { useDataset } from "@/lib/hooks";

const TYPE_LABEL: Record<string, string> = { unlock: "Unlock", macro_print: "Macro", depeg: "Depeg", mint: "Mint" };
const TYPE_COLOR: Record<string, string> = { unlock: C.violet, macro_print: C.amber, depeg: C.short, mint: C.blue };
const biasColor = (b: string) => (b === "risk_flag" ? C.amber : b === "short" ? C.short : b === "long" ? C.long : "#8b98a9");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMon = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isFinite(d.getTime()) ? `${d.getDate()} ${MON[d.getMonth()]}` : iso;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Horizon({ filter }: { filter: string }) {
  const q = useDataset("event-calendar");
  const data = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { events: calEvents(q.data?.data), filter, today: d.getTime() };
  }, [q.data, filter]);
  return (
    <section className="cq-card cq-sec">
      <SecHead
        title="Event horizon · next 30 days"
        sub="Thirty days of catalysts laid out as a runway toward NOW. Unlocks rise as pillars, macro prints span the track as arches, and the canyon walls swell where risk clusters. Events inside 48h pulse."
        mb={12}
        right={
          <div className="cq-mono flex" style={{ gap: 14, fontSize: 10.5, color: "#9aa8b8" }}>
            {(
              [
                ["Unlock", C.violet],
                ["Macro", C.amber],
                ["Depeg", C.short],
              ] as const
            ).map(([k, c]) => (
              <span key={k} className="flex items-center" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                {k}
              </span>
            ))}
          </div>
        }
      />
      <div className="cq-stage" style={{ height: "clamp(480px, 60vh, 680px)" }}>
        <div className="absolute inset-0" style={{ padding: q.data?.data ? 0 : 14 }}>
          <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight="100%" fill>
            {() => <Horizon3DView data={data} label="Event horizon: catalysts over the next 30 days" />}
          </PanelBody>
        </div>
        <div className="cq-stage-hint">pillar height = magnitude · amber arches = market-wide macro prints · canyon walls = rolling risk density · drag to orbit</div>
      </div>
    </section>
  );
}

function EventRisk() {
  const q = useDataset("score-event");
  return (
    <Panel title="Event risk" dataset="score-event" env={q.data} isLoading={q.isLoading} skeletonHeight={170} mb={12}>
      {(d) => {
        const counts = (d.counts ?? {}) as Record<string, number>;
        const mix = (["unlock", "macro_print", "depeg"] as const).map((k) => ({ k: TYPE_LABEL[k]!, v: Number(counts[k] ?? 0), c: TYPE_COLOR[k]! }));
        const subs = [
          ["Unlock subscore", d.unlock_subscore],
          ["Macro subscore", d.macro_subscore],
          ["Depeg subscore", d.depeg_subscore],
        ] as const;
        return (
          <div className="flex flex-wrap items-center" style={{ gap: 24 }}>
            <div className="flex flex-col items-center" style={{ flex: "0 0 180px", gap: 6 }}>
              <div style={{ width: 170, height: 136 }}>
                <GaugeView value={d.event_risk_score} color={C.amber} label={`Event risk score ${num(d.event_risk_score, 1)}`} />
              </div>
              <div style={{ fontSize: 12, color: "#9aa8b8" }}>Event risk score</div>
              <span className="cq-mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", color: C.amber, background: A(C.amber, 0.1), border: `1px solid ${A(C.amber, 0.4)}`, padding: "2px 8px", borderRadius: 5 }}>
                {cap(d.band)}
              </span>
            </div>
            <div className="flex min-w-0 flex-col" style={{ flex: "1 1 340px", gap: 14 }}>
              <div className="grid grid-cols-2" style={{ gap: 10 }}>
                {(
                  [
                    ["NEXT 7 DAYS", d.events_7d],
                    ["NEXT 30 DAYS", d.events_30d],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="cq-tile" style={{ padding: "12px 14px" }}>
                    <div className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878" }}>
                      {k}
                    </div>
                    <div className="cq-mono" style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>
                      {v ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#c9d3df", fontWeight: 500, marginBottom: 8 }}>Feed mix</div>
                <div className="flex" style={{ gap: 3, height: 8 }}>
                  {mix.map((m) => (m.v > 0 ? <div key={m.k} style={{ flex: `${m.v} 1 0%`, background: m.c, borderRadius: 3 }} /> : null))}
                </div>
                <div className="flex flex-wrap" style={{ gap: 14, marginTop: 8 }}>
                  {mix.map((m) => (
                    <span key={m.k} className="flex items-center" style={{ gap: 6, fontSize: 11, color: "#8b98a9" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: m.c }} />
                      {m.k} <b className="cq-mono" style={{ color: "#e6edf5" }}>{m.v}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col" style={{ flex: "1 1 300px", gap: 14 }}>
              {subs.map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between" style={{ fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: "#9aa8b8" }}>{k}</span>
                    <span className="cq-mono" style={{ fontWeight: 600 }}>
                      {num(v, 1)}
                    </span>
                  </div>
                  <div style={{ height: 5, background: "#151c26", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, v ?? 0))}%`, background: C.blue, boxShadow: "0 0 10px rgba(76,155,255,0.6)", borderRadius: 5, transition: "width .8s" }} />
                  </div>
                </div>
              ))}
              {d.partial ? <div style={{ fontSize: 11, color: C.amber }}>Partial: some inputs unavailable.</div> : null}
            </div>
          </div>
        );
      }}
    </Panel>
  );
}

const CAT_COLS = "0.7fr 0.7fr 2.2fr 0.9fr 0.8fr 1.1fr 1.5fr 0.8fr";

function CatalystRows({ items, onSymbol, empty }: { items: EventCatalystModel[]; onSymbol: (s: string) => void; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 980 }}>
        <div className="cq-th" style={{ gridTemplateColumns: CAT_COLS, gap: 14 }}>
          <span>DATE</span>
          <span>TYPE</span>
          <span>EVENT</span>
          <span>SYMBOLS</span>
          <span>BIAS</span>
          <span>MAGNITUDE</span>
          <span>SIZE</span>
          <span>SOURCE</span>
        </div>
        {items.map((e, i) => {
          const tc = TYPE_COLOR[e.event_type] ?? "#8b98a9";
          const bc = biasColor(e.bias);
          const mag = e.magnitude ?? 0;
          return (
            <div key={`${e.title}-${e.date}-${i}`} className="grid items-center" style={{ gridTemplateColumns: CAT_COLS, gap: 14, padding: "9px 12px", fontSize: 12, borderBottom: "1px solid #0f141b", background: e.days_until === 0 ? "rgba(255,181,71,0.045)" : "transparent" }}>
              <div>
                <div className="cq-mono">{dayMon(e.date)}</div>
                <div className="cq-mono" style={{ fontSize: 10, color: "#5b6878", marginTop: 1 }}>
                  {e.days_until === 0 ? "today" : e.days_until > 0 ? `in ${e.days_until}d` : `${-e.days_until}d ago`}
                </div>
              </div>
              <span className="flex items-center" style={{ gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: tc }} />
                {TYPE_LABEL[e.event_type] ?? e.event_type}
              </span>
              <span className="truncate" style={{ color: "#e6edf5" }} title={e.title}>
                {e.title}
              </span>
              <span className="flex flex-wrap" style={{ gap: 4 }}>
                {(e.symbols ?? []).length === 0 ? (
                  <span style={{ color: "#8b98a9" }}>market-wide</span>
                ) : (
                  (e.symbols ?? []).slice(0, 3).map((s) => (
                    <button key={s} type="button" onClick={() => onSymbol(s)} className="cq-mono hover:border-[#3a4859]" style={{ fontSize: 10, fontWeight: 600, border: "1px solid #2a3442", background: "#0d1219", padding: "2px 6px", borderRadius: 4, color: "#e6edf5", cursor: "pointer" }}>
                      {s}
                    </button>
                  ))
                )}
              </span>
              <span>
                <span className="cq-mono" style={{ fontSize: 10, color: bc, background: A(bc, 0.1), border: `1px solid ${A(bc, 0.4)}`, padding: "1px 7px", borderRadius: 5, whiteSpace: "nowrap" }}>
                  {e.bias.replace("_", " ")}
                </span>
              </span>
              <div className="flex items-center" style={{ gap: 8 }}>
                <div style={{ flex: 1, maxWidth: 70, height: 4, background: "#151c26", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${mag * 100}%`, background: mag >= 0.5 ? C.amber : C.blue, borderRadius: 4 }} />
                </div>
                <span className="cq-mono" style={{ fontSize: 11 }}>
                  {mag.toFixed(2)}
                </span>
              </div>
              <span className="cq-mono truncate" style={{ fontSize: 11, color: "#9aa8b8" }}>
                {catalystSize(e) || "—"}
              </span>
              <span className="cq-mono truncate" style={{ fontSize: 11, color: "#8b98a9" }}>
                {e.source ?? "—"}
              </span>
            </div>
          );
        })}
        {items.length === 0 ? <div style={{ padding: 28, textAlign: "center", fontSize: 12, color: "#5b6878" }}>{empty}</div> : null}
      </div>
    </div>
  );
}

function Catalysts({ type, setType, onSymbol }: { type: string; setType: (t: string) => void; onSymbol: (s: string) => void }) {
  const q = useDataset("event-calendar");
  const [bias, setBias] = useState("Any bias");
  const [symbol, setSymbol] = useState("");
  const [minMag, setMinMag] = useState("0");
  return (
    <Panel title="Catalysts · 30-day window" dataset="event-calendar" env={q.data} isLoading={q.isLoading} skeletonHeight={420}>
      {(d) => {
        const sym = symbol.trim().toUpperCase();
        const mm = Number(minMag) || 0;
        const typeKey = Object.entries(TYPE_LABEL).find(([, v]) => v === type)?.[0];
        const biasKey = bias === "risk flag" ? "risk_flag" : bias;
        const filtered = d.items.filter(
          (e) =>
            (type === "All types" || e.event_type === typeKey) &&
            (bias === "Any bias" || e.bias === biasKey) &&
            (!sym || sym === "ANY" || (e.symbols ?? []).some((s) => s.toUpperCase().includes(sym))) &&
            (e.magnitude ?? 0) >= mm,
        );
        const upcoming = filtered.filter((e) => e.days_until >= 0).sort((a, b) => a.days_until - b.days_until || (b.magnitude ?? 0) - (a.magnitude ?? 0));
        const recent = filtered.filter((e) => e.days_until < 0).sort((a, b) => b.days_until - a.days_until);
        return (
          <>
            <div className="flex flex-wrap items-center" style={{ gap: 12, marginBottom: 14 }}>
              <label className="cq-field">
                Type
                <select className="cq-select" value={type} onChange={(e) => setType(e.target.value)}>
                  <option>All types</option>
                  <option>Unlock</option>
                  <option>Macro</option>
                  <option>Depeg</option>
                  <option>Mint</option>
                </select>
              </label>
              <label className="cq-field">
                Bias
                <select className="cq-select" value={bias} onChange={(e) => setBias(e.target.value)}>
                  <option>Any bias</option>
                  <option>short</option>
                  <option>long</option>
                  <option>neutral</option>
                  <option>risk flag</option>
                  <option>mixed</option>
                </select>
              </label>
              <label className="cq-field">
                Symbol
                <input className="cq-input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="ANY" aria-label="Filter by symbol" style={{ width: 90, padding: "6px 9px", textTransform: "uppercase" }} />
              </label>
              <label className="cq-field">
                Min magnitude
                <select className="cq-select" value={minMag} onChange={(e) => setMinMag(e.target.value)}>
                  <option value="0">Any</option>
                  <option value="0.1">0.10+</option>
                  <option value="0.25">0.25+</option>
                  <option value="0.5">0.50+</option>
                </select>
              </label>
              <span className="cq-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "#5b6878" }}>
                {d.count} catalysts · risk score{" "}
                <span style={{ color: C.amber }}>
                  {num(d.event_risk_score, 1)} ({cap(d.band)})
                </span>
              </span>
            </div>
            <div className="cq-kicker" style={{ marginBottom: 6 }}>
              UPCOMING ({upcoming.length})
            </div>
            <CatalystRows items={upcoming} onSymbol={onSymbol} empty="No catalysts match these filters." />
            {recent.length ? (
              <>
                <div className="cq-kicker" style={{ margin: "18px 0 6px" }}>
                  RECENT ({recent.length})
                </div>
                <CatalystRows items={recent} onSymbol={onSymbol} empty="" />
              </>
            ) : null}
            <div className="cq-note">Unlocks bias short (supply overhang); macro prints are risk flags because the surprise is unknown ahead of time. Filters run on the cached 30-day calendar, so they cost no API calls.</div>
          </>
        );
      }}
    </Panel>
  );
}

function Unlocks({ onSymbol }: { onSymbol: (s: string) => void }) {
  const q = useDataset("supply-unlocks");
  const cols = "1.6fr 0.9fr 0.9fr 0.8fr 0.8fr 1.6fr";
  return (
    <Panel title="Token unlock cliffs · 30 days" dataset="supply-unlocks" env={q.data} isLoading={q.isLoading} skeletonHeight={240}>
      {(d) =>
        d.items.length === 0 ? (
          <div style={{ fontSize: 12, color: "#5b6878" }}>No unlock cliffs in the window.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 760 }}>
                <div className="cq-th" style={{ gridTemplateColumns: cols, textAlign: "right" }}>
                  <span style={{ textAlign: "left" }}>TOKEN</span>
                  <span style={{ textAlign: "left" }}>DATE</span>
                  <span>VALUE</span>
                  <span>% OF FLOAT</span>
                  <span>% OF MCAP</span>
                  <span style={{ textAlign: "left", paddingLeft: 8 }}>CATEGORIES</span>
                </div>
                {d.items.map((u) => (
                  <div key={`${u.symbol}-${u.date}`} className="cq-tr" style={{ gridTemplateColumns: cols }}>
                    <span style={{ textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 12 }}>
                      <button type="button" onClick={() => onSymbol(u.symbol)} style={{ fontWeight: 600, color: "#e6edf5", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                        {u.symbol}
                      </button>{" "}
                      <span style={{ color: "#5b6878" }}>{u.name}</span>
                    </span>
                    <span style={{ textAlign: "left" }}>
                      {dayMon(u.date)} <span style={{ color: "#5b6878", fontSize: 10 }}>in {u.days_until}d</span>
                    </span>
                    <span>{fmt.usd(u.usd)}</span>
                    <span style={{ color: (u.pct_of_float ?? 0) >= 0.05 ? C.amber : undefined, fontWeight: (u.pct_of_float ?? 0) >= 0.05 ? 600 : 400 }}>{((u.pct_of_float ?? 0) * 100).toFixed(2)}%</span>
                    <span style={{ color: "#9aa8b8" }}>{((u.pct_of_market_cap ?? 0) * 100).toFixed(2)}%</span>
                    <span className="truncate" style={{ textAlign: "left", paddingLeft: 8, color: "#8b98a9", fontFamily: "var(--font-sans)" }}>
                      {(u.categories ?? []).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="cq-note">Cliffs only (no linear vesting drips), soonest cliff per coin, sized against circulating float. Source: DefiLlama emissions via CDA ({d.tier_scope}).</div>
          </>
        )
      }
    </Panel>
  );
}

function SymbolDrawer({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const q = useDataset("event-symbol", { param: symbol });
  const cal = useDataset("event-calendar");
  const items = (cal.data?.data?.items ?? []).filter((e) => symbol && (e.symbols ?? []).includes(symbol));
  return (
    <Sheet open={symbol !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      {symbol ? (
        <SheetContent title={`${symbol} catalysts`} description="Per-symbol overlay: pending catalysts within 7 days and the net bias CDA assigns." className="sm:max-w-3xl">
          <div className="flex flex-col" style={{ gap: 16 }}>
            <div className="flex justify-end">
              <Freshness env={q.data} />
            </div>
            <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={90}>
              {(d) => (
                <div className="grid grid-cols-3" style={{ gap: 10 }}>
                  {(
                    [
                      ["NET BIAS", d.net_bias ?? "neutral"],
                      ["NET MAGNITUDE", num(d.net_magnitude, 2)],
                      ["NEAREST EVENT", d.nearest_event_days != null ? `${d.nearest_event_days}d` : "none"],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="cq-tile" style={{ padding: "11px 13px" }}>
                      <div className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#5b6878" }}>
                        {k}
                      </div>
                      <div className="cq-mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: k === "NET BIAS" ? biasColor(String(v)) : undefined }}>
                        {v}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelBody>
            <div>
              <div className="cq-kicker" style={{ marginBottom: 6 }}>
                IN THE 30-DAY CALENDAR
              </div>
              <CatalystRows items={items} onSymbol={() => undefined} empty={`No calendar entries name ${symbol}.`} />
            </div>
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

export function CalendarView() {
  const [symbol, setSymbol] = useState<string | null>(null);
  const [type, setType] = useState("All types");
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <Horizon filter={type === "Mint" ? "All types" : type} />
      <EventRisk />
      <Catalysts type={type} setType={setType} onSymbol={setSymbol} />
      <Unlocks onSymbol={setSymbol} />
      <SymbolDrawer symbol={symbol} onClose={() => setSymbol(null)} />
    </div>
  );
}
