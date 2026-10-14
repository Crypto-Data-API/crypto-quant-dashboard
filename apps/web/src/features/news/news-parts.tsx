"use client";

import { NEWS_RESPONSE_WINDOWS, type JevNewsRead, type NewsEvent, type NewsResponseWindow } from "@cqd/schemas";
import { ExternalLink } from "lucide-react";
import { DivergingBar, MeterBar } from "@/components/charts/basic";
import { PanelBody, Freshness } from "@/components/panel";
import { JevNewsCell, useJevNews } from "@/features/jev/jev-parts";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tip } from "@/components/ui/primitives";
import { C } from "@/lib/domain";
import { ago, dateTime, frac, fundingHourly, humanize, multiple, num, pct } from "@/lib/format";
import { useDataset, useNow } from "@/lib/hooks";
import { cn, toMs } from "@/lib/utils";

/** Signed bias, -1..+1. Negative is risk-off. Colour plus a word, never colour alone. */
export function BiasPill({ bias }: { bias: number }) {
  const label = bias > 0 ? "risk-on" : bias < 0 ? "risk-off" : "neutral";
  return (
    <Tip content={`Bias ${num(bias, 2)} (${label}). Negative is risk-off.`}>
      <span tabIndex={0} className="inline-flex min-w-[88px] items-center gap-1.5 outline-none">
        <span className="w-8">
          <DivergingBar value={bias} maxAbs={1} pos={C.long} neg={C.short} height={6} />
        </span>
        <span className={cn("num text-[11px]", bias > 0 ? "text-long" : bias < 0 ? "text-short" : "text-muted-foreground")}>
          {bias > 0 ? "+" : ""}
          {num(bias, 1)} {label}
        </span>
      </span>
    </Tip>
  );
}

/** Impact score with the Pro Plus components in the tooltip. */
export function Impact({ e }: { e: NewsEvent }) {
  const parts = [
    e.severity !== undefined ? `severity ${num(e.severity, 2)}` : null,
    e.confidence !== undefined ? `confidence ${num(e.confidence, 2)}` : null,
    e.match_mode ? `matched by ${e.match_mode.replace(/_/g, " ")}` : null,
  ].filter(Boolean);
  return (
    <Tip content={<div>Impact {num(e.impact_score, 3)}{parts.length ? <div className="text-muted-foreground">{parts.join(" · ")}</div> : null}</div>}>
      <span tabIndex={0} className="inline-flex items-center gap-1.5 outline-none">
        <span className="w-10">
          <MeterBar value={e.impact_score} max={1} height={4} color={e.impact_score >= 0.7 ? C.orange : C.blue} />
        </span>
        <span className="num text-[11px] font-medium">{num(e.impact_score, 2)}</span>
      </span>
    </Tip>
  );
}

