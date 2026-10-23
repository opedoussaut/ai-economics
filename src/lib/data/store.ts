import { cache } from "react";
import {
  ChangeEventSchema,
  DailyIndexRowSchema,
  FxSnapshotSchema,
  GpuSnapshotSchema,
  PriceHistoryRowSchema,
  SourceHealthSchema,
  TokenSnapshotSchema,
} from "./schemas";
import { DATA_FILES, readJson, readJsonl } from "./files";
import { LinkCheckSchema, ToolsFileSchema } from "@/lib/tools";
import { SOURCES } from "./sources";
import { computeFreshness } from "./freshness";

/** Server-only, request-deduplicated readers for the public datasets. */
export const getTokenSnapshot = cache(() => readJson(DATA_FILES.tokenSnapshot, TokenSnapshotSchema));
export const getGpuSnapshot = cache(() => readJson(DATA_FILES.gpuSnapshot, GpuSnapshotSchema));
export const getFx = cache(() => readJson(DATA_FILES.fx, FxSnapshotSchema));
export const getHealth = cache(() => readJson(DATA_FILES.health, SourceHealthSchema));
export const getChanges = cache(async () => (await readJson(DATA_FILES.changes, ChangeEventSchema.array())) ?? []);
export const getDailyIndex = cache(() => readJsonl(DATA_FILES.dailyIndex, DailyIndexRowSchema));
export const getTokenHistory = cache(() => readJsonl(DATA_FILES.tokenHistory, PriceHistoryRowSchema));
export const getGpuHistory = cache(() => readJsonl(DATA_FILES.gpuHistory, PriceHistoryRowSchema));
export const getTools = cache(async () => (await readJson(DATA_FILES.tools, ToolsFileSchema))?.tools ?? []);
export const getLinkCheck = cache(() => readJson("curated/link-check.json", LinkCheckSchema));

export const getSourceStatuses = cache(async () => {
  const health = await getHealth();
  const now = new Date();
  return SOURCES.map((s) => ({
    source: s,
    entry: health?.sources[s.id] ?? null,
    freshness: computeFreshness(s, health?.sources[s.id], now, s.requiresKey ? !!process.env[s.requiresKey] : false),
  }));
});
