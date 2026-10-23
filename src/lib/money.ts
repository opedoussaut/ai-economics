import Decimal from "decimal.js";

/**
 * Decimal-safe arithmetic helpers. All financial calculators work in Decimal
 * and only convert to `number` at the presentation boundary.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };
export type Num = Decimal.Value;

export const D = (v: Num | null | undefined): Decimal => new Decimal(v ?? 0);

export const MILLION = new Decimal(1_000_000);
export const HOURS_PER_YEAR = new Decimal(8760);
export const HOURS_PER_MONTH = HOURS_PER_YEAR.div(12); // 730
export const DAYS_PER_MONTH = new Decimal(365).div(12); // 30.4166…

/** Per-token price -> per-million-token price. */
export const perMillion = (perToken: Num) => D(perToken).mul(MILLION);

/** Safe division: returns null when the divisor is zero (undefined result). */
export function safeDiv(a: Num, b: Num): Decimal | null {
  const db = D(b);
  if (db.isZero()) return null;
  return D(a).div(db);
}

export const toNum = (d: Decimal | null, dp = 10): number | null =>
  d === null ? null : d.toDecimalPlaces(dp).toNumber();

/** Sum a list of Decimals. */
export const sum = (xs: Decimal[]) => xs.reduce((acc, x) => acc.add(x), new Decimal(0));

/** Convert an amount in `currency` to USD given ECB-style rates (units per 1 EUR). */
export function convert(
  amount: Num,
  from: string,
  to: string,
  eurRates: Record<string, number>,
): Decimal | null {
  if (from === to) return D(amount);
  const rate = (c: string) => (c === "EUR" ? 1 : eurRates[c]);
  const rf = rate(from);
  const rt = rate(to);
  if (!rf || !rt) return null;
  return D(amount).div(rf).mul(rt);
}
