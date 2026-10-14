"use client";

import type { JevMarketVerdict } from "@cqd/schemas";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { A } from "@/cq/theme";
import { ago, dateTime, int } from "@/lib/format";
import { useDataset, useNow, useWorkerStatus } from "@/lib/hooks";
import { useUi } from "@/lib/settings";
import { toMs } from "@/lib/utils";

const STANCE: Record<string, { label: string; color: string }> = {
  risk_on: { label: "risk-on", color: "#2ee6a6" },
  neutral: { label: "neutral", color: "#9aa8b8" },
  risk_off: { label: "risk-off", color: "#ff5c6c" },
};
const CONVICTION = ["very low", "low", "moderate", "high", "very high"];

export interface JevStance {
  label: string;
  color: string;
  conf: string;
  extra: string | null;
  title: string;
  verdict: JevMarketVerdict | null;
  demo: boolean;
}

/** Jev's market stance in one line, or null when the classifier is off and there is no saved read. */
export function useJevStance(): JevStance | null {
  const q = useDataset("jev-market-verdict");
  const { data } = useWorkerStatus();
  const v = q.data?.data ?? null;
  const jev = data?.worker?.jev;
  if (!v) return null;
  const s = STANCE[v.stance.choice] ?? { label: v.stance.choice.replace(/_/g, "-"), color: "#9aa8b8" };
  const tokens = jev?.configured ? `${int((jev.inputTokensToday ?? 0) / 1000)}k tok` : null;
  return {
    label: s.label,
    color: s.color,
    conf: `${Math.round(v.stance.confidence * 100)}%`,
    extra: q.data?.demo ? "demo" : tokens,
    title: `TypeSafe Jev ${v.model}: market stance ${s.label} (${Math.round(v.stance.confidence * 100)}% confidence), classified ${dateTime(toMs(v.classifiedAt))}`,
    verdict: v,
    demo: Boolean(q.data?.demo),
  };
}

function Bar({ parts }: { parts: Array<{ k: string; v: number; c: string }> }) {
  return (
    <div className="flex" style={{ gap: 3, height: 6 }}>
      {parts.map((p) => (
        <div key={p.k} style={{ flex: `${Math.max(0.5, p.v)} 1 0%`, background: p.c, borderRadius: 3 }} />
      ))}
    </div>
  );
}

function JevPopover({ v, onClose, demo, place }: { v: JevMarketVerdict; onClose: () => void; demo: boolean; place: CSSProperties }) {
  const now = useNow() || Date.now();
  const level = Math.max(0, Math.min(4, Math.round(v.conviction.score)));
  const stance = (["risk_on", "neutral", "risk_off"] as const).map((k) => ({ k, v: Math.round((v.stance.probabilities[k] ?? 0) * 100), c: k === "neutral" ? "#3a4553" : STANCE[k]!.color }));
  return (
    <div className="cq-pop z-[61]" style={{ ...place, width: 320, padding: "14px 16px 12px" }} role="dialog" aria-label="Jev market read">
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Jev market read</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#8b98a9", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}>
          ×
        </button>
      </div>
      <div className="flex items-baseline" style={{ gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: STANCE[v.stance.choice]?.color ?? "#e6edf5" }}>{STANCE[v.stance.choice]?.label ?? v.stance.choice}</span>
        <span className="cq-mono" style={{ fontSize: 11, color: "#8b98a9" }}>
          {Math.round(v.stance.confidence * 100)}% confidence
        </span>
      </div>
      <Bar parts={stance} />
      <div className="flex cq-mono" style={{ gap: 10, marginTop: 6, fontSize: 10, color: "#8b98a9" }}>
        {stance.map((s) => (
          <span key={s.k}>
            {STANCE[s.k]!.label} <b style={{ color: "#e6edf5", fontWeight: 600 }}>{s.v}%</b>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 12 }}>
        <div className="cq-tile" style={{ padding: "9px 11px" }}>
          <div className="cq-kicker" style={{ letterSpacing: "0.08em" }}>
            VOL EXPANSION 24H
          </div>
          <div className="cq-mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
            {Math.round(v.volExpansion24h * 100)}%
          </div>
        </div>
        <div className="cq-tile" style={{ padding: "9px 11px" }}>
          <div className="cq-kicker" style={{ letterSpacing: "0.08em" }}>
            CONVICTION
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 5 }}>
            {CONVICTION[level]} <span className="cq-mono" style={{ fontSize: 10.5, color: "#5b6878", fontWeight: 400 }}>{v.conviction.score.toFixed(1)}/4</span>
          </div>
        </div>
      </div>
      <div className="cq-kicker" style={{ margin: "12px 0 6px" }}>
        WHAT JEV SAW
      </div>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {v.inputs.map((i) => (
          <div key={i.dataset} className="flex items-center justify-between" style={{ gap: 8, fontSize: 11 }}>
            <span style={{ color: "#c9d3df" }}>{i.label}</span>
            <span className="cq-mono" style={{ fontSize: 10, color: i.status !== "ok" ? "#ffb547" : "#5b6878" }}>
              {i.status !== "ok" ? `${i.status} · ` : ""}
              {i.asOf ? `as of ${ago(toMs(i.asOf), now)}` : "no data"}
            </span>
          </div>
        ))}
      </div>
      <div className="cq-mono" style={{ fontSize: 10, color: "#4f5b6a", marginTop: 10, lineHeight: 1.5 }}>
        {demo ? "saved demo read · " : ""}
        {v.model} · classified {ago(toMs(v.classifiedAt), now)} · a model read over cached CDA data, not advice
      </div>
    </div>
  );
}

/** Sidebar SYSTEM row: "Jev  risk-off 62%". Opens the compact read beside the sidebar. */
export function JevRow({ popLeft }: { popLeft: number }) {
  const ui = useUi();
  const stance = useJevStance();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!ui.jev || !stance?.verdict) return null;
  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={stance.extra && !stance.demo ? `${stance.title}; ${stance.extra} of input today` : stance.title}
        className="flex w-full items-center justify-between rounded-[4px] outline-none transition-colors hover:text-[#e6edf5] focus-visible:ring-2 focus-visible:ring-[#4c9bff]/50"
        style={{ gap: 8, padding: 0, background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}
      >
        <span>Jev</span>
        <span style={{ whiteSpace: "nowrap" }}>
          <span style={{ color: A(stance.color, 0.85) }}>{stance.label}</span> <span style={{ color: "#e6edf5" }}>{stance.conf}</span>
        </span>
      </button>
      {/* Portalled so the popover keeps the page's type, not the SYSTEM block's mono lines. */}
      {open
        ? createPortal(
            <div ref={pop}>
              <JevPopover v={stance.verdict} demo={stance.demo} place={{ position: "fixed", left: popLeft, bottom: 14 }} onClose={() => setOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Tiny inline Jev mark for rows (news, squeeze alerts): a coloured dot plus a short label. */
export function JevDot({ color, label, title }: { color: string; label: string; title: string }) {
  const ui = useUi();
  if (!ui.jev) return null;
  return (
    <span className="cq-mono inline-flex items-center whitespace-nowrap" title={title} style={{ gap: 5, fontSize: 10, color: "#8b98a9" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${A(color, 0.6)}`, flex: "none" }} aria-hidden />
      {label}
    </span>
  );
}
