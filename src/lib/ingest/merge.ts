import { createHash } from "node:crypto";
import type { ChangeEvent, PriceHistoryRow } from "@/lib/data/schemas";

/**
 * Pure snapshot-merge logic shared by token and GPU datasets.
 *
 * - Idempotent: re-running with identical upstream data produces no new
 *   history rows and no change events.
 * - Offerings missing from a successful fetch are kept but flagged
 *   `listed: false` (delisted) so their last verified price stays visible.
 * - Entries from other sources are passed through untouched, so one failed
 *   source never erases another's data.
 */

export interface Tracked {
  id: string;
  sourceId: string;
  observedAt: string;
  firstSeenAt: string;
  delistedAt: string | null;
  listed: boolean;
}

export type PriceFields = Record<string, number | null>;

/** Days after which a delisted offering is dropped from the current snapshot. */
export const DELISTED_RETENTION_DAYS = 90;

export function hashPrices(values: PriceFields): string {
  const keys = Object.keys(values).sort();
  const canonical = JSON.stringify(keys.map((k) => [k, values[k] ?? null]));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export interface MergeInput<T extends Tracked> {
  dataset: "token" | "gpu";
  sourceId: string;
  previous: T[];
  observed: Omit<T, "firstSeenAt" | "delistedAt" | "listed">[];
  now: string;
  /** Latest history hash per offering id (from the history log). */
  lastHistoryHash: Map<string, string>;
  priceFields: (o: Omit<T, "firstSeenAt" | "delistedAt" | "listed">) => PriceFields;
  label: (o: Omit<T, "firstSeenAt" | "delistedAt" | "listed">) => string;
  origin?: string;
}

export interface MergeResult<T> {
  offerings: T[];
  history: PriceHistoryRow[];
  changes: ChangeEvent[];
}

export function mergeSnapshot<T extends Tracked>(input: MergeInput<T>): MergeResult<T> {
  const { dataset, sourceId, previous, observed, now, lastHistoryHash, priceFields, label } = input;
  const origin = input.origin ?? "live";
  const prevById = new Map(previous.filter((p) => p.sourceId === sourceId).map((p) => [p.id, p]));
  // A source with no previous entries is a baseline run: record history but
  // do not flood the change feed with "new" events.
  const baseline = prevById.size === 0;
  const history: PriceHistoryRow[] = [];
  const changes: ChangeEvent[] = [];
  const merged: T[] = previous.filter((p) => p.sourceId !== sourceId);
  const seen = new Set<string>();

  for (const o of observed) {
    if (seen.has(o.id)) continue; // de-duplicate upstream repeats
    seen.add(o.id);
    const prev = prevById.get(o.id);
    const values = priceFields(o);
    const hash = hashPrices(values);

    if (lastHistoryHash.get(o.id) !== hash) {
      history.push({ offeringId: o.id, observedAt: now, hash, origin, values });
    }
    if (prev && !baseline) {
      const prevValues = priceFields(prev);
      if (hashPrices(prevValues) !== hash) {
        for (const k of Object.keys(values)) {
          if ((prevValues[k] ?? null) !== (values[k] ?? null)) {
            changes.push({
              at: now, dataset, offeringId: o.id, label: label(o), kind: "price-change",
              field: k, oldValue: prevValues[k] ?? null, newValue: values[k] ?? null, sourceId,
            });
          }
        }
      }
      if (!prev.listed) {
        changes.push({ at: now, dataset, offeringId: o.id, label: label(o), kind: "relisted", field: null, oldValue: null, newValue: null, sourceId });
      }
    } else if (!prev && !baseline) {
      changes.push({ at: now, dataset, offeringId: o.id, label: label(o), kind: "new", field: null, oldValue: null, newValue: null, sourceId });
    }
    // Unchanged prices keep their original observedAt ("price since"), so the
    // committed snapshot only diffs when something genuinely changed.
    const unchanged = prev !== undefined && hashPrices(priceFields(prev)) === hash;
    merged.push({
      ...o,
      observedAt: unchanged ? prev.observedAt : o.observedAt,
      firstSeenAt: prev?.firstSeenAt ?? now,
      delistedAt: null,
      listed: true,
    } as T);
  }

  const cutoff = Date.parse(now) - DELISTED_RETENTION_DAYS * 86_400_000;
  for (const prev of prevById.values()) {
    if (seen.has(prev.id)) continue;
    if (prev.delistedAt && Date.parse(prev.delistedAt) < cutoff) continue; // retention expired
    if (prev.listed) {
      changes.push({ at: now, dataset, offeringId: prev.id, label: label(prev), kind: "delisted", field: null, oldValue: null, newValue: null, sourceId });
    }
    merged.push({ ...prev, listed: false, delistedAt: prev.delistedAt ?? now });
  }

  merged.sort((a, b) => a.id.localeCompare(b.id));
  return { offerings: merged, history, changes };
}

/** Latest hash per offering id from a history log (rows in any order). */
export function latestHashes(rows: PriceHistoryRow[]): Map<string, string> {
  const latest = new Map<string, PriceHistoryRow>();
  for (const r of rows) {
    const cur = latest.get(r.offeringId);
    if (!cur || r.observedAt >= cur.observedAt) latest.set(r.offeringId, r);
  }
  return new Map([...latest].map(([id, r]) => [id, r.hash]));
}
