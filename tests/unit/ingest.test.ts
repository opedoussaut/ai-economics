import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeFreshness } from "@/lib/data/freshness";
import { normalizeAzure } from "@/lib/ingest/adapters/azure";
import { parseEcbXml } from "@/lib/ingest/adapters/ecb";
import { normalizeLiteLLM } from "@/lib/ingest/adapters/litellm";
import { normalizeOpenRouter } from "@/lib/ingest/adapters/openrouter";
import { normalizeVast, VAST_GPUS } from "@/lib/ingest/adapters/vast";
import { fetchWithRetry } from "@/lib/ingest/http";
import { latestHashes, mergeSnapshot } from "@/lib/ingest/merge";
import { refresh, tokenPriceFields } from "@/lib/ingest/run";
import type { TokenOffering } from "@/lib/data/schemas";

const litellmRaw = {
  sample_spec: { mode: "chat" },
  "claude-x": {
    litellm_provider: "anthropic", mode: "chat", input_cost_per_token: 3e-6, output_cost_per_token: 1.5e-5,
    cache_read_input_token_cost: 3e-7, cache_creation_input_token_cost: 3.75e-6, max_input_tokens: 200000,
    source: "https://platform.claude.com/docs/en/about-claude/pricing", supports_reasoning: true,
  },
  "gpt-y": { litellm_provider: "openai", mode: "chat", input_cost_per_token: 1.25e-6, output_cost_per_token: 1e-5, input_cost_per_token_batches: 6.25e-7, output_cost_per_token_batches: 5e-6 },
  "text-embedding": { litellm_provider: "openai", mode: "embedding", input_cost_per_token: 1e-7, output_cost_per_token: 0 },
  "ollama/llama": { litellm_provider: "ollama", mode: "chat", input_cost_per_token: 0, output_cost_per_token: 0 },
  "bedrock_converse/us.anthropic.claude": { litellm_provider: "bedrock_converse", mode: "chat", input_cost_per_token: 3e-6, output_cost_per_token: 1.5e-5 },
  broken: { litellm_provider: "openai", mode: "chat", input_cost_per_token: "free" },
};

describe("data-ingestion validation", () => {
  it("normalises LiteLLM entries to $/1M and filters non-chat, local and regional duplicates", () => {
    const out = normalizeLiteLLM(litellmRaw, "2026-01-01T00:00:00Z");
    expect(out.map((o) => o.modelId).sort()).toEqual(["claude-x", "gpt-y"]);
    const c = out.find((o) => o.modelId === "claude-x")!;
    expect(c.prices).toMatchObject({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
    expect(c.developer).toBe("Anthropic");
    expect(c.channel).toBe("direct");
    expect(c.confidence).toBe("high");
    expect(out.find((o) => o.modelId === "gpt-y")!.prices.batchInput).toBe(0.625);
  });
  it("skips OpenRouter variable-priced routers and requires a minimum population", () => {
    const models = Array.from({ length: 25 }, (_, i) => ({ id: `anthropic/m${i}`, name: `M${i}`, pricing: { prompt: "0.000003", completion: "0.000015" } }));
    const out = normalizeOpenRouter({ data: [...models, { id: "openrouter/auto", name: "Auto", pricing: { prompt: "-1", completion: "-1" } }] }, "t");
    expect(out).toHaveLength(25);
    expect(out[0]).toMatchObject({ channel: "reseller", developer: "Anthropic", prices: { input: 3, output: 15 } });
    expect(() => normalizeOpenRouter({ data: models.slice(0, 3) }, "t")).toThrow();
    expect(() => normalizeOpenRouter({ nope: true }, "t")).toThrow();
  });
  it("amortises Azure reservation term totals to hourly and excludes Windows/low-priority", () => {
    const base = { armSkuName: "Standard_ND96isr_H100_v5", armRegionName: "eastus", unitOfMeasure: "1 Hour", currencyCode: "USD", productName: "NDsr H100 v5 Series" };
    const out = normalizeAzure("Standard_ND96isr_H100_v5", [
      { ...base, retailPrice: 98.32, type: "Consumption", skuName: "ND96isrH100v5" },
      { ...base, retailPrice: 18.17, type: "Consumption", skuName: "ND96isrH100v5 Spot" },
      { ...base, retailPrice: 8760, type: "Reservation", reservationTerm: "1 Year", skuName: "ND96isrH100v5" },
      { ...base, retailPrice: 999, type: "Consumption", skuName: "ND96isrH100v5", productName: "NDsr H100 v5 Series Windows" },
      { ...base, retailPrice: 1, type: "Consumption", skuName: "ND96isrH100v5 Low Priority" },
    ], "t");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ onDemandPerHour: 98.32, spotPerHour: 18.17, reserved1yPerHour: 1, gpuCount: 8, vcpus: 96 });
  });
  it("publishes Vast statistics only with enough offers, per GPU", () => {
    const gpu = VAST_GPUS[0];
    const offers = [
      { num_gpus: 8, dph_total: 16, gpu_name: gpu.name },
      { num_gpus: 1, dph_total: 3, gpu_name: gpu.name },
      { num_gpus: 2, dph_total: 5, gpu_name: gpu.name },
      { num_gpus: 1, dph_total: 9, gpu_name: "other" },
    ];
    expect(normalizeVast(gpu, offers, "t")!.perGpuHourStats).toMatchObject({ n: 3, min: 2, median: 2.5, max: 3 });
    expect(normalizeVast(gpu, offers.slice(0, 2), "t")).toBeNull();
  });
  it("parses ECB reference rates and rejects malformed XML", () => {
    const fx = parseEcbXml("<Cube time='2026-10-22'><Cube currency='USD' rate='1.1205'/><Cube currency='GBP' rate='0.8377'/></Cube>", "t");
    expect(fx).toMatchObject({ rateDate: "2026-10-22", eurRates: { USD: 1.1205, GBP: 0.8377 } });
    expect(() => parseEcbXml("<html>maintenance</html>", "t")).toThrow();
  });
});

