"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Money } from "@/components/currency";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Note, Stat, td, th } from "@/components/ui";
import { SimpleLineChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";
import { fmtDate, fmtNum, fmtTokens } from "@/lib/format";

interface LiveResponse {
  pollSeconds: number;
  live: { sampledAt: string; connected: boolean; sources: { id: string; ok: boolean; error: string | null }[]; metrics: { key: string; label: string; unit: string; value: number | null; source: string }[] };
  runs: {
    id: string; name: string; type: string; project: string | null; cluster: string | null; model: string | null; status: string; startedAt: string; endedAt: string | null;
    gpuCount: number; ratePerGpuHour: number; rateSource: string | null; mlflowRunId: string | null; elapsedHours: number; gpuHours: number; costToDate: number;
    costRatePerHour: number; generatedTokens: number | null; inputTokens: number | null; costPerMGenerated: number | null; energyKwh: number | null; energyCost: number | null; projectedTotal: number | null;
  }[];
  usage: { project: string | null; model: string | null; provider: string | null; requests: number; inputTokens: number; outputTokens: number; errors: number; cost: number | null; unpriced: number }[];
}

interface MlflowData {
  run: { name: string; status: string; metrics: { key: string; value: number; step: number }[] };
  history: Record<string, { step: number; value: number }[]>;
}

/**
 * Polls /api/telemetry/live at the server-configured interval. Charts plot
 * only values actually returned by polls in this browser session.
 */
export function LiveView({ endRunAction }: { endRunAction: (fd: FormData) => Promise<void> }) {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<string, number | string | null>[]>([]);
  const [mlflow, setMlflow] = useState<Record<string, MlflowData | { error: string }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry/live", { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login?next=/monitoring/live"; return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as LiveResponse;
      setData(json);
      setError(null);
      if (json.live.connected) {
        const v = (k: string) => json.live.metrics.find((m) => m.key === k)?.value ?? null;
        setSeries((s) => [...s.slice(-119), { t: new Date(json.live.sampledAt).toISOString().slice(11, 19), "Gen tok/s": v("genTokensPerSec"), "GPU power (W)": v("powerW"), "GPU util %": v("gpuUtil") }]);
      }
      timer.current = setTimeout(poll, json.pollSeconds * 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      timer.current = setTimeout(poll, 30_000);
    }
  }, []);

  useEffect(() => {
    poll();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [poll]);

  useEffect(() => {
    for (const r of data?.runs ?? []) {
      if (!r.mlflowRunId || mlflow[r.id]) continue;
      fetch(`/api/telemetry/mlflow?runId=${encodeURIComponent(r.mlflowRunId)}`)
        .then(async (res) => (res.ok ? res.json() : { error: (await res.json()).error ?? `HTTP ${res.status}` }))
        .then((j) => setMlflow((m) => ({ ...m, [r.id]: j })));
    }
  }, [data, mlflow]);

  if (!data) return <Card><CardBody>{error ? <Note tone="warn">Could not load telemetry: {error}</Note> : <p className="text-sm text-muted">Loading telemetry…</p>}</CardBody></Card>;

  const metric = (k: string) => data.live.metrics.find((m) => m.key === k);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Sources" subtitle={`Last poll ${fmtDate(data.live.sampledAt, true)} · every ${data.pollSeconds}s`} actions={data.live.connected ? <Badge tone="pos">Connected</Badge> : <Badge tone="warn">Not connected</Badge>} />
        <CardBody>
          {data.live.sources.length === 0 ? (
            <EmptyState title="No telemetry source configured">
              Set PROMETHEUS_URL, VLLM_METRICS_URL or DCGM_EXPORTER_URL in the server environment. No live values are shown until a real source responds.
            </EmptyState>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.live.sources.map((s) => <Badge key={s.id} tone={s.ok ? "pos" : "neg"} title={s.error ?? undefined}>{s.id}: {s.ok ? "ok" : `error — ${s.error}`}</Badge>)}
            </div>
          )}
        </CardBody>
      </Card>

      {data.live.connected && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.live.metrics.filter((m) => m.value !== null).map((m) => (
              <Stat key={m.key} label={m.label} value={`${m.unit === "tokens" ? fmtTokens(m.value) : fmtNum(m.value, m.unit === "s" ? 3 : 1)} ${m.unit === "tokens" ? "" : m.unit}`} sub={`source: ${m.source}`} badge={<ValueClassBadge kind="measured" />} />
            ))}
          </div>
          {metric("energyMj")?.value != null && <p className="text-[11px] text-faint">Energy counter is cumulative since GPU driver load; per-run energy uses the run&apos;s baseline.</p>}
          <Card>
            <CardHeader title="This session's polled values" subtitle="Only real poll results are plotted; the chart starts empty when the page opens." />
            <CardBody>
              {series.length < 2 ? <EmptyState title="Collecting samples…" /> : (
                <SimpleLineChart data={series} xKey="t" unit="number" series={[{ key: "Gen tok/s", label: "Generation tok/s" }, { key: "GPU power (W)", label: "GPU power (W)" }, { key: "GPU util %", label: "GPU util %" }]} />
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Card>
        <CardHeader title="Workload runs" subtitle="Cost to date = reserved GPUs × elapsed × rate (calculated). Projected total is a forecast." />
        {data.runs.length === 0 ? (
          <CardBody><EmptyState title="No runs tracked yet">Use the form below to start tracking a run.</EmptyState></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr>
                <th className={th}>Run</th><th className={th}>GPUs · rate</th><th className={th}>Elapsed</th><th className={th}>Cost to date</th><th className={th}>Rate now</th>
                <th className={th}>Tokens gen.</th><th className={th}>$/1M gen.</th><th className={th}>Energy</th><th className={th}>Projected</th><th className={th} />
              </tr></thead>
              <tbody>
                {data.runs.map((r) => {
                  const ml = mlflow[r.id];
                  return (
                    <tr key={r.id} className="border-b border-border/60 align-top">
                      <td className={td}>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[11px] text-muted">{r.type}{r.model ? ` · ${r.model}` : ""}{r.project ? ` · ${r.project}` : ""}{r.cluster ? ` · ${r.cluster}` : ""}</div>
                        {ml && ("error" in ml ? <div className="text-[11px] text-warn">MLflow: {ml.error}</div> : (
                          <div className="text-[11px] text-muted">MLflow {ml.run.status}: {ml.run.metrics.slice(0, 4).map((m) => `${m.key}=${fmtNum(m.value, 4)} @${m.step}`).join(" · ")}</div>
                        ))}
                      </td>
                      <td className={`${td} text-xs`}>{r.gpuCount} × <Money usd={r.ratePerGpuHour} /><div className="text-faint">{r.rateSource ?? "rate source not given"}</div></td>
                      <td className={`${td} num text-xs`}>{fmtNum(r.elapsedHours, 2)} h<div className="text-faint">{fmtNum(r.gpuHours, 1)} GPU-h</div></td>
                      <td className={td}><Money usd={r.costToDate} /> <ValueClassBadge kind="calculated" /></td>
                      <td className={td}>{r.status === "running" ? <><Money usd={r.costRatePerHour} />/h</> : <Badge>ended</Badge>}</td>
                      <td className={`${td} num`}>{r.generatedTokens === null ? "—" : fmtTokens(r.generatedTokens)}</td>
                      <td className={td}><Money usd={r.costPerMGenerated} /></td>
                      <td className={`${td} text-xs`}>{r.energyKwh === null ? "—" : `${fmtNum(r.energyKwh, 2)} kWh`}{r.energyCost !== null && <div><Money usd={r.energyCost} /></div>}</td>
                      <td className={td}>{r.projectedTotal === null ? "—" : <><Money usd={r.projectedTotal} /> <ValueClassBadge kind="modeled" /></>}</td>
                      <td className={td}>{r.status === "running" && <form action={endRunAction}><input type="hidden" name="id" value={r.id} /><Button type="submit">End</Button></form>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="API token usage (last 24 h, OTLP)" subtitle="Per project and model. Cost calculated from matched published prices; unmatched requests are counted but not priced." />
        {data.usage.length === 0 ? (
          <CardBody><EmptyState title="No GenAI spans received in the last 24 hours">Send OTLP/HTTP JSON traces to /api/ingest/otlp/v1/traces (see Monitoring page).</EmptyState></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr><th className={th}>Project</th><th className={th}>Model</th><th className={th}>Requests</th><th className={th}>Input</th><th className={th}>Output</th><th className={th}>Errors</th><th className={th}>Calculated cost</th></tr></thead>
              <tbody>
                {data.usage.map((u, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className={td}>{u.project ?? "—"}</td>
                    <td className={td}>{u.model ?? "—"}<div className="text-[11px] text-muted">{u.provider}</div></td>
                    <td className={`${td} num`}>{fmtNum(u.requests, 0)}</td>
                    <td className={`${td} num`}>{fmtTokens(u.inputTokens)}</td>
                    <td className={`${td} num`}>{fmtTokens(u.outputTokens)}</td>
                    <td className={`${td} num`}>{u.requests ? `${((u.errors / u.requests) * 100).toFixed(1)}%` : "—"}</td>
                    <td className={td}>{u.cost === null ? <span className="text-faint">no price match</span> : <Money usd={u.cost} />}{u.unpriced > 0 && u.cost !== null && <div className="text-[11px] text-warn">{u.unpriced} unpriced</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
