import { D, HOURS_PER_YEAR, MILLION, safeDiv, sum } from "@/lib/money";
import { capitalRecoveryFactor } from "./hardware";

/**
 * AI factory financial model (modeled estimate, not a forecast).
 * All amounts USD. Annual figures use 8,760 hours.
 */
export interface FactoryInputs {
  gpuCount: number;
  gpuUnitPrice: number;
  /** Rack, server chassis, CPUs, NICs, switches, optics per GPU. */
  serverNetworkPerGpu: number;
  /** Data-centre build/fit-out capex per MW of IT load (0 if colocated). */
  facilityCapexPerMw: number;
  /** Available facility power (MW, total incl. PUE). */
  powerCapacityMw: number;
  gpuPowerW: number;
  hostPowerPerGpuW: number;
  pue: number;
  electricityPerKwh: number;
  /** Colocation fee per kW of IT load per month (0 if owned facility). */
  colocationPerKwMonth: number;
  /** Cooling maintenance/water etc. beyond the energy captured by PUE (annual). */
  coolingOpexPerYear: number;
  gpuDepreciationYears: number;
  facilityDepreciationYears: number;
  residualValuePct: number;
  /** Share of capex financed with debt and its annual interest rate. */
  debtFinancedPct: number;
  interestRatePct: number;
  maintenancePctPerYear: number;
  staffFte: number;
  costPerFteYear: number;
  softwarePerGpuYear: number;
  utilization: number;
  inputTokensPerSecPerGpu: number;
  outputTokensPerSecPerGpu: number;
  /** Traffic profile: input tokens per output token. */
  inputPerOutputRatio: number;
  sellInputPerM: number;
  sellOutputPerM: number;
}

