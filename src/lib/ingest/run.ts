import {
  ChangeEventSchema,
  DailyIndexRowSchema,
  FxSnapshotSchema,
  GpuSnapshotSchema,
  PriceHistoryRowSchema,
  SourceHealthSchema,
  TokenSnapshotSchema,
  type ChangeEvent,
  type GpuOffering,
  type GpuSnapshot,
  type RefreshJob,
  type SourceHealth,
  type TokenOffering,
  type TokenSnapshot,
} from "@/lib/data/schemas";
import { DATA_DIR, DATA_FILES, appendJsonl, readJson, readJsonl, writeJsonAtomic, writeJsonl } from "@/lib/data/files";
import { latestHashes, mergeSnapshot, type PriceFields } from "@/lib/ingest/merge";
import { LITELLM_SOURCE, fetchLiteLLM, normalizeLiteLLM, type ObservedTokenOffering } from "./adapters/litellm";
import { OPENROUTER_SOURCE, fetchOpenRouter, normalizeOpenRouter } from "./adapters/openrouter";
import { AZURE_GPU_SKUS, AZURE_SOURCE, fetchAzureSku, normalizeAzure, type ObservedGpuOffering } from "./adapters/azure";
import { VAST_GPUS, VAST_SOURCE, fetchVastGpu, normalizeVast } from "./adapters/vast";
import { fetchEcb, parseEcbXml } from "./adapters/ecb";
import { gpuIndexRows, tokenIndexRows, upsertIndex } from "./indexer";

export const TOKEN_SOURCES = ["litellm", "openrouter"] as const;
export const GPU_SOURCES = ["azure", "vast"] as const;
export const ALL_SOURCES = [...TOKEN_SOURCES, ...GPU_SOURCES, "ecb-fx"] as const;
export type RefreshableSource = (typeof ALL_SOURCES)[number];

const MAX_JOBS = 300;
const MAX_CHANGES = 2000;

export const tokenPriceFields = (o: Pick<TokenOffering, "prices">): PriceFields => ({
  input: o.prices.input,
  output: o.prices.output,
  cacheRead: o.prices.cacheRead ?? null,
  cacheWrite: o.prices.cacheWrite ?? null,
  batchInput: o.prices.batchInput ?? null,
  batchOutput: o.prices.batchOutput ?? null,
});

export const gpuPriceFields = (o: Pick<GpuOffering, "onDemandPerHour" | "spotPerHour" | "reserved1yPerHour" | "reserved3yPerHour" | "perGpuHourStats">): PriceFields =>
  o.perGpuHourStats
    ? { median: o.perGpuHourStats.median, min: o.perGpuHourStats.min, p75: o.perGpuHourStats.p75 }
    : { onDemand: o.onDemandPerHour, spot: o.spotPerHour, reserved1y: o.reserved1yPerHour, reserved3y: o.reserved3yPerHour };

const emptyToken = (now: string): TokenSnapshot => ({ schemaVersion: 1, generatedAt: now, sources: {}, offerings: [] });
const emptyGpu = (now: string): GpuSnapshot => ({ schemaVersion: 1, generatedAt: now, sources: {}, offerings: [] });
const emptyHealth = (now: string): SourceHealth => ({ schemaVersion: 1, updatedAt: now, sources: {}, jobs: [] });

export interface RefreshOptions {
  dir?: string;
  now?: () => Date;
  /** Override fetchers (tests). */
  fetchers?: Partial<{
    litellm: () => Promise<{ raw: Record<string, unknown>; upstreamVersion: string | null }>;
    openrouter: () => Promise<unknown>;
    azure: (sku: string) => Promise<Parameters<typeof normalizeAzure>[1]>;
    vast: (gpuName: string) => Promise<unknown[]>;
    ecb: () => Promise<string>;
  }>;
  log?: (msg: string) => void;
}

interface SourceResult {
  sourceId: string;
  status: "ok" | "error" | "skipped";
  recordCount: number;
  changes: number;
  error: string | null;
}

