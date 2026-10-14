# Crypto Quant Dashboard: Development Plan

A real-time quant dashboard for Hyperliquid perps and the wider crypto market, powered entirely by
[CryptoDataApi.com](https://cryptodataapi.com) (CDA). Every number on screen comes from the CDA REST
API or its SSE event stream. Nothing is computed locally that CDA already computes.

Researched 2026-10-14 against the live OpenAPI spec (`https://cryptodataapi.com/api`, 226 endpoints).

---

## 1. Key constraints that shape the design

Updated 2026-10-14: the key is **Pro Plus** (confirmed via `GET /api/v1/auth/keys/me`, tier
`pro_plus`), not Pro.

| Constraint | Value (Pro Plus tier) | Consequence |
|---|---|---|
| Rate limit | 120 req/min, 50,000 req/day, per key and shared with other tooling on the same key | Browsers must never call CDA directly. One server-side poller fetches each dataset on a schedule and caches it. All users read from our cache. The poller runs a 100/min token bucket and a 30,000 calls/day budget for the dashboard, leaving 20,000/day of headroom for other tooling. |
| API key | Single `X-API-Key` header, `cdk_live_...` | Key lives only on the server (env var, read by the worker only). Never shipped to the client. |
| Key introspection | `GET /api/v1/auth/keys/me` reports tier, per-minute and daily limits, and account-wide `requests_today` | The worker reads it every 10 minutes: it caps the limiter at the key's per-minute limit minus 2, caps our daily budget at 95% of the key's daily limit, pauses if the whole account nears its limit, and skips endpoints above the key's tier without spending a call. |
| Live stream | `GET /api/v1/stream` (SSE), Pro and Pro Plus, max 3 concurrent streams per key | Server opens one SSE connection to CDA and fans out to all browser clients over our own SSE endpoint. |
| Pro-gated endpoints | regimes, GEX, whales, depth, positioning return 403 on Free | Poller handles 403 gracefully and shows a "Higher plan required" state rather than retry-spamming. |
| Pro Plus only | `/quant/history`, `/quant/regimes/history`, `/quant/whales/history`, `/quant/positioning/ladder`, `/backtesting/*` | **Available on this key, so Phase 3 is unblocked.** `quant-history`, `quant-whales-history` and `positioning-ladder` are already in the dataset registry as on-demand datasets (no polling cost until a page reads them). |
| Refresh cadences | Regimes 15 min, GEX/whales/depth ~5 min, liquidations rolling, calendar daily | Poll each dataset at its native cadence; faster polling buys nothing. |

### Polling budget (Pro key, steady state)

| Dataset | Endpoint | Interval | Calls/hour |
|---|---|---|---|
| Market regime | `/quant/market` | 5 min | 12 |
| All coin regimes + risk | `/quant/coins/risk` | 5 min | 12 |
| Long-term regime | `/regimes/current` | 15 min | 4 |
| Market health | `/market-health/summary` | 5 min | 12 |
| GEX (BTC, ETH, SOL, HYPE + open coins) | `/quant/gex?symbol=X` | 5 min each | ~60 |
| Whales | `/quant/whales` | 5 min | 12 |
| Volume scanner | `/volume/scanner` | 2 min | 30 |
| Liquidity depth (all coins) | `/liquidity/depth` | 2 min | 30 |
| Liquidity regime | `/liquidity/regime` | 5 min | 12 |
| OI divergence | `/liquidity/oi-divergence` | 5 min | 12 |
| L2 book (focused coin, only while view is open) | `/hyperliquid/l2-book?coin=X` | 15 s | up to 240 |
| Liquidations | `/market-intelligence/liquidations` | 2 min | 30 |
| Squeeze alerts | `/market-intelligence/squeeze-alerts` | 1 min | 60 |
| Event calendar + score | `/event/regime`, `/event/calendar` | 30 min | 4 |
| Volatility regime | `/volatility/regime` | 5 min | 12 |
| Funding + OI | `/derivatives/summary` | 2 min | 30 |
| Fear & Greed, macro | `/sentiment/fear-greed`, `/sentiment/macro` | 30 min | 4 |
| Policy / security / meme scores | `/policy/regime/score` etc. | 15 min | 12 |
| **Total** | | | **~350/hour idle, ~600/hour with order book open** |

The table above was the original Pro estimate (~350/hour). As built, the scheduled registry is
298 calls/hour (7,152/day) because GEX and positioning use one comma-list call each and several
endpoints were merged. Against the Pro Plus key that is about 14% of the 50,000/day allowance and
about a quarter of the dashboard's 30,000/day budget, so on-demand reads (L2 book, drawers, depth
history, and the Phase 3 history endpoints) have ample room. The header's budget meter shows both
the dashboard's calls today and the whole key's usage. Liquidation fills arrive live over SSE
anyway, so the REST poll for liquidations only refreshes the rolling-window totals.

---

## 2. Tech stack

