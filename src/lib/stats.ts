import type { Stats } from "@/lib/data/schemas";

/** Linear-interpolated quantile on a sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const r = (x: number) => Math.round(x * 1e6) / 1e6;

/** Unweighted descriptive statistics. Callers must document the population. */
export function computeStats(values: number[]): Stats {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) throw new Error("computeStats: empty population");
  return {
    n: s.length,
    min: r(s[0]),
    p25: r(quantile(s, 0.25)),
    median: r(quantile(s, 0.5)),
    p75: r(quantile(s, 0.75)),
    max: r(s[s.length - 1]),
  };
}
