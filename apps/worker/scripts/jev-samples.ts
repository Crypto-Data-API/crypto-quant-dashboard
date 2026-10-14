/**
 * Capture real Jev request/response pairs into docs/samples/jev/ (three calls, ~4k input tokens).
 *   pnpm --filter @cqd/worker jev:samples
 *
 * Inputs come from a running worker's HTTP API (WORKER_URL, default http://localhost:4100), so
 * no CryptoDataApi calls are made. Requests are built with the worker's own state builders and
 * question sets, so the samples are exactly what the classifier sends. The API key is read from
 * the repo-root .env and never written anywhere.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Envelope, NewsEventsResponse, QuantCoinsRiskResponse, LiquidityRegimeResponse, SqueezeAlertsResponse } from "@cqd/schemas";
import { findWorkspaceRoot, loadEnv } from "../src/config";
import { NEWS_QUESTIONS, SQUEEZE_QUESTIONS, VERDICT_QUESTIONS } from "../src/jev/questions";
import { newsState, squeezeState, VERDICT_INPUTS, verdictState, type VerdictInputId } from "../src/jev/state";

loadEnv();
const root = findWorkspaceRoot() ?? process.cwd();
const outDir = join(root, "docs", "samples", "jev");
const workerUrl = (process.env.WORKER_URL || "http://localhost:4100").replace(/\/+$/, "");
const apiKey = process.env.TYPESAFE_API_KEY?.trim();
const baseUrl = process.env.TYPESAFE_BASE_URL?.trim() || "https://api.typesafe.ai";
const model = process.env.JEV_MODEL?.trim() || "jev-latest";
if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set in the repo-root .env");

async function data<T>(id: string): Promise<Envelope<T>> {
  const res = await fetch(`${workerUrl}/data/${id}`);
  if (!res.ok) throw new Error(`worker /data/${id} answered ${res.status}`);
  return (await res.json()) as Envelope<T>;
}

async function capture(name: string, note: string, state: unknown, questions: unknown) {
  const request = { model, state, questions };
  const res = await fetch(`${baseUrl}/v1/systemone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
  });
  const response: unknown = await res.json();
  const out = { captured_at: new Date().toISOString(), endpoint: "POST /v1/systemone", note, http_status: res.status, request_id: res.headers.get("x-typesafe-request-id"), request, response };
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(out, null, 2)}\n`);
  const usage = (response as { usage?: { input_tokens: number } }).usage;
  console.log(`${res.status} ${name} input_tokens=${usage?.input_tokens ?? "?"}`);
}

mkdirSync(outDir, { recursive: true });

// 1. A news catalyst from the tape (prefers a coin event that has a measured market response).
const tape = await data<NewsEventsResponse>("news-market-moving");
const events = tape.data?.events ?? [];
const event = events.find((e) => e.symbol !== "MARKET" && e.market_response) ?? events[0];
if (!event) throw new Error("news tape is empty");
await capture("news-catalyst", `news-market-moving event ${event.event_id} (${event.symbol}, CDA bias ${event.bias})`, newsState(event), NEWS_QUESTIONS);

// 2. A squeeze alert. If none is active, use the include_quiet sample row with live context.
const sq = await data<SqueezeAlertsResponse>("squeeze-alerts");
const quiet = JSON.parse(readFileSync(join(root, "docs", "samples", "market-intelligence-squeeze-alerts-quiet.json"), "utf8")) as SqueezeAlertsResponse;
const live = sq.data?.alerts?.[0];
const alert = live ?? quiet.alerts[0];
if (!alert) throw new Error("no squeeze alert row available");
const asOfMs = (live ? sq.data!.as_of : quiet.as_of) * 1000;
const risk = (await data<QuantCoinsRiskResponse>("quant-coins-risk")).data?.items ?? [];
const liq = (await data<LiquidityRegimeResponse>("liquidity-regime")).data?.coins ?? [];
await capture(
  "squeeze-alert",
  live ? `active squeeze alert ${alert.symbol} ${alert.direction}` : `no alert was active at capture time: include_quiet sample row ${alert.symbol} ${alert.direction} with live regime and liquidity context`,
  squeezeState(alert, asOfMs, risk.find((r) => r.symbol === alert.symbol), liq.find((c) => c.coin === alert.symbol)),
  SQUEEZE_QUESTIONS,
);

// 3. The market verdict from the six cached inputs.
const envs = Object.fromEntries(await Promise.all(VERDICT_INPUTS.map(async (id) => [id, await data(id)] as const))) as Record<VerdictInputId, Envelope | null>;
const { state, inputs } = verdictState(envs);
await capture("market-verdict", `inputs as of: ${inputs.map((i) => `${i.dataset}@${i.asOf}`).join(", ")}`, state, VERDICT_QUESTIONS);
