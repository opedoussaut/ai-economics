import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Badge, Card, CardBody, CardHeader, ExternalLink, Formula, PageHeader, td, th } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { FreshnessBadge } from "@/components/freshness";
import { getFx, getHealth, getSourceStatuses } from "@/lib/data/store";
import { VALUE_CLASSES, type ValueClass } from "@/lib/types";
import { fmtDate, fmtNum } from "@/lib/format";

export const metadata: Metadata = { title: "Data Sources & Methodology" };
export const revalidate = 300;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-16">
      <CardHeader title={title} />
      <CardBody className="space-y-3 text-sm leading-6 text-muted [&_strong]:text-text">{children}</CardBody>
    </Card>
  );
}

export default async function MethodologyPage() {
  const [statuses, health, fx] = await Promise.all([getSourceStatuses(), getHealth(), getFx()]);
  return (
    <>
      <PageHeader eyebrow="Data Sources & Methodology" title="How every number on this site is produced"
        description="Sources, collection methods, refresh schedules, calculation conventions and known limitations. The full text is also in docs/METHODOLOGY.md and docs/DATA_SOURCES.md." />

      <div className="space-y-4">
        <Section id="value-classes" title="Six classes of economic value">
          <p>Every value is labelled with exactly one class. Estimates are never presented as measurements, and modeled production costs are never presented as any company&apos;s disclosed costs.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(VALUE_CLASSES) as ValueClass[]).map((k) => (
              <div key={k} className="rounded-lg border border-border p-3">
                <ValueClassBadge kind={k} /> <span className="ml-1 font-medium text-text">{VALUE_CLASSES[k].label}</span>
                <p className="mt-1 text-xs">{VALUE_CLASSES[k].description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Card id="source-health" className="scroll-mt-16">
          <CardHeader title="Sources & health" subtitle={`Health file updated ${fmtDate(health?.updatedAt, true)}. Cadences are targets, not guarantees of upstream freshness.`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr><th className={th}>Source</th><th className={th}>Method</th><th className={th}>Target cadence</th><th className={th}>Last success</th><th className={th}>Records</th><th className={th}>Status</th><th className={th}>Terms</th></tr></thead>
              <tbody>
                {statuses.map(({ source, entry, freshness }) => (
                  <tr key={source.id} className="border-b border-border/60 align-top">
                    <td className={td}><ExternalLink href={source.docs}>{source.name}</ExternalLink><div className="text-[11px] text-faint">{source.notes}</div></td>
                    <td className={td}><Badge>{source.method}</Badge></td>
                    <td className={`${td} text-xs`}>every {source.cadenceHours} h<div className="text-faint">stale after {source.staleAfterHours} h</div></td>
                    <td className={`${td} text-xs`}>{fmtDate(entry?.lastSuccessAt, true)}{entry?.lastError && <div className="text-neg">{entry.lastError}</div>}</td>
                    <td className={`${td} num text-xs`}>{entry ? fmtNum(entry.recordCount, 0) : "—"}</td>
                    <td className={td}><FreshnessBadge state={freshness.state} title={freshness.message} /><div className="mt-1 text-[11px] text-faint">{freshness.message}</div></td>
                    <td className={`${td} text-[11px]`}>{source.terms}{source.requiresKey && <div>Requires <code>{source.requiresKey}</code></div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="border-t border-border px-4 py-3 text-xs text-muted">
            <summary className="cursor-pointer text-text">Recent refresh jobs ({health?.jobs.length ?? 0})</summary>
            <table className="mt-2 w-full">
              <tbody>
                {health?.jobs.slice(0, 40).map((j) => (
                  <tr key={j.id} className="border-b border-border/40">
                    <td className="py-1 pr-3">{fmtDate(j.startedAt, true)}</td><td className="pr-3">{j.sourceId}</td>
                    <td className={`pr-3 ${j.status === "ok" ? "text-pos" : "text-neg"}`}>{j.status}</td>
                    <td className="pr-3 num">{j.recordCount} records</td><td className="pr-3 num">{j.changes} changes</td><td className="text-neg">{j.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Section id="collection" title="How published prices are collected">
            <p><strong>Token prices.</strong> Scheduled jobs download the MIT-licensed LiteLLM model price map and OpenRouter&apos;s public models API, validate them with schemas, convert per-token prices to USD per 1M tokens with decimal arithmetic, and merge them into a versioned snapshot. Each LiteLLM entry carries the provider&apos;s official pricing URL, shown next to the price. Provider HTML pricing pages are not scraped.</p>
            <p><strong>GPU prices.</strong> Azure list prices come from the official, unauthenticated Retail Prices API (Linux pay-as-you-go, spot and 1/3-year reservations per region). Vast.ai marketplace offers come from its documented search API; only aggregate statistics (min, quartiles, median, max, count) are republished.</p>
            <p><strong>Idempotent history.</strong> Each offering&apos;s price fields are hashed; a history row is appended only when the hash changes, so re-running a refresh adds nothing. Change events (price change, new, delisted, relisted) are derived from consecutive snapshots. The baseline run records history but no change events.</p>
            <p><strong>Failures.</strong> A failed or invalid fetch never replaces data: the last verified snapshot is kept, the error and consecutive-failure count are recorded, and the source shows as <em>failing</em>, then <em>stale</em> after its threshold. Offerings missing from a successful fetch are marked <em>delisted</em> (kept for 90 days with their last price), not deleted.</p>
          </Section>
          <Section id="measured" title="Measured vs estimated vs calculated">
            <p><strong>Measured</strong>: values read from your telemetry — token counters (vLLM, OTel spans), GPU utilization, memory, power and energy (DCGM), training metrics (MLflow).</p>
            <p><strong>Calculated</strong>: a measurement multiplied by a documented rule — e.g. measured GPU-hours × a published or contracted $/GPU-hour, or span token usage × the matched published token price.</p>
            <p><strong>Modeled</strong>: outputs of the calculators, driven by assumptions you can see and change (throughput, utilization, MFU, prices). Formulas are displayed beside every calculator.</p>
            <p><strong>Billed</strong> cost requires reconciliation against an invoice or billing API; no billing integration is connected in this deployment, so no value is labelled billed.</p>
            <p><strong>Benchmarks</strong> require a licensed feed (e.g. Artificial Analysis); none is connected, so no price/performance claims are shown.</p>
          </Section>
          <Section id="blended" title="Blended token cost">
            <p>A blended $/1M figure is only meaningful for a stated workload mix. We compute it as total request cost ÷ total billed tokens for the workload you enter, or with an explicit input:output ratio. Different mixes produce different rankings.</p>
            <p>Token accounting bills each token once: prompt tokens are split into uncached, cache-read and cache-write; reasoning tokens are a subset of output when the usage report includes them (OpenAI usage, OTel <code>gen_ai.usage.output_tokens</code>), otherwise additional. Unpublished tiers are reported as unavailable, never substituted.</p>
          </Section>
          <Section id="gpu-attribution" title="GPU cost attribution">
            <p>Three explicitly labelled methods: <strong>reserved allocation</strong> (job pays for GPU-hours it held; idle capacity shown as unallocated), <strong>billed runtime</strong> (from per-job billing records) and <strong>proportional usage</strong> (pool cost split by measured usage share — an approximation, not a bill). Allocations plus unallocated always sum to the pool cost. GPU-utilization percentage is never treated as an exact billing share.</p>
            <p>Self-hosted inference cost uses <strong>phase-time allocation</strong>: GPU-seconds per request = uncached input ÷ prefill throughput + output ÷ decode throughput. This assumes non-overlapping phases (conservative); no intrinsic input/output cost split is invented beyond measured or assumed phase throughputs.</p>
          </Section>
          <Section id="depreciation" title="Owned hardware vs cloud rental">
            <p><strong>Owned:</strong> straight-line depreciation of (GPU + server/network capex − residual) over useful life, plus an optional cost-of-capital line (capital-recovery factor), electricity = (GPU W + host W) ÷ 1000 × PUE × $/kWh, maintenance as % of capex per year, and optional colocation.</p>
            <p><strong>Rented:</strong> the rental rate already includes power, cooling, space and hardware depreciation for virtually all cloud and marketplace offers. Electricity is added only if you explicitly mark it as excluded — preventing double counting.</p>
            <Formula>{`owned $/GPU-h = (capex − residual)/(life × 8760) + capital charge + kWh/GPU-h × $/kWh + capex × maint%/8760 + facility
rented $/GPU-h = rental + [electricity only if excluded by contract] + storage/bandwidth + software/ops`}</Formula>
          </Section>
          <Section id="training-tokens" title="Training tokens vs inference tokens">
            <p>Inference tokens are billed or served units (input/prompt and output/generated). Training distinguishes <strong>unique dataset tokens</strong>, <strong>processed tokens</strong> (unique × epochs, i.e. repeated passes) and total computational throughput. Training compute is approximated as 6 × N × processed tokens for dense transformers (N = active parameters for MoE), excluding attention FLOPs; LoRA/QLoRA use ≈4N. These are approximations and are labelled as such.</p>
          </Section>
          <Section id="limitations" title="Limitations of cross-model comparisons">
            <p>Price per token is not price per unit of work: tokenizers differ, models need different numbers of tokens (especially reasoning tokens) for the same task, and quality differs. Without a benchmark feed we do not rank models by price/performance. Public API prices are what customers pay — they are <strong>not</strong> providers&apos; internal production costs, and our modeled self-hosting costs are not estimates of any provider&apos;s costs.</p>
            <p>The LiteLLM map is community-maintained and can lag provider changes or contain errors; always verify against the linked official page before relying on a price. OpenRouter prices are reseller prices and are kept separate from direct-provider prices.</p>
          </Section>
          <Section id="fx" title="Currency conversion">
            <p>All sources used publish USD. EUR display uses the ECB euro reference rate {fx ? <>of <strong>{fx.rateDate}</strong> (1 EUR = {fx.eurRates.USD} USD)</> : "(not available)"}, applied at display time only. Stored values remain in original currency; the ECB states that its reference rates are for information purposes only.</p>
          </Section>
          <Section id="schedules" title="Refresh schedules">
            <p>GitHub Actions run <code>npm run refresh</code> on a schedule and commit changed data files: token prices and Azure every 6 h, Vast.ai every 3 h, ECB FX daily, tool link checks weekly. The daily trend index is upserted per run. Live telemetry polls connected sources every 5–300 s (configurable, default 15 s) and only while the private live view is open.</p>
          </Section>
          <Section id="stale" title="Stale observations">
            <p>Each source has a stale threshold (e.g. 36 h for token prices, 24 h for the marketplace). Past it, pages keep showing the last verified snapshot with a stale badge and the timestamp of the last success — values are never silently replaced or extrapolated.</p>
          </Section>
        </div>
      </div>
    </>
  );
}
