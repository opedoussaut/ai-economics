import { D, DAYS_PER_MONTH, Decimal, MILLION, safeDiv } from "@/lib/money";
import { hourlyCost, type HardwareInputs, type HourlyCost } from "./hardware";

/**
 * Self-hosted / rented-GPU inference unit economics (modeled estimate).
 *
 * Allocation methodology — "phase-time allocation":
 *   GPU-seconds per request = uncachedInputTokens / prefillRate
 *                           + outputTokens / decodeRate
 * where rates are per-GPU aggregate throughputs MEASURED OR ASSUMED by the
 * user at their chosen concurrency, batch size and quantisation. Prefix-cached
 * input tokens are treated as skipping prefill compute. Treating prefill and
 * decode as non-overlapping is conservative: continuous batching overlaps
 * them, so real costs per token can be lower. No intrinsic input/output cost
 * split is assumed beyond this time allocation.
 */
export interface InferenceInputs {
  hardware: HardwareInputs;
  gpuCount: number;
  /** Fraction of wall-clock time the GPUs do productive serving work. */
  utilization: number;
  prefillTokensPerSecPerGpu: number;
  decodeTokensPerSecPerGpu: number;
  inputTokensPerRequest: number;
  outputTokensPerRequest: number;
  prefixCacheHitRate: number;
  /** Optional selling prices, USD per 1M tokens. */
  sellInputPerM?: number | null;
  sellOutputPerM?: number | null;
  /** Context only: recorded with the scenario, not used to derive throughput. */
  context?: { modelName?: string; quantization?: string; concurrency?: number; batchSize?: number };
}

export interface InferenceResult {
  hourly: HourlyCost;
  clusterPerHour: Decimal;
  gpuSecondsPerRequest: Decimal;
  costPerMInput: Decimal | null;
  costPerMOutput: Decimal | null;
  costPerMBlended: Decimal | null;
  costPerRequest: Decimal | null;
  costPer1kRequests: Decimal | null;
  costPerMRequests: Decimal | null;
  requestsPerDay: Decimal;
  outputTokensPerDay: Decimal;
  inputTokensPerDay: Decimal;
  monthlyCost: Decimal;
  revenuePerRequest: Decimal | null;
  revenuePerDay: Decimal | null;
  grossMarginPct: Decimal | null;
  breakEvenUtilization: Decimal | null;
}

export function computeInference(i: InferenceInputs): InferenceResult {
  if (i.utilization <= 0 || i.utilization > 1) throw new Error("Utilization must be in (0, 1]");
  if (i.prefillTokensPerSecPerGpu <= 0 || i.decodeTokensPerSecPerGpu <= 0) throw new Error("Throughputs must be > 0");
  if (i.prefixCacheHitRate < 0 || i.prefixCacheHitRate > 1) throw new Error("Cache hit rate must be in [0, 1]");

  const hourly = hourlyCost(i.hardware);
  const perGpuHour = hourly.perGpuHour;
  const productiveSecPerHour = D(3600).mul(i.utilization);
  const uncachedIn = D(i.inputTokensPerRequest).mul(1 - i.prefixCacheHitRate);
  const gpuSecondsPerRequest = uncachedIn
    .div(i.prefillTokensPerSecPerGpu)
    .add(D(i.outputTokensPerRequest).div(i.decodeTokensPerSecPerGpu));

  const costPerProductiveSec = perGpuHour.div(productiveSecPerHour);
  const costPerMInput = costPerProductiveSec.div(i.prefillTokensPerSecPerGpu).mul(MILLION);
  const costPerMOutput = costPerProductiveSec.div(i.decodeTokensPerSecPerGpu).mul(MILLION);
  const costPerRequest = gpuSecondsPerRequest.isZero() ? null : costPerProductiveSec.mul(gpuSecondsPerRequest);
  const totalTokens = D(i.inputTokensPerRequest).add(i.outputTokensPerRequest);
  const costPerMBlended = costPerRequest && !totalTokens.isZero() ? costPerRequest.div(totalTokens).mul(MILLION) : null;

  const clusterProductiveSecPerDay = productiveSecPerHour.mul(24).mul(i.gpuCount);
  const requestsPerDay = gpuSecondsPerRequest.isZero() ? D(0) : clusterProductiveSecPerDay.div(gpuSecondsPerRequest);
  const clusterPerHour = perGpuHour.mul(i.gpuCount);

  let revenuePerRequest: Decimal | null = null;
  let revenuePerDay: Decimal | null = null;
  let grossMarginPct: Decimal | null = null;
  let breakEvenUtilization: Decimal | null = null;
  if (i.sellInputPerM != null && i.sellOutputPerM != null) {
    revenuePerRequest = D(i.inputTokensPerRequest).mul(i.sellInputPerM).add(D(i.outputTokensPerRequest).mul(i.sellOutputPerM)).div(MILLION);
    revenuePerDay = revenuePerRequest.mul(requestsPerDay);
    if (costPerRequest && !revenuePerRequest.isZero()) {
      grossMarginPct = revenuePerRequest.sub(costPerRequest).div(revenuePerRequest).mul(100);
      // Utilization u at which revenue per request equals cost per request.
      breakEvenUtilization = safeDiv(perGpuHour.mul(gpuSecondsPerRequest), D(3600).mul(revenuePerRequest));
    }
  }

  return {
    hourly,
    clusterPerHour,
    gpuSecondsPerRequest,
    costPerMInput,
    costPerMOutput,
    costPerMBlended,
    costPerRequest,
    costPer1kRequests: costPerRequest?.mul(1000) ?? null,
    costPerMRequests: costPerRequest?.mul(MILLION) ?? null,
    requestsPerDay,
    outputTokensPerDay: requestsPerDay.mul(i.outputTokensPerRequest),
    inputTokensPerDay: requestsPerDay.mul(i.inputTokensPerRequest),
    monthlyCost: clusterPerHour.mul(24).mul(DAYS_PER_MONTH),
    revenuePerRequest,
    revenuePerDay,
    grossMarginPct,
    breakEvenUtilization,
  };
}

/** Cost per 1M output tokens across a utilization sweep (for sensitivity charts). */
export function utilizationSweep(i: InferenceInputs, points = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
  return points.map((u) => {
    const r = computeInference({ ...i, utilization: u });
    return {
      utilization: u,
      costPerMOutput: r.costPerMOutput!.toNumber(),
      costPerMBlended: r.costPerMBlended?.toNumber() ?? null,
    };
  });
}
