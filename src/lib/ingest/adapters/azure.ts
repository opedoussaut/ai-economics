import { z } from "zod";
import { D, HOURS_PER_YEAR } from "@/lib/money";
import type { GpuOffering } from "@/lib/data/schemas";
import { fetchJson, type FetchOptions } from "@/lib/ingest/http";

export type ObservedGpuOffering = Omit<GpuOffering, "firstSeenAt" | "listed" | "delistedAt">;

/**
 * Azure Retail Prices API: official, public, unauthenticated.
 * https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices
 */
export const AZURE_SOURCE = {
  id: "azure",
  name: "Azure Retail Prices API",
  url: "https://prices.azure.com/api/retail/prices",
  docs: "https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices",
  pricingPage: "https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/",
} as const;

/**
 * GPU VM SKUs we track. GPU counts/models follow Azure's VM size documentation.
 * vCPU counts follow Azure's naming convention (the number in the size name).
 * RAM is intentionally left null rather than restated from memory.
 */
export const AZURE_GPU_SKUS: Record<
  string,
  { gpuFamily: string; gpuModel: string; gpuCount: number; gpuMemoryGb: number | null; interconnect: string | null }
> = {
  Standard_ND96isr_H100_v5: { gpuFamily: "H100", gpuModel: "H100 SXM 80GB", gpuCount: 8, gpuMemoryGb: 80, interconnect: "NVLink + InfiniBand" },
  Standard_NC40ads_H100_v5: { gpuFamily: "H100", gpuModel: "H100 NVL 94GB", gpuCount: 1, gpuMemoryGb: 94, interconnect: null },
  Standard_NC80adis_H100_v5: { gpuFamily: "H100", gpuModel: "H100 NVL 94GB", gpuCount: 2, gpuMemoryGb: 94, interconnect: "NVLink bridge" },
  Standard_ND96isr_H200_v5: { gpuFamily: "H200", gpuModel: "H200 SXM 141GB", gpuCount: 8, gpuMemoryGb: 141, interconnect: "NVLink + InfiniBand" },
  Standard_ND96amsr_A100_v4: { gpuFamily: "A100", gpuModel: "A100 SXM 80GB", gpuCount: 8, gpuMemoryGb: 80, interconnect: "NVLink + InfiniBand" },
  Standard_ND96asr_v4: { gpuFamily: "A100", gpuModel: "A100 SXM 40GB", gpuCount: 8, gpuMemoryGb: 40, interconnect: "NVLink + InfiniBand" },
  Standard_NC24ads_A100_v4: { gpuFamily: "A100", gpuModel: "A100 PCIe 80GB", gpuCount: 1, gpuMemoryGb: 80, interconnect: null },
  Standard_NC48ads_A100_v4: { gpuFamily: "A100", gpuModel: "A100 PCIe 80GB", gpuCount: 2, gpuMemoryGb: 80, interconnect: null },
  Standard_NC96ads_A100_v4: { gpuFamily: "A100", gpuModel: "A100 PCIe 80GB", gpuCount: 4, gpuMemoryGb: 80, interconnect: null },
  Standard_ND96isr_MI300X_v5: { gpuFamily: "MI300X", gpuModel: "AMD Instinct MI300X 192GB", gpuCount: 8, gpuMemoryGb: 192, interconnect: "Infinity Fabric + InfiniBand" },
  Standard_ND128isr_NDR_GB200_v6: { gpuFamily: "B200", gpuModel: "GB200 (Blackwell)", gpuCount: 4, gpuMemoryGb: null, interconnect: "NVLink + InfiniBand" },
};

const Item = z.object({
  armSkuName: z.string(),
  armRegionName: z.string(),
  location: z.string().optional(),
  retailPrice: z.number(),
  unitOfMeasure: z.string(),
  currencyCode: z.string(),
  type: z.string(),
  reservationTerm: z.string().optional().nullable(),
  productName: z.string(),
  skuName: z.string(),
  effectiveStartDate: z.string().optional(),
});
const Page = z.object({ Items: z.array(Item), NextPageLink: z.string().nullable().optional() });
type AzureItem = z.infer<typeof Item>;

export async function fetchAzureSku(sku: string, opts?: FetchOptions): Promise<AzureItem[]> {
  const filter = `serviceName eq 'Virtual Machines' and armSkuName eq '${sku}'`;
  let url: string | null = `${AZURE_SOURCE.url}?currencyCode='USD'&$filter=${encodeURIComponent(filter)}`;
  const items: AzureItem[] = [];
  for (let page = 0; url && page < 20; page++) {
    const p = Page.parse(await fetchJson(url, opts));
    items.push(...p.Items);
    url = p.NextPageLink ?? null;
  }
  return items;
}

/** Group Linux, non-DevTest price rows by region into one offering per SKU+region. */
export function normalizeAzure(sku: string, items: AzureItem[], observedAt: string): ObservedGpuOffering[] {
  const spec = AZURE_GPU_SKUS[sku];
  if (!spec) return [];
  const byRegion = new Map<string, { onDemand?: number; spot?: number; r1?: number; r3?: number; eff?: string; location?: string }>();
  for (const i of items) {
    if (i.currencyCode !== "USD" || i.unitOfMeasure !== "1 Hour") continue;
    if (/Windows/i.test(i.productName) || /Low Priority/i.test(i.skuName)) continue;
    const r = byRegion.get(i.armRegionName) ?? { location: i.location };
    if (i.type === "Consumption") {
      if (/Spot/i.test(i.skuName)) r.spot = i.retailPrice;
      else {
        r.onDemand = i.retailPrice;
        r.eff = i.effectiveStartDate;
      }
    } else if (i.type === "Reservation") {
      // Reservation rows are the total price for the whole term.
      if (i.reservationTerm === "1 Year") r.r1 = D(i.retailPrice).div(HOURS_PER_YEAR).toDecimalPlaces(4).toNumber();
      if (i.reservationTerm === "3 Years")
        r.r3 = D(i.retailPrice).div(HOURS_PER_YEAR.mul(3)).toDecimalPlaces(4).toNumber();
    }
    byRegion.set(i.armRegionName, r);
  }
  const vcpus = Number(/^Standard_[A-Z]+?(\d+)/.exec(sku)?.[1] ?? NaN);
  const out: ObservedGpuOffering[] = [];
  for (const [region, r] of byRegion) {
    if (r.onDemand === undefined && r.spot === undefined) continue;
    out.push({
      id: `azure:${sku}:${region}`,
      sourceId: AZURE_SOURCE.id,
      provider: "Microsoft Azure",
      kind: "list-price",
      priceScope: "full-instance",
      ...spec,
      region,
      instanceType: sku,
      os: "Linux",
      vcpus: Number.isFinite(vcpus) ? vcpus : null,
      ramGb: null,
      sharing: "dedicated",
      billingUnit: "per second, quoted hourly",
      currency: "USD",
      onDemandPerHour: r.onDemand ?? null,
      spotPerHour: r.spot ?? null,
      reserved1yPerHour: r.r1 ?? null,
      reserved3yPerHour: r.r3 ?? null,
      perGpuHourStats: null,
      sourceUrl: AZURE_SOURCE.pricingPage,
      collectedFrom: AZURE_SOURCE.url,
      observedAt,
      effectiveDate: r.eff ?? null,
      notes: "Full VM price (GPUs, vCPUs, RAM, local NVMe). Spot is evictable; reserved is the term total amortised per hour.",
    });
  }
  return out;
}
