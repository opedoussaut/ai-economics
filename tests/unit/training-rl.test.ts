import { describe, expect, it } from "vitest";
import { allocateCost } from "@/lib/calc/allocation";
import { computeFactory, type FactoryInputs } from "@/lib/calc/factory";
import { computeFinetune, minGpusForMemory } from "@/lib/calc/finetune";
import type { HardwareInputs } from "@/lib/calc/hardware";
import { aggregateRolloutCosts, computeRL, type RLInputs } from "@/lib/calc/rl";
import { computeMeasuredRun, computeTraining, type TrainingInputs } from "@/lib/calc/training";

const hw: HardwareInputs = {
  mode: "rent", rentalPerGpuHour: 2, rentalIncludesPower: true, gpuPowerW: 700, hostPowerPerGpuW: 0, pue: 1,
  electricityPerKwh: 0, storageBandwidthPerGpuHour: 0, softwareOpsPerGpuHour: 0,
};
const training: TrainingInputs = {
  hardware: hw, gpuCount: 8, paramsB: 1, uniqueDatasetTokens: 1e9, epochs: 2, peakTflopsPerGpu: 1000, mfu: 0.5,
  goodput: 1, globalBatchTokens: 1e6, checkpointBytesPerParam: 16, checkpointsRetained: 0, storagePerGbMonth: 0,
  datasetStorageGb: 0, evalGpuHours: 0,
};

describe("training cost model", () => {
  it("separates unique and processed tokens and applies 6ND", () => {
    const r = computeTraining(training);
    expect(r.processedTokens.toNumber()).toBe(2e9);
    expect(r.totalFlops.toNumber()).toBe(6 * 1e9 * 2e9);
    // 1.2e19 / (8 × 1e15 × 0.5) = 3000 s
    expect(r.computeHours.toNumber()).toBeCloseTo(3000 / 3600, 12);
    expect(r.gpuHours.toNumber()).toBeCloseTo((3000 / 3600) * 8, 12);
    expect(r.steps.toNumber()).toBe(2000);
    expect(r.directComputeCost.toNumber()).toBeCloseTo((3000 / 3600) * 8 * 2, 9);
  });
  it("goodput below 1 extends wall-clock and cost", () => {
    const a = computeTraining(training);
    const b = computeTraining({ ...training, goodput: 0.8 });
    expect(b.gpuHours.div(a.gpuHours).toNumber()).toBeCloseTo(1.25, 12);
  });
  it("measured mode: calculated cost to date and linear projection", () => {
    const m = computeMeasuredRun({ elapsedGpuHours: 100, tokensProcessed: 5e8, stepsCompleted: 500, totalStepsPlanned: 2000, ratePerGpuHour: 2.5 });
    expect(m.costToDate.toNumber()).toBe(250);
    expect(m.costPerStep!.toNumber()).toBe(0.5);
    expect(m.projectedTotal!.toNumber()).toBe(1000);
    expect(m.costPerMTokens!.toNumber()).toBe(0.5);
  });
});

describe("training-run cost attribution", () => {
  const jobs = [
    { id: "a", reservedGpuHours: 40, billedGpuHours: 40, usageGpuHours: 30 },
    { id: "b", reservedGpuHours: 20, billedGpuHours: 18, usageGpuHours: 10 },
  ];
  it("reserved allocation leaves idle capacity unallocated (no hidden double counting)", () => {
    const r = allocateCost(1000, 100, jobs, "reserved");
    expect(r.allocations.map((a) => a.cost.toNumber())).toEqual([400, 200]);
    expect(r.unallocated.toNumber()).toBe(400);
    expect(r.allocated.add(r.unallocated).toNumber()).toBe(1000);
  });
  it("proportional usage distributes the whole pool and sums exactly", () => {
    const r = allocateCost(1000, 100, jobs, "proportional-usage");
    expect(r.allocations.map((a) => a.cost.toNumber())).toEqual([750, 250]);
    expect(r.unallocated.toNumber()).toBe(0);
  });
  it("rejects allocations that exceed the pool", () => {
    expect(() => allocateCost(1000, 50, jobs, "reserved")).toThrow(/double counting/);
  });
  it("billed runtime requires billing records", () => {
    expect(() => allocateCost(1000, 100, [{ id: "x", reservedGpuHours: 1, usageGpuHours: 1 }], "billed-runtime")).toThrow();
  });
});

describe("fine-tuning techniques differ", () => {
  it("LoRA uses fewer FLOPs than full fine-tuning; QLoRA needs less memory", () => {
    const base = { ...training, technique: "full" as const, validationRuns: 0, validationTokensPerRun: 0 };
    const full = computeFinetune(base);
    const lora = computeFinetune({ ...base, technique: "lora" });
    expect(lora.totalFlops.div(full.totalFlops).toNumber()).toBeCloseTo(4 / 6, 12);
    expect(minGpusForMemory(70, "full", 80).minGpus).toBeGreaterThan(minGpusForMemory(70, "qlora", 80).minGpus);
  });
});

