import { fetchText } from "@/lib/ingest/http";
import { telemetryEnv } from "./config";
import { DCGM_PROMQL, VLLM_PROMQL, dcgmFromScrape, vllmFromScrape, type LiveMetric } from "./mappings";
import { instantQuery } from "./prometheus";
import { parsePromText } from "./promtext";

export interface LiveSnapshot {
  sampledAt: string;
  connected: boolean;
  sources: { id: string; ok: boolean; error: string | null }[];
  metrics: LiveMetric[];
}

/**
 * Collect a point-in-time snapshot from every configured source. Prometheus
 * is preferred (it supports rates and windowed quantiles); direct scrapes are
 * used for sources Prometheus does not cover. Nothing is synthesised: a
 * missing source yields no metrics, never placeholder values.
 */
export async function collectLive(fetchImpl?: typeof fetch): Promise<LiveSnapshot> {
  const env = telemetryEnv();
  const sampledAt = new Date().toISOString();
  const sources: LiveSnapshot["sources"] = [];
  const metrics: LiveMetric[] = [];

  if (env.prometheus) {
    const prom = env.prometheus;
    const results = await Promise.allSettled(
      [...VLLM_PROMQL, ...DCGM_PROMQL].map(async (q) => ({ q, value: await instantQuery(prom, q.query, fetchImpl) })),
    );
    let firstError: string | null = null;
    for (const r of results) {
      if (r.status === "fulfilled") {
        metrics.push({ key: r.value.q.key, label: r.value.q.label, unit: r.value.q.unit, value: r.value.value, valueClass: "measured", source: "prometheus" });
      } else firstError ??= r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
    sources.push({ id: "prometheus", ok: results.some((r) => r.status === "fulfilled"), error: firstError });
  }

  const scrape = async (id: string, url: string | null, map: typeof vllmFromScrape) => {
    if (!url) return;
    try {
      const text = await fetchText(url, { timeoutMs: 5000, retries: 1, fetchImpl, headers: { accept: "text/plain" } });
      const fromScrape = map(parsePromText(text), id);
      for (const m of fromScrape) {
        // Prefer Prometheus values when both exist.
        if (!metrics.some((x) => x.key === m.key && x.value !== null)) {
          const idx = metrics.findIndex((x) => x.key === m.key);
          if (idx >= 0) metrics.splice(idx, 1);
          metrics.push(m);
        }
      }
      sources.push({ id, ok: true, error: null });
    } catch (err) {
      sources.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
  await scrape("vllm", env.vllmUrl, vllmFromScrape);
  await scrape("dcgm", env.dcgmUrl, dcgmFromScrape);

  return { sampledAt, connected: sources.some((s) => s.ok), sources, metrics };
}

export const metricValue = (s: LiveSnapshot, key: string) => s.metrics.find((m) => m.key === key)?.value ?? null;
