/**
 * Validate the saved CDA responses in docs/samples/ against the schemas.
 *   pnpm --filter @cqd/schemas check-samples
 *
 * docs/samples/index.json maps each file to its endpoint and dataset id. Dataset samples are
 * checked with the dataset validator; stream samples are checked event by event against the
 * strict per-type stream schema (unknown event types are reported, not failed). Finally it
 * fails if any registry dataset (or the stream) lacks a demo sample.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASET_IDS, isDatasetId } from "../src/datasets";
import { demoCoverageProblems, type SampleIndex } from "../src/demo";
import { KPI_KEYS } from "../src/kpis";
import { DelayedStreamResponse, JevResponse, RecentStreamResponse, StreamEventStrict, validateDataset } from "../src/validators";

interface IndexEntry {
  file: string;
  dataset: string | null;
  endpoint: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "../../../docs/samples");
const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as { files: IndexEntry[] };

let failures = 0;
const line = (ok: boolean, msg: string, detail?: string[]) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail?.length ? `\n     ${detail.join("\n     ")}` : ""}`);
  if (!ok) failures++;
};

for (const entry of index.files) {
  const data: unknown = JSON.parse(readFileSync(join(dir, entry.file), "utf8"));
  if (entry.dataset && isDatasetId(entry.dataset)) {
    const r = validateDataset(entry.dataset, data, 5);
    line(r.ok, `${entry.file} -> ${entry.dataset}`, r.issues);
    continue;
  }
  if (entry.endpoint.startsWith("/api/v1/stream/")) {
    const outer = entry.endpoint.includes("/delayed") ? DelayedStreamResponse.safeParse(data) : RecentStreamResponse.safeParse(data);
    if (!outer.success) {
      line(false, `${entry.file} -> stream envelope`, outer.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`));
      continue;
    }
    const counts = new Map<string, number>();
    const issues: string[] = [];
    for (const ev of outer.data.events) {
      const r = StreamEventStrict.safeParse(ev);
      counts.set(ev.type, (counts.get(ev.type) ?? 0) + 1);
      if (!r.success && issues.length < 5) issues.push(`${ev.type} ${String(ev.id)}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    const summary = [...counts].map(([t, n]) => `${t} x${n}`).join(", ");
    line(issues.length === 0, `${entry.file} -> ${outer.data.events.length} stream events (${summary})`, issues);
    continue;
  }
  console.log(`skip ${entry.file} (${entry.endpoint})`);
}

// Jev (TypeSafe) request/response pairs in docs/samples/jev/: validate the response half.
const jevDir = join(dir, "jev");
let jevCount = 0;
if (existsSync(jevDir)) {
  for (const file of readdirSync(jevDir).filter((f) => f.endsWith(".json"))) {
    const pair = JSON.parse(readFileSync(join(jevDir, file), "utf8")) as { response: unknown };
    const r = JevResponse.safeParse(pair.response);
    line(r.success, `jev/${file} -> JevResponse`, r.success ? undefined : r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`));
    jevCount++;
  }
}

// Optional header-KPI history a live worker recorded (served in demo mode and the static build).
const kpiPath = join(dir, "kpi-history.json");
if (existsSync(kpiPath)) {
  const k = JSON.parse(readFileSync(kpiPath, "utf8")) as { captured_at?: unknown; intervalMs?: unknown; points?: unknown };
  const points = Array.isArray(k.points) ? (k.points as Array<{ t?: unknown; v?: unknown }>) : [];
  const problems: string[] = [];
  if (typeof k.captured_at !== "string" || !Number.isFinite(Date.parse(k.captured_at))) problems.push("captured_at: expected an ISO timestamp");
  if (typeof k.intervalMs !== "number" || k.intervalMs <= 0) problems.push("intervalMs: expected a positive number");
  if (points.length < 2) problems.push("points: expected at least two recorded points");
  points.forEach((p, i) => {
    if (typeof p.t !== "number" || typeof p.v !== "object" || p.v === null) problems.push(`points[${i}]: expected {t: number, v: object}`);
    else if (Object.keys(p.v).some((key) => !(KPI_KEYS as readonly string[]).includes(key))) problems.push(`points[${i}]: unknown KPI key`);
  });
  line(problems.length === 0, `kpi-history.json (${points.length} recorded points)`, problems.slice(0, 5));
}

// CI guard: every registry dataset (and the stream) must have a demo sample, so the keyless
// worker and the static GitHub Pages build can render every panel.
const coverage = demoCoverageProblems(index as SampleIndex, DATASET_IDS);
line(coverage.length === 0, `demo coverage: ${DATASET_IDS.length} registry datasets plus the stream`, coverage);

console.log(failures === 0 ? `\nall ${index.files.length + jevCount} samples valid, demo coverage complete` : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
