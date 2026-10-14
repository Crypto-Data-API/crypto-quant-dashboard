import type { NextRequest } from "next/server";
import { streamUpstream } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform also stops the compression middleware from buffering the stream.
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * GET /api/stream: same-origin SSE proxy to the worker's /stream fan-out.
 *
 * The worker holds the single upstream connection to CDA (live stream, or the keyless
 * delayed preview) and replays from its ring buffer on reconnect; this route just pipes
 * bytes and forwards Last-Event-ID. In production on a serverless host, set
 * NEXT_PUBLIC_STREAM_URL to the worker's public /stream URL instead, so long-lived
 * connections bypass function duration limits.
 */
export async function GET(req: NextRequest) {
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  const lastEventId = req.headers.get("last-event-id");
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;
  try {
    const upstream = await fetch(streamUpstream(req.nextUrl.search), { headers, signal: req.signal, cache: "no-store" });
    if (!upstream.ok || !upstream.body) throw new Error(`worker answered ${upstream.status}`);
    return new Response(upstream.body, { headers: SSE_HEADERS });
  } catch (err) {
    const status = {
      source: "off",
      state: "error",
      message: `Worker offline (${(err as Error).message}). Start it with "pnpm dev:worker".`,
      lastEventAt: null,
      eventsPerMin: 0,
      clients: 0,
      bufferSize: 0,
    };
    const body = `retry: 5000\n\nevent: status\ndata: ${JSON.stringify(status)}\n\n`;
    return new Response(body, { headers: SSE_HEADERS });
  }
}
