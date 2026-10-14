#!/usr/bin/env node
// Generates Zod schemas from packages/cda-client/openapi.json for the response
// schemas the dashboard consumes. Output: src/generated/cda.ts (do not edit by hand).
//
// Design choices:
//  - Objects are z.looseObject: unknown keys pass through, so an additive spec change
//    never strips data before it reaches the UI.
//  - Non-required properties are .nullish(): FastAPI emits optional fields as either
//    missing or null depending on the code path.
//  - integer is z.number() (no .int()): validation is a drift alarm, not a gate.
//    The worker caches data even when validation fails and records the issues.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, "../../cda-client/openapi.json");
const outPath = resolve(here, "../src/generated/cda.ts");

// Root response schemas used by the dataset registry (see src/datasets.ts).
const ROOTS = [
  "HealthCheckResponse",
  "QuantProbabilityObject",
  "QuantCoinsRiskResponse",
  "QuantCoinDetailResponse",
  "QuantModelCardResponse",
  "RegimesResponse",
  "MarketHealthResponse",
  "MarketHealthSummary",
  "HealthComponentsResponse",
  "VolatilityRegimeScoreResponse",
  "LiquidityRegimeScoreResponse",
  "PolicyRegimeScoreResponse",
  "SecurityRegimeScoreResponse",
  "EventRegimeScoreResponse",
  "MemeRegimeScoreResponse",
  "VolumeScannerResponse",
  "VolumeScannerDetailResponse",
  "DepthResponse",
  "CoinDepthHistoryResponse",
  "HLL2BookResponse",
  "LiquidityRegimeResponse",
  "OIDivergenceResponse",
  "MarketIntelligenceLiquidationsResponse",
  "MarketIntelligenceDataResponse",
  "SqueezeAlertsResponse",
  "EventRegimeResponse",
  "EventSymbolOverlayResponse",
  "SupplyUnlocksResponse",
  "CrossExchangeSummary",
  // Pro Plus (registered on-demand for Phase 2)
  "QuantHistoryResponse",
];

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const schemas = spec.components.schemas;

const refName = (ref) => ref.split("/").pop();

// Collect dependencies in topological order (deps first).
const order = [];
const state = new Map(); // name -> "visiting" | "done"
function visit(name, stack) {
  if (state.get(name) === "done") return;
  if (state.get(name) === "visiting") {
    throw new Error(`Cyclic schema reference: ${[...stack, name].join(" -> ")}`);
  }
  state.set(name, "visiting");
  const s = schemas[name];
  if (!s) throw new Error(`Unknown schema ${name}`);
  for (const dep of collectRefs(s)) visit(dep, [...stack, name]);
  state.set(name, "done");
  order.push(name);
}
function collectRefs(s, acc = new Set()) {
  if (!s || typeof s !== "object") return acc;
  if (Array.isArray(s)) {
    s.forEach((x) => collectRefs(x, acc));
    return acc;
  }
  if (typeof s.$ref === "string") acc.add(refName(s.$ref));
  for (const v of Object.values(s)) collectRefs(v, acc);
  return acc;
}
ROOTS.forEach((r) => visit(r, []));

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (k) => (IDENT.test(k) ? k : JSON.stringify(k));
const comment = (d, indent) => {
  if (!d) return "";
  const line = d.replace(/\s+/g, " ").replace(/\*\//g, "* /").trim();
  const short = line.length > 220 ? `${line.slice(0, 217)}...` : line;
  return `${indent}/** ${short} */\n`;
};

function conv(s, indent) {
  if (!s || Object.keys(s).length === 0) return "z.unknown()";
  let out;
  if (s.$ref) {
    out = refName(s.$ref);
  } else if (s.allOf) {
    out = s.allOf.length === 1 ? conv(s.allOf[0], indent) : s.allOf.map((x) => conv(x, indent)).reduce((a, b) => `${a}.and(${b})`);
  } else if (s.anyOf || s.oneOf) {
    const parts = (s.anyOf ?? s.oneOf).map((x) => conv(x, indent));
    out = parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`;
  } else if (Array.isArray(s.enum) && s.enum.every((v) => typeof v === "string")) {
    out = `z.enum([${s.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
  } else if (s.type === "string") {
    out = "z.string()";
  } else if (s.type === "integer" || s.type === "number") {
    out = "z.number()";
  } else if (s.type === "boolean") {
    out = "z.boolean()";
  } else if (s.type === "array") {
    out = `z.array(${conv(s.items ?? {}, indent)})`;
  } else if (s.type === "object" || s.properties) {
    const props = s.properties ?? {};
    const names = Object.keys(props);
    if (names.length === 0) {
      const ap = s.additionalProperties;
      out = ap && typeof ap === "object" && Object.keys(ap).length > 0 ? `z.record(z.string(), ${conv(ap, indent)})` : "z.record(z.string(), z.unknown())";
    } else {
      const req = new Set(s.required ?? []);
      const inner = indent + "  ";
      const lines = names.map((n) => {
        const p = props[n];
        let expr = conv(p, inner);
        if (!req.has(n)) expr = expr.endsWith(".nullable()") ? expr.replace(/\.nullable\(\)$/, ".nullish()") : `${expr}.nullish()`;
        return `${comment(p.description, inner)}${inner}${key(n)}: ${expr},`;
      });
      out = `z.looseObject({\n${lines.join("\n")}\n${indent}})`;
    }
  } else {
    out = "z.unknown()";
  }
  if (s.nullable && !out.endsWith(".nullable()") && !out.endsWith(".nullish()")) out = `${out}.nullable()`;
  return out;
}

const header = `// AUTO-GENERATED by packages/schemas/scripts/gen-zod.mjs from packages/cda-client/openapi.json.
// Spec version: ${spec.info?.version ?? "unknown"}. Do not edit by hand; run \`pnpm gen\` at the repo root.
/* eslint-disable */
import { z } from "zod";
`;

const body = order
  .map((name) => {
    const s = schemas[name];
    return `${comment(s.description, "")}export const ${name} = ${conv(s, "")};\nexport type ${name} = z.infer<typeof ${name}>;\n`;
  })
  .join("\n");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${header}\n${body}`);
console.log(`gen-zod: wrote ${order.length} schemas (${ROOTS.length} roots) to ${outPath}`);
