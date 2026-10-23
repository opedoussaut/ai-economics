"use client";

import { useMemo } from "react";
import { computeInference, utilizationSweep, type InferenceInputs } from "@/lib/calc/inference";
import { blendedPrice } from "@/lib/calc/tokens";
import type { ApiPreset, RatePreset } from "@/lib/rate-presets";
import { useUrlState } from "@/lib/url-state";
import { fmtNum, fmtPct, fmtTokens } from "@/lib/format";
import { Money } from "@/components/currency";
import { Card, CardBody, CardHeader, Formula, Note, Stat, inputClass } from "@/components/ui";
import { FieldGroup, NumberField, PercentField } from "@/components/fields";
import { HARDWARE_DEFAULTS, HardwareFields, HourlyBreakdown, toHardwareInputs } from "@/components/hardware-fields";
import { HBarChart, SimpleLineChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";

const DEFAULTS = {
  ...HARDWARE_DEFAULTS,
  gpus: 1,
  util: 0.6,
  prefill: 20000,
  decode: 2500,
  inTok: 2000,
  outTok: 500,
  cache: 0,
  model: "70B dense, FP8",
  quant: "FP8",
  conc: 64,
  batch: 64,
  sellIn: 0,
  sellOut: 0,
  api: "",
};

export function InferenceCalculator({ rates, apis }: { rates: RatePreset[]; apis: ApiPreset[] }) {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const api = apis.find((a) => a.id === s.api) ?? null;
  const sellIn = api ? api.input : s.sellIn;
  const sellOut = api ? api.output : s.sellOut;
  const hasSell = sellIn > 0 || sellOut > 0;

  const inputs: InferenceInputs = {
    hardware: toHardwareInputs(s),
    gpuCount: Math.max(1, s.gpus),
    utilization: Math.min(1, Math.max(0.01, s.util)),
    prefillTokensPerSecPerGpu: Math.max(1, s.prefill),
    decodeTokensPerSecPerGpu: Math.max(1, s.decode),
    inputTokensPerRequest: s.inTok,
    outputTokensPerRequest: s.outTok,
    prefixCacheHitRate: s.cache,
    sellInputPerM: hasSell ? sellIn : null,
    sellOutputPerM: hasSell ? sellOut : null,
    context: { modelName: s.model, quantization: s.quant, concurrency: s.conc, batchSize: s.batch },
  };
  const r = useMemo(() => computeInference(inputs), [JSON.stringify(inputs)]); // eslint-disable-line react-hooks/exhaustive-deps
  const sweep = useMemo(() => utilizationSweep(inputs), [JSON.stringify(inputs)]); // eslint-disable-line react-hooks/exhaustive-deps
  const apiBlended = hasSell && s.inTok + s.outTok > 0 ? blendedPrice(sellIn, sellOut, s.inTok, s.outTok).toNumber() : null;
  const sweepData = sweep.map((p) => ({ util: p.utilization * 100, "Self-hosted blended $/1M": p.costPerMBlended, ...(apiBlended !== null ? { "API blended $/1M": apiBlended } : {}) }));

  const perGpuHour = r.hourly.perGpuHour.toNumber();
  const sens = [
    { label: "Utilization −20 pts", v: computeInference({ ...inputs, utilization: Math.max(0.05, inputs.utilization - 0.2) }).costPerMBlended?.toNumber() ?? 0 },
    { label: "Base case", v: r.costPerMBlended?.toNumber() ?? 0 },
    { label: "Decode throughput −30%", v: computeInference({ ...inputs, decodeTokensPerSecPerGpu: inputs.decodeTokensPerSecPerGpu * 0.7 }).costPerMBlended?.toNumber() ?? 0 },
    { label: "GPU rate +25%", v: computeInference({ ...inputs, hardware: s.mode === "rent" ? { ...inputs.hardware, rentalPerGpuHour: s.rent * 1.25 } as never : { ...inputs.hardware, gpuPrice: s.gpuPrice * 1.25 } as never }).costPerMBlended?.toNumber() ?? 0 },
    { label: "Prefix-cache hit +30 pts", v: computeInference({ ...inputs, prefixCacheHitRate: Math.min(1, s.cache + 0.3) }).costPerMBlended?.toNumber() ?? 0 },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardHeader title="Assumptions" subtitle="All inputs are shareable via the URL." actions={<button onClick={reset} className="text-xs text-accent">Reset</button>} />
        <CardBody className="space-y-6">
          <HardwareFields s={s} set={set} rates={rates} />
          <FieldGroup title="Throughput (measured or assumed)">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="GPUs" value={s.gpus} min={1} onChange={(v) => set({ gpus: Math.round(v) })} />
              <NumberField label="Prefill tok/s per GPU" value={s.prefill} onChange={(v) => set({ prefill: v })} />
              <NumberField label="Decode tok/s per GPU" value={s.decode} onChange={(v) => set({ decode: v })} hint="Aggregate across concurrent requests" />
              <NumberField label="Concurrency" value={s.conc} onChange={(v) => set({ conc: v })} />
              <NumberField label="Max batch size" value={s.batch} onChange={(v) => set({ batch: v })} />
              <label className="block"><span className="mb-1 block text-xs text-muted">Quantization</span><input className={inputClass} value={s.quant} onChange={(e) => set({ quant: e.target.value })} /></label>
            </div>
            <label className="block"><span className="mb-1 block text-xs text-muted">Model / architecture (label)</span><input className={inputClass} value={s.model} onChange={(e) => set({ model: e.target.value })} /></label>
            <PercentField label="Productive utilization" value={s.util} onChange={(v) => set({ util: Math.max(0.01, v) })} hint="Share of wall-clock time the GPUs serve at the stated throughput." />
            <Note>Concurrency, batch size and quantization are recorded as the conditions of your throughput figures. They do not change the result by themselves — re-measure throughput when you change them.</Note>
          </FieldGroup>
          <FieldGroup title="Workload">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Input tokens / request" value={s.inTok} onChange={(v) => set({ inTok: v })} />
              <NumberField label="Output tokens / request" value={s.outTok} onChange={(v) => set({ outTok: v })} />
            </div>
            <PercentField label="Prefix-cache hit rate" value={s.cache} onChange={(v) => set({ cache: v })} />
          </FieldGroup>
          <FieldGroup title="Selling price / API comparison">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Compare with a published API price</span>
              <input className={inputClass} list="api-list" placeholder="Search offerings…" defaultValue={api?.label ?? ""}
                onChange={(e) => { const m = apis.find((a) => a.label === e.target.value); set({ api: m ? m.id : "" }); }} />
              <datalist id="api-list">{apis.map((a) => <option key={a.id} value={a.label} />)}</datalist>
            </label>
            {!api && (
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Sell input $/1M" value={s.sellIn} onChange={(v) => set({ sellIn: v })} />
                <NumberField label="Sell output $/1M" value={s.sellOut} onChange={(v) => set({ sellOut: v })} />
              </div>
            )}
            {api && <p className="text-xs text-muted">Using published {api.label}: <Money usd={api.input} /> in / <Money usd={api.output} /> out per 1M. Compare only models of equivalent quality.</p>}
          </FieldGroup>
        </CardBody>
      </Card>

      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <Stat label="Infrastructure cost / hour (cluster)" value={<Money usd={r.clusterPerHour.toNumber()} />} sub={<><Money usd={perGpuHour} digits={4} /> per GPU-hour</>} badge={<ValueClassBadge kind="modeled" />} />
          <Stat label="Cost / 1M generated tokens" value={<Money usd={r.costPerMOutput?.toNumber()} />} sub="Decode-phase GPU time only" badge={<ValueClassBadge kind="modeled" />} />
          <Stat label="Cost / 1M input tokens" value={<Money usd={r.costPerMInput?.toNumber()} />} sub="Prefill-phase GPU time (uncached)" badge={<ValueClassBadge kind="modeled" />} />
          <Stat label={`Blended / 1M tokens (${fmtNum(s.inTok, 0)}:${fmtNum(s.outTok, 0)} mix)`} value={<Money usd={r.costPerMBlended?.toNumber()} />} sub="Request cost ÷ (input + output tokens)" badge={<ValueClassBadge kind="modeled" />} />
          <Stat label="Cost per request" value={<Money usd={r.costPerRequest?.toNumber()} digits={6} />} sub={<>per 1K: <Money usd={r.costPer1kRequests?.toNumber()} /> · per 1M: <Money usd={r.costPerMRequests?.toNumber()} compact /></>} />
          <Stat label="Daily capacity" value={`${fmtTokens(r.outputTokensPerDay.toNumber())} out`} sub={`${fmtNum(r.requestsPerDay.toNumber(), 0, true)} requests/day · ${fmtTokens(r.inputTokensPerDay.toNumber())} input tokens`} />
          <Stat
            label="Energy per 1M generated tokens"
            value={`${fmtNum(r.hourly.kwhPerGpuHour.div(s.decode * 3600 * Math.max(0.01, s.util)).mul(1e6).toNumber(), 3)} kWh`}
            sub={`Facility energy (IT × PUE ${s.pue}) during decode, at ${(s.util * 100).toFixed(0)}% utilization`}
            badge={<ValueClassBadge kind="modeled" />}
          />
          <Stat label="Monthly infrastructure cost" value={<Money usd={r.monthlyCost.toNumber()} compact />} sub={`${s.gpus} GPU(s), 730 h/month, utilization does not reduce rented cost`} />
          <Stat
            label="Break-even utilization"
            value={r.breakEvenUtilization ? fmtPct(r.breakEvenUtilization.toNumber() * 100) : "—"}
            sub={hasSell ? (r.breakEvenUtilization && r.breakEvenUtilization.gt(1) ? "Above 100%: unprofitable at this price even fully utilized" : <>Gross margin at current utilization: {fmtPct(r.grossMarginPct?.toNumber())}</>) : "Set a selling price or pick an API offering"}
          />
        </div>
        {hasSell && r.revenuePerDay && (
          <Note>
            Revenue estimate at {fmtPct(s.util * 100, 0)} utilization: <Money usd={r.revenuePerDay.toNumber()} /> per day vs infrastructure <Money usd={r.clusterPerHour.mul(24).toNumber()} /> per day
            (<ValueClassBadge kind="modeled" />). Contribution margin excludes sales, support and model-licensing costs.
          </Note>
        )}
        <div className="grid gap-4 2xl:grid-cols-2">
          <Card>
            <CardHeader title="Sensitivity to utilization" subtitle="Blended cost per 1M tokens for this workload mix vs utilization. Flat line = selected API price at the same mix." />
            <CardBody>
              <SimpleLineChart data={sweepData} xKey="util" xFormat={(v) => `${v}%`} series={[{ key: "Self-hosted blended $/1M", label: "Self-hosted (modeled)" }, ...(apiBlended !== null ? [{ key: "API blended $/1M", label: "API (published)", dashed: true }] : [])]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sensitivity scenarios" subtitle="Blended $/1M tokens when one assumption changes" />
            <CardBody><HBarChart data={sens.map((x) => ({ label: x.label, value: x.v }))} colorByIndex /></CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Cost build-up per GPU-hour" actions={<ValueClassBadge kind="modeled" />} />
          <CardBody className="grid gap-4 lg:grid-cols-2">
            <HourlyBreakdown lines={r.hourly.lines} total={perGpuHour} />
            <Formula>{`GPU-seconds/request = uncached_input / prefill_rate + output / decode_rate
  = ${fmtNum(s.inTok * (1 - s.cache), 0)} / ${fmtNum(s.prefill, 0)} + ${fmtNum(s.outTok, 0)} / ${fmtNum(s.decode, 0)} = ${fmtNum(r.gpuSecondsPerRequest.toNumber(), 4)} s
Cost per productive GPU-second = per-GPU-hour ÷ (3600 × utilization)
Cost/1M output = that ÷ decode_rate × 1e6 ; cost/1M input = that ÷ prefill_rate × 1e6
Break-even utilization = GPU-hour cost × GPU-s/request ÷ (3600 × revenue/request)
Phase-time allocation treats prefill and decode as non-overlapping (conservative).
No intrinsic input/output cost split is assumed beyond measured phase times.`}</Formula>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
