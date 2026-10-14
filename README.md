# Crypto Quant Dashboard

A real-time quant dashboard for Hyperliquid perps and the wider crypto market, powered by
[CryptoDataApi](https://cryptodataapi.com) (CDA). Every number on screen comes from the CDA REST
API or its live event stream; the app does not model anything CDA already computes.

**Status:** Phase 0 (foundation), Phase 1 (the seven pages) and the market-moving news page
(PLAN.md section 3.8) from [docs/PLAN.md](docs/PLAN.md) are built and verified against live data
with a Pro Plus key. Phase 2 (history and
backtesting) is unblocked by the Pro Plus key; its first three datasets are already registered.

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
| `/news` | Market-moving news | `/news/market-moving`, `/news/pulse`, `/news/sources`, `/news/coin/{symbol}` |

The news tape also appears as a compact panel beside the liquidation tape on `/liquidations`, and
per-coin news appears in the Market Regimes coin drawer.

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
- **A CDA Pro or Pro Plus key** for live data (optional: without it the app runs in keyless mode).

### Setup

```bash
git clone https://github.com/Crypto-Data-API/crypto-quant-dashboard.git
cd crypto-quant-dashboard
pnpm install
cp .env.example .env          # then set CDA_API_KEY=cdk_live_...
docker compose up -d redis    # local Redis on 6379
pnpm dev                      # worker (port 4100) + web (port 3001) together
```

Open <http://localhost:3001>. To run the two processes in separate terminals instead:

```bash
pnpm dev:worker   # poller + stream relay, http://localhost:4100
pnpm dev:web      # Next.js, http://localhost:3001
```

There is one `.env`, at the repo root; no `.env.local` copies are needed. The worker loads the whole
file (real environment variables win). The web app's `next.config.ts` loads the same file but takes
only `REDIS_URL`, `WORKER_URL`, `WORKER_TOKEN` and `NEXT_PUBLIC_STREAM_URL`: it never calls CDA, so
the key stays out of the Next.js process entirely.

Production build and start:

```bash
pnpm build
pnpm start:worker   # node apps/worker/dist/index.js
pnpm start:web      # next start on port 3001
```

### Keyless mode

With `CDA_API_KEY` empty the app still builds and runs. The worker logs a warning, makes no keyed
calls, and writes an `API key not configured` state for every keyed dataset. It still polls the
keyless `/api/v1/health`, and the live tape replays CDA's free `/api/v1/stream/delayed` preview at
its original pace (about 31 minutes behind real time, labelled DELAYED PREVIEW).

## Environment variables

All variables live in the repo-root `.env` (see [.env.example](.env.example)). The worker loads the
whole file; the web app loads only `REDIS_URL`, `WORKER_URL`, `WORKER_TOKEN` and
`NEXT_PUBLIC_STREAM_URL`, so the CDA key never enters the Next.js process. The web app's port is
fixed at 3001 in `apps/web/package.json` (`next dev -p 3001`, `next start -p 3001`).

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `CDA_API_KEY` | empty | worker | CDA key (`cdk_live_...`). Empty means keyless mode. |
| `CDA_BASE_URL` | `https://cryptodataapi.com` | worker | API origin. |
| `REDIS_URL` | `redis://localhost:6379` | both | Shared cache. `off` disables Redis; unreachable Redis falls back to memory. |
| `WORKER_PORT` | `4100` | worker | Worker HTTP port. |
| `WORKER_URL` | `http://localhost:4100` | web | Where the web app reaches the worker (fallback reads, stream proxy). |
| `WORKER_TOKEN` | empty | both | Optional bearer token for the worker's `/status` and `/data` routes. |
| `CDA_RATE_PER_MIN` | `100` | worker | Token bucket rate (max 115). Lowered automatically to the key's per-minute limit minus 2. |
| `CDA_DAILY_BUDGET` | `30000` | worker | The dashboard's daily keyed-call budget. Capped automatically at 95% of the key's daily limit. |
| `ON_DEMAND_MAX` | `16` | worker | Maximum on-demand datasets polled at once; extra requests wait as pending. |
| `WORKER_CORS_ORIGIN` | `*` | worker | CORS origin for the public `/stream` endpoint (for example `http://localhost:3001`). |
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

The key is **Pro Plus**: 120 requests per minute and 50,000 per day, counted per key and shared with
any other tooling that uses the same key. The dashboard targets well under that: 100 requests per
minute and a 30,000-call daily budget, leaving 20,000 calls a day for other tooling. The budget is
enforced in four layers.

0. **Key introspection.** At startup and every 10 minutes the worker reads `GET /api/v1/auth/keys/me`
   (about 144 calls/day). It sets the limiter to `min(CDA_RATE_PER_MIN, per_minute_limit - 2)`,
   caps the daily budget at 95% of `daily_limit`, tracks the whole key's `requests_today`, and
   skips any dataset whose `tier` is above the key's tier without spending a call. A Pro key is
   therefore held to 28/min and 9,500/day automatically.
1. **Token bucket (per minute).** 100 requests/minute with burst 1, so at most 101 requests start in
   any rolling minute against the 120 limit. Scheduled polls, on-demand reads and stream
   reconnects share it; on-demand reads have priority. A 429 pauses the whole bucket for
   `Retry-After` (or exponential backoff) and retries up to 3 times. 401, 402 and 403 are never
   retried: the envelope records `unauthorized` or `pro_required` and the worker re-checks hourly.
2. **Daily counter.** Every keyed HTTP attempt increments `cqd:calls:<UTC date>` plus per-dataset
   and per-status hashes (kept 3 days). A restarted worker reads today's count back from Redis.
   The header's Budget pill shows calls used today.
3. **Governor (per day).** The worker compares calls used with a pace line (the daily budget spread
   evenly over the UTC day, plus 4% slack for startup). Ahead of the line it stretches every
   interval by 2x (4x past 95% of the budget). Within 25 calls of the budget, or when the whole
   key is within 1% of its daily limit, it pauses keyed polling until 00:00 UTC and panels show
   "Daily budget reached". The Budget pill shows the dashboard's calls and the whole key's usage.

Scheduled load at the registry's intervals is **326 calls/hour (7,824/day)**, about a quarter of the
dashboard's budget. The L2 ladder is the most expensive on-demand dataset at 240 calls/hour while
the order-book page is open. Intervals follow CDA's own refresh cadences, so the extra Pro Plus
headroom is left for on-demand reads and Phase 2 rather than spent on faster polling.

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
| news-market-moving | `/news/market-moving?hours=168&limit=200` | 5 min | 12 |
| news-pulse | `/news/pulse?hours=24` | 5 min | 12 |
| news-sources | `/news/sources` | 15 min | 4 |

On-demand datasets: `quant-coin` (5 min), `quant-gex-coin` (5 min), `gex-history` (30 min),
`volume-detail` (10 min), `l2-book` (15 s), `depth-history` (2 min), `event-symbol` (30 min),
`news-coin` (5 min), and the
Pro Plus `quant-history`, `quant-whales-history` and `positioning-ladder` (registered for Phase 2,
not yet used by a page). At most 16 run at once (`ON_DEMAND_MAX`). Tune intervals in
[packages/schemas/src/datasets.ts](packages/schemas/src/datasets.ts); `budgetPerHour()` recomputes
the scheduled total.

### Adding a dataset

1. Add an entry to `DATASETS` in [packages/schemas/src/datasets.ts](packages/schemas/src/datasets.ts).
   The `path` is type-checked against the OpenAPI spec. Set `tier` (`free`, `pro`, `pro_plus`),
   an `intervalMs`, and either nothing (scheduled), a `param` (on-demand per symbol) or
   `onDemand: true`. Query values may be functions, for example
   `start: (now) => new Date(now - 7 * DAY).toISOString()`.
2. Add its payload type to `DatasetDataMap` and its Zod schema to `validators.ts` (run `pnpm gen`
   if the schema comes from the spec).
3. Read it from a page with `useDataset("<id>", { param })` inside a `Panel`.

The worker, cache, proxy route, panel states, tier gating and budget accounting need no changes.

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
    samples/                verbatim Pro Plus responses for every endpoint used, with index.json
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
| `pnpm --filter @cqd/schemas check-samples` | Validates every file in `docs/samples/` against the schemas (stream samples event by event). |
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
- **Port 3001** for the web app (`next dev -p 3001`), to avoid clashing with other local apps on 3000.
- **Budget sized for Pro Plus.** 100/min and 30,000/day instead of the plan's Pro numbers, adapted
  automatically from `/auth/keys/me` if the key's tier changes.

## Known gaps

- Schemas for the untyped endpoints were tightened from one capture
  ([docs/samples](docs/samples/README.md)). Fields the descriptions say can be null for warming or
  thin-coverage coins stay nullable; a mismatch is logged as drift, never dropped.
- No `whale_position` stream event was captured yet, so its schema follows the endpoint
  description.
- Phase 2 (history and backtesting) is unblocked by the Pro Plus key; no Phase 2 page exists yet.

## License

TBD
