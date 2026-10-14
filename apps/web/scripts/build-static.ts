/**
 * Static demo build for GitHub Pages.
 *   pnpm --filter @cqd/web build:static                 # export to apps/web/out
 *   GITHUB_PAGES=true pnpm --filter @cqd/web build:static   # same, served under /crypto-quant-dashboard
 *   pnpm --filter @cqd/web samples:static               # only refresh public/samples
 *
 * 1. Turns docs/samples/ into public/samples/: one demo envelope per dataset (and per symbol for
 *    on-demand datasets), a manifest of available symbols, the stream replay timeline and a
 *    static status document for the demo banner. Uses the same @cqd/schemas helpers as the
 *    keyless worker, so both demos show identical data.
 * 2. Runs `next build` with NEXT_PUBLIC_DATA_MODE=static (output: "export", no /api routes).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  demoCapturedRange,
  demoEntriesByDataset,
  demoEnvelope,
  replayTimeline,
  type DatasetId,
  type JevMarketVerdict,
  type RelayedEvent,
  type SampleIndex,
  type WorkerStatus,
} from "@cqd/schemas";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const samplesDir = resolve(webDir, "../../docs/samples");
const outDir = join(webDir, "public", "samples");

function exportSamples(): void {
  const index = JSON.parse(readFileSync(join(samplesDir, "index.json"), "utf8")) as SampleIndex;
  const read = (file: string): unknown => JSON.parse(readFileSync(join(samplesDir, file), "utf8"));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "data"), { recursive: true });

  const range = demoCapturedRange(index);
  const manifest: { capturedFrom: string | null; capturedTo: string | null; datasets: Record<string, { params: string[] }> } = {
    capturedFrom: range.from,
    capturedTo: range.to,
    datasets: {},
  };
  let files = 0;
  for (const [id, entries] of demoEntriesByDataset(index)) {
    manifest.datasets[id] = { params: entries.map((e) => e.param).filter((p): p is string => Boolean(p)) };
    for (const e of entries) {
      const env = demoEnvelope(id as DatasetId, e.param ?? null, read(e.file), e.captured_at);
      const name = e.param ? `${id}--${e.param}.json` : `${id}.json`;
      writeFileSync(join(outDir, "data", name), JSON.stringify(env));
      files++;
    }
  }
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest));

  const events = replayTimeline(index.files.filter((f) => f.stream).map((f) => read(f.file) as { events?: RelayedEvent[] }));
  writeFileSync(join(outDir, "stream.json"), JSON.stringify({ events }));
  const rateHist = replayRate(events);

  // Header-KPI history a live worker recorded, saved for the demo (optional).
  const kpiPath = join(samplesDir, "kpi-history.json");
  if (existsSync(kpiPath)) {
    const k = JSON.parse(readFileSync(kpiPath, "utf8")) as { captured_at: string; intervalMs: number; points: unknown[] };
    writeFileSync(join(outDir, "kpi-history.json"), JSON.stringify({ points: k.points, intervalMs: k.intervalMs, demo: { capturedAt: k.captured_at } }));
  }

  const verdict = index.files.find((f) => f.dataset === "jev-market-verdict");
  const jevModel = verdict ? ((read(verdict.file) as JevMarketVerdict).model ?? null) : null;
  const at = manifest.capturedTo ?? new Date().toISOString();
  const worker: WorkerStatus = {
    workerId: "static-demo",
    version: "0.1.0",
    startedAt: at,
    ts: at,
    keyConfigured: false,
    cache: "memory",
    leader: true,
    account: null,
    budget: { date: at.slice(0, 10), callsToday: 0, dailyBudget: 0, paceLimit: 0, mode: "normal", stretch: 1, scheduledPerHour: 0, byDataset: {}, byStatus: {}, resetsAt: at },
    limiter: { ratePerMinute: 0, burst: 0, tokens: 0, queued: 0, pausedUntil: null },
    stream: { source: "replay", state: "open", message: "Static demo: saved events replayed in the browser", lastEventAt: null, eventsPerMin: rateHist[rateHist.length - 1] ?? 0, rateHist, clients: 0, bufferSize: events.length, delayMs: null },
    onDemand: { active: 0, max: 0, keys: [] },
    datasets: [],
    jev: {
      enabled: false,
      configured: false,
      model: "jev-latest",
      resolvedModel: jevModel,
      callsToday: 0,
      inputTokensToday: 0,
      outputTokensToday: 0,
      errorsToday: 0,
      budget: { dailyCalls: 0, dailyInputTokens: 0, mode: "normal" },
      ratePerMinute: 0,
      lastCallAt: null,
      lastError: null,
    },
    demo: { cda: true, jev: true, static: true, capturedFrom: manifest.capturedFrom, capturedTo: manifest.capturedTo },
  };
  writeFileSync(join(outDir, "status.json"), JSON.stringify({ worker, via: "static", workerOnline: true, redis: "disabled", jev: worker.jev, now: at }));
  console.log(`static samples: ${files} dataset files, ${events.length} stream events -> ${outDir}`);
}

/**
 * Events per minute as the browser replays the saved stream (pauses capped at 3 s, like the
 * static replay in lib/hooks.ts), for the sidebar rate sparkline: up to 40 minutes.
 */
function replayRate(events: RelayedEvent[]): number[] {
  const buckets: number[] = [];
  let t = 0;
  for (let i = 0; i < events.length; i++) {
    const m = Math.floor(t / 60_000);
    if (m >= 40) break;
    buckets[m] = (buckets[m] ?? 0) + 1;
    const next = events[i + 1];
    t += next ? Math.min(3_000, Math.max(50, next.ts - events[i]!.ts)) : 2_000;
  }
  return Array.from(buckets, (v) => v ?? 0);
}

exportSamples();
if (!process.argv.includes("--samples-only")) {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_DATA_MODE: "static" };
  console.log(`next build (static export${process.env.GITHUB_PAGES === "true" ? ", basePath /crypto-quant-dashboard" : ""})`);
  execSync("next build", { cwd: webDir, stdio: "inherit", env });
}
