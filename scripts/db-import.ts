/**
 * Mirror the public file datasets (/data) into PostgreSQL pricing tables.
 * Idempotent: rows are keyed by (offering, observedAt).
 *
 *   npm run db:import
 */
import { getDb, schema } from "../src/lib/db/client";
import { DATA_FILES, readJson, readJsonl } from "../src/lib/data/files";
import { GpuSnapshotSchema, PriceHistoryRowSchema, TokenSnapshotSchema } from "../src/lib/data/schemas";
import { SOURCES } from "../src/lib/data/sources";
import { ToolsFileSchema } from "../src/lib/tools";

const chunk = <T>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const s = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

async function main() {
  const db = await getDb();
  for (const src of SOURCES) {
    await db.insert(schema.sources).values({ id: src.id, name: src.name, method: src.method, url: src.url, docs: src.docs, terms: src.terms, requiresKey: src.requiresKey }).onConflictDoNothing();
  }
  const tokens = await readJson(DATA_FILES.tokenSnapshot, TokenSnapshotSchema);
  const gpus = await readJson(DATA_FILES.gpuSnapshot, GpuSnapshotSchema);
  if (!tokens || !gpus) throw new Error("Run `npm run refresh` first");
  const ids = new Set(tokens.offerings.map((o) => o.id));
  for (const part of chunk(tokens.offerings)) {
    await db.insert(schema.modelOfferings).values(part.map((o) => ({
      id: o.id, sourceId: o.sourceId, providerId: o.provider, modelId: o.modelId, developer: o.developer, channel: o.channel,
      officialUrl: o.officialUrl, listed: o.listed, firstSeenAt: o.firstSeenAt, delistedAt: o.delistedAt,
      attributes: { contextWindow: o.contextWindow, features: o.features, prices: o.prices },
    }))).onConflictDoNothing();
  }
  const hist = (await readJsonl(DATA_FILES.tokenHistory, PriceHistoryRowSchema)).filter((r) => ids.has(r.offeringId));
  for (const part of chunk(hist)) {
    await db.insert(schema.pricingObservations).values(part.map((r) => ({
      id: `${r.offeringId}|${r.observedAt}`, offeringId: r.offeringId, observedAt: r.observedAt, hash: r.hash, origin: r.origin,
      inputPerM: s(r.values.input), outputPerM: s(r.values.output), cacheReadPerM: s(r.values.cacheRead), cacheWritePerM: s(r.values.cacheWrite),
      batchInputPerM: s(r.values.batchInput), batchOutputPerM: s(r.values.batchOutput),
    }))).onConflictDoNothing();
  }
  for (const part of chunk(gpus.offerings)) {
    await db.insert(schema.gpuOfferings).values(part.map((o) => ({
      id: o.id, sourceId: o.sourceId, provider: o.provider, kind: o.kind, priceScope: o.priceScope, gpuModel: o.gpuModel,
      gpuCount: o.gpuCount, region: o.region, instanceType: o.instanceType, listed: o.listed, attributes: { notes: o.notes },
    }))).onConflictDoNothing();
  }
  const gids = new Set(gpus.offerings.map((o) => o.id));
  const ghist = (await readJsonl(DATA_FILES.gpuHistory, PriceHistoryRowSchema)).filter((r) => gids.has(r.offeringId));
  for (const part of chunk(ghist)) {
    await db.insert(schema.infrastructureCostObservations).values(part.map((r) => ({
      id: `${r.offeringId}|${r.observedAt}`, gpuOfferingId: r.offeringId, observedAt: r.observedAt, hash: r.hash, origin: r.origin,
      onDemandPerHour: s(r.values.onDemand), spotPerHour: s(r.values.spot), reserved1yPerHour: s(r.values.reserved1y),
      reserved3yPerHour: s(r.values.reserved3y), medianPerGpuHour: s(r.values.median),
    }))).onConflictDoNothing();
  }
  const tools = await readJson(DATA_FILES.tools, ToolsFileSchema);
  for (const t of tools?.tools ?? []) {
    await db.insert(schema.tools).values({ slug: t.slug, name: t.name, category: t.category, data: t, lastVerified: t.lastVerified }).onConflictDoNothing();
  }
  console.log(`Imported ${tokens.offerings.length} model offerings, ${hist.length} price observations, ${gpus.offerings.length} GPU offerings, ${ghist.length} GPU observations.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
