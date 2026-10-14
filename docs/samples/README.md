# CDA response samples

Real CryptoDataApi responses, saved verbatim with a Pro Plus key on 2026-10-14 (UTC). They
cover every Phase 1 endpoint, the four market-moving news endpoints (section 3.8), the three
Pro Plus history endpoints, and the event stream (`/stream/recent`, `/stream/delayed`). Nothing was trimmed; it is all public
market data. `/auth/keys/me` was called but deliberately not saved, because it contains the
account email.

[index.json](index.json) maps each file to the endpoint (with query) that produced it and the
dataset id it validates against. The schemas in `packages/schemas` were tightened from these
files; re-check them after refreshing a sample:

```bash
pnpm --filter @cqd/schemas check-samples
```

These files are also the data behind demo mode: the keyless worker seeds its cache from them and
the static GitHub Pages build bundles them (see "Demo mode" in the root README). In
`index.json`, `param` is the symbol of a per-symbol sample, `demo: false` keeps a file out of the
demo (for example a quiet squeeze-alerts capture), and `stream: true` marks a stream capture that
the demo replays. `check-samples` fails when a registry dataset or the stream has no demo sample,
so add a sample with every new dataset.

Known gap: no `whale_position` stream event appeared in the captured windows, so that event's
schema follows the endpoint description only.
