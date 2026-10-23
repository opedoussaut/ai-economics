import { randomUUID } from "node:crypto";
import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { D } from "@/lib/money";
import { computeTokenCost } from "@/lib/calc/tokens";
import { getTokenSnapshot } from "@/lib/data/store";
import type { TokenOffering } from "@/lib/data/schemas";
import type { GenAiUsage } from "./otlp";
import { collectLive, metricValue, type LiveSnapshot } from "./live";

export type RunRow = typeof schema.workloadRuns.$inferSelect;
export type WorkloadRow = typeof schema.workloads.$inferSelect;

export async function listRuns() {
  const db = await getDb();
  return db
    .select({ run: schema.workloadRuns, workload: schema.workloads })
    .from(schema.workloadRuns)
    .innerJoin(schema.workloads, eq(schema.workloadRuns.workloadId, schema.workloads.id))
    .orderBy(desc(schema.workloadRuns.startedAt))
    .limit(50);
}

export async function createRun(input: {
  name: string;
  type: WorkloadRow["type"];
  project: string | null;
  cluster: string | null;
  model: string | null;
  gpuCount: number;
  ratePerGpuHour: number;
  rateSource: string | null;
  electricityPerKwh: number | null;
  plannedSteps: number | null;
  plannedTokens: number | null;
  mlflowRunId: string | null;
}) {
  const db = await getDb();
  // Capture counter baselines so "to date" values cover this run only.
  let baselines: Record<string, number | null> = {};
  try {
    const live = await collectLive();
    baselines = {
      generationTokensTotal: metricValue(live, "generationTokensTotal"),
      promptTokensTotal: metricValue(live, "promptTokensTotal"),
      energyMj: metricValue(live, "energyMj"),
    };
  } catch {
    baselines = {};
  }
  const workloadId = randomUUID();
  await db.insert(schema.workloads).values({ id: workloadId, name: input.name, type: input.type, project: input.project, cluster: input.cluster, model: input.model });
  const id = randomUUID();
  await db.insert(schema.workloadRuns).values({
    id, workloadId, name: input.name, startedAt: new Date().toISOString(), gpuCount: input.gpuCount,
    ratePerGpuHour: String(input.ratePerGpuHour), rateSource: input.rateSource,
    electricityPerKwh: input.electricityPerKwh === null ? null : String(input.electricityPerKwh),
    plannedSteps: input.plannedSteps, plannedTokens: input.plannedTokens, mlflowRunId: input.mlflowRunId, baselines,
  });
  return id;
}

export async function endRun(id: string) {
  const db = await getDb();
  await db.update(schema.workloadRuns).set({ status: "ended", endedAt: new Date().toISOString() }).where(eq(schema.workloadRuns.id, id));
}

/**
 * Run economics. Cost to date uses RESERVED allocation (GPUs held × elapsed
 * time × documented rate) and is a calculated cost; projections are labelled
 * forecasts.
 */
export function runEconomics(run: RunRow, live: LiveSnapshot | null, now = new Date()) {
  const end = run.endedAt ? new Date(run.endedAt) : now;
  const elapsedHours = D(Math.max(0, end.getTime() - Date.parse(run.startedAt))).div(3_600_000);
  const gpuHours = elapsedHours.mul(run.gpuCount);
  const rate = D(run.ratePerGpuHour);
  const costToDate = gpuHours.mul(rate);
  const base = (run.baselines ?? {}) as Record<string, number | null>;
  const delta = (key: string) => {
    const cur = live ? metricValue(live, key) : null;
    const b = base[key];
    return cur === null || b === null || b === undefined || cur < b ? null : cur - b; // counter reset → unknown
  };
  const genTokens = delta("generationTokensTotal");
  const promptTokens = delta("promptTokensTotal");
  const energyMj = delta("energyMj");
  const energyKwh = energyMj === null ? null : D(energyMj).div(3.6e9);
  const projectedTotal =
    run.plannedTokens && genTokens && genTokens > 0
      ? costToDate.div(genTokens).mul(run.plannedTokens)
      : null;
  return {
    elapsedHours,
    gpuHours,
    costRatePerHour: run.endedAt ? D(0) : rate.mul(run.gpuCount),
    costToDate,
    generatedTokens: genTokens,
    inputTokens: promptTokens,
    costPerMGenerated: genTokens && genTokens > 0 ? costToDate.div(genTokens).mul(1e6) : null,
    energyKwh,
    energyCost: energyKwh && run.electricityPerKwh ? energyKwh.mul(run.electricityPerKwh) : null,
    projectedTotal,
  };
}

