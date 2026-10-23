"use client";

import { useMemo } from "react";
import { TECHNIQUES, computeFinetune, computeManagedFinetune, minGpusForMemory, type FinetuneTechnique } from "@/lib/calc/finetune";
import { GPU_PRESETS } from "@/lib/gpu-specs";
import type { RatePreset } from "@/lib/rate-presets";
import { useUrlState } from "@/lib/url-state";
import { fmtNum, fmtTokens } from "@/lib/format";
import { Money } from "@/components/currency";
import { Card, CardBody, CardHeader, ExternalLink, Formula, Note, td, th } from "@/components/ui";
import { FieldGroup, NumberField, PercentField, SelectField } from "@/components/fields";
import { HARDWARE_DEFAULTS, HardwareFields, toHardwareInputs } from "@/components/hardware-fields";
import { HBarChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";

const DEFAULTS = {
  ...HARDWARE_DEFAULTS,
  rent: 2.5,
  preset: "h100-sxm",
  paramsB: 8,
  datasetM: 50,
  epochs: 3,
  peak: 989,
  mem: 80,
  mfu: 0.35,
  goodput: 0.95,
  batchTokens: 256_000,
  valRuns: 3,
  valTokensM: 2,
  storageGbMo: 0.02,
  evalHours: 2,
  apiPrice: 0,
  apiFees: 0,
};

export function FinetuneCalculator({ rates }: { rates: RatePreset[] }) {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const results = useMemo(
    () =>
      (Object.keys(TECHNIQUES) as FinetuneTechnique[]).map((t) => {
        const mem = minGpusForMemory(s.paramsB, t, s.mem);
        return {
          t,
          mem,
          r: computeFinetune({
            technique: t, hardware: toHardwareInputs(s), gpuCount: mem.minGpus, paramsB: s.paramsB, uniqueDatasetTokens: s.datasetM * 1e6, epochs: s.epochs,
            peakTflopsPerGpu: s.peak, mfu: Math.max(0.01, s.mfu), goodput: Math.max(0.05, s.goodput), globalBatchTokens: Math.max(1, s.batchTokens),
            checkpointsRetained: s.epochs, storagePerGbMonth: s.storageGbMo, datasetStorageGb: 1, evalGpuHours: s.evalHours,
            validationRuns: s.valRuns, validationTokensPerRun: s.valTokensM * 1e6,
          }),
        };
      }),
    [JSON.stringify(s)], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const managed = s.apiPrice > 0 ? computeManagedFinetune({ pricePerMTrainingTokens: s.apiPrice, datasetTokens: s.datasetM * 1e6, epochs: s.epochs, fixedFees: s.apiFees }) : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardHeader title="Inputs" actions={<button onClick={reset} className="text-xs text-accent">Reset</button>} />
        <CardBody className="space-y-6">
          <HardwareFields s={s} set={set} rates={rates} />
          <FieldGroup title="Job">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Base model params" unit="B" value={s.paramsB} onChange={(v) => set({ paramsB: v })} />
              <NumberField label="Dataset tokens" unit="M" value={s.datasetM} onChange={(v) => set({ datasetM: v })} />
              <NumberField label="Epochs" value={s.epochs} onChange={(v) => set({ epochs: v })} />
              <NumberField label="Batch" unit="tokens/step" value={s.batchTokens} onChange={(v) => set({ batchTokens: v })} />
              <NumberField label="Validation runs" value={s.valRuns} onChange={(v) => set({ valRuns: v })} />
              <NumberField label="Tokens / validation" unit="M" value={s.valTokensM} onChange={(v) => set({ valTokensM: v })} />
              <NumberField label="Inference eval" unit="GPU-h" value={s.evalHours} onChange={(v) => set({ evalHours: v })} />
              <NumberField label="Storage" unit="$/GB-mo" value={s.storageGbMo} onChange={(v) => set({ storageGbMo: v })} />
            </div>
          </FieldGroup>
          <FieldGroup title="Accelerator">
            <SelectField label="Preset" value={s.preset} onChange={(id) => { const p = GPU_PRESETS.find((g) => g.id === id); set(p ? { preset: id, peak: p.peakBf16Tflops, mem: p.memoryGb, gpuW: p.tdpW } : { preset: id }); }}
              options={GPU_PRESETS.map((g) => ({ value: g.id, label: g.label }))} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Peak TFLOPS" value={s.peak} onChange={(v) => set({ peak: v })} />
              <NumberField label="GPU memory" unit="GB" value={s.mem} onChange={(v) => set({ mem: v })} />
            </div>
            <PercentField label="MFU (full fine-tune)" value={s.mfu} onChange={(v) => set({ mfu: Math.max(0.01, v) })} hint="QLoRA applies a 0.7× de-quantisation penalty" />
            <PercentField label="Goodput" value={s.goodput} onChange={(v) => set({ goodput: Math.max(0.05, v) })} />
          </FieldGroup>
          <FieldGroup title="Managed fine-tuning API">
            <NumberField label="Price per 1M training tokens" unit="USD" value={s.apiPrice} onChange={(v) => set({ apiPrice: v })}
              hint={<>Enter from the provider&apos;s page, e.g. <ExternalLink href="https://developers.openai.com/api/docs/pricing">OpenAI</ExternalLink> or <ExternalLink href="https://www.together.ai/pricing">Together</ExternalLink>. Not auto-collected.</>} />
            <NumberField label="Fixed / hosting fees" unit="USD" value={s.apiFees} onChange={(v) => set({ apiFees: v })} />
          </FieldGroup>
        </CardBody>
      </Card>
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader title="Technique comparison" subtitle={`${fmtTokens(s.datasetM * 1e6)} tokens × ${s.epochs} epochs on a ${s.paramsB}B model. GPU count = minimum to fit weights + optimizer state (activations excluded).`} actions={<ValueClassBadge kind="modeled" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr>
                <th className={th}>Technique</th><th className={th}>Min. memory</th><th className={th}>GPUs</th><th className={th}>GPU-hours</th><th className={th}>Wall-clock</th>
                <th className={th}>Job cost</th><th className={th}>$/1M processed tokens</th><th className={th}>Cost/step</th>
              </tr></thead>
              <tbody>
                {results.map(({ t, mem, r }) => (
                  <tr key={t} className="border-b border-border/60">
                    <td className={td}><div className="font-medium">{TECHNIQUES[t].label}</div><div className="text-[11px] text-muted">≈{TECHNIQUES[t].flopsMultiplier}N FLOPs/token · {TECHNIQUES[t].bytesPerParam} B/param</div></td>
                    <td className={`${td} num`}>{fmtNum(mem.needGb.toNumber(), 0)} GB</td>
                    <td className={`${td} num`}>{mem.minGpus}</td>
                    <td className={`${td} num`}>{fmtNum(r.gpuHours.add(r.validationGpuHours).toNumber(), 1)}</td>
                    <td className={`${td} num`}>{fmtNum(r.wallClockHours.toNumber(), 1)} h</td>
                    <td className={`${td} font-semibold`}><Money usd={r.totalJobCost.toNumber()} /></td>
                    <td className={td}><Money usd={r.costPerMProcessedTokens.toNumber()} /></td>
                    <td className={td}><Money usd={r.costPerStep.toNumber()} /></td>
                  </tr>
                ))}
                {managed && (
                  <tr>
                    <td className={td}><div className="font-medium">Managed API</div><div className="text-[11px] text-muted">your entered published price</div></td>
                    <td className={td} colSpan={4}>—</td>
                    <td className={`${td} font-semibold`}><Money usd={managed.cost.toNumber()} /></td>
                    <td className={td}><Money usd={s.apiPrice} /></td>
                    <td className={td}>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Cost per fine-tuning job" />
          <CardBody>
            <HBarChart colorByIndex data={[...results.map(({ t, r }) => ({ label: TECHNIQUES[t].label, value: r.totalJobCost.toNumber() })), ...(managed ? [{ label: "Managed API", value: managed.cost.toNumber() }] : [])]} />
          </CardBody>
        </Card>
        <Note>
          LoRA/QLoRA typically adapt a model differently from full fine-tuning and may not reach the same quality on every task; QLoRA quantises the frozen base to 4 bits.
          This page compares cost only. Memory figures are lower bounds — sequence length, micro-batch and activation checkpointing change real requirements.
        </Note>
        <Formula>{`processed tokens = dataset tokens × epochs
compute FLOPs ≈ k × N × processed tokens,  k = 6 (full), 4 (LoRA/QLoRA: frozen base weights skip weight-gradient FLOPs)
GPU-hours = FLOPs ÷ (GPUs × peak × MFU × technique factor) ÷ goodput ÷ 3600
validation ≈ 2 × N × validation tokens (forward only)
job cost = compute + validation + inference eval + checkpoint/dataset storage
managed API = price per 1M tokens × dataset tokens × epochs + fixed fees`}</Formula>
      </div>
    </div>
  );
}
