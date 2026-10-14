import type { Questions } from "@typesafe-ai/sdk";

/**
 * The three Jev question sets (PLAN.md 3.9). Changing wording changes answers, so treat edits
 * like a model change: cached news reads are keyed by model version, not by question text.
 */

export const NEWS_QUESTIONS = {
  bias: {
    type: "choice",
    instructions:
      "Directional read of this crypto news catalyst for the named symbol (MARKET means the whole crypto market). Judge the likely price impact, not the tone of the headline.",
    criteria: {
      bullish: "Likely to push the symbol's price up",
      bearish: "Likely to push the symbol's price down",
      neutral: "No clear directional price effect",
    },
  },
  actionable: {
    type: "noul",
    instructions: "Is this a concrete, dated market event (a decision, filing, hack, listing, approval, data release), not commentary, opinion or a recap?",
  },
  severity: {
    type: "score",
    instructions: "How market-moving is this event for the named symbol?",
    criteria: [
      "Noise: no plausible price effect",
      "Minor: a small, local effect on the asset",
      "Moderate: a noticeable move in the named asset",
      "Major: a large move in the asset or its whole sector",
      "Market-wide shock: moves the whole crypto market",
    ],
  },
} as const satisfies Questions;

export const SQUEEZE_QUESTIONS = {
  cascade: {
    type: "noul",
    instructions:
      "Is the forced liquidation flow here a genuine cascade likely to continue over the next hour, rather than an isolated print? Use the alert's spike ratio, asymmetry, open-interest state and the coin's regime and liquidity context.",
  },
} as const satisfies Questions;

export const VERDICT_QUESTIONS = {
  stance: {
    type: "choice",
    instructions: "Given this snapshot of the crypto market, what positioning stance does the evidence support for the next 24 hours?",
    criteria: {
      risk_on: "Evidence favours adding risk: constructive regime, supportive health and flows",
      risk_off: "Evidence favours reducing risk: deteriorating regime, stress, or negative catalysts",
      neutral: "Mixed or weak evidence: no clear edge either way",
    },
  },
  vol_expansion_24h: {
    type: "noul",
    instructions: "Is realized volatility likely to expand materially over the next 24 hours?",
  },
  conviction: {
    type: "score",
    instructions: "How strong and consistent is the evidence behind the stance?",
    criteria: [
      "Very low: inputs conflict or are missing",
      "Low: weak, mostly conflicting signals",
      "Moderate: some agreement across inputs",
      "High: most inputs agree",
      "Very high: inputs agree strongly and consistently",
    ],
  },
} as const satisfies Questions;
