# Crypto Quant Dashboard

A real-time quant dashboard for Hyperliquid perps and the wider crypto market, powered by
[CryptoDataApi](https://cryptodataapi.com) (CDA). Every number on screen comes from the CDA REST
API or its live event stream; the app does not model anything CDA already computes.

**Status:** Phase 0 (foundation) and Phase 1 (the seven pages) from [docs/PLAN.md](docs/PLAN.md)
are built. Phase 2 extras and Phase 3 history panels are not started.

| Route | Page | Main CDA sources |
|---|---|---|
| `/` | Overview | `/quant/market`, `/market-health`, `/regimes`, `/market-intelligence/liquidations`, `/squeeze-alerts`, live stream |
| `/market-regimes` | Market Regimes (short-term HMM) | `/quant/market`, `/quant/coins/risk`, `/quant/coins/{symbol}`, `/quant/model` |
| `/regimes` | Cycle Regimes (10 phases) | `/regimes`, `/market-health`, six `/…/score` endpoints |
| `/quant-gamma` | Quant Gamma (dealer GEX analog) | `/quant/gex`, `/quant/gex/history`, `/quant/positioning` |
| `/volume-scanner` | Volume Scanner | `/volume/scanner`, `/volume/scanner/{symbol}` |
| `/quant-order-books` | Order Books | `/liquidity/depth`, `/liquidity/depth/{coin}`, `/hyperliquid/l2-book`, `/liquidity/regime`, `/liquidity/oi-divergence` |
| `/liquidations` | Liquidations | `/market-intelligence/liquidations`, `/liquidations/by-exchange`, `/squeeze-alerts`, live stream |
| `/calendar` | Calendar | `/event/regime/score`, `/event/calendar`, `/event/regime/{symbol}`, `/supply/unlocks` |

Every page shares the header stat strip and the system status pills (worker, API key, daily
budget meter, stream source). Every panel shows a "data as of" time, a stale badge, and an
explicit state when there is no data: waiting for the first poll, API key not configured, Pro
plan required, key rejected, rate limited, daily budget reached, fetch failed, or worker offline.

## Quick start

### Prerequisites

- **Node.js 20.12 or newer** (developed on 22.6). The worker uses `process.loadEnvFile`.
- **pnpm 10.** Run `corepack enable`, or `npm i -g pnpm@10` if corepack cannot write to your
  Node install directory.
- **Docker** for the local Redis (optional: without Redis everything still runs in memory).
- **A CDA Pro key** for live data (optional: without it the app runs in keyless mode).

### Setup

```bash
git clone https://github.com/Crypto-Data-API/crypto-quant-dashboard.git
cd crypto-quant-dashboard
pnpm install
cp .env.example .env          # then set CDA_API_KEY=cdk_live_...
docker compose up -d redis    # local Redis on 6379
pnpm dev                      # worker (port 4100) + web (port 3100) together
```

Open <http://localhost:3100>. To run the two processes in separate terminals instead:

```bash
pnpm dev:worker   # poller + stream relay, http://localhost:4100
pnpm dev:web      # Next.js, http://localhost:3100
```

Production build and start:

```bash
pnpm build
pnpm start:worker   # node apps/worker/dist/index.js
pnpm start:web      # next start on port 3100
```

### Keyless mode

With `CDA_API_KEY` empty the app still builds and runs. The worker logs a warning, makes no keyed
calls, and writes an `API key not configured` state for every keyed dataset. It still polls the
keyless `/api/v1/health`, and the live tape replays CDA's free `/api/v1/stream/delayed` preview at
its original pace (about 31 minutes behind real time, labelled DELAYED PREVIEW).

## Environment variables

All variables live in the repo-root `.env` (see [.env.example](.env.example)). The worker loads the
whole file; the web app loads only `REDIS_URL`, `WORKER_URL`, `WORKER_TOKEN` and
`NEXT_PUBLIC_STREAM_URL`, so the CDA key never enters the Next.js process.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `CDA_API_KEY` | empty | worker | CDA key (`cdk_live_...`). Empty means keyless mode. |
| `CDA_BASE_URL` | `https://cryptodataapi.com` | worker | API origin. |
| `REDIS_URL` | `redis://localhost:6379` | both | Shared cache. `off` disables Redis; unreachable Redis falls back to memory. |
| `WORKER_PORT` | `4100` | worker | Worker HTTP port. |
| `WORKER_URL` | `http://localhost:4100` | web | Where the web app reaches the worker (fallback reads, stream proxy). |
| `WORKER_TOKEN` | empty | both | Optional bearer token for the worker's `/status` and `/data` routes. |
| `CDA_RATE_PER_MIN` | `28` | worker | Token bucket rate (capped at 28). |
| `CDA_DAILY_BUDGET` | `10000` | worker | Daily keyed-call budget for the governor. |
| `STREAM_SOURCE` | `auto` | worker | `auto`, `live`, `delayed` or `off`. |
| `GEX_SYMBOLS` | `BTC,ETH,SOL,HYPE` | worker | Coins polled on a schedule for GEX and positioning. |
| `LOG_LEVEL` | `info` | worker | `debug`, `info`, `warn`, `error`. Set `LOG_FORMAT=pretty` for terminal output. |
| `NEXT_PUBLIC_STREAM_URL` | empty | web | Production only: point browsers straight at the worker's `/stream`. |

## Architecture

```
                 CryptoDataApi (REST + SSE)
                          |
                          |  one API key, 28 req/min token bucket, daily budget governor
                          v
  apps/worker  ---------------------------------------------------------------
  | poller: dataset registry -> fetch -> Zod drift check -> envelope          |
  | stream relay: 1 SSE connection to CDA -> ring buffer (5,000 events)       |
  | HTTP :4100  /healthz  /status  /data/:dataset  /stream                    |
  ---------------------------------------------------------------------------
          | envelopes, heartbeat, call counters        ^ on-demand interest
          v                                            |
        Redis (cqd:data:*, cqd:demand, cqd:calls:*, cqd:worker:*)
          |
          v
  apps/web (Next.js 15) ------------------------------------------------------
  | /api/data/[dataset]  reads Redis; falls back to the worker's /data        |
  | /api/status          worker heartbeat, budget, stream state               |
  | /api/stream          same-origin SSE proxy to the worker's /stream        |
  | pages: TanStack Query on /api/data, EventSource on /api/stream            |
  ---------------------------------------------------------------------------
                          ^
                       browsers (never see the key, never call CDA)
```

- **One poller.** `apps/worker` is the only process that talks to CDA. A Redis lock
  (`cqd:worker:lock`, 15 s TTL) makes sure a second worker stands by instead of doubling spend.
- **Envelopes.** Each dataset is cached as `{status, data, fetchedAt, asOf, intervalMs,
  staleAfterMs, error, validation}`. A failed fetch keeps the last good data, so panels show
  stale data with a badge rather than going blank.
- **Validation.** Responses are checked against Zod schemas generated from the OpenAPI spec
  (plus hand-written loose schemas for the endpoints the spec leaves untyped). A failure is
  logged and recorded on the envelope; the data is still served.
- **On-demand datasets.** Per-symbol endpoints (coin drawer, L2 book, depth history, GEX history,
  volume series, catalyst overlay) poll only while someone is looking. Each read registers
  interest in a Redis sorted set with a short TTL; the worker polls active entries at a higher
  limiter priority and drops them when interest lapses.
- **Redis fallback.** If Redis is unset or down, the worker keeps an in-memory cache and the
  web app reads through the worker's `/data` route. If neither is reachable the UI shows
  "Worker offline".

### Stream fan-out decision

The worker owns the fan-out. It holds the single upstream SSE connection to CDA (reconnecting with
`since_id`, so nothing is lost), keeps a 5,000-event ring buffer, and serves browsers from its own
`/stream` endpoint with server-side type, symbol and size filters. Reconnecting browsers send
`Last-Event-ID` and are replayed from the buffer; new connections get a short backfill so the tape is
never empty.

`apps/web` exposes `/api/stream` as a thin same-origin proxy to that endpoint, which keeps local
development to one origin. On a serverless host (for example Vercel), long-lived function
responses are capped, so set `NEXT_PUBLIC_STREAM_URL` to the worker's public `/stream` URL and
browsers connect to the worker directly (it sends CORS headers; restrict them with
`WORKER_CORS_ORIGIN`). This avoids a Redis pub/sub hop and keeps CDA's 3-stream limit at one
connection no matter how many browsers are open.

## Rate-limit budget

CDA Pro allows 30 requests per minute and 10,000 per day. The budget is enforced in three layers.

1. **Token bucket (per minute).** 28 requests/minute with burst 1, so at most 29 requests start in
   any rolling minute. Scheduled polls, on-demand reads and stream reconnects share it; on-demand
   reads have priority. A 429 pauses the whole bucket for `Retry-After` (or exponential backoff)
   and retries up to 3 times. 401, 402 and 403 are never retried: the envelope records
   `unauthorized` or `pro_required` and the worker re-checks hourly.
2. **Daily counter.** Every keyed HTTP attempt increments `cqd:calls:<UTC date>` plus per-dataset
   and per-status hashes (kept 3 days). A restarted worker reads today's count back from Redis.
   The header's Budget pill shows calls used today.
3. **Governor (per day).** The worker compares calls used with a pace line (the daily budget spread
   evenly over the UTC day, plus 400 calls of slack for startup). Ahead of the line it stretches
   every interval by 2x (4x past 95% of the budget). Within 25 calls of the budget it pauses keyed
   polling until 00:00 UTC and panels show "Daily budget reached".

Scheduled load at the registry's intervals is **298 calls/hour (7,152/day)**, leaving roughly 2,800
calls/day for on-demand reads. The L2 ladder is the most expensive on-demand dataset at 240
calls/hour while the order-book page is open.

| Dataset | Endpoint | Interval | Calls/hour |
|---|---|---|---|
| quant-market | `/quant/market` | 5 min | 12 |
| quant-coins-risk | `/quant/coins/risk` | 5 min | 12 |
| quant-model | `/quant/model` | 60 min | 1 |
| regimes | `/regimes` | 15 min | 4 |
| market-health | `/market-health` | 5 min | 12 |
| score-volatility, -policy, -security, -event, -meme | `/…/regime/score` | 15 min each | 20 |
| derivatives-summary | `/derivatives/summary?coin=BTC` | 5 min | 12 |
| quant-gex | `/quant/gex?symbol=BTC,ETH,SOL,HYPE` | 5 min | 12 |
| quant-positioning | `/quant/positioning?symbol=…` | 5 min | 12 |
| quant-whales | `/quant/whales` | 5 min | 12 |
| volume-scanner | `/volume/scanner` | 2 min | 30 |
| liquidity-depth | `/liquidity/depth` | 2 min | 30 |
| liquidity-regime | `/liquidity/regime` | 5 min | 12 |
| oi-divergence | `/liquidity/oi-divergence` | 5 min | 12 |
| liquidations | `/market-intelligence/liquidations` | 2 min | 30 |
| liquidations-by-exchange | `/market-intelligence/liquidations/by-exchange` | 5 min | 12 |
| squeeze-alerts | `/market-intelligence/squeeze-alerts` | 1 min | 60 |
| event-calendar | `/event/calendar?window_days=30` | 30 min | 2 |
| supply-unlocks | `/supply/unlocks?window_days=30` | 60 min | 1 |

On-demand datasets: `quant-coin` (5 min), `quant-gex-coin` (5 min), `gex-history` (30 min),
`volume-detail` (10 min), `l2-book` (15 s), `depth-history` (2 min), `event-symbol` (30 min).
At most 8 run at once (`ON_DEMAND_MAX`). Tune intervals in
[packages/schemas/src/datasets.ts](packages/schemas/src/datasets.ts); `budgetPerHour()` recomputes
the scheduled total.

## Project structure

```
crypto-quant-dashboard/
  apps/
    web/                    Next.js 15 App Router, Tailwind v4, shadcn-style UI, TanStack Query
      src/app/              pages and /api routes (data, status, stream)
      src/components/       app shell, Panel (freshness + states), charts, ui primitives
      src/features/         one folder per page area (market, regimes, gamma, volume, books,
                            liquidations, calendar)
      src/lib/              hooks (datasets, stream, clock), formatting, domain vocabulary
      src/server/store.ts   Redis reader with worker fallback
    worker/                 long-lived Node process
      src/poller.ts         dataset scheduler, on-demand loop, envelopes
      src/budget.ts         daily budget governor
      src/cache.ts          memory cache with Redis mirror, demand set, call counters
      src/stream/           CDA SSE relay, delayed preview, fan-out hub
      src/http.ts           /healthz, /status, /data/:dataset, /stream
  packages/
    cda-client/             openapi.json, generated types, transport, token bucket (see its README)
    schemas/                generated Zod schemas, permissive schemas, dataset registry, envelope
  docs/
    PLAN.md                 development plan
    samples/                trimmed real CDA responses used to verify the schemas
  docker-compose.yml        local Redis
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Worker and web in watch mode. |
| `pnpm build` | Builds every package (worker bundle via tsup, Next.js production build). |
| `pnpm typecheck` | `tsc --noEmit` in every package. |
| `pnpm lint` | ESLint in every package (Next.js rules in `apps/web`). |
| `pnpm gen` | Regenerates types from `openapi.json`, then the Zod schemas. |
| `pnpm --filter @cqd/schemas check-samples` | Validates `docs/samples/*.json` against the schemas. |
| `pnpm redis:up` / `pnpm redis:down` | Starts or stops the local Redis container. |

## Decisions that differ from PLAN.md

- **`/market-health` instead of `/market-health/summary` + `/components`.** The full endpoint returns
  scores, components and indicators in one call.
- **`/regimes` instead of `/regimes/current`.** It adds the 10-phase taxonomy the ring needs at the
  same cadence.
- **GEX and positioning in one call each.** `symbol=BTC,ETH,SOL,HYPE` replaces four calls per cycle.
  Other coins are fetched on demand from the GEX page.
- **Liquidity score from `/liquidity/regime`.** Its `composite_score` is the same number as
  `/liquidity/regime/score`, so the separate call is skipped.
- **Depth heatmap from CDA's own history.** The ±50 bps heatmap uses
  `/liquidity/depth/{coin}?minutes=360` instead of snapshots we would have to accumulate, so it is
  complete the moment a coin is focused.
- **Header stat strip.** None of the Phase 1 endpoints exposes total crypto market cap or total
  24h volume. The strip shows stablecoin market cap and Hyperliquid 24h volume in their place,
  plus BTC dominance and 24h liquidations from `/regimes` signals, BTC OI across venues, Hyperliquid
  OI, the BTC long/short ratio, whale short share and Fear & Greed.
- **Playbook leverage.** `/regimes` publishes directional bias and typical duration but no leverage
  guidance, so the playbook shows what CDA publishes.
- **Fan-out from the worker** with a same-origin proxy in the web app (see above).
- **Port 3100** for the web app, to avoid clashing with other local apps on 3000.

## Known gaps

- Field shapes for `/quant/gex`, `/quant/positioning`, `/quant/whales` and the liquidation
  endpoints were checked against one day of real samples; their schemas stay loose until more
  samples (warming coins, thin coverage) are collected.
- The stream's `whale_transfer` and `whale_position` event shapes come from the endpoint
  description; no sample has been captured yet.
- Phase 2 (whale radar, stream page, funding/OI, volatility, sentiment, news, watchlist, mobile
  pass) and Phase 3 (Pro Plus history and backtesting) are not built.

## License

TBD
