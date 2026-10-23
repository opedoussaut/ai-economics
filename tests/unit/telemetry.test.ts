import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { histogramQuantile, parsePromText, sumOf } from "@/lib/telemetry/promtext";
import { extractGenAiUsage } from "@/lib/telemetry/otlp";
import { collectLive, metricValue } from "@/lib/telemetry/live";
import { matchOffering, runEconomics, usageCost } from "@/lib/telemetry/runs";
import { bearerOk, createSessionToken, safeEqual, verifySessionToken } from "@/lib/auth";
import type { TokenOffering } from "@/lib/data/schemas";

// Exposition-format fixtures modelled on vLLM (V1 engine) and dcgm-exporter output.
const VLLM_METRICS = `# HELP vllm:prompt_tokens_total Number of prefill tokens processed.
# TYPE vllm:prompt_tokens_total counter
vllm:prompt_tokens_total{engine="0",model_name="meta-llama/Llama-3.1-8B-Instruct"} 120000.0
# TYPE vllm:generation_tokens_total counter
vllm:generation_tokens_total{engine="0",model_name="meta-llama/Llama-3.1-8B-Instruct"} 45000.0
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{engine="0",model_name="meta-llama/Llama-3.1-8B-Instruct"} 7.0
vllm:num_requests_waiting{engine="0",model_name="meta-llama/Llama-3.1-8B-Instruct"} 2.0
vllm:kv_cache_usage_perc{engine="0",model_name="meta-llama/Llama-3.1-8B-Instruct"} 0.42
# TYPE vllm:time_to_first_token_seconds histogram
vllm:time_to_first_token_seconds_bucket{le="0.1",model_name="m"} 50.0
vllm:time_to_first_token_seconds_bucket{le="0.5",model_name="m"} 90.0
vllm:time_to_first_token_seconds_bucket{le="1.0",model_name="m"} 100.0
vllm:time_to_first_token_seconds_bucket{le="+Inf",model_name="m"} 100.0
vllm:time_to_first_token_seconds_count{model_name="m"} 100.0
`;
const DCGM_METRICS = `# HELP DCGM_FI_DEV_GPU_UTIL GPU utilization (in %).
# TYPE DCGM_FI_DEV_GPU_UTIL gauge
DCGM_FI_DEV_GPU_UTIL{gpu="0",UUID="GPU-a",modelName="NVIDIA H100 80GB HBM3",Hostname="n1"} 80
DCGM_FI_DEV_GPU_UTIL{gpu="1",UUID="GPU-b",modelName="NVIDIA H100 80GB HBM3",Hostname="n1"} 60
DCGM_FI_DEV_FB_USED{gpu="0",UUID="GPU-a"} 70000
DCGM_FI_DEV_FB_USED{gpu="1",UUID="GPU-b"} 50000
DCGM_FI_DEV_POWER_USAGE{gpu="0",UUID="GPU-a"} 650.5
DCGM_FI_DEV_POWER_USAGE{gpu="1",UUID="GPU-b"} 500.5
DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION{gpu="0",UUID="GPU-a"} 3600000000
DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION{gpu="1",UUID="GPU-b"} 3600000000
`;

describe("Prometheus text parser", () => {
  it("parses labels, counters, gauges and histograms", () => {
    const s = parsePromText(VLLM_METRICS);
    expect(sumOf(s, "vllm:generation_tokens_total")).toBe(45000);
    expect(s.find((x) => x.name === "vllm:prompt_tokens_total")!.labels.model_name).toBe("meta-llama/Llama-3.1-8B-Instruct");
    // 50% of 100 observations falls at the 0.1 s bucket boundary.
    expect(histogramQuantile(s, "vllm:time_to_first_token_seconds", 0.5)).toBeCloseTo(0.1, 9);
    expect(histogramQuantile(s, "vllm:time_to_first_token_seconds", 0.95)).toBeCloseTo(0.75, 9);
  });
});