const rl: RLInputs = {
  method: "grpo", steps: 100, promptsPerStep: 10, rolloutsPerPrompt: 8, promptTokens: 500, generatedTokensPerRollout: 1000,
  ratePerGpuHour: 3600, // $1 per GPU-second, makes arithmetic obvious
  rolloutGenTokensPerSecPerGpu: 1000, rolloutPrefillTokensPerSecPerGpu: 10_000, trainTokensPerSecPerGpu: 3000,
  forwardTokensPerSecPerGpu: 6000, scoring: "verifier", judgeInputTokens: 0, judgeOutputTokens: 0, judgeInputPerM: 0,
  judgeOutputPerM: 0, envCpuSecondsPerRollout: 0, cpuPerHour: 0, toolCallsPerRollout: 0, costPerToolCall: 0,
  idleFraction: 0, checkpointEveryNSteps: 0, costPerCheckpoint: 0, evalEveryNSteps: 0, evalSamples: 0, costPerEvalSample: 0,
  successRate: 0.25,
};

describe("RL rollout cost aggregation", () => {
  it("computes per-step components for GRPO (no value model)", () => {
    const r = computeRL(rl);
    const by = Object.fromEntries(r.components.map((c) => [c.key, c.perStep.toNumber()]));
    // 80 rollouts: gen 80k tok /1000 = 80 s + prefill 40k/10k = 4 s
    expect(by.rollout).toBeCloseTo(84, 9);
    expect(by.reference).toBeCloseTo((80 * 1500) / 6000, 9);
    expect(by.policy).toBeCloseTo((80 * 1500) / 3000, 9);
    expect(by.value).toBeUndefined();
    expect(r.total.toNumber()).toBeCloseTo((84 + 20 + 40) * 100, 6);
    expect(r.costPerRollout!.toNumber()).toBeCloseTo(144 / 80, 9);
    expect(r.costPerSuccessfulTrajectory!.toNumber()).toBeCloseTo(144 / 20, 9);
  });
  it("PPO adds a value model; DPO has no rollout generation", () => {
    expect(computeRL({ ...rl, method: "ppo" }).components.some((c) => c.key === "value")).toBe(true);
    const dpo = computeRL({ ...rl, method: "dpo" });
    expect(dpo.online).toBe(false);
    expect(dpo.components.some((c) => c.key === "rollout")).toBe(false);
  });
  it("idle time grosses up GPU components only", () => {
    const a = computeRL(rl);
    const b = computeRL({ ...rl, idleFraction: 0.2, toolCallsPerRollout: 1, costPerToolCall: 0.01 });
    const tools = b.components.find((c) => c.key === "tools")!.perStep.toNumber();
    expect(tools).toBeCloseTo(0.8, 12);
    expect(b.perStep.sub(tools).div(a.perStep).toNumber()).toBeCloseTo(1.25, 9);
  });
  it("aggregates measured rollout cost rows", () => {
    const agg = aggregateRolloutCosts([
      { rolloutId: "r1", component: "gen", cost: 1 },
      { rolloutId: "r1", component: "judge", cost: 0.5 },
      { rolloutId: "r2", component: "gen", cost: 1.5 },
    ]);
    expect(agg.total.toNumber()).toBe(3);
    expect(agg.rollouts).toBe(2);
    expect(agg.perRollout.toNumber()).toBe(1.5);
    expect(agg.byComponent.get("gen")!.toNumber()).toBe(2.5);
  });
});

describe("AI factory model", () => {
  const f: FactoryInputs = {
    gpuCount: 1000, gpuUnitPrice: 30_000, serverNetworkPerGpu: 10_000, facilityCapexPerMw: 0, powerCapacityMw: 2,
    gpuPowerW: 700, hostPowerPerGpuW: 300, pue: 1.25, electricityPerKwh: 0.08, colocationPerKwMonth: 0, coolingOpexPerYear: 0,
    gpuDepreciationYears: 5, facilityDepreciationYears: 0, residualValuePct: 0, debtFinancedPct: 0, interestRatePct: 0,
    maintenancePctPerYear: 0, staffFte: 0, costPerFteYear: 0, softwarePerGpuYear: 0, utilization: 0.5,
    inputTokensPerSecPerGpu: 10_000, outputTokensPerSecPerGpu: 1_000, inputPerOutputRatio: 0, sellInputPerM: 0, sellOutputPerM: 2,
  };
  it("computes capex, power, TCO and GPU-hour cost consistently", () => {
    const r = computeFactory(f);
    expect(r.capex.toNumber()).toBe(40_000_000);
    expect(r.itKw.toNumber()).toBe(1000);
    expect(r.facilityMw.toNumber()).toBe(1.25);
    expect(r.overCapacity).toBe(false);
    const power = 1000 * 1.25 * 8760 * 0.08;
    expect(r.annualOpex.toNumber()).toBeCloseTo(power, 6);
    expect(r.annualTco.toNumber()).toBeCloseTo(power + 8_000_000, 6);
    expect(r.gpuHourCost.toNumber()).toBeCloseTo((power + 8_000_000) / (1000 * 8760), 9);
  });
  it("break-even utilization equals TCO / revenue at 100% utilization", () => {
    const r = computeFactory(f);
    const revenueFull = 1000 * 8760 * 3600 * 1000 * 2 / 1e6;
    expect(r.breakEvenUtilization!.toNumber()).toBeCloseTo(r.annualTco.toNumber() / revenueFull, 9);
  });
});
