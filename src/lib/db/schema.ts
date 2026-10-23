import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * PostgreSQL schema. Money columns use NUMERIC (decimal-safe); token counts
 * use BIGINT. All timestamps are timestamptz (UTC).
 *
 * Public pricing data is primarily maintained as versioned files in /data
 * (see docs/ARCHITECTURE.md) and can be mirrored here with
 * `npm run db:import`. Private telemetry lives only in the database.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const money = (name: string) => numeric(name, { precision: 20, scale: 10 });

export const valueClass = pgEnum("value_class", ["published", "measured", "calculated", "modeled", "billed", "benchmark"]);
export const allocationMethod = pgEnum("allocation_method", ["reserved", "billed-runtime", "proportional-usage"]);
export const workloadType = pgEnum("workload_type", ["api-inference", "self-hosted-inference", "pretraining", "fine-tuning", "rl", "agents"]);

// ── Reference & pricing ──────────────────────────────────────────────────────
export const sources = pgTable("source", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  method: text("method").notNull(),
  url: text("url").notNull(),
  docs: text("docs"),
  terms: text("terms"),
  requiresKey: text("requires_key"),
});

export const providers = pgTable("provider", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull(),
  pricingUrl: text("pricing_url"),
});

export const models = pgTable("model", {
  id: text("id").primaryKey(), // developer-scoped identifier
  developer: text("developer").notNull(),
  displayName: text("display_name").notNull(),
  contextWindow: integer("context_window"),
});

export const modelOfferings = pgTable(
  "model_offering",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => sources.id),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    developer: text("developer").notNull(),
    channel: text("channel").notNull(),
    officialUrl: text("official_url"),
    listed: boolean("listed").notNull().default(true),
    firstSeenAt: ts("first_seen_at").notNull(),
    delistedAt: ts("delisted_at"),
    attributes: jsonb("attributes"),
  },
  (t) => [index("model_offering_model_idx").on(t.modelId)],
);

export const pricingTiers = pgTable("pricing_tier", {
  id: text("id").primaryKey(), // standard | batch | priority | flex | long-context
  label: text("label").notNull(),
});

export const pricingObservations = pgTable(
  "pricing_observation",
  {
    id: text("id").primaryKey(), // offeringId|observedAt
    offeringId: text("offering_id").notNull().references(() => modelOfferings.id),
    observedAt: ts("observed_at").notNull(),
    effectiveDate: ts("effective_date"),
    hash: text("hash").notNull(),
    origin: text("origin").notNull(),
    currency: text("currency").notNull().default("USD"),
    inputPerM: money("input_per_m"),
    outputPerM: money("output_per_m"),
    cacheReadPerM: money("cache_read_per_m"),
    cacheWritePerM: money("cache_write_per_m"),
    batchInputPerM: money("batch_input_per_m"),
    batchOutputPerM: money("batch_output_per_m"),
    valueClass: valueClass("value_class").notNull().default("published"),
    confidence: text("confidence"),
  },
  (t) => [uniqueIndex("pricing_obs_unique").on(t.offeringId, t.observedAt)],
);

export const gpuSkus = pgTable("gpu_sku", {
  id: text("id").primaryKey(),
  family: text("family").notNull(),
  model: text("model").notNull(),
  memoryGb: doublePrecision("memory_gb"),
  peakDenseBf16Tflops: doublePrecision("peak_dense_bf16_tflops"),
  tdpW: integer("tdp_w"),
});

export const gpuOfferings = pgTable("gpu_offering", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  priceScope: text("price_scope").notNull(),
  gpuModel: text("gpu_model").notNull(),
  gpuCount: doublePrecision("gpu_count").notNull(),
  region: text("region").notNull(),
  instanceType: text("instance_type"),
  listed: boolean("listed").notNull().default(true),
  attributes: jsonb("attributes"),
});

export const infrastructureCostObservations = pgTable(
  "infrastructure_cost_observation",
  {
    id: text("id").primaryKey(),
    gpuOfferingId: text("gpu_offering_id").notNull().references(() => gpuOfferings.id),
    observedAt: ts("observed_at").notNull(),
    hash: text("hash").notNull(),
    origin: text("origin").notNull(),
    onDemandPerHour: money("on_demand_per_hour"),
    spotPerHour: money("spot_per_hour"),
    reserved1yPerHour: money("reserved_1y_per_hour"),
    reserved3yPerHour: money("reserved_3y_per_hour"),
    medianPerGpuHour: money("median_per_gpu_hour"),
    valueClass: valueClass("value_class").notNull().default("published"),
  },
  (t) => [uniqueIndex("infra_obs_unique").on(t.gpuOfferingId, t.observedAt)],
);