describe("live adapters against a local metrics server", () => {
  let server: http.Server;
  let base = "";
  const promQueries: string[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url!, "http://x");
      if (url.pathname === "/vllm/metrics") return res.end(VLLM_METRICS);
      if (url.pathname === "/dcgm/metrics") return res.end(DCGM_METRICS);
      if (url.pathname === "/prom/api/v1/query") {
        const q = url.searchParams.get("query")!;
        promQueries.push(q);
        res.setHeader("content-type", "application/json");
        const value = q.includes("rate(vllm:generation_tokens_total") ? "321.5" : q.startsWith("avg(DCGM_FI_DEV_GPU_UTIL") ? "71" : null;
        return res.end(JSON.stringify({ status: "success", data: { resultType: "vector", result: value ? [{ metric: {}, value: [1, value] }] : [] } }));
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    delete process.env.VLLM_METRICS_URL;
    delete process.env.DCGM_EXPORTER_URL;
    delete process.env.PROMETHEUS_URL;
  });

  it("reports not connected and no values when nothing is configured", async () => {
    const live = await collectLive();
    expect(live.connected).toBe(false);
    expect(live.metrics).toHaveLength(0);
  });

  it("scrapes vLLM and DCGM /metrics directly", async () => {
    process.env.VLLM_METRICS_URL = `${base}/vllm/metrics`;
    process.env.DCGM_EXPORTER_URL = `${base}/dcgm/metrics`;
    const live = await collectLive();
    expect(live.connected).toBe(true);
    expect(metricValue(live, "generationTokensTotal")).toBe(45000);
    expect(metricValue(live, "requestsWaiting")).toBe(2);
    expect(metricValue(live, "kvCacheUsage")).toBeCloseTo(42, 9);
    expect(metricValue(live, "gpuCount")).toBe(2);
    expect(metricValue(live, "gpuUtil")).toBe(70);
    expect(metricValue(live, "powerW")).toBeCloseTo(1151, 9);
    expect(live.metrics.every((m) => m.valueClass === "measured")).toBe(true);
  });

  it("queries Prometheus read-only and prefers its values; empty results stay null", async () => {
    process.env.PROMETHEUS_URL = `${base}/prom`;
    const live = await collectLive();
    expect(metricValue(live, "genTokensPerSec")).toBe(321.5);
    expect(metricValue(live, "gpuUtil")).toBe(71); // Prometheus value wins over scrape (70)
    expect(metricValue(live, "generationTokensTotal")).toBe(45000); // filled from direct scrape
    expect(promQueries.length).toBeGreaterThan(5);
  });

  it("reports source errors instead of inventing values", async () => {
    process.env.VLLM_METRICS_URL = `${base}/missing`;
    delete process.env.PROMETHEUS_URL;
    delete process.env.DCGM_EXPORTER_URL;
    const live = await collectLive();
    expect(live.connected).toBe(false);
    expect(live.sources[0]).toMatchObject({ id: "vllm", ok: false });
    expect(live.metrics).toHaveLength(0);
  });
});

const span = (attrs: Record<string, string | number>) => ({
  traceId: "t1", spanId: "s1", name: "chat", startTimeUnixNano: "1760000000000000000", endTimeUnixNano: "1760000001500000000",
  attributes: Object.entries(attrs).map(([key, v]) => ({ key, value: typeof v === "number" ? { intValue: String(v) } : { stringValue: v } })),
});

