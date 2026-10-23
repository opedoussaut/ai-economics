import type { SourceHealthEntry } from "@/lib/data/schemas";
import type { SourceDef } from "@/lib/data/sources";

export type FreshnessState = "fresh" | "stale" | "failing" | "never" | "not-configured";

export interface Freshness {
  state: FreshnessState;
  ageHours: number | null;
  message: string;
}

/**
 * Freshness is based on the last *successful* refresh. A failing source whose
 * last good snapshot is still young is reported as "failing" (data kept, not
 * replaced); once it exceeds `staleAfterHours` it is "stale".
 */
export function computeFreshness(
  source: Pick<SourceDef, "staleAfterHours" | "requiresKey">,
  entry: SourceHealthEntry | undefined,
  now: Date,
  keyConfigured = false,
): Freshness {
  if (source.requiresKey && !keyConfigured && !entry?.lastSuccessAt) {
    return { state: "not-configured", ageHours: null, message: `Requires ${source.requiresKey}` };
  }
  if (!entry || !entry.lastSuccessAt) {
    return {
      state: "never",
      ageHours: null,
      message: entry?.lastError ? `Never succeeded: ${entry.lastError}` : "No successful refresh recorded",
    };
  }
  const ageHours = (now.getTime() - Date.parse(entry.lastSuccessAt)) / 3_600_000;
  if (ageHours > source.staleAfterHours) {
    return {
      state: "stale",
      ageHours,
      message: `Last successful refresh ${formatAge(ageHours)} ago (stale after ${source.staleAfterHours}h); showing last verified snapshot`,
    };
  }
  if (entry.lastStatus === "error") {
    return {
      state: "failing",
      ageHours,
      message: `Latest refresh failed (${entry.consecutiveFailures}×); last good data ${formatAge(ageHours)} old`,
    };
  }
  return { state: "fresh", ageHours, message: `Refreshed ${formatAge(ageHours)} ago` };
}

export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
