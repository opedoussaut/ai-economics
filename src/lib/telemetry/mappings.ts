import { avgOf, countOf, histogramQuantile, sumOf, type PromSample } from "./promtext";

/**
 * Metric mappings for vLLM and NVIDIA dcgm-exporter.
 * vLLM names verified against https://docs.vllm.ai/en/stable/design/metrics/
 * (V1 engine; V0 aliases kept where they differ). DCGM field names from
 * dcgm-exporter's default-counters.csv.
 */
export interface LiveMetric {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  /** All values here are direct measurements from the source. */
  valueClass: "measured";
  source: string;
}

export const VLLM_PROMQL: { key: string; label: string; unit: string; query: string }[] = [
  { key: "promptTokensTotal", label: "Input tokens processed (counter)", unit: "tokens", query: "sum(vllm:prompt_tokens_total)" },
  { key: "generationTokensTotal", label: "Tokens generated (counter)", unit: "tokens", query: "sum(vllm:generation_tokens_total)" },
  { key: "genTokensPerSec", label: "Generation throughput (1m rate)", unit: "tok/s", query: "sum(rate(vllm:generation_tokens_total[1m]))" },
  { key: "promptTokensPerSec", label: "Prompt throughput (1m rate)", unit: "tok/s", query: "sum(rate(vllm:prompt_tokens_total[1m]))" },
  { key: "requestsRunning", label: "Requests running", unit: "requests", query: "sum(vllm:num_requests_running)" },
  { key: "requestsWaiting", label: "Requests waiting", unit: "requests", query: "sum(vllm:num_requests_waiting)" },
  { key: "ttftP50", label: "Time to first token p50 (5m)", unit: "s", query: "histogram_quantile(0.5, sum by (le) (rate(vllm:time_to_first_token_seconds_bucket[5m])))" },
  { key: "e2eP95", label: "End-to-end latency p95 (5m)", unit: "s", query: "histogram_quantile(0.95, sum by (le) (rate(vllm:e2e_request_latency_seconds_bucket[5m])))" },
  { key: "kvCacheUsage", label: "KV-cache usage", unit: "%", query: "100 * avg(vllm:kv_cache_usage_perc or vllm:gpu_cache_usage_perc)" },
  {
    key: "errorRate",
    label: "Aborted/errored request share (5m)",
    unit: "%",
    query: '100 * sum(rate(vllm:request_success_total{finished_reason="abort"}[5m])) / clamp_min(sum(rate(vllm:request_success_total[5m])), 1e-9)',
  },
];

export const DCGM_PROMQL: { key: string; label: string; unit: string; query: string }[] = [
  { key: "gpuCount", label: "GPUs reporting", unit: "GPUs", query: "count(DCGM_FI_DEV_GPU_UTIL)" },
  { key: "gpuUtil", label: "GPU utilization (avg)", unit: "%", query: "avg(DCGM_FI_DEV_GPU_UTIL)" },
  { key: "fbUsedMiB", label: "GPU memory used (sum)", unit: "MiB", query: "sum(DCGM_FI_DEV_FB_USED)" },
  { key: "powerW", label: "GPU power draw (sum)", unit: "W", query: "sum(DCGM_FI_DEV_POWER_USAGE)" },
  { key: "energyMj", label: "GPU energy since driver load (sum)", unit: "mJ", query: "sum(DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION)" },
];

/** Same metrics computed from a direct /metrics scrape (no rates: counters and gauges only). */
export function vllmFromScrape(samples: PromSample[], source: string): LiveMetric[] {
  const m = (key: string, label: string, unit: string, value: number | null): LiveMetric => ({ key, label, unit, value, valueClass: "measured", source });
  const kv = avgOf(samples, "vllm:kv_cache_usage_perc") ?? avgOf(samples, "vllm:gpu_cache_usage_perc");
  return [
    m("promptTokensTotal", "Input tokens processed (counter)", "tokens", sumOf(samples, "vllm:prompt_tokens_total")),
    m("generationTokensTotal", "Tokens generated (counter)", "tokens", sumOf(samples, "vllm:generation_tokens_total")),
    m("requestsRunning", "Requests running", "requests", sumOf(samples, "vllm:num_requests_running")),
    m("requestsWaiting", "Requests waiting", "requests", sumOf(samples, "vllm:num_requests_waiting")),
    m("ttftP50", "Time to first token p50 (since start)", "s", histogramQuantile(samples, "vllm:time_to_first_token_seconds", 0.5)),
    m("e2eP95", "End-to-end latency p95 (since start)", "s", histogramQuantile(samples, "vllm:e2e_request_latency_seconds", 0.95)),
    m("kvCacheUsage", "KV-cache usage", "%", kv === null ? null : kv * 100),
  ];
}

export function dcgmFromScrape(samples: PromSample[], source: string): LiveMetric[] {
  const m = (key: string, label: string, unit: string, value: number | null): LiveMetric => ({ key, label, unit, value, valueClass: "measured", source });
  const n = countOf(samples, "DCGM_FI_DEV_GPU_UTIL");
  return [
    m("gpuCount", "GPUs reporting", "GPUs", n || null),
    m("gpuUtil", "GPU utilization (avg)", "%", avgOf(samples, "DCGM_FI_DEV_GPU_UTIL")),
    m("fbUsedMiB", "GPU memory used (sum)", "MiB", sumOf(samples, "DCGM_FI_DEV_FB_USED")),
    m("powerW", "GPU power draw (sum)", "W", sumOf(samples, "DCGM_FI_DEV_POWER_USAGE")),
    m("energyMj", "GPU energy since driver load (sum)", "mJ", sumOf(samples, "DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION")),
  ];
}
