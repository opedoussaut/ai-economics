/**
 * Minimal parser for the Prometheus text exposition format (v0.0.4), enough
 * to read vLLM, Triton and dcgm-exporter /metrics endpoints directly.
 */
export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+([^\s]+)(\s+\d+)?$/;
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

function parseValue(v: string): number {
  if (v === "+Inf") return Infinity;
  if (v === "-Inf") return -Infinity;
  if (v === "NaN") return NaN;
  return Number(v);
}

export function parsePromText(text: string): PromSample[] {
  const out: PromSample[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    const labels: Record<string, string> = {};
    if (m[3]) {
      for (const lm of m[3].matchAll(LABEL)) labels[lm[1]] = lm[2].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
    }
    out.push({ name: m[1], labels, value: parseValue(m[4]) });
  }
  return out;
}

export const sumOf = (samples: PromSample[], name: string) => {
  const xs = samples.filter((s) => s.name === name && Number.isFinite(s.value));
  return xs.length ? xs.reduce((a, s) => a + s.value, 0) : null;
};

export const avgOf = (samples: PromSample[], name: string) => {
  const xs = samples.filter((s) => s.name === name && Number.isFinite(s.value));
  return xs.length ? xs.reduce((a, s) => a + s.value, 0) / xs.length : null;
};

export const countOf = (samples: PromSample[], name: string) => samples.filter((s) => s.name === name).length;

/** Quantile from cumulative histogram buckets (summed across series), like histogram_quantile on counters. */
export function histogramQuantile(samples: PromSample[], name: string, q: number): number | null {
  const buckets = new Map<number, number>();
  for (const s of samples) {
    if (s.name !== `${name}_bucket` || s.labels.le === undefined) continue;
    const le = parseValue(s.labels.le);
    buckets.set(le, (buckets.get(le) ?? 0) + s.value);
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return null;
  const total = sorted[sorted.length - 1][1];
  if (!total) return null;
  const rank = q * total;
  let prevLe = 0;
  let prevCount = 0;
  for (const [le, count] of sorted) {
    if (count >= rank) {
      if (!Number.isFinite(le)) return prevLe;
      const inBucket = count - prevCount;
      return inBucket === 0 ? le : prevLe + ((le - prevLe) * (rank - prevCount)) / inBucket;
    }
    prevLe = le;
    prevCount = count;
  }
  return prevLe;
}
