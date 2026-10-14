"use client";

import type { QuantCoinRisk } from "@cqd/schemas";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Panel } from "@/components/panel";
import { Badge, Input, Label, NativeSelect, Tip } from "@/components/ui/primitives";
import { HMM_REGIMES, hmmMeta } from "@/lib/domain";
import { dateTime, duration, frac, int, num, usd } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { cn, finite, isRecord, toMs } from "@/lib/utils";
import { CoinDrawer } from "./coin-drawer";
import { RegimeHeroCard } from "./regime-hero";

/** Tile width steps by open-interest rank (sized by OI, as the plan asks). */
function sizeClass(oi: number | null, cutoffs: number[]): string {
  if (oi === null) return "w-[74px]";
  if (oi >= (cutoffs[0] ?? Infinity)) return "w-[132px]";
  if (oi >= (cutoffs[1] ?? Infinity)) return "w-[104px]";
  return "w-[74px]";
}

function RegimeGrid({ onPick }: { onPick: (c: QuantCoinRisk) => void }) {
  const q = useDataset("quant-coins-risk");
  const vol = useDataset("volume-scanner");
  const [search, setSearch] = useState("");
  const [minConf, setMinConf] = useState(0);
  const [hideThin, setHideThin] = useState(true);

  const oiBySymbol = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of vol.data?.data?.items ?? []) {
      const oi = finite(it.open_interest_usd);
      if (oi !== null) m.set(it.symbol, oi);
    }
    return m;
  }, [vol.data]);

  return (
    <Panel
      title="Regime grid: every perp"
      dataset="quant-coins-risk"
      env={q.data}
      isLoading={q.isLoading}
      skeletonHeight={360}
      actions={null}
    >
      {(d) => {
        const term = search.trim().toUpperCase();
        const items = d.items.filter((c) => {
          if (term && !c.symbol.toUpperCase().includes(term)) return false;
          if (hideThin && (c.meta.insufficient_history || c.meta.new_listing || !c.regime)) return false;
          return (c.regime?.confidence ?? 0) >= minConf;
        });
        const ois = [...oiBySymbol.values()].sort((a, b) => b - a);
        const cutoffs = [ois[Math.floor(ois.length * 0.1)] ?? Infinity, ois[Math.floor(ois.length * 0.4)] ?? Infinity];
        const groups = HMM_REGIMES.map((r) => ({
          regime: r,
          coins: items.filter((c) => c.regime?.label === r).sort((a, b) => (oiBySymbol.get(b.symbol) ?? 0) - (oiBySymbol.get(a.symbol) ?? 0)),
        }));
        const other = items.filter((c) => !c.regime || !HMM_REGIMES.includes(c.regime.label as (typeof HMM_REGIMES)[number]));
        const total = items.length || 1;
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Label>
                <Search className="size-3.5" aria-hidden />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find coin" className="w-32" aria-label="Find coin" />
              </Label>
              <Label>
                Min confidence
                <NativeSelect value={minConf} onChange={(e) => setMinConf(Number(e.target.value))}>
                  {[0, 0.5, 0.7, 0.9].map((v) => (
                    <option key={v} value={v}>
                      {v === 0 ? "Any" : frac(v, { digits: 0 })}
                    </option>
                  ))}
                </NativeSelect>
              </Label>
              <Label className="cursor-pointer">
                <input type="checkbox" checked={hideThin} onChange={(e) => setHideThin(e.target.checked)} className="accent-[var(--primary)]" />
                Hide warming / new listings
              </Label>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {items.length} of {d.count} perps &middot; universe {d.universe_size} &middot; horizon {d.horizon}
              </span>
            </div>

            {/* Mix: share of perps per regime */}
            <div>
              <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded" role="img" aria-label="Share of perps in each regime">
                {groups
                  .filter((g) => g.coins.length > 0)
                  .map((g) => (
                    <Tip key={g.regime} content={`${hmmMeta(g.regime).name}: ${g.coins.length} perps (${frac(g.coins.length / total, { digits: 0 })})`}>
                      <div className="h-full" style={{ width: `${(g.coins.length / total) * 100}%`, background: hmmMeta(g.regime).color }} />
                    </Tip>
                  ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {groups.map((g) => {
                const m = hmmMeta(g.regime);
                return (
                  <section key={g.regime} className="rounded-md border p-3" aria-label={m.name}>
                    <header className="mb-2 flex items-center gap-2">
                      <span className="size-2.5 rounded-sm" style={{ background: m.color }} aria-hidden />
                      <span className="text-sm font-medium">{m.name}</span>
                      <Badge variant="outline">{m.short}</Badge>
                      <span className="ml-auto num text-xs text-muted-foreground">
                        {g.coins.length} &middot; {frac(g.coins.length / total, { digits: 0 })}
                      </span>
                    </header>
                    {g.coins.length === 0 ? (
                      <div className="py-2 text-xs text-muted-foreground">No perps in this regime.</div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {g.coins.map((c) => {
                          const conf = c.regime?.confidence ?? 0;
                          const oi = oiBySymbol.get(c.symbol) ?? null;
                          return (
                            <Tip
                              key={c.symbol}
                              content={
                                <div className="space-y-0.5">
                                  <div className="font-medium">
                                    {c.symbol}: {m.name}
                                  </div>
                                  <div>Confidence {frac(conf, { digits: 0 })}</div>
                                  <div>Open interest {usd(oi)}</div>
                                  <div>Vol-target size {num(c.vol_target_multiplier, 2)}x</div>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => onPick(c)}
                                className={cn(
                                  "flex h-11 flex-col justify-between rounded border px-1.5 py-1 text-left transition-colors outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/60",
                                  sizeClass(oi, cutoffs),
                                )}
                                style={{ background: `color-mix(in srgb, ${m.color} ${Math.round(6 + conf * 22)}%, transparent)`, borderColor: `color-mix(in srgb, ${m.color} ${Math.round(25 + conf * 35)}%, transparent)` }}
                                aria-label={`${c.symbol}, ${m.name}, confidence ${Math.round(conf * 100)} percent`}
                              >
                                <span className="truncate text-[11px] leading-none font-semibold">{c.symbol}</span>
                                <span className="num text-[10px] leading-none text-foreground/80">{frac(conf, { digits: 0 })}</span>
                              </button>
                            </Tip>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            {other.length > 0 ? <div className="text-[11px] text-muted-foreground">{other.length} perps without a regime yet (warming up).</div> : null}
            <p className="text-[10px] text-muted-foreground">Tiles are grouped by regime, sized by open interest (top 10% / top 40% / rest) and shaded by confidence. Click a tile for the coin drawer.</p>
          </div>
        );
      }}
    </Panel>
  );
}

function ModelCard() {
  const q = useDataset("quant-model");
  return (
    <Panel title="Model card" dataset="quant-model" env={q.data} isLoading={q.isLoading} skeletonHeight={200}>
      {(d) => {
        const runtime = isRecord(d.runtime) ? d.runtime : {};
        const universe = isRecord(runtime.universe) ? runtime.universe : {};
        const drift = isRecord(runtime.drift) ? runtime.drift : {};
        const cur = isRecord(drift.current) && isRecord(drift.current.market) ? drift.current.market : {};
        const base = isRecord(drift.baseline) ? drift.baseline : {};
        const live = finite(cur.loglik_7d_mean);
        const mean = finite(base.mean);
        const std = finite(base.std);
        const z = live !== null && mean !== null && std ? (live - mean) / std : null;
        const validation = isRecord(d.validation) ? d.validation : {};
        const folds = Array.isArray(validation.folds) ? validation.folds.length : null;
        const anchors = Array.isArray(validation.anchor_checks) ? (validation.anchor_checks as Array<Record<string, unknown>>) : [];
        const lastInference = toMs(runtime.last_inference);
        const rows: Array<[string, React.ReactNode]> = [
          ["Status", d.loaded ? <Badge variant="good">loaded</Badge> : <Badge variant="critical">not loaded</Badge>],
          ["Model", `${(d.model_family ?? "?").toUpperCase()} v${d.model_version ?? "?"} (features ${d.feature_version ?? "?"})`],
          ["Last retrain", d.last_retrain ? `${dateTime(toMs(d.last_retrain))} (${duration((Date.now() - (toMs(d.last_retrain) ?? Date.now())) / 1000)} ago)` : "—"],
          ["Last inference", lastInference ? dateTime(lastInference) : "—"],
          ["Universe", `${int(finite(universe.active))} active / ${int(finite(universe.tracked))} tracked / ${int(finite(universe.warmed_up))} warmed up`],
          ["Labels", (d.labels ?? []).map((l) => hmmMeta(l).short).join(" · ")],
          ["Validation", folds !== null ? `${folds} walk-forward folds, mean OOS loglik ${num(finite(validation.mean_oos_loglik), 2)}, max flap ${num(finite(validation.max_flap_rate), 2)}/day` : "—"],
          ["Anchor checks", anchors.length ? `${anchors.filter((a) => a.ok === true).length}/${anchors.length} historical anchors matched` : "—"],
          ["Drift (7d loglik)", z !== null ? `${num(live, 2)} vs baseline ${num(mean, 2)} (z ${num(z, 2)})` : "—"],
        ];
        return (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0">{v}</dd>
              </div>
            ))}
            {d.sha256 ? (
              <div className="contents">
                <dt className="text-muted-foreground">sha256</dt>
                <dd className="truncate font-mono text-[10px] text-muted-foreground" title={d.sha256}>
                  {d.sha256}
                </dd>
              </div>
            ) : null}
          </dl>
        );
      }}
    </Panel>
  );
}

export function MarketRegimesView() {
  const [picked, setPicked] = useState<QuantCoinRisk | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <RegimeHeroCard className="xl:col-span-2" />
        <ModelCard />
      </div>
      <RegimeGrid onPick={setPicked} />
      <CoinDrawer symbol={picked?.symbol ?? null} risk={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
