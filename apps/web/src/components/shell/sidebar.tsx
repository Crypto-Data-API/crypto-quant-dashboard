"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { cycleGroup, marketRegimeState, regimeCoins } from "@/cq/adapters";
import { Tip } from "@/components/ui/primitives";
import { SparkView } from "@/cq/react";
import { A, REG, regCode } from "@/cq/theme";
import { useDataset, useMediaQuery, useNow, useWorkerStatus } from "@/lib/hooks";
import { useLiveTape } from "@/lib/live";
import { setUi, useUi } from "@/lib/settings";
import { isActive, NAV, type NavId } from "./nav";
import { SettingsPopover } from "./settings-popover";
import { SystemBlock } from "./system-block";

function BrandMark() {
  return (
    <div
      style={{
        position: "relative",
        width: 36,
        height: 36,
        flex: "none",
        borderRadius: 10,
        background: "radial-gradient(circle at 50% 40%, #121a2a 0%, #080b12 75%)",
        border: "1px solid rgba(169,139,255,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 18px -2px rgba(124,108,255,0.55), inset 0 0 12px rgba(46,230,230,0.12)",
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }} aria-hidden>
        <defs>
          <linearGradient id="cqBrainG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3ff3ff" />
            <stop offset="0.55" stopColor="#7c8cff" />
            <stop offset="1" stopColor="#d36bff" />
          </linearGradient>
          <filter id="cqGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.1" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g stroke="url(#cqBrainG)" strokeWidth="1.5" filter="url(#cqGlow)">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
          <path d="M17.6 6.5a3 3 0 0 0 .4-1.4M6 5.1a3 3 0 0 0 .4 1.4M3.5 10.9a4 4 0 0 1 .6-.4M19.9 10.5a4 4 0 0 1 .6.4M6 18a4 4 0 0 1-2-.5M20 17.5a4 4 0 0 1-2 .5" />
        </g>
        <g stroke="#ffffff" strokeWidth="1.6" filter="url(#cqGlow)">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" strokeDasharray="2.5 44" strokeDashoffset="46">
            <animate attributeName="stroke-dashoffset" from="46" to="0" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" dur="2.6s" repeatCount="indefinite" />
          </path>
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" strokeDasharray="2.5 44" strokeDashoffset="46">
            <animate attributeName="stroke-dashoffset" from="46" to="0" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
          </path>
        </g>
        <circle cx="12" cy="10.2" r="1" fill="#3ff3ff" filter="url(#cqGlow)">
          <animate attributeName="opacity" values="0.35;1;0.35" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

/** Live per-item badges (current regime, perps, cycle phase, hot perps, liqs/min, today's macro print). */
function useBadges(): Partial<Record<NavId, [string, string]>> {
  const market = useDataset("quant-market");
  const risk = useDataset("quant-coins-risk");
  const regimes = useDataset("regimes");
  const volume = useDataset("volume-scanner");
  const calendar = useDataset("event-calendar");
  const { tape } = useLiveTape();
  const now = useNow() || Date.now();
  return useMemo(() => {
    const b: Partial<Record<NavId, [string, string]>> = {};
    const code = regCode(marketRegimeState(market.data?.data)?.label);
    if (code) b.regimes = [code, REG[code].color];
    const perps = regimeCoins(risk.data?.data).length;
    if (perps) b.perps = [String(perps), "#8b98a9"];
    const cur = regimes.data?.data?.current;
    if (cur?.id) b.cycle = [`${cur.id}/${regimes.data?.data?.regimes.length ?? 10}`, cycleGroup(cur.id).c];
    const items = volume.data?.data?.items;
    if (items) {
      const hot = items.filter((r) => r.band === "extreme" || r.band === "surging").length;
      b.volume = [`${hot} hot`, "#ff7a3d"];
    }
    b.liqs = [`${tape.filter((e) => now - e.ts < 60_000).length}/m`, "#ff5c6c"];
    const macro = calendar.data?.data?.items.find((e) => e.days_until === 0 && e.event_type === "macro_print");
    if (macro) b.calendar = [macro.macro_class || "macro", "#ffb547"];
    return b;
  }, [market.data, risk.data, regimes.data, volume.data, calendar.data, tape, now]);
}

function SideButton({ onClick, title, active, children, pressed }: { onClick: () => void; title: string; active?: boolean; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className="flex flex-1 items-center justify-center whitespace-nowrap transition-colors hover:border-[#2a3748] hover:text-[#e6edf5]"
      style={{ gap: 7, padding: 8, background: active ? "rgba(76,155,255,0.12)" : "transparent", border: "1px solid #1a2330", borderRadius: 8, color: "#9aa8b8", cursor: "pointer", fontSize: 11.5 }}
    >
      {children}
    </button>
  );
}

const HIDE_ICON = (open: boolean) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
    <path d={open ? "M4 4h16v16H4zM9 4v16M15 10l-2 2 2 2" : "M4 4h16v16H4zM9 4v16M13 10l2 2-2 2"} />
  </svg>
);

const GEAR = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
    <path d={NAV.find((n) => n.id === "settings")!.icon} />
  </svg>
);

const SOURCE_TAG: Record<string, string> = { delayed: "DELAYED", replay: "REPLAY" };

