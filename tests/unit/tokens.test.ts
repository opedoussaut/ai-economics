import { describe, expect, it } from "vitest";
import { blendedPrice, computeTokenCost, type TokenWorkload } from "@/lib/calc/tokens";
import type { TokenPrices } from "@/lib/data/schemas";

const prices: TokenPrices = {
  input: 3,
  output: 15,
  cacheRead: 0.3,
  cacheWrite: 3.75,
  batchInput: 1.5,
  batchOutput: 7.5,
};
const base: TokenWorkload = {
  promptTokens: 1_000_000,
  outputTokens: 1_000_000,
  reasoningTokens: 0,
  reasoningIncludedInOutput: false,
  cacheHitRate: 0,
  cacheWriteRate: 0,
  requestsPerDay: 1,
  tier: "standard",
};
const cost = (w: Partial<TokenWorkload>, p: TokenPrices = prices, longContext = null as never) => {
  const r = computeTokenCost({ prices: p, longContext }, { ...base, ...w });
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("input/output blended token pricing", () => {
  it("prices 1M input + 1M output at list rates", () => {
    const r = cost({});
    expect(r.perRequest.toNumber()).toBe(18);
    expect(r.blendedPerMTokens.toNumber()).toBe(9); // 18 / 2M tokens
  });
  it("blendedPrice uses the stated ratio exactly", () => {
    expect(blendedPrice(3, 15, 3, 1).toNumber()).toBe(6);
    expect(blendedPrice(3, 15, 1, 1).toNumber()).toBe(9);
    expect(() => blendedPrice(3, 15, 0, 0)).toThrow();
  });
  it("scales to daily and monthly volume", () => {
    const r = cost({ promptTokens: 1000, outputTokens: 500, requestsPerDay: 10_000 });
    // (1000×3 + 500×15)/1e6 = 0.0105 per request
    expect(r.perRequest.toNumber()).toBeCloseTo(0.0105, 12);
    expect(r.daily.toNumber()).toBeCloseTo(105, 9);
    expect(r.monthly.toNumber()).toBeCloseTo(105 * (365 / 12), 6);
  });
});

describe("cache accounting without double counting", () => {
  it("bills each prompt token exactly once across uncached/read/write", () => {
    const r = cost({ cacheHitRate: 0.5, cacheWriteRate: 0.25, outputTokens: 0 });
    const tokens = r.lines.filter((l) => ["uncachedInput", "cacheRead", "cacheWrite"].includes(l.key)).reduce((a, l) => a + l.tokens, 0);
    expect(tokens).toBe(1_000_000);
    // 0.25M×3 + 0.5M×0.3 + 0.25M×3.75 = 0.75 + 0.15 + 0.9375
    expect(r.perRequest.toNumber()).toBeCloseTo(1.8375, 12);
  });
  it("rejects hit + write rates above 100%", () => {
    const r = computeTokenCost({ prices }, { ...base, cacheHitRate: 0.8, cacheWriteRate: 0.3 });
    expect(r.ok).toBe(false);
  });
  it("refuses cache hits when no cache-read price is published", () => {
    const r = computeTokenCost({ prices: { input: 1, output: 2 } }, { ...base, cacheHitRate: 0.5 });
    expect(r.ok).toBe(false);
  });
});

describe("reasoning-token accounting", () => {
  it("adds reasoning tokens when reported separately", () => {
    const r = cost({ promptTokens: 0, outputTokens: 1_000_000, reasoningTokens: 1_000_000 });
    expect(r.perRequest.toNumber()).toBe(30);
  });
  it("does not double count when output already includes reasoning (OpenAI-style usage)", () => {
    const r = cost({ promptTokens: 0, outputTokens: 1_000_000, reasoningTokens: 600_000, reasoningIncludedInOutput: true });
    expect(r.perRequest.toNumber()).toBe(15);
    expect(r.billedTokensPerRequest).toBe(1_000_000);
  });
  it("applies a separate reasoning rate when published", () => {
    const r = cost({ promptTokens: 0, outputTokens: 0, reasoningTokens: 1_000_000 }, { ...prices, reasoningOutput: 20 });
    expect(r.perRequest.toNumber()).toBe(20);
  });
  it("rejects reasoning > output when included", () => {
    const r = computeTokenCost({ prices }, { ...base, outputTokens: 10, reasoningTokens: 20, reasoningIncludedInOutput: true });
    expect(r.ok).toBe(false);
  });
});

describe("service tiers and long context", () => {
  it("uses batch rates", () => {
    expect(cost({ tier: "batch" }).perRequest.toNumber()).toBe(9);
  });
  it("reports unavailable tiers instead of silently falling back", () => {
    const r = computeTokenCost({ prices }, { ...base, tier: "priority" });
    expect(r.ok).toBe(false);
  });
  it("applies long-context rates to the whole request above the threshold", () => {
    const lc = { thresholdTokens: 200_000, input: 6, output: 22.5 };
    const r = computeTokenCost({ prices, longContext: lc }, { ...base, promptTokens: 300_000, outputTokens: 0 });
    expect(r.ok && r.longContextApplied).toBe(true);
    expect(r.ok && r.perRequest.toNumber()).toBeCloseTo(1.8, 12);
  });
});