- **Next.js 15 (App Router) + TypeScript**: one repo for UI and API proxy routes.
- **Tailwind CSS + shadcn/ui**: dark-first trading UI, fast to build, consistent.
- **TanStack Query**: client-side cache keyed to our proxy endpoints, `refetchInterval` matched to each dataset's cadence.
- **Charts**: `lightweight-charts` (TradingView) for price/candles and time-based heatmaps; Recharts for distributions, bars, gauges and sparklines.
- **Server state**: Redis (Upstash in prod, Docker locally) shared between poller and web. Poller writes `cda:<dataset>` keys with TTLs; Next route handlers read them.
- **Stream relay**: a long-lived Node process holds one SSE connection to CDA, keeps a ring buffer, and fans out to browsers via our own `/api/stream`. Reconnects use `since_id` so no events are lost.
- **Validation**: Zod schemas generated from the OpenAPI spec so every CDA response is typed and shape-checked at the boundary.
- **Deploy**: Vercel for the Next app; a small Fly.io or Railway container for the poller + relay (they need a long-lived process).

```
crypto-quant-dashboard/
  apps/
    web/          Next.js dashboard + /api proxy routes
    worker/       poller loops + SSE relay, one Node process
  packages/
    cda-client/   typed fetch client generated from openapi.json, rate-limit aware
    schemas/      Zod schemas + shared TS types
  docs/
```

---

## 3. Feature map

### 3.1 Market Regimes (short-term HMM) — `/market-regimes`
Source: `/quant/market`, `/quant/coins/risk`, `/quant/coins/{symbol}`, `/quant/model`.
- Hero card: market-wide regime (one of 6), time in regime, calibrated confidence, 24h risk odds
  (vol spike %, >5% drop %), 24h outcome distribution bar (strong fall to strong rise), simulated 5/50/95 range.
- Regime grid: all ~178 perps as tiles coloured by regime, sized by OI, with confidence. Click opens the coin drawer.
- Coin drawer: directional / volatility / funding / liquidation-risk / OI / transition probability
  bars, the `explain.features` z-scores, hysteresis state, calibration numbers.
- Model card panel from `/quant/model` (version, last retrain, data staleness).

### 3.2 Long-term Regimes (cycle phase) — `/regimes`
Source: `/regimes/current`, `/regimes`, `/market-health/summary`, `/market-health/components`.
- 10-phase cycle ring with the current phase highlighted and its playbook (bias, leverage, hold period).
- Market health 0 to 100 gauge, short-term and long-term scores, component breakdown.
- Header stat strip shared across all pages: total mcap, 24h vol, BTC dominance, OI, HL OI, 24h liqs, L/S ratio, whale short share.
- Supporting regime scores as small gauges: volatility, liquidity, policy, security, event, meme (each has a `/score` endpoint).

### 3.3 Quant Gamma (dealer GEX) — `/quant-gamma`
Source: `/quant/gex?symbol=`, `/quant/gex/history`, `/quant/positioning`.
- Per-coin card: mark, MM net inventory (long/short), gamma flip price and % distance, regime flag
  (`amplify` / `dampen` / `transitional`), dealer count.
- Gamma profile chart: liquidation density by 0.5% price bin over ±50%, mirrored around mark, flip line drawn.
- `distribution_context` percentile chips (near-mark density, distance to flip, skew, regime score, funding) vs 30-day history.
- 30-day sparklines from `/gex/history` (hourly ring).
- Positioning tab: net delta by trader class (`market_maker`, `whale`, `smart_money`).

### 3.4 Volume Scanner — `/volume-scanner`
Source: `/volume/scanner`, `/volume/scanner/{symbol}`.
- Sortable table of all perps: price, 24h notional, change vs last settled day, 7d sparkline, 30d mean/median, multiplier, activity band.
- Filters: band, min multiplier. Summary strip: total notional, count at 2x or more, most active vs normal.
- Coin click opens the 30-day series chart.

### 3.5 Quant Order Books — `/quant-order-books`
Source: `/liquidity/depth`, `/liquidity/depth/{coin}`, `/hyperliquid/l2-book`, `/liquidity/regime`, `/liquidity/oi-divergence`.
- Depth table for all coins: spread bps, depth within ±10/25/100 bps, imbalance, OI, liquidity regime label.
- Focused coin: live L2 ladder (bids/asks, size, order count) refreshed while open, plus a ±50 bps
  liquidity heatmap over the last 6h built from our own cached snapshots.
- Each book is paired with its HMM regime label from 3.1 as corroboration, matching the CDA page.
- OI-divergence panel: OI vs price across 1h/4h/24h, ranked, with "fragile positioning" callouts.

