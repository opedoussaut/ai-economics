import type { CollectionMethod } from "@/lib/types";

/**
 * Registry of every upstream source. `cadenceHours` is the *target* collection
 * schedule; `staleAfterHours` is when the UI starts warning.
 */
export interface SourceDef {
  id: string;
  name: string;
  dataset: "token" | "gpu" | "fx" | "benchmark";
  method: CollectionMethod;
  url: string;
  docs: string;
  cadenceHours: number;
  staleAfterHours: number;
  requiresKey: string | null;
  terms: string;
  notes: string;
}

export const SOURCES: SourceDef[] = [
  {
    id: "litellm",
    name: "LiteLLM model price map",
    dataset: "token",
    method: "aggregator-feed",
    url: "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
    docs: "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
    cadenceHours: 6,
    staleAfterHours: 36,
    requiresKey: null,
    terms: "MIT-licensed open-source dataset.",
    notes:
      "Community-maintained map of provider list prices. Each entry usually links the provider's official pricing page, shown next to every price. Covers direct developer APIs, cloud platforms and third-party hosts.",
  },
  {
    id: "openrouter",
    name: "OpenRouter models API",
    dataset: "token",
    method: "reseller-api",
    url: "https://openrouter.ai/api/v1/models",
    docs: "https://openrouter.ai/docs/api-reference/models/get-models",
    cadenceHours: 6,
    staleAfterHours: 36,
    requiresKey: null,
    terms: "Public, unauthenticated API. Prices are OpenRouter's offered prices.",
    notes: "Reseller/router prices. Never merged with direct-provider prices.",
  },
  {
    id: "azure",
    name: "Azure Retail Prices API",
    dataset: "gpu",
    method: "official-api",
    url: "https://prices.azure.com/api/retail/prices",
    docs: "https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices",
    cadenceHours: 6,
    staleAfterHours: 48,
    requiresKey: null,
    terms: "Official, public, unauthenticated Microsoft API.",
    notes: "Linux pay-as-you-go, spot and reserved (1y/3y) prices for GPU VM sizes, per region.",
  },
  {
    id: "vast",
    name: "Vast.ai marketplace search API",
    dataset: "gpu",
    method: "marketplace-api",
    url: "https://console.vast.ai/api/v0/bundles/",
    docs: "https://vast.ai/developers/api",
    cadenceHours: 3,
    staleAfterHours: 24,
    requiresKey: null,
    terms: "Documented public search endpoint. Only aggregate statistics are republished.",
    notes: "Live marketplace asks from independent hosts; prices move continuously.",
  },
  {
    id: "ecb-fx",
    name: "ECB euro reference rates",
    dataset: "fx",
    method: "official-api",
    url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    docs: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    cadenceHours: 24,
    staleAfterHours: 96,
    requiresKey: null,
    terms: "Public reference rates for information purposes.",
    notes: "Used only for EUR display conversion. Published on TARGET business days around 16:00 CET.",
  },
  {
    id: "artificial-analysis",
    name: "Artificial Analysis data API",
    dataset: "benchmark",
    method: "licensed-api",
    url: "https://artificialanalysis.ai/data-api",
    docs: "https://artificialanalysis.ai/data-api",
    cadenceHours: 24,
    staleAfterHours: 72,
    requiresKey: "ARTIFICIAL_ANALYSIS_API_KEY",
    terms: "Requires an API key and acceptance of Artificial Analysis terms, including attribution.",
    notes: "Optional benchmark integration. Not connected unless a key is configured.",
  },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