export const benchmarkObservations = pgTable("benchmark_observation", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  modelId: text("model_id").notNull(),
  metric: text("metric").notNull(),
  value: doublePrecision("value").notNull(),
  unit: text("unit"),
  conditions: jsonb("conditions"),
  observedAt: ts("observed_at").notNull(),
});

export const dataRefreshJobs = pgTable("data_refresh_job", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  status: text("status").notNull(),
  recordCount: integer("record_count").notNull().default(0),
  changes: integer("changes").notNull().default(0),
  error: text("error"),
});

export const tools = pgTable("tool", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  data: jsonb("data").notNull(),
  lastVerified: ts("last_verified"),
});

// ── Private telemetry ────────────────────────────────────────────────────────
export const integrations = pgTable("integration", {
  id: text("id").primaryKey(), // prometheus | vllm | dcgm | mlflow | otlp | langfuse | litellm
  kind: text("kind").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  /** Non-secret settings only. Secrets stay in server environment variables. */
  settings: jsonb("settings"),
  lastSuccessAt: ts("last_success_at"),
  lastError: text("last_error"),
});

export const workloads = pgTable("workload", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: workloadType("type").notNull(),
  project: text("project"),
  cluster: text("cluster"),
  model: text("model"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const workloadRuns = pgTable("workload_run", {
  id: text("id").primaryKey(),
  workloadId: text("workload_id").notNull().references(() => workloads.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: ts("started_at").notNull(),
  endedAt: ts("ended_at"),
  gpuCount: integer("gpu_count").notNull(),
  ratePerGpuHour: money("rate_per_gpu_hour").notNull(),
  rateSource: text("rate_source"),
  electricityPerKwh: money("electricity_per_kwh"),
  allocationMethod: allocationMethod("allocation_method").notNull().default("reserved"),
  plannedSteps: bigint("planned_steps", { mode: "number" }),
  plannedTokens: bigint("planned_tokens", { mode: "number" }),
  mlflowRunId: text("mlflow_run_id"),
  /** Counter baselines captured at run start (e.g. vLLM token counters, DCGM energy). */
  baselines: jsonb("baselines"),
});

export const hardwareSamples = pgTable(
  "hardware_sample",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").references(() => workloadRuns.id),
    source: text("source").notNull(),
    sampledAt: ts("sampled_at").notNull(),
    gpuCount: integer("gpu_count"),
    gpuUtilPct: doublePrecision("gpu_util_pct"),
    memoryUsedMiB: doublePrecision("memory_used_mib"),
    powerW: doublePrecision("power_w"),
    energyMj: doublePrecision("energy_mj"),
  },
  (t) => [index("hw_sample_run_idx").on(t.runId, t.sampledAt)],
);

export const tokenUsageSamples = pgTable(
  "token_usage_sample",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").references(() => workloadRuns.id),
    source: text("source").notNull(), // otlp | vllm | langfuse | litellm
    sampledAt: ts("sampled_at").notNull(),
    project: text("project"),
    provider: text("provider"),
    model: text("model"),
    operation: text("operation"),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).notNull().default(0),
    cacheCreationTokens: bigint("cache_creation_tokens", { mode: "number" }).notNull().default(0),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms"),
    error: boolean("error").notNull().default(false),
    /** Calculated cost = usage × matched published price; null if no price matched. */
    calculatedCost: money("calculated_cost"),
    priceOfferingId: text("price_offering_id"),
  },
  (t) => [index("token_sample_time_idx").on(t.sampledAt), index("token_sample_project_idx").on(t.project)],
);

export const trainingStepSamples = pgTable("training_step_sample", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => workloadRuns.id),
  step: bigint("step", { mode: "number" }).notNull(),
  sampledAt: ts("sampled_at").notNull(),
  metrics: jsonb("metrics").notNull(),
});

export const costAllocations = pgTable("cost_allocation", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => workloadRuns.id),
  periodStart: ts("period_start").notNull(),
  periodEnd: ts("period_end").notNull(),
  method: allocationMethod("method").notNull(),
  gpuHours: numeric("gpu_hours", { precision: 20, scale: 6 }).notNull(),
  cost: money("cost").notNull(),
  valueClass: valueClass("value_class").notNull().default("calculated"),
});

export const alerts = pgTable("alert", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => workloadRuns.id),
  kind: text("kind").notNull(), // budget | stale-source | integration-error
  threshold: money("threshold"),
  message: text("message").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  resolvedAt: ts("resolved_at"),
});
