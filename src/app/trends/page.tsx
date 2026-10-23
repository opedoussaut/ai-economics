import type { Metadata } from "next";
import { Card, CardBody, CardHeader, Note, PageHeader } from "@/components/ui";
import { TimeSeriesChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";
import { getDailyIndex, getTokenHistory, getTokenSnapshot } from "@/lib/data/store";
import { pivotIndex } from "@/lib/analytics";
import { TOKEN_POPULATIONS } from "@/lib/ingest/indexer";
import { ModelHistory, type HistoryOption } from "./model-history";

export const metadata: Metadata = { title: "Market Trends" };
export const revalidate = 300;

export default async function TrendsPage() {
  const [index, history, snap] = await Promise.all([getDailyIndex(), getTokenHistory(), getTokenSnapshot()]);
  const populations = TOKEN_POPULATIONS.map((p) => ({ key: p.key, label: p.label }));
  const medianOut = pivotIndex(index, populations.map((p) => ({ key: p.key, metric: "output", as: p.label })));
  const medianIn = pivotIndex(index, populations.map((p) => ({ key: p.key, metric: "input", as: p.label })));
  const floor = pivotIndex(index, [
    { key: "token:direct", metric: "output", stat: "min", as: "Lowest output (direct)" },
    { key: "token:direct", metric: "output", stat: "p25", as: "25th percentile output (direct)" },
    { key: "token:direct", metric: "output", stat: "p75", as: "75th percentile output (direct)" },
  ]);
  const counts = pivotIndex(index, populations.map((p) => ({ key: p.key, metric: "output", stat: "n", as: p.label })));

  // Per-offering histories with at least two distinct observations.
  const byId = new Map<string, { at: string; input: number | null; output: number | null; origin: string }[]>();
  for (const r of history) {
    const arr = byId.get(r.offeringId) ?? [];
    arr.push({ at: r.observedAt.slice(0, 10), input: r.values.input ?? null, output: r.values.output ?? null, origin: r.origin });
    byId.set(r.offeringId, arr);
  }
  const names = new Map(snap?.offerings.map((o) => [o.id, `${o.modelId} · ${o.providerName}`]) ?? []);
  const options: HistoryOption[] = [...byId.entries()]
    .filter(([id, rows]) => rows.length >= 2 && names.has(id))
    .map(([id, rows]) => ({ id, label: names.get(id)!, rows: rows.sort((a, b) => a.at.localeCompare(b.at)) }))
    .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader
        eyebrow="Market Trends"
        title="How published AI prices move over time"
        description="Population statistics and individual model price histories. Backfilled points come from monthly revisions of the LiteLLM price map (dated by commit); live points from our own scheduled collection."
        actions={<ValueClassBadge kind="published" />}
      />
      <Note className="mb-4">
        Population medians mix two effects: repricing of existing models and changes in which models are listed. For like-for-like price evolution, use the per-model history
        below. Statistics are unweighted (one offering = one vote) and never represent a usage-weighted market average.
      </Note>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Median output price by population" subtitle="USD per 1M output tokens" />
          <CardBody><TimeSeriesChart data={medianOut} series={populations.map((p) => ({ key: p.label, label: p.label }))} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Median input price by population" subtitle="USD per 1M input tokens" />
          <CardBody><TimeSeriesChart data={medianIn} series={populations.map((p) => ({ key: p.label, label: p.label }))} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Distribution of first-party output prices" subtitle="Minimum and interquartile range across direct developer APIs" />
          <CardBody><TimeSeriesChart data={floor} series={[{ key: "Lowest output (direct)", label: "Minimum" }, { key: "25th percentile output (direct)", label: "P25" }, { key: "75th percentile output (direct)", label: "P75" }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Population size" subtitle="Number of paid offerings in each population (affects comparability across dates)" />
          <CardBody><TimeSeriesChart data={counts} unit="number" series={populations.map((p) => ({ key: p.label, label: p.label }))} /></CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Price history for a single offering" subtitle={`${options.length} offerings have two or more distinct recorded prices. Step changes are dated by observation (commit date or collection time), not by provider effective date.`} />
        <CardBody><ModelHistory options={options} /></CardBody>
      </Card>
    </>
  );
}
