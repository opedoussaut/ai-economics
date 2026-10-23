import type { OfferingChannel } from "@/lib/data/schemas";

/**
 * API providers we ingest from the LiteLLM map. Only providers that sell
 * metered API access are included (local runtimes such as Ollama are not).
 * `channel` distinguishes first-party developer APIs from cloud platforms and
 * third-party hosts of open-weight models.
 */
export interface ProviderInfo {
  name: string;
  channel: OfferingChannel;
  pricingUrl: string;
}

export const LITELLM_PROVIDERS: Record<string, ProviderInfo> = {
  openai: { name: "OpenAI", channel: "direct", pricingUrl: "https://developers.openai.com/api/docs/pricing" },
  anthropic: { name: "Anthropic", channel: "direct", pricingUrl: "https://platform.claude.com/docs/en/about-claude/pricing" },
  gemini: { name: "Google Gemini API", channel: "direct", pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  mistral: { name: "Mistral AI", channel: "direct", pricingUrl: "https://mistral.ai/pricing" },
  deepseek: { name: "DeepSeek", channel: "direct", pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing" },
  xai: { name: "xAI", channel: "direct", pricingUrl: "https://docs.x.ai/docs/models" },
  moonshot: { name: "Moonshot AI", channel: "direct", pricingUrl: "https://platform.moonshot.ai/docs/pricing" },
  zai: { name: "Z.ai", channel: "direct", pricingUrl: "https://docs.z.ai/guides/overview/pricing" },
  dashscope: { name: "Alibaba Cloud Model Studio", channel: "direct", pricingUrl: "https://www.alibabacloud.com/help/en/model-studio/models" },
  minimax: { name: "MiniMax", channel: "direct", pricingUrl: "https://www.minimax.io/platform" },
  cohere_chat: { name: "Cohere", channel: "direct", pricingUrl: "https://cohere.com/pricing" },
  ai21: { name: "AI21 Labs", channel: "direct", pricingUrl: "https://www.ai21.com/pricing" },
  perplexity: { name: "Perplexity", channel: "direct", pricingUrl: "https://docs.perplexity.ai/guides/pricing" },
  "vertex_ai-language-models": { name: "Google Vertex AI", channel: "cloud-platform", pricingUrl: "https://cloud.google.com/vertex-ai/generative-ai/pricing" },
  "vertex_ai-anthropic_models": { name: "Google Vertex AI", channel: "cloud-platform", pricingUrl: "https://cloud.google.com/vertex-ai/generative-ai/pricing" },
  bedrock_converse: { name: "Amazon Bedrock", channel: "cloud-platform", pricingUrl: "https://aws.amazon.com/bedrock/pricing/" },
  azure_ai: { name: "Azure AI Foundry", channel: "cloud-platform", pricingUrl: "https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/" },
  azure: { name: "Azure OpenAI", channel: "cloud-platform", pricingUrl: "https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/" },
  together_ai: { name: "Together AI", channel: "third-party-host", pricingUrl: "https://www.together.ai/pricing" },
  fireworks_ai: { name: "Fireworks AI", channel: "third-party-host", pricingUrl: "https://fireworks.ai/pricing" },
  groq: { name: "Groq", channel: "third-party-host", pricingUrl: "https://groq.com/pricing" },
  deepinfra: { name: "DeepInfra", channel: "third-party-host", pricingUrl: "https://deepinfra.com/pricing" },
  cerebras: { name: "Cerebras", channel: "third-party-host", pricingUrl: "https://www.cerebras.ai/pricing" },
  sambanova: { name: "SambaNova", channel: "third-party-host", pricingUrl: "https://cloud.sambanova.ai/plans/pricing" },
  nebius: { name: "Nebius AI Studio", channel: "third-party-host", pricingUrl: "https://nebius.com/prices-ai-studio" },
  lambda_ai: { name: "Lambda", channel: "third-party-host", pricingUrl: "https://lambda.ai/inference" },
  novita: { name: "Novita AI", channel: "third-party-host", pricingUrl: "https://novita.ai/pricing" },
  hyperbolic: { name: "Hyperbolic", channel: "third-party-host", pricingUrl: "https://hyperbolic.xyz/pricing" },
  baseten: { name: "Baseten", channel: "third-party-host", pricingUrl: "https://www.baseten.co/pricing/" },
};

/** Model-name patterns -> model developer. Order matters (first match wins). */
const DEVELOPER_PATTERNS: [RegExp, string][] = [
  [/gpt-oss/i, "OpenAI"],
  [/(^|[/.])(gpt|o1|o3|o4|chatgpt|codex|davinci|babbage)([-.]|$)/i, "OpenAI"],
  [/claude/i, "Anthropic"],
  [/gemini|gemma|palm|bison/i, "Google"],
  [/llama|meta[-_]/i, "Meta"],
  [/mistral|mixtral|codestral|magistral|devstral|ministral|pixtral|voxtral/i, "Mistral AI"],
  [/deepseek/i, "DeepSeek"],
  [/qwen|qwq|qvq/i, "Alibaba (Qwen)"],
  [/grok/i, "xAI"],
  [/kimi|moonshot/i, "Moonshot AI"],
  [/glm|zai-org|chatglm/i, "Z.ai (Zhipu)"],
  [/command|cohere|aya/i, "Cohere"],
  [/jamba|jurassic/i, "AI21 Labs"],
  [/nova|titan/i, "Amazon"],
  [/phi-|phi[0-9]/i, "Microsoft"],
  [/minimax|abab/i, "MiniMax"],
  [/sonar|pplx/i, "Perplexity"],
  [/nemotron|nvidia/i, "NVIDIA"],
  [/granite/i, "IBM"],
  [/hermes|nous/i, "Nous Research"],
  [/ernie/i, "Baidu"],
  [/hunyuan/i, "Tencent"],
  [/seed|doubao/i, "ByteDance"],
];

/** Developer behind each first-party ("direct") API, for channel checks. */
export const DIRECT_PROVIDER_DEVELOPER: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", gemini: "Google", mistral: "Mistral AI", deepseek: "DeepSeek", xai: "xAI",
  moonshot: "Moonshot AI", zai: "Z.ai (Zhipu)", dashscope: "Alibaba (Qwen)", minimax: "MiniMax", cohere_chat: "Cohere",
  ai21: "AI21 Labs", perplexity: "Perplexity",
};

export function inferDeveloper(modelKey: string): string {
  for (const [re, dev] of DEVELOPER_PATTERNS) if (re.test(modelKey)) return dev;
  return "Other / unknown";
}
