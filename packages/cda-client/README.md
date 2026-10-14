# @cqd/cda-client

Typed, rate-limit-aware client for [CryptoDataApi](https://cryptodataapi.com), generated from
`openapi.json` (the live spec, 226 endpoints, saved here so generation is reproducible).

Only `apps/worker` uses it at runtime. The browser and the Next.js routes never call CDA.

## What is in here

| File | Purpose |
|---|---|
| `openapi.json` | The CDA OpenAPI 3.0.3 spec, checked in. |
| `scripts/gen.mjs` | Runs openapi-typescript over the spec and writes `src/generated/openapi.ts`. |
| `src/client.ts` | `createCdaClient()`: one transport for every request, plus a typed client and a registry-driven `get()`. |
| `src/limiter.ts` | Token bucket with a priority queue and a global pause for 429s. |
| `src/errors.ts` | Maps HTTP outcomes to the panel states the UI shows. |

## Generator choice: openapi-typescript + openapi-fetch

We chose **openapi-typescript + openapi-fetch** over openapi-zod-client.

- **Zero runtime for types.** openapi-typescript emits a `paths` type and nothing else. The
  dataset registry in `@cqd/schemas` types its endpoint paths against it (`GetPath`), so a
  typo or a removed endpoint fails at compile time.
- **One transport we control.** openapi-fetch accepts a custom `fetch`. Every request,
  typed or registry-driven, goes through the same function that adds the key, waits for the
  token bucket, retries 429/5xx with backoff, refuses to retry 401/402/403, and reports each
  attempt to the daily call counter.
- **Validation lives elsewhere, on purpose.** openapi-zod-client generates a zodios client with
  strict Zod 3 validators that reject a response on any drift. The dashboard wants the
  opposite: cache the data, record the drift, keep the panel alive. `@cqd/schemas` generates
  loose Zod 4 schemas from the same spec with its own small generator and validates at the
  worker boundary.

## Rate limiting and retries

- **Token bucket:** a bucket admits at most `burst + rate` requests in any rolling minute. The
  client default is 28/min with burst 1 (29 worst case, safe for a Pro key at 30/min). The worker
  runs 100/min for the Pro Plus key (120/min) and calls `limiter.setRate()` with the key's real
  per-minute limit minus 2 after reading `/auth/keys/me`.
- **Priorities:** on-demand reads (a viewer has a drawer or page open) jump ahead of scheduled
  polls; the stream connection jumps ahead of both.
- **429:** the whole bucket pauses until `Retry-After` (or an exponential backoff with jitter),
  then the request retries, up to 3 times.
- **401 / 402 / 403 / 404 / 422:** never retried. The caller caches a state instead
  (`unauthorized`, `pro_required`, and so on) and re-checks on a long timer.
- **5xx / network / timeout:** retried twice with backoff.
- **No key:** keyed paths short-circuit to `no_api_key` without any network call. Keyless
  paths (`/api/v1`, `/api/v1/health`, `/api/v1/stream/delayed`) never send the key and use a
  separate 10/minute bucket.

## Usage

```ts
import { createCdaClient, TokenBucket } from "@cqd/cda-client";

const cda = createCdaClient({
  apiKey: process.env.CDA_API_KEY,
  limiter: new TokenBucket({ ratePerMinute: 28, burst: 1 }),
  onAttempt: (e) => e.authed && countCall(e.path, e.status),
});

// Registry-driven: never throws for HTTP failures.
const res = await cda.get("/api/v1/quant/gex", { query: { symbol: "BTC,ETH" } });
if (res.ok) use(res.data);
else console.warn(res.kind, res.message); // "pro_required", "rate_limited", ...

// Fully typed, hand-written call.
const { data } = await cda.api.GET("/api/v1/health");
```

## Regenerating

```bash
curl -s https://cryptodataapi.com/api/openapi.json -o packages/cda-client/openapi.json
pnpm gen   # types here, then Zod schemas in @cqd/schemas
pnpm --filter @cqd/schemas check-samples
```

The spec reuses one operationId for GET and HEAD `/api/v1/health`; `scripts/gen.mjs`
de-duplicates it in memory before generating.
