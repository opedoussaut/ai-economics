"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { DEFAULT_SCENARIOS, applyScenario, computeFactory, type FactoryInputs } from "@/lib/calc/factory";
import { useUrlState, downloadFile, toCsv } from "@/lib/url-state";
import { fmtNum, fmtPct, fmtTokens } from "@/lib/format";
import { Money } from "@/components/currency";
import { Button, Card, CardBody, CardHeader, Formula, Note, Stat, td, th } from "@/components/ui";
import { FieldGroup, NumberField, PercentField } from "@/components/fields";
import { HBarChart, SimpleLineChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";

const DEFAULTS = {
  gpus: 4096, gpuPrice: 30000, serverNet: 12000, facilityPerMw: 10_000_000, capacityMw: 6, gpuW: 700, hostW: 350, pue: 1.25, kwh: 0.08,
  colo: 0, cooling: 300_000, gpuLife: 5, facilityLife: 15, residual: 10, debt: 60, interest: 8, maint: 3, fte: 25, fteCost: 180_000,
  software: 1500, util: 0.6, inTps: 25000, outTps: 3000, ratio: 3, sellIn: 0.5, sellOut: 2,
};

export function FactorySimulator() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const f: FactoryInputs = {
    gpuCount: Math.max(1, s.gpus), gpuUnitPrice: s.gpuPrice, serverNetworkPerGpu: s.serverNet, facilityCapexPerMw: s.facilityPerMw, powerCapacityMw: s.capacityMw,
    gpuPowerW: s.gpuW, hostPowerPerGpuW: s.hostW, pue: Math.max(1, s.pue), electricityPerKwh: s.kwh, colocationPerKwMonth: s.colo, coolingOpexPerYear: s.cooling,
    gpuDepreciationYears: Math.max(1, s.gpuLife), facilityDepreciationYears: s.facilityLife, residualValuePct: s.residual, debtFinancedPct: s.debt, interestRatePct: s.interest,
    maintenancePctPerYear: s.maint, staffFte: s.fte, costPerFteYear: s.fteCost, softwarePerGpuYear: s.software, utilization: s.util,
    inputTokensPerSecPerGpu: Math.max(1, s.inTps), outputTokensPerSecPerGpu: Math.max(1, s.outTps), inputPerOutputRatio: s.ratio, sellInputPerM: s.sellIn, sellOutputPerM: s.sellOut,
  };
  const r = useMemo(() => computeFactory(f), [JSON.stringify(f)]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = (Object.keys(DEFAULT_SCENARIOS) as (keyof typeof DEFAULT_SCENARIOS)[]).map((k) => ({ k, d: DEFAULT_SCENARIOS[k], r: computeFactory(applyScenario(f, DEFAULT_SCENARIOS[k])) }));
  const utilCurve = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((u) => {
    const x = computeFactory({ ...f, utilization: u });
    return { util: u * 100, "Net profit / yr": x.netProfit.toNumber(), "Cost / 1M output": x.costPerMOutput?.toNumber() ?? null };
  });

  const exportScenario = () =>
    downloadFile("ai-factory-scenarios.csv", toCsv(scenarios.map(({ k, d, r: x }) => ({
      scenario: k, utilization: applyScenario(f, d).utilization, capex_usd: x.capex.toFixed(0), annual_opex_usd: x.annualOpex.toFixed(0), annual_tco_usd: x.annualTco.toFixed(0),
      gpu_hour_cost_usd: x.gpuHourCost.toFixed(4), cost_per_m_output_usd: x.costPerMOutput?.toFixed(4) ?? "", revenue_usd: x.revenue.toFixed(0), net_profit_usd: x.netProfit.toFixed(0),
      payback_years: x.paybackYears?.toFixed(2) ?? "", break_even_utilization: x.breakEvenUtilization?.toFixed(4) ?? "",
    }))));

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardHeader title="Assumptions" actions={<button onClick={reset} className="text-xs text-accent">Reset</button>} />
        <CardBody className="space-y-6">
          <FieldGroup title="Hardware (CAPEX)">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="GPUs" value={s.gpus} onChange={(v) => set({ gpus: Math.round(v) })} />
              <NumberField label="GPU unit price" unit="USD" value={s.gpuPrice} onChange={(v) => set({ gpuPrice: v })} />
              <NumberField label="Rack/server/network per GPU" unit="USD" value={s.serverNet} onChange={(v) => set({ serverNet: v })} />
              <NumberField label="Facility build per MW (IT)" unit="USD" value={s.facilityPerMw} onChange={(v) => set({ facilityPerMw: v })} hint="0 if colocated" />
            </div>
          </FieldGroup>
          <FieldGroup title="Power & facility">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="GPU power" unit="W" value={s.gpuW} onChange={(v) => set({ gpuW: v })} />
              <NumberField label="Host/network per GPU" unit="W" value={s.hostW} onChange={(v) => set({ hostW: v })} />
              <NumberField label="PUE" value={s.pue} step={0.05} onChange={(v) => set({ pue: v })} />
              <NumberField label="Electricity" unit="USD/kWh" value={s.kwh} step={0.01} onChange={(v) => set({ kwh: v })} />
              <NumberField label="Power capacity" unit="MW" value={s.capacityMw} onChange={(v) => set({ capacityMw: v })} />
              <NumberField label="Colocation" unit="USD/kW-mo" value={s.colo} onChange={(v) => set({ colo: v })} />
              <NumberField label="Cooling (non-energy)" unit="USD/yr" value={s.cooling} onChange={(v) => set({ cooling: v })} />
            </div>
          </FieldGroup>
          <FieldGroup title="Finance & operations">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="GPU depreciation" unit="years" value={s.gpuLife} onChange={(v) => set({ gpuLife: v })} />
              <NumberField label="Facility depreciation" unit="years" value={s.facilityLife} onChange={(v) => set({ facilityLife: v })} />
              <NumberField label="Residual value" unit="%" value={s.residual} onChange={(v) => set({ residual: v })} />
              <NumberField label="Debt financed" unit="%" value={s.debt} onChange={(v) => set({ debt: v })} />
              <NumberField label="Interest rate" unit="%" value={s.interest} onChange={(v) => set({ interest: v })} />
              <NumberField label="Maintenance" unit="% hw/yr" value={s.maint} onChange={(v) => set({ maint: v })} />
              <NumberField label="Staff" unit="FTE" value={s.fte} onChange={(v) => set({ fte: v })} />
              <NumberField label="Cost per FTE" unit="USD/yr" value={s.fteCost} onChange={(v) => set({ fteCost: v })} />
              <NumberField label="Software / GPU" unit="USD/yr" value={s.software} onChange={(v) => set({ software: v })} />
            </div>
          </FieldGroup>
          <FieldGroup title="Serving & pricing">
            <PercentField label="Expected utilization" value={s.util} onChange={(v) => set({ util: v })} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Input tok/s per GPU" value={s.inTps} onChange={(v) => set({ inTps: v })} />
              <NumberField label="Output tok/s per GPU" value={s.outTps} onChange={(v) => set({ outTps: v })} />
              <NumberField label="Input:output ratio" value={s.ratio} onChange={(v) => set({ ratio: v })} hint="Traffic profile" />
              <NumberField label="Sell input $/1M" value={s.sellIn} onChange={(v) => set({ sellIn: v })} />
              <NumberField label="Sell output $/1M" value={s.sellOut} onChange={(v) => set({ sellOut: v })} />
            </div>
          </FieldGroup>
        </CardBody>
      </Card>
      <div className="min-w-0 space-y-4">
        {r.overCapacity && <Note tone="warn">Facility load {fmtNum(r.facilityMw.toNumber(), 2)} MW exceeds the {s.capacityMw} MW power capacity. Reduce GPUs or increase capacity.</Note>}
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <Stat label="Initial CAPEX" value={<Money usd={r.capex.toNumber()} compact />} sub={`${fmtNum(r.facilityMw.toNumber(), 2)} MW facility load`} badge={<ValueClassBadge kind="modeled" />} />
          <Stat label="Annual OPEX" value={<Money usd={r.annualOpex.toNumber()} compact />} sub={<>Monthly TCO <Money usd={r.monthlyTco.toNumber()} compact /></>} />
          <Stat label="Annual TCO" value={<Money usd={r.annualTco.toNumber()} compact />} sub="OPEX + depreciation + interest" />
          <Stat label="Cost per GPU-hour" value={<Money usd={r.gpuHourCost.toNumber()} />} sub="TCO ÷ (GPUs × 8,760 h)" />
          <Stat label="Cost / 1M generated tokens" value={<Money usd={r.costPerMOutput?.toNumber()} />} sub={<>Per 1M processed (in+out): <Money usd={r.costPerMProcessed?.toNumber()} /></>} />
          <Stat label="Annual capacity" value={`${fmtTokens(r.outputTokensYear.toNumber())} out`} sub={`${fmtTokens(r.processedTokensYear.toNumber())} processed tokens/yr`} />
          <Stat label="Revenue / yr" value={<Money usd={r.revenue.toNumber()} compact />} sub={<>Net profit <Money usd={r.netProfit.toNumber()} compact /> · contribution <Money usd={r.contributionMargin.toNumber()} compact /></>} />
          <Stat label="Break-even utilization" value={r.breakEvenUtilization ? fmtPct(r.breakEvenUtilization.toNumber() * 100) : "—"}
            sub={<>Payback {r.paybackYears ? `${fmtNum(r.paybackYears.toNumber(), 1)} yrs` : "not reached"} · simple ROI {fmtPct(r.simpleRoiPct?.toNumber())}</>} />
        </div>
        <div className="grid gap-4 2xl:grid-cols-2">
          <Card>
            <CardHeader title="Annual cost structure" actions={<ValueClassBadge kind="modeled" />} />
            <CardBody>
              <HBarChart colorByIndex data={[...r.opex.map((o) => ({ label: o.label, value: o.annual.toNumber() })), { label: "Depreciation", value: r.depreciation.toNumber() }, { label: "Interest", value: r.annualInterest.toNumber() }].filter((x) => x.value > 0)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sensitivity to utilization" subtitle="Annual net profit vs utilization" />
            <CardBody><SimpleLineChart data={utilCurve} xKey="util" xFormat={(v) => `${v}%`} series={[{ key: "Net profit / yr", label: "Net profit / yr" }]} /></CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Scenarios" subtitle="Sensitivity cases around your base assumptions — not forecasts." actions={<Button onClick={exportScenario}><Download className="size-3.5" /> CSV</Button>} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr><th className={th}>Case</th><th className={th}>Changes</th><th className={th}>TCO / yr</th><th className={th}>$/1M out</th><th className={th}>Revenue / yr</th><th className={th}>Net profit / yr</th><th className={th}>Payback</th></tr></thead>
              <tbody>
                {scenarios.map(({ k, d, r: x }) => (
                  <tr key={k} className="border-b border-border/60">
                    <td className={`${td} font-medium capitalize`}>{k}</td>
                    <td className={`${td} text-[11px] text-muted`}>util {d.utilization >= 0 ? "+" : ""}{d.utilization * 100} pts · price ×{d.sellPriceMultiplier} · power ×{d.electricityMultiplier} · GPU ×{d.gpuPriceMultiplier}</td>
                    <td className={td}><Money usd={x.annualTco.toNumber()} compact /></td>
                    <td className={td}><Money usd={x.costPerMOutput?.toNumber()} /></td>
                    <td className={td}><Money usd={x.revenue.toNumber()} compact /></td>
                    <td className={`${td} ${x.netProfit.lt(0) ? "text-neg" : "text-pos"}`}><Money usd={x.netProfit.toNumber()} compact /></td>
                    <td className={td}>{x.paybackYears ? `${fmtNum(x.paybackYears.toNumber(), 1)} yrs` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Formula>{`IT load = GPUs × (GPU W + host W); facility load = IT × PUE (energy at full deployed draw, conservative)
CAPEX = GPUs × (unit price + server/network) + facility $/MW × IT MW
Depreciation = (hardware − residual) ÷ GPU life + facility ÷ facility life
Interest = level debt service on debt share − straight-line principal
TCO = OPEX + depreciation + interest ; GPU-hour cost = TCO ÷ (GPUs × 8,760)
GPU-s per output token = 1/output rate + ratio/input rate (phase-time allocation)
Revenue = input tokens × in price + output tokens × out price; break-even = TCO ÷ revenue at 100% util
Payback = CAPEX ÷ (EBITDA − interest); simple ROI = net profit × GPU life ÷ CAPEX (no tax, no discounting)`}</Formula>
      </div>
    </div>
  );
}