describe("OTLP GenAI extraction", () => {
  const payload = {
    resourceSpans: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: "support-bot" } }] },
      scopeSpans: [{ spans: [
        span({
          "gen_ai.provider.name": "anthropic", "gen_ai.request.model": "claude-x", "gen_ai.usage.input_tokens": 1000, "gen_ai.usage.output_tokens": 200,
          "gen_ai.usage.cache_read.input_tokens": 600, "gen_ai.input.messages": "SECRET PROMPT", "gen_ai.output.messages": "SECRET ANSWER",
        }),
        span({ "http.method": "GET" }),
      ] }],
    }],
  };
  it("extracts usage and timing, ignores non-GenAI spans", () => {
    const u = extractGenAiUsage(payload);
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ provider: "anthropic", model: "claude-x", inputTokens: 1000, outputTokens: 200, cacheReadTokens: 600, project: "support-bot", durationMs: 1500 });
  });
  it("never retains prompt or completion content", () => {
    expect(JSON.stringify(extractGenAiUsage(payload))).not.toContain("SECRET");
  });
  it("rejects malformed payloads", () => {
    expect(() => extractGenAiUsage({ foo: 1 })).toThrow();
  });
  it("prices usage without double counting cached and reasoning tokens", () => {
    const offering = { id: "litellm:anthropic:claude-x", sourceId: "litellm", provider: "anthropic", modelId: "claude-x", listed: true,
      prices: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } } as unknown as TokenOffering;
    expect(matchOffering([offering], "anthropic", "claude-x")?.id).toBe(offering.id);
    expect(matchOffering([offering], "openai", "claude-x")).toBeNull();
    const [u] = extractGenAiUsage(payload);
    // 400 uncached × 3 + 600 cache-read × 0.3 + 200 output × 15 = 1200 + 180 + 3000 (per 1e6)
    expect(usageCost(offering, u)!.toNumber()).toBeCloseTo(0.00438, 12);
    // reasoning is a subset of output_tokens per OTel conventions → no extra charge
    expect(usageCost(offering, { ...u, reasoningTokens: 150 })!.toNumber()).toBeCloseTo(0.00438, 12);
  });
});

describe("run economics", () => {
  it("cost to date uses reserved GPUs × elapsed × rate; deltas from counter baselines", () => {
    const run = { startedAt: "2026-01-01T00:00:00Z", endedAt: null, gpuCount: 8, ratePerGpuHour: "2.5", electricityPerKwh: "0.1", plannedTokens: 2_000_000,
      baselines: { generationTokensTotal: 1_000_000, promptTokensTotal: 0, energyMj: 0 } } as never;
    const live = { sampledAt: "", connected: true, sources: [], metrics: [
      { key: "generationTokensTotal", value: 2_000_000 }, { key: "energyMj", value: 7.2e9 },
    ] } as never;
    const e = runEconomics(run, live, new Date("2026-01-01T02:00:00Z"));
    expect(e.costToDate.toNumber()).toBe(40);
    expect(e.generatedTokens).toBe(1_000_000);
    expect(e.costPerMGenerated!.toNumber()).toBe(40);
    expect(e.energyKwh!.toNumber()).toBe(2);
    expect(e.energyCost!.toNumber()).toBeCloseTo(0.2, 12);
    expect(e.projectedTotal!.toNumber()).toBe(80);
  });
  it("treats a counter reset as unknown rather than negative", () => {
    const run = { startedAt: "2026-01-01T00:00:00Z", endedAt: null, gpuCount: 1, ratePerGpuHour: "1", baselines: { generationTokensTotal: 500 } } as never;
    const live = { connected: true, metrics: [{ key: "generationTokensTotal", value: 10 }] } as never;
    expect(runEconomics(run, live, new Date("2026-01-01T01:00:00Z")).generatedTokens).toBeNull();
  });
});

describe("authentication", () => {
  const secret = "x".repeat(40);
  it("accepts valid sessions and rejects tampered or expired ones", async () => {
    const tok = await createSessionToken(secret, 1_000);
    expect(await verifySessionToken(tok, secret, 2_000)).toBe(true);
    const tampered = tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A");
    expect(await verifySessionToken(tampered, secret, 2_000)).toBe(false);
    expect(await verifySessionToken(tok, "y".repeat(40), 2_000)).toBe(false);
    expect(await verifySessionToken(tok, secret, 1_000 + 13 * 3600 * 1000)).toBe(false);
    expect(await verifySessionToken(undefined, secret)).toBe(false);
  });
  it("checks bearer tokens in constant time", () => {
    expect(bearerOk("Bearer abc", "abc")).toBe(true);
    expect(bearerOk("Bearer abd", "abc")).toBe(false);
    expect(bearerOk("abc", "abc")).toBe(false);
    expect(bearerOk("Bearer abc", undefined)).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});
