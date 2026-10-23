import { z } from "zod";

/**
 * Zod schemas for the versioned public datasets in /data.
 * Ingestion validates before writing; the app validates on read.
 * All money values are USD per stated unit unless `currency` says otherwise.
 */

const price = z.number().nonnegative().nullable();

export const TokenPricesSchema = z.object({
  /** Standard input, USD per 1M tokens. */
  input: price,
  /** Standard output (includes reasoning tokens unless reasoningOutput is set). */
  output: price,
  cacheRead: price.optional(),
  cacheWrite: price.optional(),
  /** Some providers (Anthropic) charge more for 1-hour cache writes. */
  cacheWrite1h: price.optional(),
  batchInput: price.optional(),
  batchOutput: price.optional(),
  priorityInput: price.optional(),
  priorityOutput: price.optional(),
  flexInput: price.optional(),
  flexOutput: price.optional(),
  /** Only set when a provider bills reasoning tokens at a separate rate. */
  reasoningOutput: price.optional(),
});
export type TokenPrices = z.infer<typeof TokenPricesSchema>;

export const LongContextTierSchema = z.object({
  thresholdTokens: z.number().int().positive(),
  input: price,
  output: price,
  cacheRead: price.optional(),
});

export const OfferingChannel = z.enum(["direct", "cloud-platform", "third-party-host", "reseller"]);
export type OfferingChannel = z.infer<typeof OfferingChannel>;

export const TokenOfferingSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  developer: z.string(),
  provider: z.string(),
  providerName: z.string(),
  channel: OfferingChannel,
  currency: z.literal("USD"),
  prices: TokenPricesSchema,
  longContext: LongContextTierSchema.nullable().optional(),
  contextWindow: z.number().int().nullable(),
  maxOutputTokens: z.number().int().nullable(),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  features: z.array(z.string()),
  webSearchPerQuery: z.number().nullable().optional(),
  deprecationDate: z.string().nullable().optional(),
  /** Provider's official pricing page, as recorded by the upstream source. */
  officialUrl: z.string().nullable(),
  /** The URL we actually collected from. */
  collectedFrom: z.string(),
  /** When ingestion first observed the current price values (UTC ISO). Source-level fetchedAt is the last verification time. */
  observedAt: z.string(),
  firstSeenAt: z.string(),
  /** Effective date published by the provider, if known. Usually unknown. */
  effectiveDate: z.string().nullable(),
  /** False once the offering disappears from upstream; kept for history. */
  listed: z.boolean(),
  /** When the offering was first missing from a successful fetch; null while listed. */
  delistedAt: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type TokenOffering = z.infer<typeof TokenOfferingSchema>;

export const SourceMetaSchema = z.object({
  fetchedAt: z.string(),
  upstreamVersion: z.string().nullable(),
  url: z.string(),
  recordCount: z.number().int(),
});

export const TokenSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  sources: z.record(z.string(), SourceMetaSchema),
  offerings: z.array(TokenOfferingSchema),
});
export type TokenSnapshot = z.infer<typeof TokenSnapshotSchema>;

const stats = z.object({
  n: z.number().int(),
  min: z.number(),
  p25: z.number(),
  median: z.number(),
  p75: z.number(),
  max: z.number(),
});
export type Stats = z.infer<typeof stats>;
export const StatsSchema = stats;

export const GpuOfferingSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  provider: z.string(),
  /** list-price: a published SKU price. marketplace-aggregate: stats over live offers. */
  kind: z.enum(["list-price", "marketplace-aggregate"]),
  /** What the price covers. */
  priceScope: z.enum(["full-instance", "gpu-only", "marketplace-offer"]),
  gpuFamily: z.string(),
  gpuModel: z.string(),
  gpuCount: z.number().positive(),
  gpuMemoryGb: z.number().nullable(),
  region: z.string(),
  instanceType: z.string().nullable(),
  os: z.string().nullable(),
  vcpus: z.number().nullable(),
  ramGb: z.number().nullable(),
  interconnect: z.string().nullable(),
  sharing: z.enum(["dedicated", "fractional", "unknown"]),
  billingUnit: z.string(),
  currency: z.literal("USD"),
  /** Instance-level hourly prices. */
  onDemandPerHour: z.number().nullable(),
  spotPerHour: z.number().nullable(),
  reserved1yPerHour: z.number().nullable(),
  reserved3yPerHour: z.number().nullable(),
  /** Marketplace stats, USD per GPU-hour. */
  perGpuHourStats: stats.nullable(),
  sourceUrl: z.string(),
  collectedFrom: z.string(),
  observedAt: z.string(),
  firstSeenAt: z.string(),
  effectiveDate: z.string().nullable(),
  listed: z.boolean(),
  /** When the offering was first missing from a successful fetch; null while listed. */
  delistedAt: z.string().nullable(),
  notes: z.string().nullable(),
});
export type GpuOffering = z.infer<typeof GpuOfferingSchema>;

export const GpuSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  sources: z.record(z.string(), SourceMetaSchema),
  offerings: z.array(GpuOfferingSchema),
});
export type GpuSnapshot = z.infer<typeof GpuSnapshotSchema>;

export const FxSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.string(),
  url: z.string(),
  /** ECB reference date. */
  rateDate: z.string(),
  fetchedAt: z.string(),
  /** Units of currency per 1 EUR. */
  eurRates: z.record(z.string(), z.number().positive()),
});
export type FxSnapshot = z.infer<typeof FxSnapshotSchema>;

export const SourceHealthEntrySchema = z.object({
  id: z.string(),
  lastAttemptAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastStatus: z.enum(["ok", "error", "skipped", "never"]),
  lastError: z.string().nullable(),
  recordCount: z.number().int(),
  durationMs: z.number().nullable(),
  consecutiveFailures: z.number().int(),
});
export type SourceHealthEntry = z.infer<typeof SourceHealthEntrySchema>;

export const RefreshJobSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  status: z.enum(["ok", "error", "skipped"]),
  recordCount: z.number().int(),
  changes: z.number().int(),
  error: z.string().nullable(),
});
export type RefreshJob = z.infer<typeof RefreshJobSchema>;

export const SourceHealthSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  sources: z.record(z.string(), SourceHealthEntrySchema),
  jobs: z.array(RefreshJobSchema),
});
export type SourceHealth = z.infer<typeof SourceHealthSchema>;

export const PriceHistoryRowSchema = z.object({
  offeringId: z.string(),
  observedAt: z.string(),
  hash: z.string(),
  origin: z.string(),
  values: z.record(z.string(), z.number().nullable()),
});
export type PriceHistoryRow = z.infer<typeof PriceHistoryRowSchema>;

export const ChangeEventSchema = z.object({
  at: z.string(),
  dataset: z.enum(["token", "gpu"]),
  offeringId: z.string(),
  label: z.string(),
  kind: z.enum(["price-change", "new", "delisted", "relisted"]),
  field: z.string().nullable(),
  oldValue: z.number().nullable(),
  newValue: z.number().nullable(),
  sourceId: z.string(),
});
export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

export const DailyIndexRowSchema = z.object({
  date: z.string(), // YYYY-MM-DD (UTC)
  dataset: z.enum(["token", "gpu"]),
  /** Population key, e.g. "token:direct:all" or "gpu:H100:marketplace". */
  key: z.string(),
  /** Metric name, e.g. "input", "output", "perGpuHour". */
  metric: z.string(),
  stats: stats,
  origin: z.string(),
});
export type DailyIndexRow = z.infer<typeof DailyIndexRowSchema>;
