import type { DailyIndexRow, GpuOffering, Stats, TokenOffering } from "@/lib/data/schemas";
import { computeStats } from "@/lib/stats";
import { perGpuHour } from "@/lib/ingest/indexer";

/** Paid, listed offerings with both standard prices (free/promo tiers excluded). */
export const isPaid = (o: TokenOffering) => o.listed && (o.prices.input ?? 0) > 0 && (o.prices.output ?? 0) > 0;

export function cheapest(offerings: TokenOffering[], field: "input" | "output", filter: (o: TokenOffering) => boolean) {
  return offerings.filter((o) => isPaid(o) && filter(o)).sort((a, b) => a.prices[field]! - b.prices[field]!)[0] ?? null;
}

export function priceStats(offerings: TokenOffering[], field: "input" | "output", filter: (o: TokenOffering) => boolean): Stats | null {
  const xs = offerings.filter((o) => isPaid(o) && filter(o)).map((o) => o.prices[field]!);
  return xs.length ? computeStats(xs) : null;
}

export interface GpuFamilySummary {
  family: string;
  marketplace: { median: number; min: number; max: number; n: number; models: number } | null;
  cloudOnDemand: Stats | null;
  cloudSpotMin: number | null;
  cloudReserved1yMin: number | null;
  regions: number;
}

const FAMILY_ORDER = ["B300", "B200", "H200", "H100", "MI300X", "A100", "L40S", "RTX PRO 6000", "RTX 6000 Ada", "RTX 5090", "RTX 4090"];

export function gpuFamilies(offerings: GpuOffering[]): GpuFamilySummary[] {
  const fams = [...new Set(offerings.filter((o) => o.listed).map((o) => o.gpuFamily))];
  fams.sort((a, b) => (FAMILY_ORDER.indexOf(a) + 99) % 99 - (FAMILY_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b));
  return fams.map((family) => {
    const of = offerings.filter((o) => o.listed && o.gpuFamily === family);
    const market = of.filter((o) => o.kind === "marketplace-aggregate" && o.perGpuHourStats);
    const cloud = of.filter((o) => o.kind === "list-price");
    const onDemand = cloud.map((o) => perGpuHour(o)).filter((x): x is number => x !== null);
    const spot = cloud.map((o) => perGpuHour(o, "spotPerHour")).filter((x): x is number => x !== null);
    const r1 = cloud.map((o) => perGpuHour(o, "reserved1yPerHour")).filter((x): x is number => x !== null);
    return {
      family,
      marketplace: market.length
        ? {
            median: computeStats(market.map((m) => m.perGpuHourStats!.median)).median,
            min: Math.min(...market.map((m) => m.perGpuHourStats!.min)),
            max: Math.max(...market.map((m) => m.perGpuHourStats!.max)),
            n: market.reduce((a, m) => a + m.perGpuHourStats!.n, 0),
            models: market.length,
          }
        : null,
      cloudOnDemand: onDemand.length ? computeStats(onDemand) : null,
      cloudSpotMin: spot.length ? Math.min(...spot) : null,
      cloudReserved1yMin: r1.length ? Math.min(...r1) : null,
      regions: new Set(cloud.map((o) => o.region)).size,
    };
  });
}

/** Pivot daily index rows into chart rows {date, <key>:<metric>: value}. */
export function pivotIndex(rows: DailyIndexRow[], picks: { key: string; metric: string; stat?: keyof Stats; as: string }[]) {
  const byDate = new Map<string, Record<string, number | string | null>>();
  for (const p of picks) {
    for (const r of rows) {
      if (r.key !== p.key || r.metric !== p.metric) continue;
      const row = byDate.get(r.date) ?? { date: r.date };
      row[p.as] = r.stats[p.stat ?? "median"];
      byDate.set(r.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
