import type { FxSnapshot } from "@/lib/data/schemas";
import { fetchText, type FetchOptions } from "@/lib/ingest/http";

/** ECB euro foreign exchange reference rates (daily, public). */
export const ECB_SOURCE = {
  id: "ecb-fx",
  name: "ECB euro reference rates",
  url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  docs: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
} as const;

export function parseEcbXml(xml: string, fetchedAt: string): FxSnapshot {
  const date = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!date) throw new Error("ECB XML: reference date not found");
  const eurRates: Record<string, number> = {};
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    eurRates[m[1]] = Number(m[2]);
  }
  if (!eurRates.USD) throw new Error("ECB XML: USD rate missing");
  return { schemaVersion: 1, source: ECB_SOURCE.name, url: ECB_SOURCE.url, rateDate: date, fetchedAt, eurRates };
}

export async function fetchEcb(opts?: FetchOptions) {
  return fetchText(ECB_SOURCE.url, opts);
}
