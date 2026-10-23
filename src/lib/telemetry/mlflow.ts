import { z } from "zod";
import { fetchJson } from "@/lib/ingest/http";

/**
 * Read-only MLflow Tracking REST client.
 * https://mlflow.org/docs/latest/api_reference/rest-api.html
 */
export interface MlflowConfig {
  trackingUri: string;
  token?: string;
}

const Metric = z.object({ key: z.string(), value: z.number(), timestamp: z.union([z.number(), z.string()]), step: z.union([z.number(), z.string()]).optional() });
const RunResp = z.object({
  run: z.object({
    info: z.object({
      run_id: z.string(),
      run_name: z.string().optional(),
      status: z.string(),
      start_time: z.union([z.number(), z.string()]).optional(),
      end_time: z.union([z.number(), z.string()]).optional().nullable(),
      experiment_id: z.string(),
    }),
    data: z.object({
      metrics: z.array(Metric).optional(),
      params: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
      tags: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
    }),
  }),
});
const HistoryResp = z.object({ metrics: z.array(Metric).optional(), next_page_token: z.string().optional() });

const headers = (c: MlflowConfig): Record<string, string> => (c.token ? { authorization: `Bearer ${c.token}` } : {});
const base = (c: MlflowConfig) => c.trackingUri.replace(/\/$/, "");

export async function getMlflowRun(c: MlflowConfig, runId: string) {
  const r = RunResp.parse(await fetchJson(`${base(c)}/api/2.0/mlflow/runs/get?run_id=${encodeURIComponent(runId)}`, { headers: headers(c), timeoutMs: 8000, retries: 1 }));
  const info = r.run.info;
  // Only metrics and non-sensitive run metadata are returned; params/tags are not exposed.
  return {
    runId: info.run_id,
    name: info.run_name ?? info.run_id,
    status: info.status,
    startTime: info.start_time ? new Date(Number(info.start_time)).toISOString() : null,
    endTime: info.end_time ? new Date(Number(info.end_time)).toISOString() : null,
    metrics: (r.run.data.metrics ?? []).map((m) => ({ key: m.key, value: m.value, step: Number(m.step ?? 0), at: new Date(Number(m.timestamp)).toISOString() })),
  };
}

export async function getMlflowMetricHistory(c: MlflowConfig, runId: string, key: string, maxResults = 1000) {
  const r = HistoryResp.parse(
    await fetchJson(`${base(c)}/api/2.0/mlflow/metrics/get-history?run_id=${encodeURIComponent(runId)}&metric_key=${encodeURIComponent(key)}&max_results=${maxResults}`, {
      headers: headers(c), timeoutMs: 8000, retries: 1,
    }),
  );
  return (r.metrics ?? []).map((m) => ({ step: Number(m.step ?? 0), value: m.value, at: new Date(Number(m.timestamp)).toISOString() }));
}
