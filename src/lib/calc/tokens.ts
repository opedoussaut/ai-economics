import { D, DAYS_PER_MONTH, Decimal, MILLION, sum } from "@/lib/money";
import type { TokenPrices } from "@/lib/data/schemas";

/**
 * API workload cost calculator.
 *
 * Token accounting model (each token is billed exactly once):
 *   promptTokens  = all input tokens in the request context
 *                 = uncached + cacheRead + cacheWrite
 *   outputTokens  = generated tokens. If `reasoningIncludedInOutput` is true
 *                   (OpenAI-style usage, where completion_tokens already
 *                   includes reasoning), reasoning tokens are a SUBSET of
 *                   outputTokens; otherwise they are additional.
 */
export type ServiceTier = "standard" | "batch" | "priority" | "flex";

export interface TokenWorkload {
  promptTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  reasoningIncludedInOutput: boolean;
  /** Fraction of prompt tokens served from cache (billed at cache-read rate). */
  cacheHitRate: number;
  /** Fraction of prompt tokens written to cache (billed at cache-write rate). */
  cacheWriteRate: number;
  requestsPerDay: number;
  tier: ServiceTier;
}

export interface TokenCostLine {
  key: "uncachedInput" | "cacheRead" | "cacheWrite" | "output" | "reasoning";
  label: string;
  tokens: number;
  ratePerM: number;
  cost: Decimal;
}

export type TokenCostResult =
  | {
      ok: true;
      lines: TokenCostLine[];
      perRequest: Decimal;
      per1kRequests: Decimal;
      daily: Decimal;
      monthly: Decimal;
      /** Total cost / total billed tokens, for THIS workload mix only. */
      blendedPerMTokens: Decimal;
      billedTokensPerRequest: number;
      longContextApplied: boolean;
      notes: string[];
    }
  | { ok: false; reason: string };

export interface PricedOffering {
  prices: TokenPrices;
  longContext?: { thresholdTokens: number; input: number | null; output: number | null; cacheRead?: number | null } | null;
}

export function validateWorkload(w: TokenWorkload): string | null {
  if (w.promptTokens < 0 || w.outputTokens < 0 || w.reasoningTokens < 0) return "Token counts must be non-negative";
  if (w.cacheHitRate < 0 || w.cacheWriteRate < 0) return "Cache rates must be non-negative";
  if (w.cacheHitRate + w.cacheWriteRate > 1) return "Cache hit rate + cache write rate cannot exceed 100% of prompt tokens";
  if (w.reasoningIncludedInOutput && w.reasoningTokens > w.outputTokens)
    return "Reasoning tokens cannot exceed output tokens when output already includes reasoning";
  return null;
}

export function computeTokenCost(offering: PricedOffering, w: TokenWorkload): TokenCostResult {
  const invalid = validateWorkload(w);
  if (invalid) return { ok: false, reason: invalid };
  const p = offering.prices;
  const notes: string[] = [];

  let inputRate: number | null | undefined;
  let outputRate: number | null | undefined;
  let cacheReadRate = p.cacheRead;
  switch (w.tier) {
    case "standard":
      inputRate = p.input;
      outputRate = p.output;
      break;
    case "batch":
      inputRate = p.batchInput;
      outputRate = p.batchOutput;
      notes.push("Batch rates applied to uncached input and output; cache-read rate assumed unchanged.");
      break;
    case "priority":
      inputRate = p.priorityInput;
      outputRate = p.priorityOutput;
      break;
    case "flex":
      inputRate = p.flexInput;
      outputRate = p.flexOutput;
      break;
  }
  if (inputRate == null || outputRate == null) {
    return { ok: false, reason: `No published ${w.tier} pricing for this offering` };
  }

  let longContextApplied = false;
  const lc = offering.longContext;
  if (w.tier === "standard" && lc && w.promptTokens > lc.thresholdTokens && lc.input != null && lc.output != null) {
    inputRate = lc.input;
    outputRate = lc.output;
    if (lc.cacheRead != null) cacheReadRate = lc.cacheRead;
    longContextApplied = true;
    notes.push(`Prompt exceeds ${lc.thresholdTokens.toLocaleString("en-US")} tokens: long-context rates apply to the whole request.`);
  }

  const cacheReadTokens = D(w.promptTokens).mul(w.cacheHitRate);
  const cacheWriteTokens = D(w.promptTokens).mul(w.cacheWriteRate);
  const uncached = D(w.promptTokens).sub(cacheReadTokens).sub(cacheWriteTokens);

  if (w.cacheHitRate > 0 && cacheReadRate == null) {
    return { ok: false, reason: "This offering publishes no cache-read price; set cache hit rate to 0" };
  }
  if (w.cacheWriteRate > 0 && p.cacheWrite == null) {
    notes.push("No separate cache-write price published: cache writes billed at the standard input rate.");
  }
  const cacheWriteRate = p.cacheWrite ?? inputRate;

  // Reasoning accounting: never bill a reasoning token twice.
  const visibleOutput = w.reasoningIncludedInOutput ? D(w.outputTokens).sub(w.reasoningTokens) : D(w.outputTokens);
  const reasoningRate = p.reasoningOutput ?? outputRate;
  if (w.reasoningTokens > 0 && p.reasoningOutput == null) {
    notes.push("Reasoning tokens billed at the output rate (no separate reasoning rate published).");
  }

  const line = (key: TokenCostLine["key"], label: string, tokens: Decimal, rate: number): TokenCostLine => ({
    key,
    label,
    tokens: tokens.toNumber(),
    ratePerM: rate,
    cost: tokens.mul(rate).div(MILLION),
  });
  const lines = [
    line("uncachedInput", "Uncached input", uncached, inputRate),
    line("cacheRead", "Cache reads", cacheReadTokens, cacheReadRate ?? 0),
    line("cacheWrite", "Cache writes", cacheWriteTokens, cacheWriteRate),
    line("output", "Visible output", visibleOutput, outputRate),
    line("reasoning", "Reasoning tokens", D(w.reasoningTokens), reasoningRate),
  ];

  const perRequest = sum(lines.map((l) => l.cost));
  const billedTokens = D(w.promptTokens).add(visibleOutput).add(w.reasoningTokens);
  const daily = perRequest.mul(w.requestsPerDay);
  return {
    ok: true,
    lines,
    perRequest,
    per1kRequests: perRequest.mul(1000),
    daily,
    monthly: daily.mul(DAYS_PER_MONTH),
    blendedPerMTokens: billedTokens.isZero() ? D(0) : perRequest.div(billedTokens).mul(MILLION),
    billedTokensPerRequest: billedTokens.toNumber(),
    longContextApplied,
    notes,
  };
}

/**
 * Blended $/1M tokens for a stated input:output token ratio, e.g. 3:1.
 * This is a convention for comparison only; always state the ratio.
 */
export function blendedPrice(input: number, output: number, inputParts: number, outputParts: number): Decimal {
  const total = inputParts + outputParts;
  if (total <= 0) throw new Error("Ratio parts must sum to > 0");
  return D(input).mul(inputParts).add(D(output).mul(outputParts)).div(total);
}
