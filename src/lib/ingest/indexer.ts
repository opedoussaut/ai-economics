import type { DailyIndexRow, GpuOffering, TokenOffering } from "@/lib/data/schemas";
import { computeStats } from "@/lib/stats";
import { D } from "@/lib/money";

/**
 * Daily aggregate rows used for trend charts. Each row states its population
 * (`key`) and is an UNWEIGHTED statistic over the offerings in that population
 * on that date — never a "global market average".
 */
export const TOKEN_POPULATIONS: { key: string; label: string; filter: (o: TokenOffering) => boolean }[] = [
  { key: "token:direct", label: "First-party developer APIs (LiteLLM map)", filter: (o) => o.channel === "direct" && o.sourceId === "litellm" },
  { key: "token:third-party-host", label: "Third-party hosts (LiteLLM map)", filter: (o) => o.channel === "third-party-host" && o.sourceId === "litellm" },
  { key: "token:cloud-platform", label: "Cloud platforms (LiteLLM map)", filter: (o) => o.channel === "cloud-platform" && o.sourceId === "litellm" },
  { key: "token:openrouter", label: "OpenRouter catalogue", filter: (o) => o.sourceId === "openrouter" },
];

export function tokenIndexRows(offerings: TokenOffering[], date: string, origin: string): DailyIndexRow[] {
  const rows: DailyIndexRow[] = [];
  for (const pop of TOKEN_POPULATIONS) {
    // Exclude free/zero-priced entries: they are promotional, not comparable.
    const members = offerings.filter(
      (o) => o.listed && pop.filter(o) && (o.prices.input ?? 0) > 0 && (o.prices.output ?? 0) > 0,
    );
    if (members.length < 5) continue;
    for (const metric of ["input", "output"] as const) {
      rows.push({
        date, dataset: "token", key: pop.key, metric,
        stats: computeStats(members.map((o) => o.prices[metric]!)), origin,
      });
    }
  }
  return rows;
}

/** Per-GPU-hour on-demand price of a list-price offering (instance price / GPU count). */
export const perGpuHour = (o: GpuOffering, field: "onDemandPerHour" | "spotPerHour" | "reserved1yPerHour" | "reserved3yPerHour" = "onDemandPerHour") =>
  o[field] === null ? null : D(o[field]!).div(o.gpuCount).toDecimalPlaces(4).toNumber();

export function gpuIndexRows(offerings: GpuOffering[], date: string, origin: string): DailyIndexRow[] {
  const rows: DailyIndexRow[] = [];
  const families = new Set(offerings.map((o) => o.gpuFamily));
  for (const fam of families) {
    const listPrices = offerings
      .filter((o) => o.listed && o.gpuFamily === fam && o.kind === "list-price" && o.onDemandPerHour !== null)
      .map((o) => perGpuHour(o)!);
    if (listPrices.length >= 1) {
      rows.push({ date, dataset: "gpu", key: `gpu:${fam}:cloud-list`, metric: "perGpuHour", stats: computeStats(listPrices), origin });
    }
    const market = offerings.filter((o) => o.listed && o.gpuFamily === fam && o.kind === "marketplace-aggregate" && o.perGpuHourStats);
    const medians = market.map((o) => o.perGpuHourStats!.median);
    if (medians.length >= 1) {
      rows.push({ date, dataset: "gpu", key: `gpu:${fam}:marketplace`, metric: "perGpuHour", stats: computeStats(medians), origin });
    }
  }
  return rows;
}

/** Replace rows with the same (date, key, metric, origin); keeps the log idempotent per day. */
export function upsertIndex(existing: DailyIndexRow[], incoming: DailyIndexRow[]): DailyIndexRow[] {
  const k = (r: DailyIndexRow) => `${r.date}|${r.key}|${r.metric}|${r.origin}`;
  const map = new Map(existing.map((r) => [k(r), r]));
  for (const r of incoming) map.set(k(r), r);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