function StreamFooter() {
  const { data } = useWorkerStatus();
  const { connection } = useLiveTape();
  const stream = data?.worker?.stream;
  const hist = stream?.rateHist && stream.rateHist.length >= 2 ? stream.rateHist : null;
  const rate = stream?.eventsPerMin ?? 0;
  const isStatic = data?.via === "static";
  const off = !stream || (!isStatic && connection === "closed");
  // Anything but the live stream is named, so a delayed or replayed tape is never taken for live.
  const tag = stream && stream.source !== "live" ? (SOURCE_TAG[stream.source] ?? "OFF") : null;
  const tip = isStatic ? (
    "The liquidation tape replays saved stream events in your browser; the graph is the replay's events per minute."
  ) : stream ? (
    <div className="space-y-0.5">
      <div>
        Source: {stream.source}
        {stream.source === "delayed" ? " (keyless preview, about 31 min behind)" : ""}
      </div>
      <div>
        State: {stream.state}
        {stream.message ? `: ${stream.message}` : ""}
      </div>
      <div>
        {stream.eventsPerMin} events/min, {stream.clients} browser connections
      </div>
    </div>
  ) : (
    "Stream status unknown while the worker is offline."
  );
  return (
    <div className="flex flex-col" style={{ gap: 10, padding: "0 4px" }}>
      <Tip side="right" content={tip}>
        <div tabIndex={0} className="flex cursor-default items-center justify-between rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[#4c9bff]/50">
          <span className="cq-kicker">
            STREAM
            {tag ? <span style={{ color: "#4c9bff" }}> · {tag}</span> : null}
          </span>
          <span className="cq-mono" style={{ fontSize: 11, color: "#c9d3df" }}>
            {off ? (
              "off"
            ) : (
              <>
                {rate}
                <span style={{ color: "#5b6878" }}>/min</span>
              </>
            )}
          </span>
        </div>
      </Tip>
      <div style={{ height: 34 }}>{hist ? <SparkView values={hist} color="#4c9bff" fill live label="Stream events per minute, recent minutes" /> : null}</div>
      <div style={{ fontSize: 10.5, lineHeight: 1.5, color: "#4f5b6a", textWrap: "pretty" }}>Data from CryptoDataApi. The browser reads our cache; one server-side poller spends the API budget.</div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const ui = useUi();
  // Phones get the icon rail regardless of the saved setting.
  const narrow = useMediaQuery("(max-width: 719px)");
  const open = ui.sb && !narrow;
  const badges = useBadges();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <aside className="flex flex-none flex-col overflow-hidden" style={{ width: open ? 224 : 64, background: "#080b0f", borderRight: "1px solid #131a23", transition: "width .25s ease", lineHeight: "normal" }} aria-label="Sidebar">
        <Link href="/" className="flex items-center" style={{ gap: 11, padding: "18px 15px 16px", borderBottom: "1px solid #111821", color: "inherit" }} aria-label="Crypto QuantDesk, overview">
          <BrandMark />
          {open ? (
            <div style={{ whiteSpace: "nowrap" }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "#e6edf5" }}>Crypto QuantDesk</div>
              <div className="cq-mono" style={{ fontSize: 10, color: "#5b6878", marginTop: 1 }}>
                powered by CryptoDataApi
              </div>
            </div>
          ) : null}
        </Link>
        <nav className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto" style={{ gap: 2, padding: "12px 10px" }} aria-label="Main">
          {open ? (
            <div className="cq-mono" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "#3f4a57", padding: "4px 10px 8px" }}>
              WORKSPACE
            </div>
          ) : null}
          {NAV.map((n) => {
            const on = isActive(pathname, n.href);
            const b = badges[n.id];
            return (
              <Link
                key={n.id}
                href={n.href}
                title={n.label}
                aria-current={on ? "page" : undefined}
                className={`relative flex w-full items-center text-left transition-[background,color] duration-200 ${on ? "bg-[rgba(76,155,255,0.09)] text-[#eef3f8] hover:text-[#eef3f8]" : "text-[#8b98a9] hover:bg-[rgba(255,255,255,0.035)] hover:text-[#e6edf5]"}`}
                style={{ justifyContent: open ? "flex-start" : "center", gap: 11, padding: "9px 10px", borderRadius: 9, fontSize: 13, fontWeight: 500 }}
              >
                <span style={{ position: "absolute", left: -10, top: 8, bottom: 8, width: 3, borderRadius: "0 3px 3px 0", background: on ? "#4c9bff" : "transparent", boxShadow: on ? "0 0 12px #4c9bff" : "none" }} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={on ? "#4c9bff" : "#56626f"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
                  <path d={n.icon} />
                </svg>
                {open ? <span style={{ flex: 1, whiteSpace: "nowrap" }}>{n.label}</span> : null}
                {open && b ? (
                  <span className="cq-mono" style={{ fontSize: 9.5, fontWeight: 600, color: b[1], background: A(b[1], 0.1), padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap" }}>
                    {b[0]}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col" style={{ padding: "12px 12px 14px", borderTop: "1px solid #111821", gap: 10 }}>
          {open ? <SystemBlock popLeft={234} /> : null}
          {open ? <StreamFooter /> : null}
          <div className={open ? "flex" : "flex flex-col"} style={{ gap: 6 }}>
            <SideButton onClick={() => setUi({ sb: !open })} title={open ? "Hide sidebar" : "Show sidebar"}>
              {HIDE_ICON(open)}
              {open ? "Hide" : null}
            </SideButton>
            <SideButton onClick={() => setSettingsOpen((v) => !v)} title="Settings" active={settingsOpen} pressed={settingsOpen}>
              {GEAR}
              {open ? "Settings" : null}
            </SideButton>
          </div>
        </div>
      </aside>
      {settingsOpen ? <SettingsPopover left={open ? 234 : 74} onClose={() => setSettingsOpen(false)} /> : null}
    </>
  );
}
