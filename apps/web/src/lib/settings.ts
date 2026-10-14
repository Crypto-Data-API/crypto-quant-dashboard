"use client";

import { useSyncExternalStore } from "react";

/**
 * Display settings, persisted per browser under "cq.ui" (the prototype's key). The settings
 * popover in the sidebar and the /settings page edit the same store.
 */
export interface UiSettings {
  /** Sidebar expanded (224px) or collapsed to an icon rail (64px). */
  sb: boolean;
  /** Live feed: stream ticks, liquidations and book updates. Off freezes the tape and ladder. */
  live: boolean;
  /** Slow auto-rotate and sway on the 3D views. */
  motion: boolean;
  /** Rows on the live liquidation tape. */
  rows: number;
  /** Coin focused on Order Books (and the overview terrain) when a page opens. */
  focus: string;
  /** Show TypeSafe Jev reads (status pill, news and squeeze dots, sidebar line). */
  jev: boolean;
  /** Sparklines in the header KPI strip. */
  kpiSparks: boolean;
}

export const TAPE_ROW_OPTIONS = [16, 28, 40, 60] as const;

const KEY = "cq.ui";

export const UI_DEFAULTS: UiSettings = { sb: true, live: true, motion: true, rows: 28, focus: "BTC", jev: true, kpiSparks: true };

function load(): UiSettings {
  const base = { ...UI_DEFAULTS };
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) base.motion = false;
  } catch {
    /* ignore */
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<UiSettings>;
    return {
      sb: typeof saved.sb === "boolean" ? saved.sb : base.sb,
      live: typeof saved.live === "boolean" ? saved.live : base.live,
      motion: typeof saved.motion === "boolean" ? saved.motion : base.motion,
      rows: TAPE_ROW_OPTIONS.includes(saved.rows as (typeof TAPE_ROW_OPTIONS)[number]) ? (saved.rows as number) : base.rows,
      focus: typeof saved.focus === "string" && /^[A-Za-z0-9]{1,20}$/.test(saved.focus) ? saved.focus.toUpperCase() : base.focus,
      jev: typeof saved.jev === "boolean" ? saved.jev : base.jev,
      kpiSparks: typeof saved.kpiSparks === "boolean" ? saved.kpiSparks : base.kpiSparks,
    };
  } catch {
    return base;
  }
}

let current: UiSettings | null = null;
const listeners = new Set<() => void>();

export function getUi(): UiSettings {
  if (current) return current;
  if (typeof window === "undefined") return UI_DEFAULTS;
  current = load();
  return current;
}

export function setUi(patch: Partial<UiSettings>): void {
  current = { ...getUi(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: keep the in-memory value */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = load();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useUi(): UiSettings {
  return useSyncExternalStore(subscribe, getUi, () => UI_DEFAULTS);
}
