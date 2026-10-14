import { NextResponse } from "next/server";
import { readKpiHistory } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/kpi-history: the header-KPI history the worker records (sparklines and deltas). */
export async function GET() {
  return NextResponse.json(await readKpiHistory(), { headers: { "Cache-Control": "no-store" } });
}
