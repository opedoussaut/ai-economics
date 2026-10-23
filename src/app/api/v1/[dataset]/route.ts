import { NextResponse } from "next/server";
import { getChanges, getGpuSnapshot, getSourceStatuses, getTokenSnapshot, getTools } from "@/lib/data/store";
import { toCsvServer } from "@/lib/csv";

export const revalidate = 300;

const DATASETS = ["token-prices", "gpu-prices", "tools", "changes", "sources"] as const;
type Dataset = (typeof DATASETS)[number];

const ATTRIBUTION =
  "AI Economics. Token prices aggregated from the LiteLLM model price map (MIT) and OpenRouter; GPU prices from the Azure Retail Prices API and Vast.ai (aggregates). Verify against official provider pages.";

/** Public, read-only datasets. Add ?format=csv for CSV (token-prices, gpu-prices). */
export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!DATASETS.includes(dataset as Dataset)) return NextResponse.json({ error: "unknown dataset", datasets: DATASETS }, { status: 404 });
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  const headers = { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" };
  const csvResponse = (rows: Record<string, unknown>[]) =>
    new NextResponse(toCsvServer(rows), { headers: { ...headers, "content-type": "text/csv; charset=utf-8" } });

  switch (dataset as Dataset) {
    case "token-prices": {
      const s = await getTokenSnapshot();
      if (!s) return NextResponse.json({ error: "no data" }, { status: 503 });
      if (csv) {
        return csvResponse(s.offerings.map((o) => ({
          id: o.id, model_id: o.modelId, developer: o.developer, provider: o.providerName, channel: o.channel, source: o.sourceId,
          input_usd_per_m: o.prices.input, output_usd_per_m: o.prices.output, cache_read_usd_per_m: o.prices.cacheRead ?? null,
          cache_write_usd_per_m: o.prices.cacheWrite ?? null, batch_input_usd_per_m: o.prices.batchInput ?? null,
          batch_output_usd_per_m: o.prices.batchOutput ?? null, context_window: o.contextWindow, listed: o.listed,
          price_observed_at: o.observedAt, official_url: o.officialUrl,
        })));
      }
      return NextResponse.json({ attribution: ATTRIBUTION, valueClass: "published", unit: "USD per 1M tokens", ...s }, { headers });
    }
    case "gpu-prices": {
      const s = await getGpuSnapshot();
      if (!s) return NextResponse.json({ error: "no data" }, { status: 503 });
      if (csv) {
        return csvResponse(s.offerings.map((o) => ({
          id: o.id, source: o.sourceId, provider: o.provider, kind: o.kind, gpu_model: o.gpuModel, gpu_count: o.gpuCount, region: o.region,
          instance_type: o.instanceType, on_demand_instance_hour: o.onDemandPerHour, spot_instance_hour: o.spotPerHour,
          reserved_1y_instance_hour: o.reserved1yPerHour, market_median_per_gpu_hour: o.perGpuHourStats?.median ?? null,
          market_offers: o.perGpuHourStats?.n ?? null, listed: o.listed, observed_at: o.observedAt,
        })));
      }
      return NextResponse.json({ attribution: ATTRIBUTION, valueClass: "published", unit: "USD per hour", ...s }, { headers });
    }
    case "tools":
      return NextResponse.json({ tools: await getTools() }, { headers });
    case "changes":
      return NextResponse.json({ changes: (await getChanges()).slice(0, 500) }, { headers });
    case "sources":
      return NextResponse.json(
        { sources: (await getSourceStatuses()).map(({ source, entry, freshness }) => ({ ...source, health: entry, freshness })) },
        { headers },
      );
  }
}
