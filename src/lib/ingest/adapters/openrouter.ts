import { z } from "zod";
import { perMillion } from "@/lib/money";
import { fetchJson, type FetchOptions } from "@/lib/ingest/http";
import { inferDeveloper } from "@/lib/ingest/providers";
import type { ObservedTokenOffering } from "./litellm";

/**
 * OpenRouter is a reseller/router. Its prices are OpenRouter's offered prices
 * and are never merged with direct-provider prices.
 */
export const OPENROUTER_SOURCE = {
  id: "openrouter",
  name: "OpenRouter models API",
  url: "https://openrouter.ai/api/v1/models",
  docs: "https://openrouter.ai/docs/api-reference/models/get-models",
} as const;

const num = z.union([z.string(), z.number()]).optional().nullable();
const Model = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number().nullable().optional(),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).optional(),
      output_modalities: z.array(z.string()).optional(),
    })
    .optional(),
  pricing: z.object({
    prompt: num,
    completion: num,
    input_cache_read: num,
    input_cache_write: num,
    internal_reasoning: num,
    web_search: num,
  }),
  top_provider: z.object({ max_completion_tokens: z.number().nullable().optional() }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  expiration_date: z.string().nullable().optional(),
});
const Response = z.object({ data: z.array(z.unknown()) });

const toNum = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const pm = (v: string | number | null | undefined) => {
  const n = toNum(v);
  return n === undefined || n < 0 ? null : perMillion(n).toDecimalPlaces(6).toNumber();
};

const DEV_PREFIX: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", "meta-llama": "Meta", mistralai: "Mistral AI",
  deepseek: "DeepSeek", qwen: "Alibaba (Qwen)", "x-ai": "xAI", moonshotai: "Moonshot AI", "z-ai": "Z.ai (Zhipu)",
  cohere: "Cohere", ai21: "AI21 Labs", amazon: "Amazon", microsoft: "Microsoft", minimax: "MiniMax",
  perplexity: "Perplexity", nvidia: "NVIDIA", "ibm-granite": "IBM", nousresearch: "Nous Research",
  baidu: "Baidu", tencent: "Tencent", bytedance: "ByteDance",
};

export function normalizeOpenRouter(json: unknown, observedAt: string): ObservedTokenOffering[] {
  const parsed = Response.parse(json);
  const out: ObservedTokenOffering[] = [];
  for (const item of parsed.data) {
    const r = Model.safeParse(item);
    if (!r.success) continue;
    const m = r.data;
    const input = pm(m.pricing.prompt);
    const output = pm(m.pricing.completion);
    // Variable-priced routers (e.g. openrouter/auto) publish -1; skip them.
    if (input === null || output === null) continue;
    const prefix = m.id.split("/")[0];
    const params = m.supported_parameters ?? [];
    const features: string[] = [];
    if (params.includes("reasoning") || params.includes("include_reasoning")) features.push("reasoning");
    if (params.includes("tools")) features.push("tools");
    if (m.architecture?.input_modalities?.includes("image")) features.push("vision");
    if (m.pricing.input_cache_read !== undefined && m.pricing.input_cache_read !== null) features.push("caching");
    const reasoning = pm(m.pricing.internal_reasoning);
    out.push({
      id: `openrouter:${m.id}`,
      sourceId: OPENROUTER_SOURCE.id,
      modelId: m.id,
      displayName: m.name,
      developer: DEV_PREFIX[prefix] ?? inferDeveloper(m.id),
      provider: "openrouter",
      providerName: "OpenRouter",
      channel: "reseller",
      currency: "USD",
      prices: {
        input,
        output,
        cacheRead: pm(m.pricing.input_cache_read),
        cacheWrite: pm(m.pricing.input_cache_write),
        reasoningOutput: reasoning && reasoning > 0 && reasoning !== output ? reasoning : null,
      },
      longContext: null,
      contextWindow: m.context_length ?? null,
      maxOutputTokens: m.top_provider?.max_completion_tokens ?? null,
      inputModalities: m.architecture?.input_modalities ?? ["text"],
      outputModalities: m.architecture?.output_modalities ?? ["text"],
      features,
      webSearchPerQuery: toNum(m.pricing.web_search) ?? null,
      deprecationDate: m.expiration_date ?? null,
      officialUrl: `https://openrouter.ai/${m.id}`,
      collectedFrom: OPENROUTER_SOURCE.url,
      observedAt,
      effectiveDate: null,
      confidence: "high",
    });
  }
  if (out.length < 20) throw new Error(`OpenRouter returned only ${out.length} priced models`);
  return out;
}

export async function fetchOpenRouter(opts?: FetchOptions) {
  return fetchJson(OPENROUTER_SOURCE.url, opts);
}
