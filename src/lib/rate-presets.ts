import type { GpuOffering, TokenOffering } from "@/lib/data/schemas";
import { gpuFamilies, isPaid } from "@/lib/analytics";

/** Live, sourced GPU rates offered as calculator presets (server-side). */
export interface RatePreset {
  id: string;
  label: string;
  family: string;
  rate: number;
  source: string;
}

export function ratePresets(gpus: GpuOffering[]): RatePreset[] {
  const out: RatePreset[] = [];
  for (const f of gpuFamilies(gpus)) {
    if (f.marketplace) out.push({ id: `${f.family}-market`, label: `${f.family} · Vast.ai median`, family: f.family, rate: f.marketplace.median, source: "Vast.ai marketplace median (live)" });
    if (f.cloudOnDemand) out.push({ id: `${f.family}-azure`, label: `${f.family} · Azure on-demand (cheapest region)`, family: f.family, rate: f.cloudOnDemand.min, source: "Azure Retail Prices API, per GPU" });
  }
  return out;
}

export interface ApiPreset {
  id: string;
  label: string;
  input: number;
  output: number;
}

/** Compact list of paid offerings for API-vs-self-host comparison. */
export function apiPresets(tokens: TokenOffering[]): ApiPreset[] {
  return tokens
    .filter((o) => isPaid(o) && o.sourceId === "litellm")
    .map((o) => ({ id: o.id, label: `${o.modelId} · ${o.providerName}`, input: o.prices.input!, output: o.prices.output! }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
