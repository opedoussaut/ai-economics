"use client";

import { useMemo } from "react";
import Link from "next/link";
import { computeMeasuredRun, computeTraining } from "@/lib/calc/training";
import { allocateCost, ALLOCATION_METHODS, type AllocationMethod } from "@/lib/calc/allocation";
import { hourlyCost } from "@/lib/calc/hardware";
import { GPU_PRESETS } from "@/lib/gpu-specs";
import type { RatePreset } from "@/lib/rate-presets";
import { useUrlState } from "@/lib/url-state";
import { fmtNum, fmtTokens } from "@/lib/format";
import { Money } from "@/components/currency";
import { Card, CardBody, CardHeader, Formula, Note, Stat, cn } from "@/components/ui";
import { FieldGroup, NumberField, PercentField, SelectField } from "@/components/fields";
import { HARDWARE_DEFAULTS, HardwareFields, HourlyBreakdown, toHardwareInputs } from "@/components/hardware-fields";
import { HBarChart, SimpleLineChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";

const DEFAULTS = {
  ...HARDWARE_DEFAULTS,
  rent: 2.5,
  tab: "estimate",
  preset: "h100-sxm",
  gpus: 256,
  paramsB: 8,
  tokensB: 1000,
  epochs: 1,
  peak: 989,
  mfu: 0.4,
  goodput: 0.9,
  batchTokens: 4_000_000,
  ckptBytes: 16,
  ckpts: 5,
  storageGbMo: 0.02,
  datasetGb: 4000,
  evalHours: 500,
  // measured mode
  mElapsed: 12_000,
  mTokens: 150e9,
  mSteps: 37_500,
  mPlanned: 250_000,
  // attribution
  allocMethod: "reserved",
};

export function TrainingCalculator({ rates }: { rates: RatePreset[] }) {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const hardware = toHardwareInputs(s);
  const r = useMemo(
    () =>
      computeTraining({
        hardware, gpuCount: Math.max(1, s.gpus), paramsB: s.paramsB, uniqueDatasetTokens: s.tokensB * 1e9, epochs: s.epochs,
        peakTflopsPerGpu: s.peak, mfu: Math.min(1, Math.max(0.01, s.mfu)), goodput: Math.min(1, Math.max(0.05, s.goodput)),
        globalBatchTokens: Math.max(1, s.batchTokens), checkpointBytesPerParam: s.ckptBytes, checkpointsRetained: s.ckpts,
        storagePerGbMonth: s.storageGbMo, datasetStorageGb: s.datasetGb, evalGpuHours: s.evalHours,
      }),
    [JSON.stringify(s)], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rate = hourlyCost(hardware).perGpuHour.toNumber();
  const m = computeMeasuredRun({ elapsedGpuHours: s.mElapsed, tokensProcessed: s.mTokens, stepsCompleted: s.mSteps, totalStepsPlanned: s.mPlanned || null, ratePerGpuHour: rate });

  // Cumulative cost curve over the modeled run.
  const curve = Array.from({ length: 11 }, (_, i) => ({ pct: i * 10, "Cumulative cost": r.directComputeCost.toNumber() * (i / 10), "Tokens (B)": (r.processedTokens.toNumber() / 1e9) * (i / 10) }));
  // Attribution example: the cluster shared by this run and two others for one week.
  const weekPool = s.gpus * 168;
  const jobs = [
    { id: "This run", reservedGpuHours: weekPool * 0.6, billedGpuHours: weekPool * 0.58, usageGpuHours: weekPool * 0.6 * s.mfu * 2 },
    { id: "Eval jobs", reservedGpuHours: weekPool * 0.15, billedGpuHours: weekPool * 0.12, usageGpuHours: weekPool * 0.05 },
    { id: "Ablations", reservedGpuHours: weekPool * 0.15, billedGpuHours: weekPool * 0.15, usageGpuHours: weekPool * 0.1 },
  ];
  const alloc = allocateCost(weekPool * rate, weekPool, jobs, s.allocMethod as AllocationMethod);

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 rounded-lg border border-border bg-panel p-1 text-sm w-fit">
        {[["estimate", "Cost estimate (modeled)"], ["measured", "Actual run (measured)"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={s.tab === id} onClick={() => set({ tab: id })}
            className={cn("rounded-md px-3 py-1.5", s.tab === id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-text")}>{label}</button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Inputs" actions={<button onClick={reset} className="text-xs text-accent">Reset</button>} />
          <CardBody className="space-y-6">
            <HardwareFields s={s} set={set} rates={rates} />
            {s.tab === "estimate" ? (
              <>
                <FieldGroup title="Model & data">
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label="Parameters (active)" unit="B" value={s.paramsB} onChange={(v) => set({ paramsB: v })} />
                    <NumberField label="Unique dataset tokens" unit="B" value={s.tokensB} onChange={(v) => set({ tokensB: v })} />
                    <NumberField label="Epochs" value={s.epochs} step={0.1} onChange={(v) => set({ epochs: v })} />
                    <NumberField label="Global batch" unit="tokens" value={s.batchTokens} onChange={(v) => set({ batchTokens: v })} />
                  </div>
                </FieldGroup>
                <FieldGroup title="Cluster & efficiency">
                  <SelectField label="Accelerator preset (datasheet peak)" value={s.preset} onChange={(id) => { const p = GPU_PRESETS.find((g) => g.id === id); set(p ? { preset: id, peak: p.peakBf16Tflops, gpuW: p.tdpW } : { preset: id }); }}
                    options={GPU_PRESETS.map((g) => ({ value: g.id, label: `${g.label} — ${g.peakBf16Tflops} TFLOPS BF16 dense` }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label="GPUs" value={s.gpus} onChange={(v) => set({ gpus: Math.round(v) })} />
                    <NumberField label="Peak TFLOPS / GPU" value={s.peak} onChange={(v) => set({ peak: v })} />
                  </div>
                  <PercentField label="Model FLOPs utilization (MFU)" value={s.mfu} onChange={(v) => set({ mfu: Math.max(0.01, v) })} hint="Assumed unless measured. Includes interconnect/distributed overheads." />
                  <PercentField label="Goodput (useful time)" value={s.goodput} onChange={(v) => set({ goodput: Math.max(0.05, v) })} hint="Losses from failures, restarts and checkpoint stalls." />
                </FieldGroup>
                <FieldGroup title="Storage & evaluation">
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label="Checkpoint bytes/param" value={s.ckptBytes} onChange={(v) => set({ ckptBytes: v })} hint="~16 for mixed-precision Adam" />
                    <NumberField label="Checkpoints retained" value={s.ckpts} onChange={(v) => set({ ckpts: v })} />
                    <NumberField label="Storage $/GB-month" value={s.storageGbMo} step={0.005} onChange={(v) => set({ storageGbMo: v })} />
                    <NumberField label="Dataset size" unit="GB" value={s.datasetGb} onChange={(v) => set({ datasetGb: v })} />
                    <NumberField label="Evaluation GPU-hours" value={s.evalHours} onChange={(v) => set({ evalHours: v })} />
                  </div>
                </FieldGroup>
              </>
            ) : (
              <FieldGroup title="Measurements from your run">
                <NumberField label="GPU-hours elapsed" value={s.mElapsed} onChange={(v) => set({ mElapsed: v })} hint="From your scheduler, DCGM or billing (accumulated GPU count × time)" />
                <NumberField label="Tokens processed" value={s.mTokens} onChange={(v) => set({ mTokens: v })} />
                <NumberField label="Steps completed" value={s.mSteps} onChange={(v) => set({ mSteps: v })} />
                <NumberField label="Total steps planned" value={s.mPlanned} onChange={(v) => set({ mPlanned: v })} />
                <Note>For live runs, connect MLflow and DCGM on the <Link className="text-accent" href="/monitoring">Monitoring</Link> page to read these automatically.</Note>
              </FieldGroup>
            )}
          </CardBody>
        </Card>

        <div className="min-w-0 space-y-4">
          {s.tab === "estimate" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <Stat label="Fully loaded training cost" value={<Money usd={r.fullyLoadedCost.toNumber()} compact />} sub={<>Direct compute: <Money usd={r.directComputeCost.toNumber()} compact /></>} badge={<ValueClassBadge kind="modeled" />} />
                <Stat label="GPU-hours" value={fmtNum(r.gpuHours.toNumber(), 0, true)} sub={`${fmtNum(r.wallClockHours.toNumber() / 24, 1)} days wall-clock on ${s.gpus} GPUs`} />
                <Stat label="Cost / 1M training tokens" value={<Money usd={r.costPerMTokens.toNumber()} />} sub={`${fmtTokens(r.processedTokens.toNumber())} processed (${fmtTokens(s.tokensB * 1e9)} unique × ${s.epochs} epochs)`} />
                <Stat label="Cost / optimizer step" value={<Money usd={r.costPerStep.toNumber()} />} sub={`${fmtNum(r.steps.toNumber(), 0)} steps of ${fmtTokens(s.batchTokens)} tokens`} />
                <Stat label="Throughput" value={`${fmtNum(r.tokensPerSecPerGpu.toNumber(), 0)} tok/s/GPU`} sub={`${fmtTokens(r.clusterTokensPerSec.toNumber())} tok/s cluster (while computing)`} />
                <Stat label="Training compute" value={`${r.totalFlops.toExponential(2)} FLOPs`} sub="≈ 6 × N × processed tokens" />
                <Stat label="Facility energy" value={`${fmtNum(r.energyKwh.toNumber() / 1000, 1)} MWh`} sub={s.mode === "rent" && s.inclPower ? "Included in rental price — not added to cost" : "Included in cost via electricity × PUE"} />
                <Stat label="Checkpoint size" value={`${fmtNum(r.checkpointGb.toNumber(), 0)} GB`} sub={`${s.ckpts} retained`} />
              </div>
              <div className="grid gap-4 2xl:grid-cols-2">
                <Card>
                  <CardHeader title="Cost breakdown" actions={<ValueClassBadge kind="modeled" />} />
                  <CardBody><HBarChart data={r.costLines.map((l) => ({ label: l.label, value: l.cost.toNumber() }))} colorByIndex /></CardBody>
                </Card>
                <Card>
                  <CardHeader title="Training cost accumulation" subtitle="Direct compute cost vs share of run completed (linear at constant throughput)" />
                  <CardBody><SimpleLineChart data={curve} xKey="pct" xFormat={(v) => `${v}%`} series={[{ key: "Cumulative cost", label: "Cumulative compute cost" }]} /></CardBody>
                </Card>
              </div>
              <Card>
                <CardHeader title="Method" />
                <CardBody className="grid gap-4 lg:grid-cols-2">
                  <HourlyBreakdown lines={hourlyCost(hardware).lines} total={rate} />
                  <Formula>{`processed tokens = unique tokens × epochs (repeated epochs are processed again)
FLOPs ≈ 6 × N × processed tokens   (dense transformer; N = active params for MoE;
        excludes attention FLOPs, which grow with sequence length)
compute time = FLOPs ÷ (GPUs × peak × MFU) ; wall-clock = compute ÷ goodput
GPU-hours = wall-clock × GPUs ; direct cost = GPU-hours × fully loaded $/GPU-h
steps = ceil(processed tokens ÷ global batch tokens)
Fully loaded = compute + evaluation + checkpoint and dataset storage`}</Formula>
                </CardBody>
              </Card>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <Stat label="Cost to date" value={<Money usd={m.costToDate.toNumber()} compact />} sub={`${fmtNum(s.mElapsed, 0)} measured GPU-h × ${rate.toFixed(3)} $/GPU-h`} badge={<ValueClassBadge kind="calculated" />} />
                <Stat label="Cost per step" value={<Money usd={m.costPerStep?.toNumber()} />} badge={<ValueClassBadge kind="calculated" />} />
                <Stat label="Cost / 1M tokens processed" value={<Money usd={m.costPerMTokens?.toNumber()} />} badge={<ValueClassBadge kind="calculated" />} />
                <Stat label="Projected total (forecast)" value={<Money usd={m.projectedTotal?.toNumber()} compact />} sub="Linear extrapolation of cost/step to planned steps" badge={<ValueClassBadge kind="modeled" />} />
              </div>
              <Note>Cost to date is a calculated cost: measured GPU-hours multiplied by your documented rate. It becomes a billed cost only once reconciled with the provider invoice.</Note>
            </>
          )}
          <Card>
            <CardHeader title="Training-run cost attribution (shared cluster example)" subtitle={`One week of a ${s.gpus}-GPU pool shared by three jobs. Choose how idle and shared capacity is attributed.`}
              actions={<SelectField label="" value={s.allocMethod} onChange={(v) => set({ allocMethod: v })} options={Object.entries(ALLOCATION_METHODS).map(([k, v]) => ({ value: k, label: v.label }))} />} />
            <CardBody className="space-y-3">
              <p className="text-xs text-muted">{ALLOCATION_METHODS[s.allocMethod as AllocationMethod].description}</p>
              <HBarChart data={[...alloc.allocations.map((a) => ({ label: a.id, value: a.cost.toNumber() })), { label: "Unallocated idle", value: alloc.unallocated.toNumber(), color: "var(--faint)" }]} colorByIndex />
              <p className="text-[11px] text-faint">Allocations + unallocated always equal the pool cost (<Money usd={weekPool * rate} compact />). GPU utilisation % is never treated as an exact billing share.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
