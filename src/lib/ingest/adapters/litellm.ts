import { z } from "zod";
import { D, perMillion } from "@/lib/money";
import type { TokenOffering } from "@/lib/data/schemas";
import { fetchWithRetry, type FetchOptions } from "@/lib/ingest/http";
import { DIRECT_PROVIDER_DEVELOPER, LITELLM_PROVIDERS, inferDeveloper } from "@/lib/ingest/providers";

export type ObservedTokenOffering = Omit<TokenOffering, "firstSeenAt" | "listed" | "delistedAt">;

export const LITELLM_SOURCE = {
  id: "litellm",
  name: "LiteLLM model price map",
  url: "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
  homepage: "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
  licence: "MIT",
} as const;

/** Loose schema: we only rely on a handful of fields and validate their types. */
const Entry = z
  .object({
    litellm_provider: z.string().optional(),
    mode: z.string().optional(),
    input_cost_per_token: z.number().optional(),
    output_cost_per_token: z.number().optional(),
    cache_read_input_token_cost: z.number().optional(),
    cache_creation_input_token_cost: z.number().optional(),
    cache_creation_input_token_cost_above_1hr: z.number().optional(),
    input_cost_per_token_batches: z.number().optional(),
    output_cost_per_token_batches: z.number().optional(),
    input_cost_per_token_priority: z.number().optional(),
    output_cost_per_token_priority: z.number().optional(),
    input_cost_per_token_flex: z.number().optional(),
    output_cost_per_token_flex: z.number().optional(),
    output_cost_per_reasoning_token: z.number().optional(),
    max_input_tokens: z.number().optional(),
    max_output_tokens: z.number().optional(),
    supported_modalities: z.array(z.string()).optional(),
    supported_output_modalities: z.array(z.string()).optional(),
    supports_vision: z.boolean().optional(),
    supports_reasoning: z.boolean().optional(),
    supports_function_calling: z.boolean().optional(),
    supports_prompt_caching: z.boolean().optional(),
    supports_web_search: z.boolean().optional(),
    supports_pdf_input: z.boolean().optional(),
    supports_audio_input: z.boolean().optional(),
    search_context_cost_per_query: z.record(z.string(), z.number()).optional(),
    deprecation_date: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough();

/** Keys for regional/duplicate routing variants we skip to avoid duplicates. */
const SKIP_KEY = /(^|\/)(us|eu|apac|jp|au|global|ca|us-gov)[./]|\/(us|eu|global)\//i;

const pm = (v: number | undefined) =>
  v === undefined ? undefined : perMillion(v).toDecimalPlaces(6).toNumber();

function longContextTier(e: Record<string, unknown>) {
  let best: { thresholdTokens: number; input: number | null; output: number | null; cacheRead?: number | null } | null =
    null;
  for (const [k, v] of Object.entries(e)) {
    const m = /^input_cost_per_token_above_(\d+)k_tokens$/.exec(k);
    if (!m || typeof v !== "number") continue;
    const threshold = Number(m[1]) * 1000;
    if (best && best.thresholdTokens <= threshold) continue;
    const out = e[`output_cost_per_token_above_${m[1]}k_tokens`];
    const cr = e[`cache_read_input_token_cost_above_${m[1]}k_tokens`];
    best = {
      thresholdTokens: threshold,
      input: pm(v) ?? null,
      output: typeof out === "number" ? (pm(out) ?? null) : null,
      cacheRead: typeof cr === "number" ? (pm(cr) ?? null) : undefined,
    };
  }
  return best;
}

export function normalizeLiteLLM(
  raw: Record<string, unknown>,
  observedAt: string,
): ObservedTokenOffering[] {
  const out: ObservedTokenOffering[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === "sample_spec") continue;
    const parsed = Entry.safeParse(value);
    if (!parsed.success) continue;
    const e = parsed.data;
    const provider = e.litellm_provider ?? "";
    const info = LITELLM_PROVIDERS[provider];
    if (!info || e.mode !== "chat") continue;
    if (e.input_cost_per_token === undefined || e.output_cost_per_token === undefined) continue;
    if (SKIP_KEY.test(key)) continue;

    const features: string[] = [];
    if (e.supports_reasoning) features.push("reasoning");
    if (e.supports_function_calling) features.push("tools");
    if (e.supports_vision) features.push("vision");
    if (e.supports_prompt_caching || e.cache_read_input_token_cost !== undefined) features.push("caching");
    if (e.input_cost_per_token_batches !== undefined) features.push("batch");
    if (e.supports_web_search) features.push("web-search");

    const inputModalities = e.supported_modalities ?? [
      "text",
      ...(e.supports_vision ? ["image"] : []),
      ...(e.supports_audio_input ? ["audio"] : []),
      ...(e.supports_pdf_input ? ["pdf"] : []),
    ];
    const searchCosts = e.search_context_cost_per_query ? Object.values(e.search_context_cost_per_query) : [];
    const reasoning = pm(e.output_cost_per_reasoning_token);
    const output = pm(e.output_cost_per_token)!;
    // Strip the provider routing prefix before inferring the developer
    // (e.g. "mistral/glm-5-2" is a Z.ai model hosted by Mistral).
    const bareModel = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
    const inferred = inferDeveloper(bareModel);
    // Unrecognised names on a first-party API are that developer's own models.
    const developer = inferred === "Other / unknown" && DIRECT_PROVIDER_DEVELOPER[provider] ? DIRECT_PROVIDER_DEVELOPER[provider] : inferred;
    // A developer API serving another developer's model is a host, not first-party.
    const channel =
      info.channel === "direct" && DIRECT_PROVIDER_DEVELOPER[provider] && developer !== DIRECT_PROVIDER_DEVELOPER[provider]
        ? "third-party-host"
        : info.channel;

    out.push({
      id: `litellm:${provider}:${key}`,
      sourceId: LITELLM_SOURCE.id,
      modelId: key,
      displayName: bareModel,
      developer,
      provider,
      providerName: info.name,
      channel,
      currency: "USD",
      prices: {
        input: pm(e.input_cost_per_token)!,
        output,
        cacheRead: pm(e.cache_read_input_token_cost) ?? null,
        cacheWrite: pm(e.cache_creation_input_token_cost) ?? null,
        cacheWrite1h: pm(e.cache_creation_input_token_cost_above_1hr) ?? null,
        batchInput: pm(e.input_cost_per_token_batches) ?? null,
        batchOutput: pm(e.output_cost_per_token_batches) ?? null,
        priorityInput: pm(e.input_cost_per_token_priority) ?? null,
        priorityOutput: pm(e.output_cost_per_token_priority) ?? null,
        flexInput: pm(e.input_cost_per_token_flex) ?? null,
        flexOutput: pm(e.output_cost_per_token_flex) ?? null,
        reasoningOutput: reasoning !== undefined && reasoning !== output ? reasoning : null,
      },
      longContext: longContextTier(value as Record<string, unknown>),
      contextWindow: e.max_input_tokens ?? null,
      maxOutputTokens: e.max_output_tokens ?? null,
      inputModalities,
      outputModalities: e.supported_output_modalities ?? ["text"],
      features,
      webSearchPerQuery: searchCosts.length ? D(Math.min(...searchCosts)).toNumber() : null,
      deprecationDate: e.deprecation_date ?? null,
      officialUrl: e.source?.startsWith("http") ? e.source : info.pricingUrl,
      collectedFrom: LITELLM_SOURCE.homepage,
      observedAt,
      effectiveDate: null,
      // Entries carrying a provider `source` URL are higher confidence.
      confidence: e.source ? "high" : "medium",
    });
  }
  return out;
}

export async function fetchLiteLLM(opts?: FetchOptions & { url?: string }) {
  const res = await fetchWithRetry(opts?.url ?? LITELLM_SOURCE.url, opts);
  const etag = res.headers.get("etag");
  const raw = (await res.json()) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || Object.keys(raw).length < 100) {
    throw new Error("LiteLLM map failed validation: unexpected shape or too few entries");
  }
  return { raw, upstreamVersion: etag };
}
