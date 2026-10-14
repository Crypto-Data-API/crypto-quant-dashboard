# CDA response samples

Real CryptoDataApi responses, saved verbatim with a Pro Plus key on 2026-10-14 (UTC). They
cover every Phase 1 endpoint, the three Pro Plus history endpoints registered for Phase 3, and
the event stream (`/stream/recent`, `/stream/delayed`). Nothing was trimmed; it is all public
market data. `/auth/keys/me` was called but deliberately not saved, because it contains the
account email.

[index.json](index.json) maps each file to the endpoint (with query) that produced it and the
dataset id it validates against. The schemas in `packages/schemas` were tightened from these
files; re-check them after refreshing a sample:

```bash
pnpm --filter @cqd/schemas check-samples
```

Known gap: no `whale_position` stream event appeared in the captured windows, so that event's
schema follows the endpoint description only.
