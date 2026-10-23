# Integrations

All integrations are configured with server environment variables (see `.env.example`). The public UI only shows whether each is configured; addresses and credentials never reach the browser. The live view (`/monitoring/live`) and `/api/telemetry/*` require an admin session (`ADMIN_TOKEN`, `SESSION_SECRET`).

| Integration | Status | Mode |
|---|---|---|
| Prometheus (read-only) | Working adapter | Pull, `GET /api/v1/query` |
| vLLM `/metrics` | Working adapter | Pull, Prometheus text format |
| NVIDIA dcgm-exporter | Working adapter | Pull, Prometheus text format |
| MLflow Tracking | Working adapter | Pull, REST `runs/get`, `metrics/get-history` |
| OpenTelemetry GenAI | Working adapter | Push, OTLP/HTTP **JSON** |
| Langfuse | Documentation only | via OTel export |
| LiteLLM Proxy | Documentation only | via Prometheus or OTel callback |
| NVIDIA Triton | Documentation only | scrape `:8002/metrics` with Prometheus; GPU metrics via DCGM |

Adapters are covered by tests that serve real-format responses from a local HTTP server (`tests/unit/telemetry.test.ts`) and by an end-to-end OTLP ingest test against the production build. No production Prometheus/vLLM/DCGM/MLflow instance was available while building this release, so they have not been exercised against live infrastructure yet.

## Prometheus

```
PROMETHEUS_URL=http://prometheus.internal:9090
PROMETHEUS_BEARER_TOKEN=            # optional
```

Queries used (see `/monitoring` for the full table):

* vLLM: `sum(vllm:prompt_tokens_total)`, `sum(vllm:generation_tokens_total)`, `sum(rate(vllm:generation_tokens_total[1m]))`, `sum(vllm:num_requests_running)`, `sum(vllm:num_requests_waiting)`, `histogram_quantile(0.5, sum by (le) (rate(vllm:time_to_first_token_seconds_bucket[5m])))`, `histogram_quantile(0.95, … vllm:e2e_request_latency_seconds_bucket …)`, `100 * avg(vllm:kv_cache_usage_perc or vllm:gpu_cache_usage_perc)`, abort share from `vllm:request_success_total{finished_reason="abort"}`.
* DCGM: `count(DCGM_FI_DEV_GPU_UTIL)`, `avg(DCGM_FI_DEV_GPU_UTIL)`, `sum(DCGM_FI_DEV_FB_USED)`, `sum(DCGM_FI_DEV_POWER_USAGE)`, `sum(DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION)`.

Scope queries to one workload with Prometheus relabelling or a dedicated Prometheus; the adapter aggregates everything it sees.

## vLLM (direct)

```
VLLM_METRICS_URL=http://vllm-host:8000/metrics
```

Counter and gauge values are read directly; latency quantiles are computed from cumulative histogram buckets (since server start). Metric names verified against vLLM's V1 metrics design doc and source (`vllm/v1/metrics/loggers.py`); V0's `gpu_cache_usage_perc` is accepted as a fallback.

## NVIDIA DCGM

```
DCGM_EXPORTER_URL=http://gpu-node:9400/metrics
```

Requires the default counters (`DCGM_FI_DEV_GPU_UTIL`, `DCGM_FI_DEV_FB_USED`, `DCGM_FI_DEV_POWER_USAGE`, `DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION`). Energy is cumulative in millijoules since driver load; per-run energy = delta from the run baseline ÷ 3.6×10⁹ → kWh.

## MLflow

```
MLFLOW_TRACKING_URI=https://mlflow.internal
MLFLOW_TRACKING_TOKEN=              # optional bearer token
```

Link a workload run to an MLflow run ID when creating it. The live view shows run status and the latest loss/reward/KL metrics. Params and tags are not exposed.

## OpenTelemetry GenAI (push)

```
INGEST_TOKEN=<random secret>
```

```bash
curl -X POST https://<host>/api/ingest/otlp/v1/traces \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" --data @traces.json
```

OpenTelemetry Collector:

```yaml
exporters:
  otlphttp/aie:
    traces_endpoint: https://<host>/api/ingest/otlp/v1/traces
    encoding: json
    headers:
      Authorization: "Bearer ${env:INGEST_TOKEN}"
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlphttp/aie]
```

Attributes read (GenAI conventions, now maintained at `open-telemetry/semantic-conventions-genai`): `gen_ai.provider.name` (fallback `gen_ai.system`), `gen_ai.response.model` / `gen_ai.request.model`, `gen_ai.operation.name`, `gen_ai.usage.input_tokens` (fallback `prompt_tokens`), `gen_ai.usage.output_tokens` (fallback `completion_tokens`), `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`, `gen_ai.usage.reasoning.output_tokens`, `error.type`, plus optional `aie.project`; resource `service.name`. Content attributes are ignored. Protobuf encoding returns 415. Limit 5 MB per request.

Each span's cost is calculated by matching provider + model to a LiteLLM-map offering (`openai`, `anthropic`, `gcp.gemini`, `gcp.vertex_ai`, `aws.bedrock`, `azure.ai.openai`, …). Unmatched spans are stored without cost and counted as *unpriced*.

## Langfuse

Langfuse computes per-trace cost itself. To consolidate in AI Economics, use Langfuse's OpenTelemetry support or instrument with an OTel GenAI SDK and export to the OTLP endpoint above. A direct importer for the Langfuse public API is not implemented.

## LiteLLM Proxy

Add the proxy's Prometheus endpoint to your Prometheus scrape config (check your LiteLLM edition for metric availability), or enable its OpenTelemetry callback with the OTLP endpoint above.

## Workload runs and attribution

Runs record GPU count, $/GPU-hour (with its source), optional electricity price, planned tokens/steps and an MLflow run ID. At creation, counter baselines are captured from connected sources. Cost to date uses reserved allocation; see METHODOLOGY §10 for other attribution methods.