const offering = (id: string, input: number, sourceId = "litellm"): Omit<TokenOffering, "firstSeenAt" | "delistedAt" | "listed"> =>
  ({
    id, sourceId, modelId: id, displayName: id, developer: "X", provider: "p", providerName: "P", channel: "direct", currency: "USD",
    prices: { input, output: input * 4 }, contextWindow: null, maxOutputTokens: null, inputModalities: [], outputModalities: [],
    features: [], officialUrl: null, collectedFrom: "u", observedAt: "t", effectiveDate: null, confidence: "high",
  }) as never;

describe("price snapshot idempotency and change detection", () => {
  const merge = (previous: TokenOffering[], observed: ReturnType<typeof offering>[], now: string, hist = new Map<string, string>()) =>
    mergeSnapshot<TokenOffering>({ dataset: "token", sourceId: "litellm", previous, observed, now, lastHistoryHash: hist, priceFields: tokenPriceFields, label: (o) => o.id });

  it("baseline run records history but no change events", () => {
    const r = merge([], [offering("a", 1), offering("b", 2)], "2026-01-01T00:00:00Z");
    expect(r.history).toHaveLength(2);
    expect(r.changes).toHaveLength(0);
  });
  it("re-running with identical data adds nothing and keeps observedAt", () => {
    const first = merge([], [offering("a", 1)], "2026-01-01T00:00:00Z");
    const second = merge(first.offerings, [offering("a", 1)], "2026-01-02T00:00:00Z", latestHashes(first.history));
    expect(second.history).toHaveLength(0);
    expect(second.changes).toHaveLength(0);
    expect(second.offerings[0].observedAt).toBe(first.offerings[0].observedAt);
  });
  it("detects price changes, new and delisted offerings, and keeps delisted data", () => {
    const first = merge([], [offering("a", 1), offering("b", 2)], "2026-01-01T00:00:00Z");
    const second = merge(first.offerings, [offering("a", 1.5), offering("c", 3)], "2026-01-02T00:00:00Z", latestHashes(first.history));
    const kinds = second.changes.map((c) => `${c.kind}:${c.offeringId}:${c.field ?? ""}`).sort();
    expect(kinds).toEqual(["delisted:b:", "new:c:", "price-change:a:input", "price-change:a:output"]);
    const b = second.offerings.find((o) => o.id === "b")!;
    expect(b.listed).toBe(false);
    expect(b.prices.input).toBe(2); // last verified price retained
    expect(b.delistedAt).toBe("2026-01-02T00:00:00Z");
  });
  it("does not touch other sources' offerings", () => {
    const other = { ...offering("or:z", 9, "openrouter"), firstSeenAt: "t", delistedAt: null, listed: true } as TokenOffering;
    const r = merge([other], [offering("a", 1)], "2026-01-01T00:00:00Z");
    expect(r.offerings.find((o) => o.id === "or:z")).toEqual(other);
  });
});

