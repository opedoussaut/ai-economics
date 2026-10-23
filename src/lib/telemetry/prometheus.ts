import { z } from "zod";
import { fetchWithRetry } from "@/lib/ingest/http";

/**
 * Read-only Prometheus HTTP API client (GET /api/v1/query only).
 * https://prometheus.io/docs/prometheus/latest/querying/api/
 */
const QueryResponse = z.object({
  status: z.enum(["success", "error"]),
  error: z.string().optional(),
  data: z
    .object({
      resultType: z.string(),
      result: z.array(z.object({ metric: z.record(z.string(), z.string()), value: z.tuple([z.number(), z.string()]) })),
    })
    .optional(),
});

export interface PromConfig {
  url: string;
  bearerToken?: string;
  timeoutMs?: number;
}

/** Returns the scalar value of an instant query (first series), or null when empty. */
export async function instantQuery(cfg: PromConfig, promql: string, fetchImpl?: typeof fetch): Promise<number | null> {
  const url = `${cfg.url.replace(/\/$/, "")}/api/v1/query?query=${encodeURIComponent(promql)}`;
  const res = await fetchWithRetry(url, {
    timeoutMs: cfg.timeoutMs ?? 5000,
    retries: 1,
    headers: cfg.bearerToken ? { authorization: `Bearer ${cfg.bearerToken}` } : {},
    fetchImpl,
  });
  const body = QueryResponse.parse(await res.json());
  if (body.status !== "success") throw new Error(body.error ?? "Prometheus query failed");
  const first = body.data?.result[0];
  if (!first) return null;
  const v = Number(first.value[1]);
  return Number.isFinite(v) ? v : null;
}
