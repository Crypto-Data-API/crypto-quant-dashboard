# Jev request/response samples

Real `POST https://api.typesafe.ai/v1/systemone` exchanges captured on 2026-10-14 with
`pnpm --filter @cqd/worker jev:samples`. Each file holds the exact request body the worker sends
(built with `apps/worker/src/jev/state.ts` and `questions.ts`) and the verbatim response. The
Authorization header is not stored.

| File | Classification | Notes |
|---|---|---|
| `news-catalyst.json` | News catalyst (bias, actionable, severity) | A BTC event from the news tape |
| `squeeze-alert.json` | Squeeze cascade noul | A live NEAR long-flush alert with the coin's regime and liquidity context (the script falls back to the `include_quiet` sample row when no alert is active) |
| `market-verdict.json` | Market verdict (stance, vol expansion, conviction) | Built from the six cached inputs listed in `note` |

Score answers include a `legend` (the rubric echoed back) and an expected `score` that can fall
between levels; both are handled by `JevResponse` in `packages/schemas/src/jev.ts`.
