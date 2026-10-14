import { NextResponse } from "next/server";
import { readHeartbeat, redisState } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/status: worker heartbeat (budget, limiter, stream, datasets) plus cache reachability. */
export async function GET() {
  const { status, via } = await readHeartbeat();
  const stale = status ? Date.now() - Date.parse(status.ts) > 30_000 : true;
  return NextResponse.json(
    { worker: status, via, workerOnline: status !== null && !stale, redis: redisState(), now: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