### 3.6 Liquidations — `/liquidations`
Source: `/market-intelligence/liquidations`, `/liquidations/by-exchange`, `/squeeze-alerts`, SSE `liquidation` events.
- Totals for 1h/4h/12h/24h with long/short split (treated as levels, never summed across polls).
- Heatmap tiles: top coins by 24h liquidations, brightness by size, long/short split per tile.
- By-exchange breakdown (OKX, Bybit, Hyperliquid).
- Live tape: scrolling feed of liquidation events from the stream, filterable by coin and min USD.
- Squeeze alerts banner: one-sided abnormal flow right now, with severity and the liquidated side.

### 3.7 Calendar — `/calendar`
Source: `/event/regime`, `/event/calendar`, `/event/regime/{symbol}`, `/supply/unlocks`.
- Event Risk score + band, next 7d / 30d counts, feed mix.
- Upcoming catalysts table: date, type (unlock / macro / depeg / mint-burn), event, bias, magnitude, source. Filters by type, symbol, bias, min magnitude.
- Recent catalysts list. Per-symbol overlay in the coin drawer.

### 3.8 Extras worth adding (all available on Pro)
- **Whale Radar** (`/quant/whales`): positioning of accounts at $100k or more, directional net excluding MMs, top coins by whale notional, class split. Pairs naturally with GEX.
- **Live Event Stream page** (`/stream`): unified real-time feed of liquidations, $1M+ whale transfers, top-trader position changes, funding prints, OI jumps and 1-min price moves. The most exciting single surface the API offers, from one SSE connection.
- **Top Traders / Copy Signals** (`/hyperliquid/top-traders`, `/copy-signals`, `/wallet-signals`): leaderboard and position-change signals.
- **Funding & OI** (`/derivatives/summary`, `/hyperliquid/funding-rates`, `/open-interest`): cross-exchange funding table with extremes highlighted.
- **Volatility Index** (`/volatility/index`, `/volatility/implied`): CVI per coin and BTC/ETH implied vol.
- **Sentiment strip**: Fear & Greed, stablecoin dry powder, Coinbase premium, ETF flows.
- **Market-moving news** (`/news/market-moving`, `/news/pulse`): scored headlines, shown next to the liquidation tape so cause and effect sit together.
- **Technical screener** (`/indicators/technical`, `/indicators/heatmap`): MA state and RSI extremes across the universe.

---

## 4. Phased delivery

### Phase 0: Foundation
1. Monorepo scaffold (pnpm workspaces), Next.js app, Tailwind, shadcn, TanStack Query.
2. `packages/cda-client`: generate types from `openapi.json`; wrap fetch with the API key, a token-bucket limiter (28/min to stay under 30), retry-with-backoff on 429, no retry on 403.
3. `apps/worker` poller: dataset registry (endpoint, interval, cache key, TTL), Redis writes, daily call counter, structured logs.
4. `/api/data/[dataset]` proxy route reading from Redis. `/api/stream` SSE relay.
5. App shell: dark layout, nav, shared header stat strip, "data as of" timestamps on every panel, Pro-required and stale-data states.

### Phase 1: The seven requested pages
Build in this order, since each reuses the previous: Market Regimes, Long-term Regimes, Volume
Scanner, Liquidations (with live tape), Order Books, Quant Gamma, Calendar.

### Phase 2: Extras and polish
Whale Radar, Live Stream page, Funding/OI, Volatility, Sentiment strip, News. A coin drawer that
aggregates everything for one symbol (regime, GEX, whales, depth, liquidations, calendar overlay,
news). Watchlist in localStorage. Mobile layout pass.

### Phase 3: History and backtesting (requires Pro Plus)
**Unblocked (2026-10-14):** the key is Pro Plus, so every endpoint below is available today.
`quant-history`, `quant-whales-history` and `positioning-ladder` are already registered as
on-demand datasets with schemas checked against real responses (docs/samples/), so the first
Phase 3 pages only need UI. The ladder's bins share the GEX profile-bin shape, so the existing
gamma profile chart can render it.

Regime timeline since 2020, GEX/whale history charts, positioning ladder, liquidation density
archives, and a "what the model said vs what happened" scorecard from `/quant/history`.

---

## 5. Open questions

1. **Tier**: resolved. The key is Pro Plus, so Phase 3 (history and backtesting) is unblocked and
   can move up. Three Pro Plus endpoints are already registered as on-demand datasets; open
   question is only ordering versus the Phase 2 extras.
2. **Audience**: private tool or public? Public changes nothing in the data layer (the cache already
   isolates CDA from user count) but adds auth, abuse protection and attribution to CDA.
3. **Hosting**: Vercel + Fly.io as proposed, or a single VPS running everything?
4. **Coin focus**: default GEX/order-book set is BTC, ETH, SOL, HYPE plus whatever is open. OK?

---

## 6. Immediate next steps

1. Receive the Pro key, store as `CDA_API_KEY` in `.env.local` (already gitignored).
2. Smoke-test every Phase 1 endpoint with the key and save real responses under `docs/samples/`
   so schemas are built from real data, not just the spec.
3. Scaffold Phase 0.
