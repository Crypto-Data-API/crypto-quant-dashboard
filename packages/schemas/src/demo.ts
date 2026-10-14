/**
 * Demo mode: build cache envelopes from the committed samples in docs/samples/ (see its
 * index.json). Shared by the worker (keyless seeding) and the web app's static export, so both
 * show exactly the same data. Zod-free and fs-free: callers read the files.
 */
import { DATASETS, isDatasetId, isOnDemandDef, staleAfter, type DatasetDef, type DatasetId } from "./datasets";
import type { Envelope } from "./envelope";
import type { RelayedEvent } from "./types";

export interface SampleIndexEntry {
  file: string;
  /** Registry dataset id (null for stream captures). */
  dataset: string | null;
  endpoint: string;
  captured_at: string;
  bytes?: number;
  /** Symbol for on-demand datasets. */
  param?: string | null;
  /** Seeds demo mode. */
  demo?: boolean;
  /** Events replayed by the demo stream. */
  stream?: boolean;
}

export interface SampleIndex {
  captured_with?: string;
  files: SampleIndexEntry[];
}

function toIso(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v > 1e9 ? v * 1000 : null;
    return ms ? new Date(ms).toISOString() : null;
  }
  if (typeof v === "string" && v.length > 0) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}

/** CDA's own timestamp inside a payload ("data as of"), falling back to common field names. */
export function extractAsOf(def: DatasetDef, data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidates = [def.asOfField, "as_of", "timestamp", "positions_as_of", "generated_at", "ts", "classifiedAt"].filter(Boolean) as string[];
  for (const c of candidates) {
    const iso = toIso(d[c]);
    if (iso) return iso;
  }
  return null;
}

/** An "ok" envelope for a saved sample, flagged as demo data and dated at capture time. */
export function demoEnvelope<T = unknown>(id: DatasetId, param: string | null, data: T, capturedAt: string): Envelope<T> {
  const def = DATASETS[id] as DatasetDef;
  return {
    dataset: id,
    param,
    status: "ok",
    data,
    fetchedAt: capturedAt,
    asOf: extractAsOf(def, data) ?? capturedAt,
    checkedAt: capturedAt,
    intervalMs: def.intervalMs,
    staleAfterMs: staleAfter(def),
    error: null,
    validation: null,
    demo: { capturedAt },
  };
}

/** Requested symbol has no saved sample. */
export function demoUnavailableEnvelope<T = unknown>(id: DatasetId, param: string | null, available: string[]): Envelope<T> {
  const def = DATASETS[id] as DatasetDef;
  return {
    dataset: id,
    param,
    status: "demo_unavailable",
    data: null,
    fetchedAt: null,
    asOf: null,
    checkedAt: null,
    intervalMs: def.intervalMs,
    staleAfterMs: staleAfter(def),
    error: {
      kind: "demo_unavailable",
      message: available.length ? `Demo data includes ${available.join(", ")} only.` : "This view has no demo data.",
    },
    validation: null,
    demo: null,
  };
}

/** Demo samples grouped by dataset: [entry, ...] with params for on-demand datasets. */
export function demoEntriesByDataset(index: SampleIndex): Map<DatasetId, SampleIndexEntry[]> {
  const out = new Map<DatasetId, SampleIndexEntry[]>();
  for (const e of index.files) {
    if (!e.demo || !e.dataset || !isDatasetId(e.dataset)) continue;
    const list = out.get(e.dataset) ?? [];
    list.push(e);
    out.set(e.dataset, list);
  }
  return out;
}

/**
 * Timeline for the demo stream replay. Each capture becomes a track that starts at time zero
 * (event times rebased to milliseconds since the track's first event), so a liquidation-only
 * capture plays from the first second alongside the mixed ones. Deduplicated by event id.
 */
export function replayTimeline(captures: Array<{ events?: RelayedEvent[] }>): RelayedEvent[] {
  const seen = new Set<string>();
  const out: RelayedEvent[] = [];
  for (const c of captures) {
    const events = [...(c.events ?? [])].sort((a, b) => a.ts - b.ts);
    const t0 = events[0]?.ts ?? 0;
    for (const ev of events) {
      if (seen.has(String(ev.id))) continue;
      seen.add(String(ev.id));
      out.push({ ...ev, ts: ev.ts - t0 });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Capture time range of the demo data, for the "Demo data from ..." banner. */
export function demoCapturedRange(index: SampleIndex): { from: string | null; to: string | null } {
  const times = index.files
    .filter((e) => e.demo || e.stream)
    .map((e) => Date.parse(e.captured_at))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    from: times.length ? new Date(times[0]!).toISOString() : null,
    to: times.length ? new Date(times[times.length - 1]!).toISOString() : null,
  };
}

/**
 * Coverage problems for the CI guard: every registry dataset needs a demo sample; scheduled
 * datasets need exactly one; on-demand datasets with a parameter need at least one symbol.
 */
export function demoCoverageProblems(index: SampleIndex, datasetIds: readonly DatasetId[]): string[] {
  const by = demoEntriesByDataset(index);
  const problems: string[] = [];
  for (const id of datasetIds) {
    const def = DATASETS[id] as DatasetDef;
    const list = by.get(id) ?? [];
    if (list.length === 0) problems.push(`${id}: no demo sample in docs/samples/index.json`);
    else if (def.param && list.some((e) => !e.param)) problems.push(`${id}: on-demand sample without a param`);
    else if (!def.param && list.length > 1) problems.push(`${id}: ${list.length} demo samples; mark all but one with "demo": false`);
    else if (!def.param && isOnDemandDef(def) && list[0]?.param) problems.push(`${id}: parameterless dataset sample has a param`);
  }
  if (!index.files.some((e) => e.stream)) problems.push("stream: no stream capture marked \"stream\": true");
  return problems;
}
