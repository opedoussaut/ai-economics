import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, Note, PageHeader, Stat, td, th } from "@/components/ui";
import { Money } from "@/components/currency";
import { PriceScatter, TimeSeriesChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";
import { FreshnessBadge } from "@/components/freshness";
import { getChanges, getDailyIndex, getGpuSnapshot, getSourceStatuses, getTokenSnapshot } from "@/lib/data/store";
import { cheapest, gpuFamilies, isPaid, pivotIndex, priceStats } from "@/lib/analytics";
import { computeInference } from "@/lib/calc/inference";
import { fmtDate, fmtNum } from "@/lib/format";

export const revalidate = 300;

const FLAGSHIP_DEVELOPERS = ["OpenAI", "Anthropic", "Google", "xAI", "Mistral AI", "DeepSeek", "Alibaba (Qwen)", "Moonshot AI"];

export default async function OverviewPage() {
  const [tokens, gpus, changes, index, statuses] = await Promise.all([getTokenSnapshot(), getGpuSnapshot(), getChanges(), getDailyIndex(), getSourceStatuses()]);
  if (!tokens || !gpus) {
    return (
      <EmptyState title="No data ingested yet">
        Run <code>npm run refresh</code> to collect public prices. Nothing is shown until real observations exist.
      </EmptyState>
    );
  }
  const offerings = tokens.offerings;
  const direct = (o: (typeof offerings)[number]) => o.channel === "direct" && o.sourceId === "litellm";
  const listed = offerings.filter((o) => o.listed);
  const lowIn = cheapest(offerings, "input", direct);
  const lowOut = cheapest(offerings, "output", direct);
  const medIn = priceStats(offerings, "input", direct);
  const medOut = priceStats(offerings, "output", direct);
  const families = gpuFamilies(gpus.offerings);
  const h100 = families.find((f) => f.family === "H100");
  const litellmAt = tokens.sources.litellm?.fetchedAt;

  // Modeled scenario: rented H100 at the marketplace median, illustrative throughput assumptions.
  const scenarioRate = h100?.marketplace?.median ?? h100?.cloudOnDemand?.median ?? null;
  const scenario = scenarioRate
    ? computeInference({
        hardware: { mode: "rent", rentalPerGpuHour: scenarioRate, rentalIncludesPower: true, gpuPowerW: 700, hostPowerPerGpuW: 0, pue: 1, electricityPerKwh: 0, storageBandwidthPerGpuHour: 0, softwareOpsPerGpuHour: 0 },
        gpuCount: 1, utilization: 0.6, prefillTokensPerSecPerGpu: 20_000, decodeTokensPerSecPerGpu: 2_500,
        inputTokensPerRequest: 2000, outputTokensPerRequest: 500, prefixCacheHitRate: 0,
      })
    : null;

  const trend = pivotIndex(index, [
    { key: "token:direct", metric: "input", as: "Direct APIs · input" },
    { key: "token:direct", metric: "output", as: "Direct APIs · output" },
    { key: "token:third-party-host", metric: "output", as: "Third-party hosts · output" },
  ]);

  const scatterPts = (filter: (o: (typeof offerings)[number]) => boolean) =>
    offerings.filter((o) => isPaid(o) && filter(o)).map((o) => ({ x: o.prices.input!, y: o.prices.output!, label: `${o.providerName} · ${o.modelId}` }));
  const scatter = [
    { name: "First-party developer APIs", color: "var(--chart-1)", points: scatterPts(direct) },
    { name: "Third-party hosts", color: "var(--chart-3)", points: scatterPts((o) => o.channel === "third-party-host") },
  ];

  const recentChanges = changes.filter((c) => c.kind === "price-change").slice(0, 10);
  const recentEvents = changes.filter((c) => c.kind !== "price-change").slice(0, 6);
  const flagship = FLAGSHIP_DEVELOPERS.map((dev) => {
    const own = offerings.filter((o) => isPaid(o) && direct(o) && o.developer === dev && !o.deprecationDate);
    return { dev, n: own.length, input: priceStats(own, "input", () => true), output: priceStats(own, "output", () => true) };
  }).filter((x) => x.n > 0);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="The economics of AI, from published sources"
        description={
          <>
            {fmtNum(listed.length, 0)} listed model offerings and {fmtNum(gpus.offerings.filter((o) => o.listed).length, 0)} GPU price points, collected automatically.
            Medians below are <strong>unweighted</strong> across a stated population — not a global market average.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Lowest published input price · direct APIs"
          badge={<ValueClassBadge kind="published" />}
          value={lowIn ? <Money usd={lowIn.prices.input} /> : "—"}
          sub={lowIn && <>per 1M tokens · {lowIn.providerName} <code className="text-[11px]">{lowIn.modelId}</code></>}
        />
        <Stat
          label="Lowest published output price · direct APIs"
          badge={<ValueClassBadge kind="published" />}
          value={lowOut ? <Money usd={lowOut.prices.output} /> : "—"}
          sub={lowOut && <>per 1M tokens · {lowOut.providerName} <code className="text-[11px]">{lowOut.modelId}</code></>}
        />
        <Stat
          label="Median input / output · direct APIs"
          badge={<ValueClassBadge kind="published" />}
          value={medIn && medOut ? <><Money usd={medIn.median} /> / <Money usd={medOut.median} /></> : "—"}
          sub={medIn && <>Unweighted median of n={medIn.n} paid first-party offerings (LiteLLM map), {fmtDate(litellmAt)}</>}
        />
        <Stat
          label="H100 rental · Vast.ai marketplace median"
          badge={<ValueClassBadge kind="published" />}
          value={h100?.marketplace ? <><Money usd={h100.marketplace.median} />/GPU-h</> : "—"}
          sub={h100?.marketplace && <>Range <Money usd={h100.marketplace.min} />–<Money usd={h100.marketplace.max} /> over {h100.marketplace.n} live offers ({h100.marketplace.models} H100 variants)</>}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="H100 on-demand · Azure (per GPU-hour)"
          badge={<ValueClassBadge kind="published" />}
          value={h100?.cloudOnDemand ? <Money usd={h100.cloudOnDemand.min} /> : "—"}
          sub={h100?.cloudOnDemand && <>Cheapest of {h100.regions} regions; median <Money usd={h100.cloudOnDemand.median} />. Full-VM price ÷ GPUs.</>}
        />
        <Stat
          label="Modeled cost per 1M generated tokens"
          badge={<ValueClassBadge kind="modeled" />}
          value={scenario ? <Money usd={scenario.costPerMOutput!.toNumber()} /> : "—"}
          sub={<>1×H100 at the marketplace median, 60% utilization, assumed 2,500 output tok/s aggregate. <Link className="text-accent" href="/inference">Adjust →</Link></>}
        />
        <Stat
          label="Modeled cost per request (2K in / 500 out)"
          badge={<ValueClassBadge kind="modeled" />}
          value={scenario?.costPerRequest ? <Money usd={scenario.costPerRequest.toNumber()} digits={5} /> : "—"}
          sub="Same illustrative scenario; phase-time allocation, no cache. Assumptions, not benchmarks."
        />
        <Stat
          label="Data sources healthy"
          value={`${statuses.filter((s) => s.freshness.state === "fresh").length} / ${statuses.filter((s) => s.freshness.state !== "not-configured").length}`}
          sub={<Link href="/methodology#source-health" className="text-accent">View source health →</Link>}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Published token price trend — unweighted medians"
            subtitle="USD per 1M tokens. Populations from the LiteLLM map at each monthly revision (backfilled) and each live refresh. Composition changes as models are added/removed, so moves reflect mix as well as repricing."
            actions={<ValueClassBadge kind="published" />}
          />
          <CardBody>
            <TimeSeriesChart data={trend} series={[{ key: "Direct APIs · input", label: "Direct APIs · input" }, { key: "Direct APIs · output", label: "Direct APIs · output" }, { key: "Third-party hosts · output", label: "Third-party hosts · output", dashed: true }]} />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Input vs output price" subtitle="Each dot is one paid offering (log scales)." actions={<ValueClassBadge kind="published" />} />
          <CardBody>
            <PriceScatter groups={scatter} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="First-party API prices by developer" subtitle="Median of each developer's own paid, non-deprecated API offerings (unweighted). USD per 1M tokens." actions={<ValueClassBadge kind="published" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr><th className={th}>Developer</th><th className={th}>Offerings</th><th className={th}>Median input</th><th className={th}>Median output</th><th className={th}>Output range</th></tr></thead>
              <tbody>
                {flagship.map((f) => (
                  <tr key={f.dev} className="border-b border-border/60 last:border-0">
                    <td className={td}><Link className="hover:text-accent" href={`/token-pricing?developer=${encodeURIComponent(f.dev)}&channel=direct`}>{f.dev}</Link></td>
                    <td className={`${td} num text-muted`}>{f.n}</td>
                    <td className={td}><Money usd={f.input?.median} /></td>
                    <td className={td}><Money usd={f.output?.median} /></td>
                    <td className={`${td} text-muted`}><Money usd={f.output?.min} /> – <Money usd={f.output?.max} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="GPU rental price ranges" subtitle="USD per GPU-hour. Marketplace = median of Vast.ai offer medians; cloud = Azure on-demand full-VM price ÷ GPUs." actions={<ValueClassBadge kind="published" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr><th className={th}>GPU</th><th className={th}>Marketplace median</th><th className={th}>Marketplace range</th><th className={th}>Cloud on-demand (min)</th></tr></thead>
              <tbody>
                {families.slice(0, 9).map((f) => (
                  <tr key={f.family} className="border-b border-border/60 last:border-0">
                    <td className={td}><Link className="hover:text-accent" href={`/gpu-pricing?family=${encodeURIComponent(f.family)}`}>{f.family}</Link></td>
                    <td className={td}>{f.marketplace ? <Money usd={f.marketplace.median} /> : <span className="text-faint">—</span>}</td>
                    <td className={`${td} text-muted`}>{f.marketplace ? <><Money usd={f.marketplace.min} /> – <Money usd={f.marketplace.max} /></> : "—"}</td>
                    <td className={td}>{f.cloudOnDemand ? <Money usd={f.cloudOnDemand.min} /> : <span className="text-faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recently observed price changes" subtitle="Detected by comparing consecutive snapshots. Times are observation times, not provider effective dates." actions={<a href="/feed.xml" className="text-xs text-accent">RSS</a>} />
          {recentChanges.length === 0 ? (
            <CardBody>
              <EmptyState title="No price changes observed yet">
                Change detection starts after the baseline snapshot ({fmtDate(litellmAt, true)}). New changes appear here and in the RSS feed.
              </EmptyState>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border/60">
              {recentChanges.map((c, i) => {
                const up = (c.newValue ?? 0) > (c.oldValue ?? 0);
                return (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                    {up ? <ArrowUpRight className="size-4 text-neg" /> : <ArrowDownRight className="size-4 text-pos" />}
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <Badge>{c.field}</Badge>
                    <span className="num text-xs text-muted">{fmtNum(c.oldValue, 4)} → {fmtNum(c.newValue, 4)}</span>
                    <span className="text-xs text-faint">{fmtDate(c.at, true)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {recentEvents.length > 0 && (
            <div className="border-t border-border px-4 py-2 text-xs text-muted">
              Also: {recentEvents.map((e) => `${e.kind} ${e.label}`).join(" · ")}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Data freshness" subtitle="Last successful collection per source" />
          <ul className="divide-y divide-border/60">
            {statuses.map(({ source, freshness, entry }) => (
              <li key={source.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">{source.name}</span>
                <span className="flex items-center gap-2">
                  {entry?.lastSuccessAt && <span className="text-[11px] text-faint">{fmtDate(entry.lastSuccessAt, true)}</span>}
                  <FreshnessBadge state={freshness.state} title={freshness.message} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Note className="mt-6">
        Public API list prices are what customers are charged; they are <strong>not</strong> providers&apos; internal production costs. Modeled production costs on this site come
        from adjustable assumptions and are labelled <ValueClassBadge kind="modeled" />. Benchmark-based price/performance requires a licensed benchmark feed (not connected).
      </Note>
    </>
  );
}
