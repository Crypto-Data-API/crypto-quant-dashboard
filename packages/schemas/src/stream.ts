/**
 * CDA live event stream (`GET /api/v1/stream`, SSE) and its keyless preview
 * (`GET /api/v1/stream/delayed`).
 *
 * Two layers:
 *  - `StreamEvent` is lenient (id, ts, type plus optional type fields). The relay gates on it,
 *    so an unfamiliar event type or an extra field is passed through, never dropped.
 *  - `StreamEventStrict` is a per-type union tightened from real events (docs/samples/
 *    stream-*.json: funding, oi_delta, price_move, liquidation, whale_transfer). It is used
 *    for drift checks. `whale_position` follows the endpoint description; no sample yet.
 */
import { z } from "zod";

export const StreamEvent = z.looseObject({
  id: z.union([z.number(), z.string()]),
  /** Event time, epoch ms. */
  ts: z.number(),
  /** When CDA saw it, epoch ms. */
  recv_ts: z.number().nullish(),
  type: z.string(),
  venue: z.string().nullish(),
  symbol: z.string().nullish(),
  // liquidation: side is the LIQUIDATED position side
  side: z.string().nullish(),
  usd: z.number().nullish(),
  px: z.number().nullish(),
  sz: z.number().nullish(),
  // whale_transfer
  exchange: z.string().nullish(),
  chain: z.string().nullish(),
  direction: z.string().nullish(),
  amount: z.number().nullish(),
  // whale_position
  action: z.string().nullish(),
  size: z.number().nullish(),
  address: z.string().nullish(),
  change_pct: z.number().nullish(),
  // funding
  rate_1h: z.number().nullish(),
  prev_rate_1h: z.number().nullish(),
  settle: z.boolean().nullish(),
  // oi_delta / price_move
  pct: z.number().nullish(),
  window_s: z.number().nullish(),
  oi_usd: z.number().nullish(),
  price: z.number().nullish(),
  prev_price: z.number().nullish(),
});
export type StreamEvent = z.infer<typeof StreamEvent>;

const base = {
  id: z.number(),
  ts: z.number(),
  recv_ts: z.number(),
  venue: z.string(),
  symbol: z.string(),
};

export const StreamEventStrict = z.discriminatedUnion("type", [
  z.looseObject({
    ...base,
    type: z.literal("liquidation"),
    side: z.enum(["long", "short"]),
    usd: z.number(),
    /** Hyperliquid fills only. */
    px: z.number().optional(),
    sz: z.number().optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("whale_transfer"),
    exchange: z.string(),
    chain: z.string(),
    direction: z.enum(["inflow", "outflow"]),
    amount: z.number(),
    usd: z.number(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("whale_position"),
    action: z.enum(["entry", "exit", "increase", "decrease"]),
    side: z.string(),
    size: z.number(),
    usd: z.number(),
    address: z.string(),
    change_pct: z.number().nullable(),
  }),
  z.looseObject({ ...base, type: z.literal("funding"), rate_1h: z.number(), prev_rate_1h: z.number().nullable(), settle: z.boolean() }),
  z.looseObject({ ...base, type: z.literal("oi_delta"), usd: z.number(), pct: z.number(), window_s: z.number(), oi_usd: z.number() }),
  z.looseObject({ ...base, type: z.literal("price_move"), pct: z.number(), price: z.number(), prev_price: z.number(), window_s: z.number() }),
]);
export type StreamEventStrict = z.infer<typeof StreamEventStrict>;

export const DelayedStreamResponse = z.looseObject({
  server_now: z.number(),
  delay_ms: z.number(),
  window_start: z.number(),
  window_end: z.number(),
  events_per_min: z.number().nullish(),
  count: z.number().nullish(),
  events: z.array(StreamEvent),
});
export type DelayedStreamResponse = z.infer<typeof DelayedStreamResponse>;

/** /api/v1/stream/recent: newest events as JSON, oldest first; `last_id` seeds `since_id`. */
export const RecentStreamResponse = z.looseObject({
  count: z.number(),
  last_id: z.union([z.number(), z.string()]).nullable(),
  events: z.array(StreamEvent),
});
export type RecentStreamResponse = z.infer<typeof RecentStreamResponse>;
