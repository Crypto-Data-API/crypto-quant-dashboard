import { DATASETS, isDatasetId, normalizeParam, type DatasetDef } from "@cqd/schemas";
import { NextResponse, type NextRequest } from "next/server";
import { readEnvelope } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/data/:dataset[?param=SYMBOL]
 * Returns the cached Envelope for a dataset. Never calls CDA. For on-demand datasets the
 * request also registers interest so the worker starts (or keeps) polling that symbol.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await ctx.params;
  if (!isDatasetId(dataset)) {
    return NextResponse.json({ error: "unknown_dataset", dataset }, { status: 404 });
  }
  const def = DATASETS[dataset] as DatasetDef;
  let param: string | null = null;
  if (def.param) {
    const raw = req.nextUrl.searchParams.get("param") ?? req.nextUrl.searchParams.get(def.param.name) ?? "";
    param = normalizeParam(raw);
    if (!param) {
      return NextResponse.json({ error: "missing_or_invalid_param", param: def.param.name, example: def.param.example }, { status: 400 });
    }
  }
  const env = await readEnvelope(dataset, param);
  return NextResponse.json(env, { headers: { "Cache-Control": "no-store" } });
}