export function Corroboration({ e }: { e: NewsEvent }) {
  return (
    <Tip content={e.sources?.length ? `Carried by: ${e.sources.join(", ")}` : `${e.corroboration} independent source(s)`}>
      <span tabIndex={0} className={cn("num text-[11px] outline-none", e.corroboration >= 3 ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {e.corroboration}x
      </span>
    </Tip>
  );
}

function windowTip(w: NewsResponseWindow, label: string) {
  return (
    <div className="space-y-0.5">
      <div className="font-medium">+{label} after publication</div>
      <div>Return {pct(w.ret_pct, { sign: true, digits: 2 })}</div>
      <div>OI change {pct(w.oi_change_pct, { sign: true, digits: 2 })}</div>
      <div>Funding shift {fundingHourly(w.funding_shift)}</div>
      <div>Volume {multiple(w.volume_multiplier)} of normal</div>
      <div>Abnormality {frac(w.abnormality, { digits: 0 })}</div>
    </div>
  );
}

/** One cell per response window (+15m / +1h / +4h): signed return, details on hover. */
export function ResponseCell({ e, window }: { e: NewsEvent; window: (typeof NEWS_RESPONSE_WINDOWS)[number] }) {
  const w = e.market_response?.[window];
  if (!w) {
    return (
      <Tip content={e.symbol === "MARKET" ? "Market-wide event: no single instrument to measure." : e.market_response === undefined ? "Market response needs a Pro Plus key." : "Not measured yet."}>
        <span tabIndex={0} className="text-[11px] text-muted-foreground/60 outline-none">
          {"—"}
        </span>
      </Tip>
    );
  }
  return (
    <Tip content={windowTip(w, window)}>
      <span tabIndex={0} className={cn("num text-[11px] outline-none", w.ret_pct > 0 ? "text-long" : w.ret_pct < 0 ? "text-short" : "", w.abnormality >= 0.5 && "font-semibold")}>
        {pct(w.ret_pct, { sign: true, digits: 2 })}
      </span>
    </Tip>
  );
}

export function SymbolChip({ symbol, onClick }: { symbol: string; onClick?: (s: string) => void }) {
  const cls = cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", symbol === "MARKET" ? "border-primary/40 text-[#7db3f0]" : "");
  return onClick ? (
    <button type="button" onClick={() => onClick(symbol)} className={cn(cls, "hover:border-foreground/40 hover:bg-accent")}>
      {symbol}
    </button>
  ) : (
    <span className={cls}>{symbol}</span>
  );
}

export function Headline({ e, clamp = false }: { e: NewsEvent; clamp?: boolean }) {
  if (clamp) {
    return (
      <a href={e.url} target="_blank" rel="noopener noreferrer" title={e.title} className="line-clamp-2 whitespace-normal text-foreground hover:underline">
        {e.title}
      </a>
    );
  }
  return (
    <a href={e.url} target="_blank" rel="noopener noreferrer" title={e.title} className="group flex max-w-full items-center gap-1 text-foreground hover:underline">
      <span className="truncate">{e.title}</span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden />
    </a>
  );
}

/** The catalyst tape as a table: newest first, all fields from the plan. */
export function NewsTable({ events, onSymbol, showSymbol = true }: { events: NewsEvent[]; onSymbol?: (s: string) => void; showSymbol?: boolean }) {
  const now = useNow() || Date.now();
  const jev = useJevNews();
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Published</TableHead>
          {showSymbol ? <TableHead>Symbol</TableHead> : null}
          <TableHead>Category</TableHead>
          <TableHead className="min-w-[260px]">Headline</TableHead>
          <TableHead>CDA bias</TableHead>
          <TableHead>Jev read</TableHead>
          <TableHead>Impact</TableHead>
          <TableHead className="text-right">Corrob.</TableHead>
          {NEWS_RESPONSE_WINDOWS.map((w) => (
            <TableHead key={w} className="text-right">
              +{w}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => {
          const t = toMs(e.published);
          return (
            <TableRow key={e.event_id}>
              <TableCell title={dateTime(t)}>
                <div>{ago(t, now)}</div>
                <div className="text-[10px] text-muted-foreground">{dateTime(t)}</div>
              </TableCell>
              {showSymbol ? (
                <TableCell>
                  <SymbolChip symbol={e.symbol} onClick={onSymbol} />
                </TableCell>
              ) : null}
              <TableCell>
                <Badge variant="outline">{humanize(e.category)}</Badge>
              </TableCell>
              <TableCell className="max-w-[420px]">
                <Headline e={e} />
                <div className="text-[10px] text-muted-foreground">{e.source}</div>
              </TableCell>
              <TableCell>
                <BiasPill bias={e.bias} />
              </TableCell>
              <TableCell>
                <JevNewsCell read={jev.reads[e.event_id]} envStatus={jev.env?.status} />
              </TableCell>
              <TableCell>
                <Impact e={e} />
              </TableCell>
              <TableCell className="text-right">
                <Corroboration e={e} />
              </TableCell>
              {NEWS_RESPONSE_WINDOWS.map((w) => (
                <TableCell key={w} className="text-right">
                  <ResponseCell e={e} window={w} />
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Per-coin drill-down from /news/coin/{symbol} (on demand). Used in the news drawer and the coin drawer. */
export function CoinNews({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  const q = useDataset("news-coin", { param: symbol });
  const jev = useJevNews();
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">News (7 days)</h3>
        <Freshness env={q.data} />
      </div>
      <PanelBody env={q.data} isLoading={q.isLoading} skeletonHeight={compact ? 60 : 160} compact>
        {(d) => (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground uppercase">Pressure</div>
                <div className="num font-semibold">{num(d.news_pressure, 2)}</div>
                <MeterBar value={d.news_pressure} max={1} height={4} />
              </div>
              <div className="rounded-md border px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground uppercase">Tilt</div>
                <div className={cn("num font-semibold", d.news_tilt > 0 ? "text-long" : d.news_tilt < 0 ? "text-short" : "")}>
                  {d.news_tilt > 0 ? "+" : ""}
                  {num(d.news_tilt, 2)}
                </div>
                <DivergingBar value={d.news_tilt} maxAbs={1} height={4} />
              </div>
              <div className="rounded-md border px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground uppercase">Qualified events</div>
                <div className="num font-semibold">{d.count}</div>
              </div>
            </div>
            {d.events.length === 0 ? (
              <div className="text-xs text-muted-foreground">No qualified catalysts for {d.symbol} in the last {num(d.window_hours, 0)} hours.</div>
            ) : compact ? (
              <ul className="space-y-2">
                {d.events.slice(0, 5).map((e) => (
                  <CompactNewsItem key={e.event_id} e={e} jev={jev.reads[e.event_id]} jevStatus={jev.env?.status} />
                ))}
              </ul>
            ) : (
              <NewsTable events={d.events} showSymbol={false} />
            )}
          </div>
        )}
      </PanelBody>
    </div>
  );
}

/** Two-line item for narrow panels (liquidations page, coin drawer). */
export function CompactNewsItem({ e, onSymbol, jev, jevStatus }: { e: NewsEvent; onSymbol?: (s: string) => void; jev?: JevNewsRead; jevStatus?: string }) {
  const now = useNow() || Date.now();
  return (
    <li className="space-y-1 border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="num text-muted-foreground">{ago(toMs(e.published), now)}</span>
        <SymbolChip symbol={e.symbol} onClick={onSymbol} />
        <span className="text-muted-foreground">{humanize(e.category)}</span>
        <span className="ml-auto flex items-center gap-2">
          <BiasPill bias={e.bias} />
          <Impact e={e} />
        </span>
      </div>
      <div className="text-xs">
        <Headline e={e} clamp />
      </div>
      <div className="flex items-center gap-2">
        <JevNewsCell read={jev} envStatus={jevStatus} compact />
      </div>
      {e.market_response ? (
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          {NEWS_RESPONSE_WINDOWS.map((w) => (
            <span key={w}>
              +{w} <ResponseCell e={e} window={w} />
            </span>
          ))}
          <span className="ml-auto">
            <Corroboration e={e} /> sources
          </span>
        </div>
      ) : null}
    </li>
  );
}
