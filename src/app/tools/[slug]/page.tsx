import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, ExternalLink, Formula, Note, PageHeader } from "@/components/ui";
import { getLinkCheck, getTools } from "@/lib/data/store";
import { COST_CAPABILITY, TOOL_CATEGORIES, WORKLOADS } from "@/lib/tools";
import { fmtDate } from "@/lib/format";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getTools()).map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = (await getTools()).find((x) => x.slug === slug);
  return { title: t ? `${t.name} · Tools` : "Tool" };
}

const Yes = ({ v }: { v: boolean }) => (v ? <Check className="inline size-4 text-pos" aria-label="Yes" /> : <X className="inline size-4 text-faint" aria-label="No" />);

const AIE_GUIDE: Record<string, string> = {
  "nvidia-dcgm": "Set DCGM_EXPORTER_URL (direct scrape) or point PROMETHEUS_URL at a Prometheus that scrapes dcgm-exporter. AI Economics reads GPU utilization, memory, power and energy and multiplies energy by your electricity price.",
  "vllm-metrics": "Set VLLM_METRICS_URL to the server's /metrics endpoint or scrape it with Prometheus. AI Economics converts token counters into cost per token for a run, using your $/GPU-hour.",
  prometheus: "Set PROMETHEUS_URL (and PROMETHEUS_BEARER_TOKEN if needed). Only GET /api/v1/query is used.",
  "mlflow-tracking": "Set MLFLOW_TRACKING_URI (and MLFLOW_TRACKING_TOKEN). Link a workload run to an MLflow run ID to show loss/reward and cost per step.",
  "otel-genai": "Set INGEST_TOKEN and send OTLP/HTTP JSON traces to /api/ingest/otlp/v1/traces with `Authorization: Bearer <token>`. Only usage attributes are stored.",
  openlit: "Configure OpenLIT's OTLP exporter to send traces to the AI Economics OTLP endpoint (JSON encoding).",
  langfuse: "Langfuse already computes cost per trace. To consolidate in AI Economics, export via OpenTelemetry to the OTLP endpoint.",
  litellm: "Scrape LiteLLM's Prometheus endpoint with your Prometheus, or configure its OpenTelemetry callback to the OTLP endpoint.",
  "mlflow-genai": "MLflow traces can be exported via OpenTelemetry to the OTLP endpoint.",
  "triton-metrics": "Scrape Triton's :8002/metrics with Prometheus. A dedicated Triton mapping is not yet implemented; GPU metrics map via DCGM.",
};

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tools, links] = await Promise.all([getTools(), getLinkCheck()]);
  const t = tools.find((x) => x.slug === slug);
  if (!t) notFound();
  const checks = links?.results[slug] ?? [];
  return (
    <>
      <p className="mb-2 text-xs"><Link href="/tools" className="text-accent">← All tools</Link></p>
      <PageHeader eyebrow={TOOL_CATEGORIES[t.category]} title={t.name} description={t.summary}
        actions={<><ExternalLink href={t.website} className="text-xs">Website</ExternalLink><ExternalLink href={t.docs} className="text-xs">Documentation</ExternalLink>{t.github && <ExternalLink href={t.github} className="text-xs">GitHub</ExternalLink>}</>} />
      {t.caveats && <Note tone="warn" className="mb-4">{t.caveats}</Note>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="What it measures vs what it estimates" />
          <CardBody className="space-y-4 text-sm">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Measured directly</h3>
              <ul className="list-disc space-y-1 pl-5">{t.measures.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Monetary cost</h3>
              <p><Badge tone={t.costCapability === "none" ? "neutral" : "violet"}>{COST_CAPABILITY[t.costCapability]}</Badge> <span className="text-muted">{t.costNotes}</span></p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Supported workloads</h3>
              <div className="flex flex-wrap gap-1">{t.workloads.map((w) => <Link key={w} href={`/tools?workload=${w}`}><Badge>{WORKLOADS[w]}</Badge></Link>)}</div>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Installation</h3>
              <Formula>{t.install}</Formula>
            </div>
            {AIE_GUIDE[t.slug] && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Connecting to AI Economics</h3>
                <p className="text-muted">{AIE_GUIDE[t.slug]} See <Link href="/monitoring" className="text-accent">Monitoring &amp; Telemetry</Link>.</p>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Facts" />
          <dl className="divide-y divide-border/60 text-sm">
            {[
              ["Live monitoring", <Yes key="l" v={t.liveMonitoring} />],
              ["Historical records", <Yes key="h" v={t.historicalRecords} />],
              ["Hosting", t.hosting.join(", ")],
              ["License", t.license],
              ["Integrations", t.integrations.join(" · ")],
              ["Platforms", t.platforms.join(" · ")],
              ["Data export / API", t.exportApi],
              ["Pricing", t.pricing],
              ["AI Economics", t.aieIntegration === "adapter" ? "Working adapter" : t.aieIntegration === "documented" ? "Documented pathway" : "Not integrated"],
              ["Entry reviewed", fmtDate(t.lastVerified)],
            ].map(([k, v]) => (
              <div key={String(k)} className="grid grid-cols-[120px_1fr] gap-2 px-4 py-2">
                <dt className="text-xs text-faint">{k}</dt>
                <dd className="text-xs">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-border px-4 py-3 text-[11px] text-faint">
            <p className="mb-1 font-medium text-muted">Link check {fmtDate(links?.checkedAt, true)}</p>
            {checks.map((c) => (
              <p key={c.url} className="truncate">{c.ok ? "✓" : "✗"} {c.status ?? c.error} · {c.url}</p>
            ))}
          </div>
        </Card>
      </div>
      <p className="mt-4 text-[11px] text-faint">Pricing and licence terms change; confirm on the vendor&apos;s site. Logos are not reproduced. Capabilities summarised from official documentation; version-dependent features are flagged.</p>
    </>
  );
}
