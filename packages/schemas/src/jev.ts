/**
 * TypeSafe "System One" classifier (model family Jev), PLAN.md section 3.9.
 *
 * `JevResponse` validates what POST https://api.typesafe.ai/v1/systemone returns, checked against
 * real responses (docs/samples/jev/). Two details beyond the published facts: score answers also
 * carry a `legend` (the rubric echoed back, keyed by level), and `score` is an expected value that
 * can fall between levels (for example 2.22).
 *
 * The Jev* read types below are what the worker caches and serves as datasets (jev-news,
 * jev-squeeze, jev-market-verdict). They are built by the worker, not parsed from outside.
 */
import { z } from "zod";

const num = z.number();

export const JevChoiceAnswer = z.looseObject({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: num,
  probabilities: z.record(z.string(), num),
});
export const JevScoreAnswer = z.looseObject({
  type: z.literal("score"),
  /** Expected score; may fall between integer rubric levels. */
  score: num,
  confidence: num,
  /** Keyed by level as a string: "0", "1", ... */
  probabilities: z.record(z.string(), num),
  legend: z.record(z.string(), z.unknown()).optional(),
});
export const JevNoulAnswer = z.looseObject({
  type: z.literal("noul"),
  /** Probability of "yes", 0..1. */
  noul: num,
});
export const JevAnswer = z.discriminatedUnion("type", [JevChoiceAnswer, JevScoreAnswer, JevNoulAnswer]);
export const JevResponse = z.looseObject({
  /** Resolved model version, e.g. "jev-1.13.0" for a "jev-latest" request. */
  model: z.string(),
  answers: z.record(z.string(), JevAnswer),
  usage: z.looseObject({ input_tokens: num, output_tokens: num }),
});
export type JevChoiceAnswer = z.infer<typeof JevChoiceAnswer>;
export type JevScoreAnswer = z.infer<typeof JevScoreAnswer>;
export type JevNoulAnswer = z.infer<typeof JevNoulAnswer>;
export type JevAnswer = z.infer<typeof JevAnswer>;
export type JevResponse = z.infer<typeof JevResponse>;

export interface JevChoiceRead {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevScoreRead {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  /** Number of rubric levels (score runs 0..levels-1). */
  levels: number;
}

/** Jev's read of one news catalyst. Cached permanently per (event id, model version). */
export interface JevNewsRead {
  eventId: string;
  model: string;
  classifiedAt: string;
  /** bullish | bearish | neutral */
  bias: JevChoiceRead;
  /** Probability that this is a concrete dated market event rather than commentary. */
  actionable: number;
  /** 0 noise .. 4 market-wide shock. */
  severity: JevScoreRead;
  /** CDA's own signed bias at classification time, for the agreement check. */
  cdaBias: number;
  /** True when sign(CDA bias) matches Jev's choice (positive=bullish, negative=bearish, zero=neutral). */
  agrees: boolean;
  inputTokens: number;
}

export interface JevNewsReads {
  model: string | null;
  /** Reads for every event currently on the news tape or an open coin drill-down. */
  reads: Record<string, JevNewsRead>;
  eventsSeen: number;
  classified: number;
  pending: number;
  failed: number;
}

/** Jev's read of one squeeze alert episode (symbol + direction + UTC hour). */
export interface JevSqueezeRead {
  alertId: string;
  symbol: string;
  direction: string;
  model: string;
  classifiedAt: string;
  /** Probability the forced flow is a genuine cascade likely to continue over the next hour. */
  cascade: number;
  inputTokens: number;
}

export interface JevSqueezeReads {
  model: string | null;
  reads: Record<string, JevSqueezeRead>;
  /** "SYMBOL|direction" -> alert id, for the alerts active in the latest squeeze-alerts poll. */
  active: Record<string, string>;
}

export interface JevVerdictInput {
  dataset: string;
  label: string;
  status: string;
  asOf: string | null;
  fetchedAt: string | null;
}

export interface JevMarketVerdict {
  model: string;
  classifiedAt: string;
  /** risk_on | risk_off | neutral */
  stance: JevChoiceRead;
  /** Probability of a volatility expansion over the next 24 hours. */
  volExpansion24h: number;
  /** 0 very low .. 4 very high. */
  conviction: JevScoreRead;
  inputs: JevVerdictInput[];
  usage: { input_tokens: number; output_tokens: number };
}
