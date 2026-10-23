/**
 * Core domain vocabulary shared by ingestion, storage, calculators and UI.
 *
 * Every economic value shown by AI Economics carries a ValueClass so that a
 * published price is never confused with a modeled estimate.
 */

export const VALUE_CLASSES = {
  published: {
    label: "Published price",
    short: "Published",
    description: "The provider's documented public list price.",
  },
  measured: {
    label: "Measured usage",
    short: "Measured",
    description: "Directly observed tokens, GPU time, power, etc.",
  },
  calculated: {
    label: "Calculated cost",
    short: "Calculated",
    description: "A measurement multiplied by a documented pricing or allocation rule.",
  },
  modeled: {
    label: "Modeled estimate",
    short: "Modeled",
    description: "Calculated from user-adjustable assumptions. Not a measurement.",
  },
  billed: {
    label: "Billed cost",
    short: "Billed",
    description: "Reconciled against an actual provider invoice or billing API.",
  },
  benchmark: {
    label: "Benchmark",
    short: "Benchmark",
    description: "Independently measured performance under documented conditions.",
  },
} as const;

export type ValueClass = keyof typeof VALUE_CLASSES;

/** How a source's data reaches us. */
export type CollectionMethod =
  | "official-api" // documented, public, structured API run by the provider
  | "aggregator-feed" // third-party maintained dataset (e.g. LiteLLM map)
  | "marketplace-api" // marketplace offers (e.g. Vast.ai)
  | "reseller-api" // a reseller's own prices (e.g. OpenRouter)
  | "licensed-api" // requires a key and licence (e.g. Artificial Analysis)
  | "manual"; // human-verified entry

export type Confidence = "high" | "medium" | "low";

export interface SourceRef {
  id: string;
  name: string;
  url: string;
}
