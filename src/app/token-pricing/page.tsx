import type { Metadata } from "next";
import { EmptyState, Note, PageHeader } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { getTokenSnapshot } from "@/lib/data/store";
import { fmtDate } from "@/lib/format";
import { TokenCatalog, type CatalogRow } from "./catalog";

export const metadata: Metadata = { title: "Token Pricing" };
export const revalidate = 300;

const DEFAULT_COMPARE = [
  "litellm:openai:gpt-5",
  "litellm:anthropic:claude-opus-4-7",
  "litellm:gemini:gemini/gemini-3.1-pro-preview",
  "litellm:deepseek:deepseek/deepseek-v4-pro",
];

export default async function TokenPricingPage() {
  const snap = await getTokenSnapshot();
  if (!snap) return <EmptyState title="No token price data yet">Run <code>npm run refresh</code>.</EmptyState>;
  const rows: CatalogRow[] = snap.offerings.map((o) => ({
    id: o.id,
    modelId: o.modelId,
    developer: o.developer,
    provider: o.providerName,
    channel: o.channel,
    source: o.sourceId,
    prices: o.prices,
    longContext: o.longContext ?? null,
    contextWindow: o.contextWindow,
    maxOutput: o.maxOutputTokens,
    modalities: o.inputModalities,
    features: o.features,
    webSearch: o.webSearchPerQuery ?? null,
    officialUrl: o.officialUrl,
    collectedFrom: o.collectedFrom,
    observedAt: o.observedAt,
    listed: o.listed,
    deprecation: o.deprecationDate ?? null,
    confidence: o.confidence,
  }));
  const defaults = DEFAULT_COMPARE.filter((id) => rows.some((r) => r.id === id));
  return (
    <>
      <PageHeader
        eyebrow="Token Pricing"
        title="LLM API price catalogue & workload calculator"
        description={
          <>
            Published list prices per 1M tokens for {rows.filter((r) => r.listed).length.toLocaleString("en-US")} listed offerings. LiteLLM-map prices were last
            collected {fmtDate(snap.sources.litellm?.fetchedAt, true)}; OpenRouter {fmtDate(snap.sources.openrouter?.fetchedAt, true)}. OpenRouter is a reseller and is
            shown separately from direct-provider prices.
          </>
        }
        actions={<ValueClassBadge kind="published" />}
      />
      <Note className="mb-4">
        Prices from the LiteLLM map are an aggregated, community-maintained record of provider list prices; each row links the provider&apos;s official pricing page for
        verification. Pricing structures differ between vendors (cache writes, long-context tiers, batch and priority tiers) — empty cells mean the tier is not published
        for that offering, not that it is free.
      </Note>
      <TokenCatalog rows={rows} defaultCompare={defaults} />
    </>
  );
}
