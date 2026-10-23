import { D, Decimal, MILLION, sum } from "@/lib/money";
import { hourlyCost, type HardwareInputs } from "./hardware";

/**
 * Training cost model (modeled estimate).
 *
 * Token vocabulary — never mixed:
 *   uniqueDatasetTokens   distinct tokens in the dataset
 *   processedTokens       uniqueDatasetTokens × epochs (tokens actually fed)
 *
 * Compute approximation: training FLOPs ≈ 6 × N × processedTokens for a dense
 * transformer with N parameters (forward 2N + backward 4N per token). It
 * ignores attention FLOPs (material at long sequence lengths) and is not
 * valid for mixture-of-experts unless N is the ACTIVE parameter count.
 */
export interface TrainingInputs {
  hardware: HardwareInputs;
  gpuCount: number;
  /** Parameters (active parameters for MoE), in billions. */
  paramsB: number;
  uniqueDatasetTokens: number;
  epochs: number;
  /** Vendor peak dense TFLOPS per GPU at the training precision. */
  peakTflopsPerGpu: number;
  /** Model FLOPs utilization (assumed or measured). */
  mfu: number;
  /** Fraction of wall-clock time doing useful steps (restarts, checkpoint stalls, failures). */
  goodput: number;
  globalBatchTokens: number;
  /** Bytes per parameter in a full training checkpoint (weights + optimizer; ~16 for mixed-precision Adam). */
  checkpointBytesPerParam: number;
  checkpointsRetained: number;
  storagePerGbMonth: number;
  datasetStorageGb: number;
  evalGpuHours: number;
  flopsMultiplier?: number; // 6 for full training; fine-tuning techniques override
}

export interface TrainingResult {
  processedTokens: Decimal;
  totalFlops: Decimal;
  computeHours: Decimal;
  wallClockHours: Decimal;
  gpuHours: Decimal;
  clusterTokensPerSec: Decimal;
  tokensPerSecPerGpu: Decimal;
  steps: Decimal;
  checkpointGb: Decimal;
  energyKwh: Decimal;
  costLines: { key: string; label: string; cost: Decimal }[];
  directComputeCost: Decimal;
  fullyLoadedCost: Decimal;
  costPerMTokens: Decimal;
  costPerStep: Decimal;
}

export function computeTraining(t: TrainingInputs): TrainingResult {
  if (t.mfu <= 0 || t.mfu > 1) throw new Error("MFU must be in (0, 1]");
  if (t.goodput <= 0 || t.goodput > 1) throw new Error("Goodput must be in (0, 1]");
  const N = D(t.paramsB).mul(1e9);
  const processedTokens = D(t.uniqueDatasetTokens).mul(t.epochs);
  const totalFlops = D(t.flopsMultiplier ?? 6).mul(N).mul(processedTokens);
  const clusterFlopsPerSec = D(t.peakTflopsPerGpu).mul(1e12).mul(t.gpuCount).mul(t.mfu);
  const computeSeconds = totalFlops.div(clusterFlopsPerSec);
  const computeHours = computeSeconds.div(3600);
  const wallClockHours = computeHours.div(t.goodput);
  const gpuHours = wallClockHours.mul(t.gpuCount);
  const clusterTokensPerSec = processedTokens.div(computeSeconds);
  const hourly = hourlyCost(t.hardware);
  const months = wallClockHours.div(730).add(1); // storage held for the run + one month
  const checkpointGb = N.mul(t.checkpointBytesPerParam).div(1e9);
  const steps = processedTokens.div(t.globalBatchTokens).ceil();

  const directComputeCost = gpuHours.mul(hourly.perGpuHour);
  const costLines = [
    { key: "compute", label: "Training compute (GPU-hours × rate)", cost: directComputeCost },
    { key: "eval", label: "Evaluation runs", cost: D(t.evalGpuHours).mul(hourly.perGpuHour) },
    {
      key: "checkpoints",
      label: "Checkpoint storage",
      cost: checkpointGb.mul(t.checkpointsRetained).mul(t.storagePerGbMonth).mul(months),
    },
    { key: "dataset", label: "Dataset storage", cost: D(t.datasetStorageGb).mul(t.storagePerGbMonth).mul(months) },
  ];
  const fullyLoadedCost = sum(costLines.map((l) => l.cost));
  return {
    processedTokens,
    totalFlops,
    computeHours,
    wallClockHours,
    gpuHours,
    clusterTokensPerSec,
    tokensPerSecPerGpu: clusterTokensPerSec.div(t.gpuCount),
    steps,
    checkpointGb,
    energyKwh: gpuHours.add(t.evalGpuHours).mul(hourly.kwhPerGpuHour),
    costLines,
    directComputeCost,
    fullyLoadedCost,
    costPerMTokens: processedTokens.isZero() ? D(0) : fullyLoadedCost.div(processedTokens).mul(MILLION),
    costPerStep: steps.isZero() ? D(0) : fullyLoadedCost.div(steps),
  };
}

/** Measured-run mode: cost to date and projection from actual run telemetry. */
export interface MeasuredRunInputs {
  elapsedGpuHours: number;
  tokensProcessed: number;
  stepsCompleted: number;
  totalStepsPlanned: number | null;
  ratePerGpuHour: number;
}

export function computeMeasuredRun(m: MeasuredRunInputs) {
  const costToDate = D(m.elapsedGpuHours).mul(m.ratePerGpuHour);
  const costPerStep = m.stepsCompleted > 0 ? costToDate.div(m.stepsCompleted) : null;
  return {
    /** Calculated cost: measured GPU-hours × documented rate. */
    costToDate,
    costPerStep,
    costPerMTokens: m.tokensProcessed > 0 ? costToDate.div(m.tokensProcessed).mul(MILLION) : null,
    /** Forecast (modeled): linear extrapolation of cost per step. */
    projectedTotal:
      costPerStep && m.totalStepsPlanned ? costPerStep.mul(m.totalStepsPlanned) : null,
  };
}
