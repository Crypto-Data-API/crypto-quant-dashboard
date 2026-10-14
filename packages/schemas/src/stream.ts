/**
 * CDA live event stream (`GET /api/v1/stream`, SSE) and its keyless preview
 * (`GET /api/v1/stream/delayed`). Shapes follow the endpoint description and were checked
 * against a real /stream/delayed sample (docs/samples/stream-delayed.json).
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
