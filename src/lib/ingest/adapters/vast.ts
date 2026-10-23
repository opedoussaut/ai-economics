import { z } from "zod";
import { D } from "@/lib/money";
import { fetchJson, type FetchOptions } from "@/lib/ingest/http";
import { computeStats } from "@/lib/stats";
import type { ObservedGpuOffering } from "./azure";

/**
 * Vast.ai marketplace search API (documented at https://vast.ai/developers/api).
 * Offers are set by independent hosts; we publish aggregate statistics only
 * (no individual host listings) and link out to the marketplace.
 */
export const VAST_SOURCE = {
  id: "vast",
  name: "Vast.ai marketplace search API",
  url: "https://console.vast.ai/api/v0/bundles/",
  docs: "https://vast.ai/developers/api",
  marketplace: "https://cloud.vast.ai/create/",
} as const;

export const VAST_GPUS: { name: string; family: string; model: string; memoryGb: number | null }[] = [
  { name: "H100 SXM", family: "H100", model: "H100 SXM 80GB", memoryGb: 80 },
  { name: "H100 PCIE", family: "H100", model: "H100 PCIe 80GB", memoryGb: 80 },
  { name: "H100 NVL", family: "H100", model: "H100 NVL 94GB", memoryGb: 94 },
  { name: "H200", family: "H200", model: "H200 SXM 141GB", memoryGb: 141 },
  { name: "H200 NVL", family: "H200", model: "H200 NVL 141GB", memoryGb: 141 },
  { name: "B200", family: "B200", model: "B200 180GB", memoryGb: null },
  { name: "B300", family: "B300", model: "B300", memoryGb: null },
  { name: "A100 SXM4", family: "A100", model: "A100 SXM4", memoryGb: null },
  { name: "A100 PCIE", family: "A100", model: "A100 PCIe", memoryGb: null },
  { name: "L40S", family: "L40S", model: "L40S 48GB", memoryGb: 48 },
  { name: "RTX PRO 6000 S", family: "RTX PRO 6000", model: "RTX PRO 6000 Server", memoryGb: 96 },
  { name: "RTX PRO 6000 WS", family: "RTX PRO 6000", model: "RTX PRO 6000 Workstation", memoryGb: 96 },
  { name: "RTX 6000Ada", family: "RTX 6000 Ada", model: "RTX 6000 Ada 48GB", memoryGb: 48 },
  { name: "RTX 5090", family: "RTX 5090", model: "GeForce RTX 5090 32GB", memoryGb: 32 },
  { name: "RTX 4090", family: "RTX 4090", model: "GeForce RTX 4090 24GB", memoryGb: 24 },
];

const Offer = z.object({
  num_gpus: z.number().positive(),
  dph_total: z.number().positive(),
  gpu_name: z.string(),
  gpu_ram: z.number().optional(),
  verification: z.string().optional(),
});
const Resp = z.object({ offers: z.array(z.unknown()) });

/** Minimum number of offers before we publish statistics. */
export const VAST_MIN_OFFERS = 3;

export async function fetchVastGpu(name: string, opts?: FetchOptions) {
  const q = {
    gpu_name: { eq: name },
    rentable: { eq: true },
    rented: { eq: false },
    verified: { eq: true },
    type: "on-demand",
    limit: 1000,
  };
  return Resp.parse(await fetchJson(`${VAST_SOURCE.url}?q=${encodeURIComponent(JSON.stringify(q))}`, opts))
    .offers;
}

export function normalizeVast(
  gpu: (typeof VAST_GPUS)[number],
  offersRaw: unknown[],
  observedAt: string,
): ObservedGpuOffering | null {
  const perGpu: number[] = [];
  for (const raw of offersRaw) {
    const o = Offer.safeParse(raw);
    if (!o.success || o.data.gpu_name !== gpu.name) continue;
    perGpu.push(D(o.data.dph_total).div(o.data.num_gpus).toDecimalPlaces(4).toNumber());
  }
  if (perGpu.length < VAST_MIN_OFFERS) return null;
  const stats = computeStats(perGpu);
  return {
    id: `vast:${gpu.name}`,
    sourceId: VAST_SOURCE.id,
    provider: "Vast.ai marketplace",
    kind: "marketplace-aggregate",
    priceScope: "marketplace-offer",
    gpuFamily: gpu.family,
    gpuModel: gpu.model,
    gpuCount: 1,
    gpuMemoryGb: gpu.memoryGb,
    region: "global (mixed host locations)",
    instanceType: null,
    os: null,
    vcpus: null,
    ramGb: null,
    interconnect: null,
    sharing: "dedicated",
    billingUnit: "per second",
    currency: "USD",
    onDemandPerHour: null,
    spotPerHour: null,
    reserved1yPerHour: null,
    reserved3yPerHour: null,
    perGpuHourStats: stats,
    sourceUrl: VAST_SOURCE.marketplace,
    collectedFrom: VAST_SOURCE.url,
    observedAt,
    effectiveDate: null,
    notes:
      "Statistics over verified, rentable on-demand offers at collection time. Per-GPU price = offer dph_total / GPUs in offer; includes host CPU/RAM share and default disk, excludes bandwidth. Host quality and reliability vary.",
  };
}
