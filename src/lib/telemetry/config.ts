/**
 * Integration configuration comes ONLY from server environment variables.
 * Endpoint URLs and credentials are never sent to the browser; the public UI
 * only learns whether each integration is configured.
 */
export interface IntegrationStatus {
  id: string;
  name: string;
  mode: "adapter" | "documentation-only";
  configured: boolean;
  description: string;
  envVars: string[];
}

const has = (k: string) => !!process.env[k]?.trim();

export function integrationStatuses(): IntegrationStatus[] {
  return [
    { id: "prometheus", name: "Prometheus (read-only)", mode: "adapter", configured: has("PROMETHEUS_URL"),
      description: "Instant PromQL queries for vLLM and DCGM metrics via GET /api/v1/query.", envVars: ["PROMETHEUS_URL", "PROMETHEUS_BEARER_TOKEN (optional)"] },
    { id: "vllm", name: "vLLM /metrics (direct scrape)", mode: "adapter", configured: has("VLLM_METRICS_URL"),
      description: "Reads token counters, queue depth, latency histograms and KV-cache usage from a vLLM server.", envVars: ["VLLM_METRICS_URL"] },
    { id: "dcgm", name: "NVIDIA dcgm-exporter (direct scrape)", mode: "adapter", configured: has("DCGM_EXPORTER_URL"),
      description: "Reads GPU utilization, memory, power and cumulative energy.", envVars: ["DCGM_EXPORTER_URL"] },
    { id: "mlflow", name: "MLflow Tracking", mode: "adapter", configured: has("MLFLOW_TRACKING_URI"),
      description: "Reads run status and metric history (loss, reward, steps) via the MLflow REST API.", envVars: ["MLFLOW_TRACKING_URI", "MLFLOW_TRACKING_TOKEN (optional)"] },
    { id: "otlp", name: "OpenTelemetry GenAI (OTLP/HTTP JSON)", mode: "adapter", configured: has("INGEST_TOKEN"),
      description: "Push endpoint for GenAI spans; stores token usage only (never prompts/completions).", envVars: ["INGEST_TOKEN"] },
    { id: "langfuse", name: "Langfuse", mode: "documentation-only", configured: false,
      description: "Export Langfuse traces via OpenTelemetry to the OTLP endpoint, or use Langfuse's own cost views. No direct importer yet.", envVars: [] },
    { id: "litellm", name: "LiteLLM Proxy", mode: "documentation-only", configured: false,
      description: "Scrape LiteLLM's Prometheus metrics into your Prometheus, or send its OpenTelemetry callback to the OTLP endpoint.", envVars: [] },
  ];
}

export const telemetryEnv = () => ({
  prometheus: process.env.PROMETHEUS_URL ? { url: process.env.PROMETHEUS_URL, bearerToken: process.env.PROMETHEUS_BEARER_TOKEN } : null,
  vllmUrl: process.env.VLLM_METRICS_URL ?? null,
  dcgmUrl: process.env.DCGM_EXPORTER_URL ?? null,
  mlflow: process.env.MLFLOW_TRACKING_URI ? { trackingUri: process.env.MLFLOW_TRACKING_URI, token: process.env.MLFLOW_TRACKING_TOKEN } : null,
  pollSeconds: Math.min(300, Math.max(5, Number(process.env.TELEMETRY_POLL_SECONDS ?? 15))),
});
