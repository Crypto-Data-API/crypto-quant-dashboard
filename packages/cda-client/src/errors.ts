/** Why a CDA call did not return data. Drives the panel state shown in the UI. */
export type CdaErrorKind =
  | "no_api_key" // CDA_API_KEY not configured; the call was never sent
  | "payment_required" // 402: CDA wants a key or an x402 payment
  | "unauthorized" // 401: key rejected
  | "pro_required" // 403: endpoint is above this key's tier
  | "not_found" // 404
  | "bad_request" // 400 / 422
  | "rate_limited" // 429 after all retries
  | "unavailable" // 503 (cold start upstream)
  | "server_error" // other 5xx
  | "network"
  | "timeout"
  | "invalid_response"
  | "aborted";

export class CdaError extends Error {
  readonly kind: CdaErrorKind;
  readonly status: number | null;
  constructor(kind: CdaErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "CdaError";
    this.kind = kind;
    this.status = status;
  }
}

export function classifyStatus(status: number): CdaErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 402) return "payment_required";
  if (status === 403) return "pro_required";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "bad_request";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  return "server_error";
}

/** Statuses that must never be retried: retrying cannot change the answer and burns budget. */
export function isTerminalStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 402 || status === 403 || status === 404 || status === 422;
}

/** Pull a human-readable message out of a CDA / FastAPI error body. */
export function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const k of ["message", "detail", "error"]) {
      const v = b[k];
      if (typeof v === "string" && v.length > 0) return v.slice(0, 300);
      if (Array.isArray(v) && v.length > 0) {
        const first = v[0] as Record<string, unknown> | undefined;
        if (first && typeof first.msg === "string") return first.msg.slice(0, 300);
      }
    }
  }
  if (typeof body === "string" && body.trim().length > 0 && !body.trim().startsWith("<")) return body.trim().slice(0, 300);
  return fallback;
}
