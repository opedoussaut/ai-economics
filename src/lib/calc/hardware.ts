import { D, Decimal, HOURS_PER_YEAR, sum } from "@/lib/money";

/**
 * Hourly cost of one accelerator, for rented or owned hardware.
 * Shared by the inference, training, fine-tuning, RL and factory models.
 */

export interface PowerInputs {
  /** Average draw per GPU while deployed (W). */
  gpuPowerW: number;
  /** Host CPU/RAM/NIC/fans attributed per GPU (W). */
  hostPowerPerGpuW: number;
  /** Power usage effectiveness of the facility (>= 1). */
  pue: number;
  electricityPerKwh: number;
}

/** Facility energy per GPU-hour in kWh (IT load × PUE). */
export function facilityKwhPerGpuHour(p: PowerInputs): Decimal {
  if (p.pue < 1) throw new Error("PUE cannot be below 1.0");
  return D(p.gpuPowerW).add(p.hostPowerPerGpuW).div(1000).mul(p.pue);
}

export function powerCostPerGpuHour(p: PowerInputs): Decimal {
  return facilityKwhPerGpuHour(p).mul(p.electricityPerKwh);
}

/**
 * Capital recovery factor: annual payment that repays `1` over `years` at `rate`.
 * With rate 0 it reduces to straight-line 1/years.
 */
export function capitalRecoveryFactor(rate: number, years: number): Decimal {
  if (years <= 0) throw new Error("Useful life must be > 0");
  if (rate === 0) return D(1).div(years);
  const r = D(rate);
  const f = r.add(1).pow(years);
  return r.mul(f).div(f.sub(1));
}

export interface OwnedHardware extends PowerInputs {
  mode: "own";
  gpuPrice: number;
  /** Server, rack and network capex attributed per GPU. */
  serverNetworkPerGpu: number;
  usefulLifeYears: number;
  residualValuePct: number;
  /** Annual cost of capital; 0 = straight-line depreciation only. */
  costOfCapitalPct: number;
  maintenancePctPerYear: number;
  /** Colocation / facility fee per GPU-hour, excluding electricity. */
  facilityPerGpuHour: number;
}

export interface RentedHardware extends PowerInputs {
  mode: "rent";
  rentalPerGpuHour: number;
  /**
   * Most cloud/marketplace rentals already include power, cooling and space.
   * Only when false is electricity added on top.
   */
  rentalIncludesPower: boolean;
}

export interface CommonOverheads {
  storageBandwidthPerGpuHour: number;
  softwareOpsPerGpuHour: number;
}

export type HardwareInputs = (OwnedHardware | RentedHardware) & CommonOverheads;

export interface HourlyCostLine {
  key: string;
  label: string;
  perGpuHour: Decimal;
}

export interface HourlyCost {
  lines: HourlyCostLine[];
  perGpuHour: Decimal;
  capexPerGpu: Decimal;
  kwhPerGpuHour: Decimal;
}

export function hourlyCost(h: HardwareInputs): HourlyCost {
  const lines: HourlyCostLine[] = [];
  let capexPerGpu = D(0);
  if (h.mode === "rent") {
    lines.push({ key: "rental", label: "GPU rental", perGpuHour: D(h.rentalPerGpuHour) });
    if (!h.rentalIncludesPower) {
      lines.push({ key: "power", label: "Electricity (not included in rental)", perGpuHour: powerCostPerGpuHour(h) });
    }
  } else {
    capexPerGpu = D(h.gpuPrice).add(h.serverNetworkPerGpu);
    const residual = capexPerGpu.mul(h.residualValuePct).div(100);
    const rate = h.costOfCapitalPct / 100;
    // Present value of residual is subtracted before annualising.
    const pvResidual = residual.div(D(1 + rate).pow(h.usefulLifeYears));
    const annualCapital = capexPerGpu.sub(pvResidual).mul(capitalRecoveryFactor(rate, h.usefulLifeYears));
    const straightLine = capexPerGpu.sub(residual).div(h.usefulLifeYears);
    lines.push({ key: "depreciation", label: "Depreciation", perGpuHour: straightLine.div(HOURS_PER_YEAR) });
    if (rate > 0) {
      lines.push({ key: "capital", label: "Cost of capital", perGpuHour: annualCapital.sub(straightLine).div(HOURS_PER_YEAR) });
    }
    lines.push({ key: "power", label: "Electricity (incl. PUE)", perGpuHour: powerCostPerGpuHour(h) });
    lines.push({
      key: "maintenance",
      label: "Maintenance",
      perGpuHour: capexPerGpu.mul(h.maintenancePctPerYear).div(100).div(HOURS_PER_YEAR),
    });
    if (h.facilityPerGpuHour > 0) {
      lines.push({ key: "facility", label: "Facility / colocation", perGpuHour: D(h.facilityPerGpuHour) });
    }
  }
  if (h.storageBandwidthPerGpuHour > 0)
    lines.push({ key: "storage", label: "Storage & bandwidth", perGpuHour: D(h.storageBandwidthPerGpuHour) });
  if (h.softwareOpsPerGpuHour > 0)
    lines.push({ key: "software", label: "Software & operations", perGpuHour: D(h.softwareOpsPerGpuHour) });

  return {
    lines,
    perGpuHour: sum(lines.map((l) => l.perGpuHour)),
    capexPerGpu,
    kwhPerGpuHour: facilityKwhPerGpuHour(h),
  };
}

/** Accumulate GPU-hours from (gpuCount, seconds) samples. */
export function accumulateGpuHours(samples: { gpuCount: number; seconds: number }[]): Decimal {
  return samples.reduce((acc, s) => {
    if (s.gpuCount < 0 || s.seconds < 0) throw new Error("GPU-hour samples must be non-negative");
    return acc.add(D(s.gpuCount).mul(s.seconds).div(3600));
  }, D(0));
}
