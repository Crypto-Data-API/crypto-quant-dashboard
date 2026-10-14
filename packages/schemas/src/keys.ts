/** Cache key layout shared by the worker (writer) and the web app (reader). */
export const KEY_PREFIX = "cqd";

export const keys = {
  /** Envelope JSON for a dataset (optionally per symbol). */
  data: (dataset: string, param?: string | null) => (param ? `${KEY_PREFIX}:data:${dataset}:${param}` : `${KEY_PREFIX}:data:${dataset}`),
  /** Sorted set of on-demand requests: member "dataset|param", score = expiry epoch ms. */
  demand: `${KEY_PREFIX}:demand`,
  /** Keyed CDA calls made on a UTC date. */
  callsTotal: (date: string) => `${KEY_PREFIX}:calls:${date}`,
  /** Hash: dataset id -> calls on a UTC date. */
  callsByDataset: (date: string) => `${KEY_PREFIX}:calls:${date}:by-dataset`,
  /** Hash: HTTP status -> calls on a UTC date. */
  callsByStatus: (date: string) => `${KEY_PREFIX}:calls:${date}:by-status`,
  /** Worker status JSON, refreshed every few seconds with a short TTL. */
  heartbeat: `${KEY_PREFIX}:worker:heartbeat`,
  /** Single-poller lock so two workers never double the call budget. */
  lock: `${KEY_PREFIX}:worker:lock`,
  /** Jev (TypeSafe) daily counters: calls, input tokens, output tokens, errors. */
  jevCounter: (date: string, what: "calls" | "input_tokens" | "output_tokens" | "errors") => `${KEY_PREFIX}:jev:${date}:${what}`,
  /** Hash of Jev news reads for one model version: event id -> JSON. Kept permanently. */
  jevNews: (model: string) => `${KEY_PREFIX}:jev:news:${model}`,
  /** Hash of Jev squeeze reads for one model version: alert id -> JSON. */
  jevSqueeze: (model: string) => `${KEY_PREFIX}:jev:squeeze:${model}`,
  /** Last model version the API resolved JEV_MODEL to (e.g. jev-latest -> jev-1.13.0). */
  jevResolvedModel: `${KEY_PREFIX}:jev:resolved-model`,
  /** Rolling header-KPI history (JSON KpiHistory) the worker records every few minutes. */
  kpiHistory: `${KEY_PREFIX}:kpi:history`,
} as const;

export const demandMember = (dataset: string, param: string) => `${dataset}|${param}`;

export function parseDemandMember(member: string): { dataset: string; param: string } | null {
  const i = member.indexOf("|");
  if (i <= 0) return null;
  return { dataset: member.slice(0, i), param: member.slice(i + 1) };
}

/** UTC date (YYYY-MM-DD) used to bucket the daily call counter. */
export function utcDate(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}
