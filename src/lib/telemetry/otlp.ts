import { z } from "zod";

/**
 * OTLP/HTTP JSON trace ingestion for OpenTelemetry GenAI spans.
 *
 * Usage semantics follow the GenAI conventions
 * (https://github.com/open-telemetry/semantic-conventions-genai):
 *   gen_ai.usage.input_tokens   includes cache_read and cache_creation tokens
 *   gen_ai.usage.output_tokens  includes reasoning.output_tokens
 * Legacy prompt_tokens/completion_tokens are accepted as fallbacks.
 *
 * Privacy: only model/provider/usage/timing attributes are extracted. Message
 * content attributes (gen_ai.input.messages, gen_ai.output.messages,
 * gen_ai.prompt, gen_ai.completion, system instructions, tool arguments) are
 * never read or stored.
 */
const AnyValue = z
  .object({
    stringValue: z.string().optional(),
    intValue: z.union([z.string(), z.number()]).optional(),
    doubleValue: z.number().optional(),
    boolValue: z.boolean().optional(),
  })
  .passthrough();
const KeyValue = z.object({ key: z.string(), value: AnyValue });
const Span = z.object({
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  name: z.string().optional(),
  startTimeUnixNano: z.union([z.string(), z.number()]).optional(),
  endTimeUnixNano: z.union([z.string(), z.number()]).optional(),
  attributes: z.array(KeyValue).optional(),
  status: z.object({ code: z.union([z.number(), z.string()]).optional() }).optional(),
});
export const OtlpTraces = z.object({
  resourceSpans: z.array(
    z.object({
      resource: z.object({ attributes: z.array(KeyValue).optional() }).optional(),
      scopeSpans: z.array(z.object({ spans: z.array(Span).optional() })).optional(),
    }),
  ),
});

export interface GenAiUsage {
  traceId: string | null;
  spanId: string | null;
  startedAt: string | null;
  durationMs: number | null;
  serviceName: string | null;
  project: string | null;
  operation: string | null;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  error: boolean;
}

const ALLOWED = new Set([
  "gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.system", "gen_ai.request.model", "gen_ai.response.model",
  "gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens", "gen_ai.usage.prompt_tokens", "gen_ai.usage.completion_tokens",
  "gen_ai.usage.cache_read.input_tokens", "gen_ai.usage.cache_creation.input_tokens", "gen_ai.usage.reasoning.output_tokens",
  "error.type", "aie.project",
]);

function attrMap(kvs: z.infer<typeof KeyValue>[] | undefined): Map<string, string | number | boolean> {
  const m = new Map<string, string | number | boolean>();
  for (const kv of kvs ?? []) {
    if (!ALLOWED.has(kv.key) && kv.key !== "service.name" && kv.key !== "deployment.environment") continue;
    const v = kv.value;
    if (v.stringValue !== undefined) m.set(kv.key, v.stringValue);
    else if (v.intValue !== undefined) m.set(kv.key, Number(v.intValue));
    else if (v.doubleValue !== undefined) m.set(kv.key, v.doubleValue);
    else if (v.boolValue !== undefined) m.set(kv.key, v.boolValue);
  }
  return m;
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const str = (v: unknown) => (typeof v === "string" && v.length ? v.slice(0, 200) : null);
const nanoToIso = (n: string | number | undefined) => {
  if (n === undefined) return null;
  const ms = Number(BigInt(String(n)) / BigInt(1_000_000));
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
};

export function extractGenAiUsage(payload: unknown): GenAiUsage[] {
  const parsed = OtlpTraces.parse(payload);
  const out: GenAiUsage[] = [];
  for (const rs of parsed.resourceSpans) {
    const res = attrMap(rs.resource?.attributes);
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const a = attrMap(span.attributes);
        const hasUsage = ["gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens", "gen_ai.usage.prompt_tokens", "gen_ai.usage.completion_tokens"].some((k) => a.has(k));
        if (!hasUsage) continue;
        const start = nanoToIso(span.startTimeUnixNano);
        const end = nanoToIso(span.endTimeUnixNano);
        out.push({
          traceId: str(span.traceId),
          spanId: str(span.spanId),
          startedAt: start,
          durationMs: start && end ? Date.parse(end) - Date.parse(start) : null,
          serviceName: str(res.get("service.name")),
          project: str(a.get("aie.project")) ?? str(res.get("service.name")),
          operation: str(a.get("gen_ai.operation.name")),
          provider: str(a.get("gen_ai.provider.name")) ?? str(a.get("gen_ai.system")),
          model: str(a.get("gen_ai.response.model")) ?? str(a.get("gen_ai.request.model")),
          inputTokens: int(a.get("gen_ai.usage.input_tokens") ?? a.get("gen_ai.usage.prompt_tokens")),
          outputTokens: int(a.get("gen_ai.usage.output_tokens") ?? a.get("gen_ai.usage.completion_tokens")),
          cacheReadTokens: int(a.get("gen_ai.usage.cache_read.input_tokens")),
          cacheCreationTokens: int(a.get("gen_ai.usage.cache_creation.input_tokens")),
          reasoningTokens: int(a.get("gen_ai.usage.reasoning.output_tokens")),
          error: a.has("error.type") || span.status?.code === 2 || span.status?.code === "STATUS_CODE_ERROR",
        });
      }
    }
  }
  return out;
}
