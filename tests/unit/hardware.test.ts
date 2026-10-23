import { describe, expect, it } from "vitest";
import { accumulateGpuHours, facilityKwhPerGpuHour, hourlyCost, powerCostPerGpuHour, type HardwareInputs } from "@/lib/calc/hardware";
import { computeInference } from "@/lib/calc/inference";
import { convert, perMillion } from "@/lib/money";

const power = { gpuPowerW: 700, hostPowerPerGpuW: 300, pue: 1.3, electricityPerKwh: 0.1 };
const overhead = { storageBandwidthPerGpuHour: 0, softwareOpsPerGpuHour: 0 };

describe("power and PUE", () => {
  it("multiplies IT load by PUE", () => {
    expect(facilityKwhPerGpuHour(power).toNumber()).toBeCloseTo(1.3, 12);
    expect(powerCostPerGpuHour(power).toNumber()).toBeCloseTo(0.13, 12);
  });
  it("rejects PUE below 1", () => {
    expect(() => facilityKwhPerGpuHour({ ...power, pue: 0.9 })).toThrow();
  });
});

describe("rental electricity is not double counted", () => {
  const rent: HardwareInputs = { mode: "rent", rentalPerGpuHour: 2.5, rentalIncludesPower: true, ...power, ...overhead };
  it("adds nothing for power when the rental includes it", () => {
    const h = hourlyCost(rent);
    expect(h.perGpuHour.toNumber()).toBe(2.5);
    expect(h.lines.map((l) => l.key)).toEqual(["rental"]);
  });
  it("adds electricity only when explicitly excluded by the contract", () => {
    const h = hourlyCost({ ...rent, rentalIncludesPower: false });
    expect(h.perGpuHour.toNumber()).toBeCloseTo(2.63, 12);
  });
});

describe("hardware depreciation", () => {
  const own: HardwareInputs = {
    mode: "own", gpuPrice: 30_000, serverNetworkPerGpu: 10_000, usefulLifeYears: 4, residualValuePct: 10,
    costOfCapitalPct: 0, maintenancePctPerYear: 0, facilityPerGpuHour: 0, ...power, electricityPerKwh: 0, ...overhead,
  };
  it("straight-line depreciation net of residual value", () => {
    const h = hourlyCost(own);
    // (40,000 − 4,000) / 4 / 8760
    expect(h.perGpuHour.toNumber()).toBeCloseTo(36_000 / 4 / 8760, 10);
    expect(h.capexPerGpu.toNumber()).toBe(40_000);
  });
  it("adds a separate cost-of-capital line when financing", () => {
    const h = hourlyCost({ ...own, costOfCapitalPct: 8 });
    expect(h.lines.some((l) => l.key === "capital")).toBe(true);
    expect(h.perGpuHour.toNumber()).toBeGreaterThan(36_000 / 4 / 8760);
  });
});

describe("GPU-hour accumulation", () => {
  it("sums gpuCount × seconds", () => {
    const h = accumulateGpuHours([
      { gpuCount: 8, seconds: 3600 },
      { gpuCount: 4, seconds: 1800 },
      { gpuCount: 0, seconds: 999 },
    ]);
    expect(h.toNumber()).toBe(10);
  });
  it("rejects negative samples", () => {
    expect(() => accumulateGpuHours([{ gpuCount: 1, seconds: -1 }])).toThrow();
  });
});

describe("currency / unit normalisation", () => {
  const rates = { USD: 1.12, GBP: 0.84 };
  it("converts via EUR cross rates", () => {
    expect(convert(1.12, "USD", "EUR", rates)!.toNumber()).toBeCloseTo(1, 12);
    expect(convert(1, "EUR", "USD", rates)!.toNumber()).toBe(1.12);
    expect(convert(1.12, "USD", "GBP", rates)!.toNumber()).toBeCloseTo(0.84, 12);
  });
  it("returns null for unknown currencies", () => {
    expect(convert(1, "USD", "XYZ", rates)).toBeNull();
  });
  it("converts per-token to per-million exactly", () => {
    expect(perMillion(2.8e-7).toNumber()).toBe(0.28);
    expect(perMillion(0.000003).toNumber()).toBe(3);
  });
});

describe("inference unit economics", () => {
  const inputs = {
    hardware: { mode: "rent", rentalPerGpuHour: 3.6, rentalIncludesPower: true, ...power, ...overhead } as HardwareInputs,
    gpuCount: 1, utilization: 0.5, prefillTokensPerSecPerGpu: 10_000, decodeTokensPerSecPerGpu: 1_000,
    inputTokensPerRequest: 1000, outputTokensPerRequest: 100, prefixCacheHitRate: 0,
    sellInputPerM: 1, sellOutputPerM: 4,
  };
  it("allocates GPU time by phase", () => {
    const r = computeInference(inputs);
    expect(r.gpuSecondsPerRequest.toNumber()).toBeCloseTo(0.2, 12); // 0.1 + 0.1
    // $3.6/h at 50% util = $0.002 per productive second
    expect(r.costPerMOutput!.toNumber()).toBeCloseTo(2, 9);
    expect(r.costPerMInput!.toNumber()).toBeCloseTo(0.2, 9);
    expect(r.costPerRequest!.toNumber()).toBeCloseTo(0.0004, 12);
    expect(r.requestsPerDay.toNumber()).toBeCloseTo(216_000, 6);
  });
  it("computes break-even utilization", () => {
    const r = computeInference(inputs);
    // revenue/request = (1000×1 + 100×4)/1e6 = 0.0014; cost at u: 3.6×0.2/(3600u)
    expect(r.breakEvenUtilization!.toNumber()).toBeCloseTo((3.6 * 0.2) / 3600 / 0.0014, 9);
  });
  it("prefix-cache hits skip prefill compute", () => {
    const r = computeInference({ ...inputs, prefixCacheHitRate: 1 });
    expect(r.gpuSecondsPerRequest.toNumber()).toBeCloseTo(0.1, 12);
  });
});