export function computeFactory(f: FactoryInputs) {
  if (f.utilization < 0 || f.utilization > 1) throw new Error("Utilization must be in [0, 1]");
  const itKw = D(f.gpuPowerW).add(f.hostPowerPerGpuW).mul(f.gpuCount).div(1000);
  const facilityMw = itKw.mul(f.pue).div(1000);
  const gpuCapex = D(f.gpuUnitPrice).mul(f.gpuCount);
  const serverCapex = D(f.serverNetworkPerGpu).mul(f.gpuCount);
  const facilityCapex = D(f.facilityCapexPerMw).mul(itKw.div(1000));
  const capex = gpuCapex.add(serverCapex).add(facilityCapex);
  const hardwareCapex = gpuCapex.add(serverCapex);

  const residual = hardwareCapex.mul(f.residualValuePct).div(100);
  const depreciation = hardwareCapex.sub(residual).div(f.gpuDepreciationYears).add(
    f.facilityDepreciationYears > 0 ? facilityCapex.div(f.facilityDepreciationYears) : D(0),
  );
  const debt = capex.mul(f.debtFinancedPct).div(100);
  // Level annual debt service over the GPU life; interest = service − principal.
  const debtService = debt.isZero() ? D(0) : debt.mul(capitalRecoveryFactor(f.interestRatePct / 100, f.gpuDepreciationYears));
  const annualInterest = debt.isZero() ? D(0) : debtService.sub(debt.div(f.gpuDepreciationYears));

  // Energy: assume full deployed draw regardless of utilization (conservative).
  const annualKwh = itKw.mul(f.pue).mul(HOURS_PER_YEAR);
  const opex = [
    { key: "power", label: "Electricity", annual: annualKwh.mul(f.electricityPerKwh) },
    { key: "colocation", label: "Colocation", annual: itKw.mul(f.colocationPerKwMonth).mul(12) },
    { key: "cooling", label: "Cooling (non-energy)", annual: D(f.coolingOpexPerYear) },
    { key: "maintenance", label: "Maintenance", annual: hardwareCapex.mul(f.maintenancePctPerYear).div(100) },
    { key: "staff", label: "Staffing", annual: D(f.staffFte).mul(f.costPerFteYear) },
    { key: "software", label: "Software licences", annual: D(f.softwarePerGpuYear).mul(f.gpuCount) },
  ];
  const annualOpex = sum(opex.map((o) => o.annual));
  const annualTco = annualOpex.add(depreciation).add(annualInterest);
  const gpuHours = D(f.gpuCount).mul(HOURS_PER_YEAR);
  const gpuHourCost = annualTco.div(gpuHours);

  // Capacity via phase-time allocation: GPU-seconds per output token incl. its input share.
  const secPerOutputToken = D(1).div(f.outputTokensPerSecPerGpu).add(D(f.inputPerOutputRatio).div(f.inputTokensPerSecPerGpu));
  const productiveSec = gpuHours.mul(3600).mul(f.utilization);
  const outputTokensYear = productiveSec.div(secPerOutputToken);
  const inputTokensYear = outputTokensYear.mul(f.inputPerOutputRatio);
  const processedTokensYear = outputTokensYear.add(inputTokensYear);
  const revenue = inputTokensYear.mul(f.sellInputPerM).add(outputTokensYear.mul(f.sellOutputPerM)).div(MILLION);
  const revenuePerOutputToken = D(f.inputPerOutputRatio).mul(f.sellInputPerM).add(f.sellOutputPerM).div(MILLION);

  const ebitda = revenue.sub(annualOpex);
  const netProfit = ebitda.sub(depreciation).sub(annualInterest);
  // Break-even: revenue(u) = TCO, revenue linear in u.
  const revenueAtFull = revenuePerOutputToken.mul(gpuHours.mul(3600).div(secPerOutputToken));
  const breakEvenUtilization = safeDiv(annualTco, revenueAtFull);

  return {
    itKw,
    facilityMw,
    overCapacity: facilityMw.gt(f.powerCapacityMw),
    capexLines: [
      { key: "gpu", label: "GPUs", amount: gpuCapex },
      { key: "server", label: "Servers, racks & network", amount: serverCapex },
      { key: "facility", label: "Facility build-out", amount: facilityCapex },
    ],
    capex,
    opex,
    annualOpex,
    depreciation,
    annualInterest,
    annualTco,
    monthlyTco: annualTco.div(12),
    gpuHourCost,
    annualKwh,
    outputTokensYear,
    processedTokensYear,
    costPerMOutput: outputTokensYear.isZero() ? null : annualTco.div(outputTokensYear).mul(MILLION),
    costPerMProcessed: processedTokensYear.isZero() ? null : annualTco.div(processedTokensYear).mul(MILLION),
    revenue,
    contributionMargin: revenue.sub(opex.find((o) => o.key === "power")!.annual),
    ebitda,
    netProfit,
    breakEvenUtilization,
    // Simple payback on cash flow after interest (no discounting, no tax).
    paybackYears: ebitda.sub(annualInterest).gt(0) ? capex.div(ebitda.sub(annualInterest)) : null,
    simpleRoiPct: capex.isZero() ? null : netProfit.mul(f.gpuDepreciationYears).div(capex).mul(100),
  };
}

export interface ScenarioDelta {
  utilization: number;
  sellPriceMultiplier: number;
  electricityMultiplier: number;
  gpuPriceMultiplier: number;
}

export const DEFAULT_SCENARIOS: Record<"pessimistic" | "base" | "optimistic", ScenarioDelta> = {
  pessimistic: { utilization: -0.2, sellPriceMultiplier: 0.7, electricityMultiplier: 1.3, gpuPriceMultiplier: 1.1 },
  base: { utilization: 0, sellPriceMultiplier: 1, electricityMultiplier: 1, gpuPriceMultiplier: 1 },
  optimistic: { utilization: 0.1, sellPriceMultiplier: 1.15, electricityMultiplier: 0.85, gpuPriceMultiplier: 0.95 },
};

export function applyScenario(f: FactoryInputs, d: ScenarioDelta): FactoryInputs {
  return {
    ...f,
    utilization: Math.min(1, Math.max(0.01, f.utilization + d.utilization)),
    sellInputPerM: f.sellInputPerM * d.sellPriceMultiplier,
    sellOutputPerM: f.sellOutputPerM * d.sellPriceMultiplier,
    electricityPerKwh: f.electricityPerKwh * d.electricityMultiplier,
    gpuUnitPrice: f.gpuUnitPrice * d.gpuPriceMultiplier,
  };
}
