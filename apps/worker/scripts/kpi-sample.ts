/**
 * Save the header-KPI history a running worker has recorded as the demo sample
 * (docs/samples/kpi-history.json), so keyless runs and the static build show real sparklines.
 *   pnpm --filter @cqd/worker kpi:sample
 *
 * Reads the worker's /kpi-history (WORKER_URL, default http://localhost:4100; WORKER_TOKEN if
 * set). Makes no CryptoDataApi calls. Run it after the worker has recorded for a few hours.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KpiHistory } from "@cqd/schemas";
import { findWorkspaceRoot, loadEnv } from "../src/config";

loadEnv();
const root = findWorkspaceRoot() ?? process.cwd();
const workerUrl = (process.env.WORKER_URL || "http://localhost:4100").replace(/\/+$/, "");
const token = process.env.WORKER_TOKEN?.trim();

const res = await fetch(`${workerUrl}/kpi-history`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
if (!res.ok) throw new Error(`worker /kpi-history answered ${res.status}`);
const h = (await res.json()) as KpiHistory;
if (h.demo) throw new Error("the worker is serving a saved demo history, not its own recording (is CDA_API_KEY set?)");
if (h.points.length < 2) throw new Error(`only ${h.points.length} point(s) recorded so far; let the worker run longer`);
const out = { captured_at: new Date().toISOString(), note: "Header KPIs recorded by a live worker every intervalMs from its own cache of CDA responses.", intervalMs: h.intervalMs, points: h.points };
const file = join(root, "docs", "samples", "kpi-history.json");
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`saved ${h.points.length} points (${new Date(h.points[0]!.t).toISOString()} to ${new Date(h.points[h.points.length - 1]!.t).toISOString()}) to ${file}`);