// ── OTLP token usage ────────────────────────────────────────────────────────

/** OTel provider names → LiteLLM provider keys used in our price snapshot. */
const OTEL_PROVIDER: Record<string, string> = {
  openai: "openai", anthropic: "anthropic", "gcp.gemini": "gemini", "gcp.vertex_ai": "vertex_ai-language-models",
  "aws.bedrock": "bedrock_converse", "azure.ai.openai": "azure", "azure.ai.inference": "azure_ai", mistral_ai: "mistral",
  deepseek: "deepseek", "x_ai": "xai", groq: "groq", perplexity: "perplexity", cohere: "cohere_chat",
};

export function matchOffering(offerings: TokenOffering[], provider: string | null, model: string | null) {
  if (!model) return null;
  const p = provider ? (OTEL_PROVIDER[provider] ?? provider) : null;
  const candidates = offerings.filter((o) => o.sourceId === "litellm" && o.listed && (!p || o.provider === p));
  return (
    candidates.find((o) => o.modelId === model) ??
    candidates.find((o) => o.modelId.endsWith(`/${model}`)) ??
    null
  );
}

export function usageCost(offering: TokenOffering | null, u: GenAiUsage) {
  if (!offering || u.inputTokens + u.outputTokens === 0) return null;
  const input = Math.max(u.inputTokens, u.cacheReadTokens + u.cacheCreationTokens);
  const r = computeTokenCost(offering, {
    promptTokens: input,
    outputTokens: Math.max(u.outputTokens, u.reasoningTokens),
    reasoningTokens: u.reasoningTokens,
    reasoningIncludedInOutput: true, // OTel: output_tokens includes reasoning
    cacheHitRate: input ? u.cacheReadTokens / input : 0,
    cacheWriteRate: input ? u.cacheCreationTokens / input : 0,
    requestsPerDay: 1,
    tier: "standard",
  });
  return r.ok ? r.perRequest : null;
}

export async function storeUsage(usages: GenAiUsage[]) {
  if (usages.length === 0) return { stored: 0, priced: 0 };
  const db = await getDb();
  const snap = await getTokenSnapshot();
  let priced = 0;
  const rows = usages.map((u) => {
    const offering = snap ? matchOffering(snap.offerings, u.provider, u.model) : null;
    const cost = usageCost(offering, u);
    if (cost) priced++;
    return {
      id: randomUUID(), source: "otlp", sampledAt: u.startedAt ?? new Date().toISOString(), project: u.project, provider: u.provider,
      model: u.model, operation: u.operation, inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens,
      cacheCreationTokens: u.cacheCreationTokens, reasoningTokens: u.reasoningTokens, durationMs: u.durationMs, error: u.error,
      calculatedCost: cost ? cost.toFixed(10) : null, priceOfferingId: cost ? offering!.id : null,
    };
  });
  await db.insert(schema.tokenUsageSamples).values(rows);
  return { stored: rows.length, priced };
}

/** Aggregates of stored token usage over a window, grouped by project and model. */
export async function usageSummary(sinceHours = 24) {
  const db = await getDb();
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  const t = schema.tokenUsageSamples;
  return db
    .select({
      project: t.project,
      model: t.model,
      provider: t.provider,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${t.inputTokens}),0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${t.outputTokens}),0)::bigint`,
      errors: sql<number>`sum(case when ${t.error} then 1 else 0 end)::int`,
      cost: sql<string | null>`sum(${t.calculatedCost})`,
      unpriced: sql<number>`sum(case when ${t.calculatedCost} is null then 1 else 0 end)::int`,
    })
    .from(t)
    .where(gte(t.sampledAt, since))
    .groupBy(t.project, t.model, t.provider)
    .orderBy(desc(sql`sum(${t.calculatedCost})`));
}
