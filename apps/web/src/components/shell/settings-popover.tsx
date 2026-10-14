"use client";

import Link from "next/link";
import { useEffect } from "react";
import { setUi, TAPE_ROW_OPTIONS, useUi, type UiSettings } from "@/lib/settings";

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="cq-switch" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function SettingRow({ title, sub, children, first = false }: { title: string; sub: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className="flex items-center" style={{ gap: 12, padding: "10px 0", borderTop: first ? undefined : "1px solid #121922" }}>
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 12.5, color: "#e6edf5" }}>{title}</div>
        <div style={{ fontSize: 11, color: "#5b6878", marginTop: 2 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

export function RowsPicker({ rows }: { rows: number }) {
  return (
    <div className="flex" style={{ gap: 4, marginTop: 8, padding: 3, background: "#080b10", border: "1px solid #1c2531", borderRadius: 9 }} role="radiogroup" aria-label="Tape rows">
      {TAPE_ROW_OPTIONS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rows === n}
          onClick={() => setUi({ rows: n })}
          className="cq-mono flex-1"
          style={{ padding: "5px 0", border: "none", borderRadius: 7, background: rows === n ? "#1a2230" : "transparent", color: rows === n ? "#eef3f8" : "#8b98a9", cursor: "pointer", fontSize: 11 }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Quick toggles from the prototype's sidebar popover. The full list is on /settings. */
export function SettingsPopover({ left, onClose }: { left: number; onClose: () => void }) {
  const ui = useUi();
  const set = (patch: Partial<UiSettings>) => setUi(patch);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(3,5,8,0.35)" }} aria-hidden />
      <div className="cq-pop" role="dialog" aria-label="Settings" style={{ position: "fixed", left, bottom: 14, zIndex: 61, width: 300, padding: "16px 18px 10px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Settings</span>
          <button type="button" onClick={onClose} aria-label="Close settings" style={{ background: "none", border: "none", color: "#8b98a9", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}>
            ×
          </button>
        </div>
        <div style={{ borderTop: "1px solid #121922" }}>
          <SettingRow title="Live feed" sub="Stream ticks, liquidations and book updates" first>
            <Switch on={ui.live} onChange={(v) => set({ live: v })} label="Live feed" />
          </SettingRow>
        </div>
        <SettingRow title="Auto-rotate 3D views" sub="Slow camera orbit and sway on all scenes">
          <Switch on={ui.motion} onChange={(v) => set({ motion: v })} label="Auto-rotate 3D views" />
        </SettingRow>
        <div style={{ padding: "10px 0 8px", borderTop: "1px solid #121922" }}>
          <div style={{ fontSize: 12.5, color: "#e6edf5" }}>Tape rows</div>
          <RowsPicker rows={ui.rows} />
        </div>
        <div className="flex justify-end" style={{ padding: "8px 0 4px", borderTop: "1px solid #121922" }}>
          <Link href="/settings" onClick={onClose} style={{ fontSize: 11.5 }}>
            All settings →
          </Link>
        </div>
      </div>
    </>
  );
}
