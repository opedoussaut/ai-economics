import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Button, Card, CardBody, CardHeader, PageHeader, inputClass } from "@/components/ui";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { createRun, endRun } from "@/lib/telemetry/runs";
import { getGpuSnapshot } from "@/lib/data/store";
import { ratePresets } from "@/lib/rate-presets";
import { LiveView } from "./live-view";
import { databaseConfigured } from "@/lib/db/client";

export const metadata: Metadata = { title: "Live telemetry", robots: { index: false } };
export const dynamic = "force-dynamic";

async function assertAdmin() {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET))) redirect("/login");
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);

async function createRunAction(formData: FormData) {
  "use server";
  await assertAdmin();
  const type = String(formData.get("type"));
  const allowed = ["api-inference", "self-hosted-inference", "pretraining", "fine-tuning", "rl", "agents"] as const;
  const gpuCount = num(formData.get("gpuCount"));
  const rate = num(formData.get("rate"));
  if (!databaseConfigured()) return;
  if (!str(formData.get("name")) || !gpuCount || gpuCount < 1 || rate === null || rate < 0 || !allowed.includes(type as never)) return;
  const mlflow = str(formData.get("mlflowRunId"));
  await createRun({
    name: str(formData.get("name"))!, type: type as (typeof allowed)[number], project: str(formData.get("project")), cluster: str(formData.get("cluster")),
    model: str(formData.get("model")), gpuCount: Math.round(gpuCount), ratePerGpuHour: rate, rateSource: str(formData.get("rateSource")),
    electricityPerKwh: num(formData.get("kwh")), plannedSteps: num(formData.get("plannedSteps")), plannedTokens: num(formData.get("plannedTokens")),
    mlflowRunId: mlflow && /^[A-Za-z0-9_-]{1,64}$/.test(mlflow) ? mlflow : null,
  });
  revalidatePath("/monitoring/live");
}

async function endRunAction(formData: FormData) {
  "use server";
  await assertAdmin();
  const id = String(formData.get("id"));
  if (/^[0-9a-f-]{36}$/.test(id)) await endRun(id);
  revalidatePath("/monitoring/live");
}

async function logoutAction() {
  "use server";
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/monitoring");
}

export default async function LivePage() {
  await assertAdmin();
  const gpus = await getGpuSnapshot();
  const presets = gpus ? ratePresets(gpus.offerings) : [];
  return (
    <>
      <PageHeader
        eyebrow="Monitoring · private"
        title="Live workloads"
        description="Values come from your connected sources at each poll. Cost to date is calculated from measured time × your documented rate; projections are forecasts."
        actions={<form action={logoutAction}><Button type="submit">Sign out</Button></form>}
      />
      <LiveView endRunAction={endRunAction} />
      <Card className="mt-4">
        <CardHeader title="Start tracking a workload run" subtitle="Captures counter baselines from connected sources at creation. Cost attribution: reserved GPUs × elapsed time × rate." />
        <CardBody>
          <form action={createRunAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block"><span className="mb-1 block text-xs text-muted">Run name *</span><input name="name" required maxLength={120} className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Workload type</span>
              <select name="type" className={inputClass} defaultValue="self-hosted-inference">
                <option value="self-hosted-inference">Self-hosted inference</option><option value="api-inference">API inference</option><option value="pretraining">Pretraining</option>
                <option value="fine-tuning">Fine-tuning</option><option value="rl">Reinforcement learning</option><option value="agents">Agents</option>
              </select></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Model</span><input name="model" className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Project</span><input name="project" className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Cluster</span><input name="cluster" className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">GPUs reserved *</span><input name="gpuCount" type="number" min={1} required className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">$ / GPU-hour *</span><input name="rate" type="number" step="any" min={0} required className={inputClass} list="rate-presets" /></label>
            <datalist id="rate-presets">{presets.map((p) => <option key={p.id} value={p.rate.toFixed(4)}>{p.label}</option>)}</datalist>
            <label className="block"><span className="mb-1 block text-xs text-muted">Rate source</span><input name="rateSource" placeholder="e.g. contract, Azure list price" className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Electricity $/kWh (owned hw)</span><input name="kwh" type="number" step="any" className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Planned tokens</span><input name="plannedTokens" type="number" className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Planned steps</span><input name="plannedSteps" type="number" className={inputClass} /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">MLflow run ID</span><input name="mlflowRunId" className={inputClass} /></label>
            <div className="flex items-end"><Button variant="primary" type="submit" disabled={!databaseConfigured()}>Start tracking</Button></div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