export async function refresh(sources: readonly RefreshableSource[] = ALL_SOURCES, opts: RefreshOptions = {}) {
  const dir = opts.dir ?? DATA_DIR;
  const nowFn = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const f = opts.fetchers ?? {};
  const results: SourceResult[] = [];

  const health = (await readJson(DATA_FILES.health, SourceHealthSchema, dir)) ?? emptyHealth(nowFn().toISOString());
  let tokenSnap = (await readJson(DATA_FILES.tokenSnapshot, TokenSnapshotSchema, dir)) ?? emptyToken(nowFn().toISOString());
  let gpuSnap = (await readJson(DATA_FILES.gpuSnapshot, GpuSnapshotSchema, dir)) ?? emptyGpu(nowFn().toISOString());
  const tokenHistory = await readJsonl(DATA_FILES.tokenHistory, PriceHistoryRowSchema, dir);
  const gpuHistory = await readJsonl(DATA_FILES.gpuHistory, PriceHistoryRowSchema, dir);
  const newChanges: ChangeEvent[] = [];

  for (const sourceId of sources) {
    const startedAt = nowFn().toISOString();
    const t0 = Date.now();
    let result: SourceResult;
    try {
      if (sourceId === "litellm" || sourceId === "openrouter") {
        let observed: ObservedTokenOffering[];
        let upstreamVersion: string | null = null;
        let url: string;
        if (sourceId === "litellm") {
          const { raw, upstreamVersion: v } = await (f.litellm ?? (() => fetchLiteLLM()))();
          observed = normalizeLiteLLM(raw, startedAt);
          upstreamVersion = v;
          url = LITELLM_SOURCE.url;
        } else {
          observed = normalizeOpenRouter(await (f.openrouter ?? (() => fetchOpenRouter()))(), startedAt);
          url = OPENROUTER_SOURCE.url;
        }
        if (observed.length === 0) throw new Error("Validation failed: zero offerings after normalisation");
        const merged = mergeSnapshot<TokenOffering>({
          dataset: "token", sourceId, previous: tokenSnap.offerings, observed, now: startedAt,
          lastHistoryHash: latestHashes(tokenHistory), priceFields: tokenPriceFields,
          label: (o) => `${o.providerName} · ${o.modelId}`,
        });
        tokenSnap = {
          ...tokenSnap, generatedAt: startedAt, offerings: merged.offerings,
          sources: { ...tokenSnap.sources, [sourceId]: { fetchedAt: startedAt, upstreamVersion, url, recordCount: observed.length } },
        };
        TokenSnapshotSchema.parse(tokenSnap);
        tokenHistory.push(...merged.history);
        await appendJsonl(DATA_FILES.tokenHistory, merged.history, dir);
        newChanges.push(...merged.changes);
        result = { sourceId, status: "ok", recordCount: observed.length, changes: merged.changes.length, error: null };
      } else if (sourceId === "azure" || sourceId === "vast") {
        const observed: ObservedGpuOffering[] = [];
        if (sourceId === "azure") {
          for (const sku of Object.keys(AZURE_GPU_SKUS)) {
            const items = await (f.azure ?? ((s: string) => fetchAzureSku(s)))(sku);
            observed.push(...normalizeAzure(sku, items, startedAt));
          }
        } else {
          for (const gpu of VAST_GPUS) {
            const offers = await (f.vast ?? ((n: string) => fetchVastGpu(n)))(gpu.name);
            const agg = normalizeVast(gpu, offers, startedAt);
            if (agg) observed.push(agg);
          }
        }
        if (observed.length === 0) throw new Error("Validation failed: zero GPU offerings after normalisation");
        const merged = mergeSnapshot<GpuOffering>({
          dataset: "gpu", sourceId, previous: gpuSnap.offerings, observed, now: startedAt,
          lastHistoryHash: latestHashes(gpuHistory), priceFields: gpuPriceFields,
          label: (o) => `${o.provider} · ${o.gpuModel}${o.instanceType ? ` · ${o.instanceType}` : ""} · ${o.region}`,
        });
        gpuSnap = {
          ...gpuSnap, generatedAt: startedAt, offerings: merged.offerings,
          sources: {
            ...gpuSnap.sources,
            [sourceId]: { fetchedAt: startedAt, upstreamVersion: null, url: sourceId === "azure" ? AZURE_SOURCE.url : VAST_SOURCE.url, recordCount: observed.length },
          },
        };
        GpuSnapshotSchema.parse(gpuSnap);
        gpuHistory.push(...merged.history);
        await appendJsonl(DATA_FILES.gpuHistory, merged.history, dir);
        newChanges.push(...merged.changes);
        result = { sourceId, status: "ok", recordCount: observed.length, changes: merged.changes.length, error: null };
      } else {
        const fx = parseEcbXml(await (f.ecb ?? (() => fetchEcb()))(), startedAt);
        FxSnapshotSchema.parse(fx);
        await writeJsonAtomic(DATA_FILES.fx, fx, dir);
        result = { sourceId, status: "ok", recordCount: Object.keys(fx.eurRates).length, changes: 0, error: null };
      }
    } catch (err) {
      // Never substitute invented data: keep the last snapshot, record the failure.
      const message = err instanceof Error ? err.message : String(err);
      result = { sourceId, status: "error", recordCount: 0, changes: 0, error: message.slice(0, 500) };
    }
    const finishedAt = nowFn().toISOString();
    const prev = health.sources[sourceId];
    health.sources[sourceId] = {
      id: sourceId,
      lastAttemptAt: startedAt,
      lastSuccessAt: result.status === "ok" ? finishedAt : (prev?.lastSuccessAt ?? null),
      lastStatus: result.status,
      lastError: result.error,
      recordCount: result.status === "ok" ? result.recordCount : (prev?.recordCount ?? 0),
      durationMs: Date.now() - t0,
      consecutiveFailures: result.status === "error" ? (prev?.consecutiveFailures ?? 0) + 1 : 0,
    };
    const job: RefreshJob = { id: `${sourceId}@${startedAt}`, startedAt, finishedAt, ...result };
    health.jobs = [job, ...health.jobs].slice(0, MAX_JOBS);
    results.push(result);
    log(`${sourceId}: ${result.status}${result.error ? ` — ${result.error}` : ` (${result.recordCount} records, ${result.changes} changes)`}`);
  }

  const now = nowFn().toISOString();
  await writeJsonAtomic(DATA_FILES.tokenSnapshot, tokenSnap, dir);
  await writeJsonAtomic(DATA_FILES.gpuSnapshot, gpuSnap, dir);
  health.updatedAt = now;
  await writeJsonAtomic(DATA_FILES.health, SourceHealthSchema.parse(health), dir);

  if (newChanges.length) {
    const existing = (await readJson(DATA_FILES.changes, ChangeEventSchema.array(), dir)) ?? [];
    await writeJsonAtomic(DATA_FILES.changes, [...newChanges, ...existing].slice(0, MAX_CHANGES), dir);
  }

  // Daily aggregates (idempotent per date/key/metric/origin).
  const date = now.slice(0, 10);
  const index = await readJsonl(DATA_FILES.dailyIndex, DailyIndexRowSchema, dir);
  const rows = [
    ...tokenIndexRows(tokenSnap.offerings, date, "live"),
    ...gpuIndexRows(gpuSnap.offerings, date, "live"),
  ];
  await writeJsonl(DATA_FILES.dailyIndex, upsertIndex(index, rows), dir);

  return results;
}