describe("data freshness and missing-source behaviour", () => {
  const src = { staleAfterHours: 24, requiresKey: null };
  const now = new Date("2026-01-02T12:00:00Z");
  const entry = (lastSuccessAt: string | null, lastStatus: "ok" | "error" = "ok") => ({
    id: "s", lastAttemptAt: "2026-01-02T11:00:00Z", lastSuccessAt, lastStatus, lastError: lastStatus === "error" ? "boom" : null,
    recordCount: 1, durationMs: 1, consecutiveFailures: lastStatus === "error" ? 2 : 0,
  });
  it("fresh / failing / stale / never / not-configured", () => {
    expect(computeFreshness(src, entry("2026-01-02T06:00:00Z"), now).state).toBe("fresh");
    expect(computeFreshness(src, entry("2026-01-02T06:00:00Z", "error"), now).state).toBe("failing");
    expect(computeFreshness(src, entry("2025-12-30T00:00:00Z", "error"), now).state).toBe("stale");
    expect(computeFreshness(src, undefined, now).state).toBe("never");
    expect(computeFreshness({ staleAfterHours: 24, requiresKey: "KEY" }, undefined, now).state).toBe("not-configured");
  });

  it("a failed source keeps its last snapshot and records the error; others still update", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "aie-"));
    let t = Date.parse("2026-01-01T00:00:00Z");
    const now = () => new Date((t += 1000));
    const ok = { litellm: async () => ({ raw: litellmRaw, upstreamVersion: "v1" }) };
    await refresh(["litellm"], { dir, now, fetchers: ok });
    const failing = {
      litellm: async () => { throw new Error("HTTP 503 from upstream"); },
      ecb: async () => "<Cube time='2026-01-01'><Cube currency='USD' rate='1.1'/></Cube>",
    };
    const results = await refresh(["litellm", "ecb-fx"], { dir, now, fetchers: failing });
    expect(results.map((r) => r.status)).toEqual(["error", "ok"]);
    const snap = JSON.parse(await readFile(path.join(dir, "snapshots/token-prices.json"), "utf8"));
    expect(snap.offerings).toHaveLength(2);
    expect(snap.offerings.every((o: TokenOffering) => o.listed)).toBe(true);
    const health = JSON.parse(await readFile(path.join(dir, "source-health.json"), "utf8"));
    expect(health.sources.litellm).toMatchObject({ lastStatus: "error", consecutiveFailures: 1, recordCount: 2 });
    expect(health.sources.litellm.lastSuccessAt).not.toBeNull();
    expect(health.sources["ecb-fx"].lastStatus).toBe("ok");
    // Idempotent re-run: no new history lines.
    const before = (await readFile(path.join(dir, "history/token-prices.jsonl"), "utf8")).split("\n").length;
    await refresh(["litellm"], { dir, now, fetchers: ok });
    const after = (await readFile(path.join(dir, "history/token-prices.jsonl"), "utf8")).split("\n").length;
    expect(after).toBe(before);
  });
});

describe("HTTP retry behaviour", () => {
  it("retries 5xx then succeeds; does not retry 404", async () => {
    let calls = 0;
    const flaky = (async () => (++calls < 3 ? new Response("x", { status: 503 }) : new Response("{}", { status: 200 }))) as typeof fetch;
    const res = await fetchWithRetry("http://x", { fetchImpl: flaky, sleep: async () => {} });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
    let n = 0;
    const notFound = (async () => { n++; return new Response("x", { status: 404 }); }) as typeof fetch;
    await expect(fetchWithRetry("http://x", { fetchImpl: notFound, sleep: async () => {} })).rejects.toThrow(/404/);
    expect(n).toBe(1);
  });
});
