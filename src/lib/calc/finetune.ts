import { D, Decimal, MILLION } from "@/lib/money";
import { computeTraining, type TrainingInputs } from "./training";

/**
 * Fine-tuning techniques differ in compute AND memory. These factors are
 * documented approximations, exposed in the UI and overridable:
 *
 *  - Full fine-tuning: ≈6N FLOPs/token; ≈16 bytes/param resident for
 *    mixed-precision AdamW (bf16 weights + grads, fp32 master + 2 moments).
 *  - LoRA: frozen base, so weight gradients for N are skipped: ≈4N FLOPs/token
 *    (forward 2N + activation-gradient backward 2N); ≈2 bytes/param (bf16 base)
 *    plus small adapter state.
 *  - QLoRA: same FLOPs as LoRA, 4-bit base ≈0.55 bytes/param, but de-
 *    quantisation lowers achieved throughput (modelled via an MFU penalty).
 *
 * Memory figures exclude activations and KV, so they are lower bounds.
 * Quality is NOT equivalent across techniques; this compares cost only.
 */
export type FinetuneTechnique = "full" | "lora" | "qlora";

export const TECHNIQUES: Record<
  FinetuneTechnique,
  { label: string; flopsMultiplier: number; bytesPerParam: number; mfuFactor: number; checkpointBytesPerParam: number }
> = {
  full: { label: "Full-parameter SFT", flopsMultiplier: 6, bytesPerParam: 16, mfuFactor: 1, checkpointBytesPerParam: 16 },
  lora: { label: "LoRA", flopsMultiplier: 4, bytesPerParam: 2, mfuFactor: 1, checkpointBytesPerParam: 0.02 },
  qlora: { label: "QLoRA (4-bit base)", flopsMultiplier: 4, bytesPerParam: 0.55, mfuFactor: 0.7, checkpointBytesPerParam: 0.02 },
};

export function minGpusForMemory(paramsB: number, technique: FinetuneTechnique, gpuMemoryGb: number, usableFraction = 0.8) {
  const needGb = D(paramsB).mul(TECHNIQUES[technique].bytesPerParam); // 1e9 params × bytes / 1e9
  return { needGb, minGpus: Math.max(1, Math.ceil(needGb.div(D(gpuMemoryGb).mul(usableFraction)).toNumber())) };
}

export type FinetuneInputs = Omit<TrainingInputs, "flopsMultiplier" | "checkpointBytesPerParam"> & {
  technique: FinetuneTechnique;
  validationRuns: number;
  validationTokensPerRun: number;
};

export function computeFinetune(f: FinetuneInputs) {
  const tech = TECHNIQUES[f.technique];
  const r = computeTraining({
    ...f,
    mfu: Math.min(1, f.mfu * tech.mfuFactor),
    flopsMultiplier: tech.flopsMultiplier,
    checkpointBytesPerParam: tech.checkpointBytesPerParam,
  });
  // Validation: forward passes only (≈2N FLOPs/token) at the same MFU.
  const N = D(f.paramsB).mul(1e9);
  const valFlops = N.mul(2).mul(f.validationTokensPerRun).mul(f.validationRuns);
  const valGpuHours = valFlops.div(D(f.peakTflopsPerGpu).mul(1e12).mul(f.mfu * tech.mfuFactor)).div(3600);
  const ratePerGpuHour = r.gpuHours.isZero() ? D(0) : r.directComputeCost.div(r.gpuHours);
  const validationCost = valGpuHours.mul(ratePerGpuHour);
  const total = r.fullyLoadedCost.add(validationCost);
  return {
    ...r,
    technique: f.technique,
    validationGpuHours: valGpuHours,
    validationCost,
    totalJobCost: total,
    costPerMProcessedTokens: r.processedTokens.isZero() ? D(0) : total.div(r.processedTokens).mul(MILLION),
  };
}

/** Managed fine-tuning API: price per 1M training tokens × tokens × epochs. */
export function computeManagedFinetune(input: {
  pricePerMTrainingTokens: number;
  datasetTokens: number;
  epochs: number;
  fixedFees?: number;
}): { trainedTokens: Decimal; cost: Decimal } {
  const trainedTokens = D(input.datasetTokens).mul(input.epochs);
  return { trainedTokens, cost: trainedTokens.mul(input.pricePerMTrainingTokens).div(MILLION).add(input.fixedFees ?? 0) };
}
