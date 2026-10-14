import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DATASETS,
  demoCapturedRange,
  demoEntriesByDataset,
  demoEnvelope,
  demoUnavailableEnvelope,
  isJevDef,
  replayTimeline,
  keys,
  type DatasetDef,
  type DatasetId,
  type Envelope,
  type RelayedEvent,
  type SampleIndex,
} from "@cqd/schemas";
import type { WorkerCache } from "./cache";
import type { Logger } from "./log";

/** Demo envelopes never expire on their own: they are replaced by live data once a key is set. */
const DEMO_TTL_MS = 365 * 24 * 3600 * 1000;

export interface DemoSamples {
  capturedFrom: string | null;
  capturedTo: string | null;
  /** Saved sample for a dataset (and symbol), or null when none was captured. */
  envelope(id: DatasetId, param: string | null): Envelope | null;
  /** "Not in demo" envelope listing the symbols that do have samples. */
  unavailable(id: DatasetId, param: string | null): Envelope;
  /** Saved stream events as a replay timeline (each capture rebased to start at zero). */
  streamEvents(): RelayedEvent[];
}

/** Load docs/samples/ (index.json plus files). Null when the folder is absent (e.g. a slim deploy image). */
export function loadDemoSamples(root: string | null, log: Logger): DemoSamples | null {
  if (!root) return null;
  const dir = join(root, "docs", "samples");
  const indexPath = join(dir, "index.json");
  if (!existsSync(indexPath)) {
    log.warn("demo samples not found; keyless panels will show empty states", { dir });
    return null;
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as SampleIndex;
  const byDataset = demoEntriesByDataset(index);
  const files = new Map<string, unknown>();
  const read = (file: string): unknown => {
    if (!files.has(file)) files.set(file, JSON.parse(readFileSync(join(dir, file), "utf8")));
    return files.get(file);
  };
  const range = demoCapturedRange(index);

  return {
    capturedFrom: range.from,
    capturedTo: range.to,
    envelope(id, param) {
      const list = byDataset.get(id) ?? [];
      const entry = param ? list.find((e) => (e.param ?? "").toUpperCase() === param.toUpperCase()) : list.find((e) => !e.param);
      return entry ? demoEnvelope(id, param, read(entry.file), entry.captured_at) : null;
    },
    unavailable(id, param) {
      const params = (byDataset.get(id) ?? []).map((e) => e.param).filter((p): p is string => Boolean(p));
      return demoUnavailableEnvelope(id, param, params);
    },
    streamEvents() {
      return replayTimeline(index.files.filter((f) => f.stream).map((e) => read(e.file) as { events?: RelayedEvent[] }));
    },
  };
}

/**
 * Seed the cache (memory and Redis) with every demo sample for the sources running in demo:
 * CryptoDataApi datasets when CDA_API_KEY is empty, Jev datasets when the classifier is off.
 * Keyless datasets (cda-health) keep polling live.
 */
export function seedDemo(cache: WorkerCache, samples: DemoSamples, opts: { cda: boolean; jev: boolean }): number {
  let n = 0;
  for (const id of Object.keys(DATASETS) as DatasetId[]) {
    const def = DATASETS[id] as DatasetDef;
    if (def.tier === "keyless" && !isJevDef(def)) continue;
    if (!(isJevDef(def) ? opts.jev : opts.cda)) continue;
    if (def.param) continue; // per-symbol samples are served on demand
    const env = samples.envelope(id, null);
    if (env) {
      cache.setEnvelope(keys.data(id), env, DEMO_TTL_MS);
      n++;
    }
  }
  return n;
}

export { DEMO_TTL_MS };
