import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Formula, Note, PageHeader, td, th } from "@/components/ui";
import { integrationStatuses } from "@/lib/telemetry/config";
import { DCGM_PROMQL, VLLM_PROMQL } from "@/lib/telemetry/mappings";
import { authConfigured } from "@/lib/auth";

export const metadata: Metadata = { title: "Monitoring & Telemetry" };
export const dynamic = "force-dynamic";

export default function MonitoringPage() {
  const integrations = integrationStatuses();
  const anyConnected = integrations.some((i) => i.configured);
  return (
    <>
      <PageHeader
        eyebrow="Monitoring & Telemetry"
        title="Connect your instrumentation to measure real cost"
        description="AI Economics reads metrics from systems you already run — Prometheus, vLLM, NVIDIA DCGM, MLflow and OpenTelemetry GenAI spans — and multiplies measured usage by documented rates. Nothing here is simulated: with no source connected, no live values are shown."
        actions={<ButtonLink href="/monitoring/live"><Lock className="size-3.5" /> Open live view</ButtonLink>}
      />
      {!anyConnected && (
        <Note tone="warn" className="mb-4">
          No telemetry source is connected on this deployment. The live view will show a not-connected state until a source is configured in the server environment.
        </Note>
      )}
      {!authConfigured() && (
        <Note className="mb-4">Private monitoring is disabled on this deployment (no <code>ADMIN_TOKEN</code>/<code>SESSION_SECRET</code>). Configuration is server-side only; endpoint URLs and credentials are never sent to browsers.</Note>
      )}

      <Card className="mb-4">
        <CardHeader title="Integrations" subtitle="Status reflects server configuration only. Endpoint addresses are never displayed." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border"><tr><th className={th}>Integration</th><th className={th}>Type</th><th className={th}>Status</th><th className={th}>What it provides</th><th className={th}>Configure with</th></tr></thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className={`${td} font-medium`}>{i.name}</td>
                  <td className={td}><Badge tone={i.mode === "adapter" ? "accent" : "neutral"}>{i.mode === "adapter" ? "Working adapter" : "Documentation only"}</Badge></td>
                  <td className={td}>{i.mode === "documentation-only" ? <Badge>n/a</Badge> : i.configured ? <Badge tone="pos">Configured</Badge> : <Badge tone="warn">Not connected</Badge>}</td>
                  <td className={`${td} text-xs text-muted`}>{i.description}</td>
                  <td className={`${td} text-xs`}>{i.envVars.length ? i.envVars.map((e) => <code key={e} className="mr-1 block">{e}</code>) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="How live cost is computed" />
          <CardBody className="space-y-3 text-sm text-muted">
            <p>A <strong className="text-text">workload run</strong> records its GPU count, a documented $/GPU-hour (e.g. a published rate from GPU Pricing or your contract) and the allocation method. On creation, counter baselines (tokens, energy) are captured so that &ldquo;to date&rdquo; values cover only that run.</p>
            <Formula>{`cost to date (calculated)  = GPUs × elapsed hours × $/GPU-hour        [reserved allocation]
current cost rate          = GPUs × $/GPU-hour                           (while running)
tokens generated (measured)= vllm:generation_tokens_total − baseline
cost per 1M generated      = cost to date ÷ tokens generated × 1e6
energy (measured)          = Δ DCGM_FI_DEV_TOTAL_ENERGY_CONSUMPTION (mJ) ÷ 3.6e9 → kWh
projected total (FORECAST) = cost per token × planned tokens`}</Formula>
            <p>Utilization is shown as a measurement but is <em>not</em> used as a billing share. Cumulative cost and forecasts are always labelled separately.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="OpenTelemetry GenAI ingestion" subtitle="Works with any OTel SDK or collector using the OTLP/HTTP JSON protocol" />
          <CardBody className="space-y-3 text-sm text-muted">
            <Formula>{`curl -X POST https://<your-host>/api/ingest/otlp/v1/traces \\
  -H "Authorization: Bearer $INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data @traces.json

# OpenTelemetry Collector exporter
exporters:
  otlphttp/aie:
    traces_endpoint: https://<your-host>/api/ingest/otlp/v1/traces
    encoding: json
    headers: { Authorization: "Bearer \${env:INGEST_TOKEN}" }`}</Formula>
            <p>Read attributes: <code>gen_ai.provider.name</code>, <code>gen_ai.request/response.model</code>, <code>gen_ai.usage.input_tokens</code> (includes cached), <code>cache_read/cache_creation.input_tokens</code>, <code>output_tokens</code> (includes reasoning), <code>reasoning.output_tokens</code>, optional <code>aie.project</code>. Prompt/completion content attributes are ignored and never stored. Cost is calculated against the matched published price; unmatched models are stored without cost.</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Metric mapping" subtitle="PromQL used against Prometheus (read-only GET /api/v1/query). Direct scrapes use the same metric names without rate windows." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border"><tr><th className={th}>Source</th><th className={th}>Metric</th><th className={th}>Unit</th><th className={th}>PromQL</th></tr></thead>
            <tbody>
              {[...VLLM_PROMQL.map((q) => ({ ...q, src: "vLLM" })), ...DCGM_PROMQL.map((q) => ({ ...q, src: "DCGM" }))].map((q) => (
                <tr key={q.src + q.key} className="border-b border-border/60 last:border-0">
                  <td className={td}><Badge>{q.src}</Badge></td>
                  <td className={td}>{q.label}</td>
                  <td className={`${td} text-muted`}>{q.unit}</td>
                  <td className={`${td} num text-[11px] text-muted`}>{q.query}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Note className="mt-4">
        Security: integration settings live in server environment variables, the live view and telemetry APIs require an admin session, the OTLP endpoint requires a bearer token,
        and raw prompts, completions or training data are not collected. See <Link className="text-accent" href="/methodology">methodology</Link> and <code>docs/INTEGRATIONS.md</code>.
      </Note>
    </>
  );
}
