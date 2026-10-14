import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { DATASETS, isDatasetId, isOnDemandDef, normalizeParam, type DatasetDef, type WorkerStatus } from "@cqd/schemas";
import type { Logger } from "./log";
import type { Poller } from "./poller";
import { parseFilter, type StreamHub } from "./stream/hub";

export interface HttpDeps {
  poller: Poller;
  hub: StreamHub;
  status: () => WorkerStatus;
  log: Logger;
  token: string | null;
  corsOrigin: string;
}

/**
 * Worker HTTP API.
 *   GET /healthz                       liveness
 *   GET /status                        budget, limiter, stream and per-dataset state
 *   GET /data/:dataset[?param=SYM]     envelope from the worker's own cache (fallback when Redis is down);
 *                                      also registers on-demand interest
 *   GET /stream[?types=&symbols=&min_usd=&since_id=]   SSE fan-out of the live (or preview) tape
 *
 * /status and /data require `Authorization: Bearer $WORKER_TOKEN` when WORKER_TOKEN is set.
 * /stream is public (it is what browsers connect to in production) and honours CORS.
 */
export function createHttpServer(deps: HttpDeps): Server {
  const { log } = deps;
  return createServer((req, res) => {
    try {
      route(req, res, deps);
    } catch (err) {
      log.error("http handler crashed", { error: (err as Error).message, url: req.url });
      if (!res.headersSent) json(res, 500, { error: "internal_error" });
      else res.end();
    }
  });
}

function route(req: IncomingMessage, res: ServerResponse, deps: HttpDeps): void {
  const url = new URL(req.url ?? "/", "http://worker.local");
  res.setHeader("Access-Control-Allow-Origin", deps.corsOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Last-Event-ID, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== "GET") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  if (url.pathname === "/healthz") {
    json(res, 200, { ok: true, uptimeS: Math.round(process.uptime()) });
    return;
  }

  if (url.pathname === "/stream") {
    const sinceId = (req.headers["last-event-id"] as string | undefined) ?? url.searchParams.get("since_id");
    const backfill = Math.min(1_000, Math.max(0, Number(url.searchParams.get("backfill") ?? 200) || 0));
    deps.hub.attach(req, res, parseFilter(url.searchParams), sinceId || null, backfill);
    return;
  }

  if (deps.token && req.headers.authorization !== `Bearer ${deps.token}`) {
    json(res, 401, { error: "unauthorized" });
    return;
  }

  if (url.pathname === "/status") {
    json(res, 200, deps.status());
    return;
  }

  const m = /^\/data\/([a-z0-9-]+)$/.exec(url.pathname);
  if (m) {
    const id = m[1]!;
    if (!isDatasetId(id)) {
      json(res, 404, { error: "unknown_dataset", dataset: id });
      return;
    }
    const def = DATASETS[id] as DatasetDef;
    let param: string | null = null;
    if (def.param) {
      const raw = url.searchParams.get("param") ?? url.searchParams.get(def.param.name) ?? "";
      param = normalizeParam(raw);
      if (!param) {
        json(res, 400, { error: "missing_or_invalid_param", param: def.param.name });
        return;
      }
      deps.poller.touchDemand(id, param);
    } else if (isOnDemandDef(def)) {
      deps.poller.touchDemand(id, null);
    }
    json(res, 200, deps.poller.envelopeFor(id, param));
    return;
  }

  json(res, 404, { error: "not_found" });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(payload);
}
