/** Presentation helpers. Values arrive as plain numbers already computed in Decimal. */

export function fmtMoney(v: number | null | undefined, currency = "USD", opts: { digits?: number; compact?: boolean } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = opts.digits ?? (abs === 0 ? 2 : abs < 0.01 ? 5 : abs < 1 ? 4 : abs < 100 ? 2 : 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.compact ? 0 : Math.min(digits, 2),
    maximumFractionDigits: opts.compact ? 2 : digits,
    notation: opts.compact && abs >= 10_000 ? "compact" : "standard",
  }).format(v);
}

export function fmtNum(v: number | null | undefined, digits = 2, compact = false) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    notation: compact && Math.abs(v) >= 100_000 ? "compact" : "standard",
  }).format(v);
}

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}%`;

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  return withTime
    ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`
    : d.toISOString().slice(0, 10);
}

export function fmtTokens(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${fmtNum(n / 1_000_000, 2)}M`;
  if (n >= 1_000) return `${fmtNum(n / 1_000, 1)}K`;
  return fmtNum(n, 0);
}
