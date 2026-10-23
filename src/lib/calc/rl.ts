import { D, Decimal, sum } from "@/lib/money";

/**
 * Post-training / reinforcement-learning cost model (modeled estimate).
 *
 * Online methods (PPO, GRPO, RLOO, online agent RL) pay per step for:
 *   rollout generation → scoring (reward model / judge API / verifier) →
 *   reference & value forward passes → policy optimisation → environment.
 * Offline preference optimisation (DPO) and reward-model training have no
 * rollout generation: they are supervised passes over a fixed dataset.
 *
 * GPU components are expressed as GPU-seconds from user-supplied throughputs,
 * then multiplied by a $/GPU-hour rate. Synchronisation idle time is applied
 * to GPU components only.
 */
export type RLMethod = "ppo" | "grpo" | "rloo" | "online-agent" | "dpo" | "reward-model";

export const RL_METHODS: Record<RLMethod, { label: string; online: boolean; valueModel: boolean; referenceModel: boolean }> = {
  ppo: { label: "PPO (RLHF)", online: true, valueModel: true, referenceModel: true },
  grpo: { label: "GRPO", online: true, valueModel: false, referenceModel: true },
  rloo: { label: "RLOO", online: true, valueModel: false, referenceModel: true },
  "online-agent": { label: "Online agent RL", online: true, valueModel: false, referenceModel: true },
  dpo: { label: "DPO (offline preference)", online: false, valueModel: false, referenceModel: true },
  "reward-model": { label: "Reward-model training", online: false, valueModel: false, referenceModel: false },
};

export interface RLInputs {
  method: RLMethod;
  steps: number;
  /** Online: prompts per step. Offline: preference pairs per step. */
  promptsPerStep: number;
  /** Rollouts (completions) per prompt — the GRPO/RLOO group size. */
  rolloutsPerPrompt: number;
  promptTokens: number;
  generatedTokensPerRollout: number;
  ratePerGpuHour: number;
  /** Generation throughput on the rollout engine (aggregate tok/s per GPU). */
  rolloutGenTokensPerSecPerGpu: number;
  rolloutPrefillTokensPerSecPerGpu: number;
  /** Policy trainer throughput (tokens/s per GPU incl. fwd+bwd). */
  trainTokensPerSecPerGpu: number;
  /** Forward-only throughput for reference / reward / value scoring. */
  forwardTokensPerSecPerGpu: number;
  scoring: "reward-model" | "judge-api" | "verifier";
  judgeInputTokens: number;
  judgeOutputTokens: number;
  judgeInputPerM: number;
  judgeOutputPerM: number;
  /** Rule-based verifier / unit-test CPU seconds per rollout. */
  envCpuSecondsPerRollout: number;
  cpuPerHour: number;
  toolCallsPerRollout: number;
  costPerToolCall: number;
  /** Fraction of GPU time lost to synchronisation/idle between phases. */
  idleFraction: number;
  checkpointEveryNSteps: number;
  costPerCheckpoint: number;
  evalEveryNSteps: number;
  evalSamples: number;
  costPerEvalSample: number;
  /** Fraction of rollouts counted as successful (if success is defined). */
  successRate: number | null;
}

export interface RLComponent {
  key: string;
  label: string;
  group: "generation" | "scoring" | "optimization" | "environment" | "overhead";
  perStep: Decimal;
}

export function computeRL(r: RLInputs) {
  if (r.idleFraction < 0 || r.idleFraction >= 1) throw new Error("Idle fraction must be in [0, 1)");
  const m = RL_METHODS[r.method];
  const gpuSecCost = D(r.ratePerGpuHour).div(3600);
  const idleMult = D(1).div(D(1).sub(r.idleFraction));
  const rollouts = m.online ? D(r.promptsPerStep).mul(r.rolloutsPerPrompt) : D(r.promptsPerStep).mul(2); // chosen+rejected
  const seqTokens = D(r.promptTokens).add(r.generatedTokensPerRollout);
  const allSeqTokens = rollouts.mul(seqTokens);
  const genTokens = rollouts.mul(r.generatedTokensPerRollout);
  const components: RLComponent[] = [];
  const gpu = (sec: Decimal) => sec.mul(gpuSecCost).mul(idleMult);

  if (m.online) {
    // Prompts are prefilled once per rollout (no shared-prefix assumption).
    const genSec = genTokens.div(r.rolloutGenTokensPerSecPerGpu).add(rollouts.mul(r.promptTokens).div(r.rolloutPrefillTokensPerSecPerGpu));
    components.push({ key: "rollout", label: "Policy rollout generation", group: "generation", perStep: gpu(genSec) });
    if (r.scoring === "reward-model") {
      components.push({ key: "reward", label: "Reward-model inference", group: "scoring", perStep: gpu(allSeqTokens.div(r.forwardTokensPerSecPerGpu)) });
    } else if (r.scoring === "judge-api") {
      const perCall = D(r.judgeInputTokens).mul(r.judgeInputPerM).add(D(r.judgeOutputTokens).mul(r.judgeOutputPerM)).div(1e6);
      components.push({ key: "judge", label: "Judge-model API calls", group: "scoring", perStep: perCall.mul(rollouts) });
    }
    if (r.envCpuSecondsPerRollout > 0) {
      components.push({
        key: "env", label: r.scoring === "verifier" ? "Verifier / environment execution" : "Environment simulation",
        group: "environment", perStep: rollouts.mul(r.envCpuSecondsPerRollout).mul(r.cpuPerHour).div(3600),
      });
    }
    if (r.toolCallsPerRollout > 0) {
      components.push({ key: "tools", label: "Tool / API calls", group: "environment", perStep: rollouts.mul(r.toolCallsPerRollout).mul(r.costPerToolCall) });
    }
  }
  if (m.referenceModel) {
    components.push({ key: "reference", label: "Reference-model forward (KL)", group: "scoring", perStep: gpu(allSeqTokens.div(r.forwardTokensPerSecPerGpu)) });
  }
  if (m.valueModel) {
    // Value model is trained too: fwd+bwd at trainer throughput.
    components.push({ key: "value", label: "Value-model compute", group: "optimization", perStep: gpu(allSeqTokens.div(r.trainTokensPerSecPerGpu)) });
  }
  components.push({ key: "policy", label: "Policy optimisation (fwd+bwd)", group: "optimization", perStep: gpu(allSeqTokens.div(r.trainTokensPerSecPerGpu)) });

  const perStepCore = sum(components.map((c) => c.perStep));
  const ckptPerStep = r.checkpointEveryNSteps > 0 ? D(r.costPerCheckpoint).div(r.checkpointEveryNSteps) : D(0);
  const evalPerStep = r.evalEveryNSteps > 0 ? D(r.evalSamples).mul(r.costPerEvalSample).div(r.evalEveryNSteps) : D(0);
  if (!ckptPerStep.isZero()) components.push({ key: "checkpoint", label: "Checkpointing", group: "overhead", perStep: ckptPerStep });
  if (!evalPerStep.isZero()) components.push({ key: "eval", label: "Model evaluation", group: "overhead", perStep: evalPerStep });

  const perStep = perStepCore.add(ckptPerStep).add(evalPerStep);
  const total = perStep.mul(r.steps);
  const totalRollouts = rollouts.mul(r.steps);
  // GPU components were grossed up by 1/(1−idle); their idle share is perStep × idle.
  const GPU_KEYS = new Set(["rollout", "reward", "reference", "value", "policy"]);
  const idleShare = sum(components.filter((c) => GPU_KEYS.has(c.key)).map((c) => c.perStep)).mul(r.idleFraction);
  const evalSamplesTotal = r.evalEveryNSteps > 0 ? D(r.evalSamples).mul(Math.floor(r.steps / r.evalEveryNSteps)) : D(0);

  return {
    online: m.online,
    components,
    perStep,
    total,
    rolloutsPerStep: rollouts,
    totalRollouts,
    costPerRollout: totalRollouts.isZero() ? null : total.div(totalRollouts),
    costPerSuccessfulTrajectory:
      m.online && r.successRate && r.successRate > 0 ? total.div(totalRollouts.mul(r.successRate)) : null,
    costPerEvalSample: evalSamplesTotal.isZero() ? null : D(r.costPerEvalSample),
    idleCostPerStep: idleShare,
    byGroup: (["generation", "scoring", "optimization", "environment", "overhead"] as const).map((g) => ({
      group: g,
      perStep: sum(components.filter((c) => c.group === g).map((c) => c.perStep)),
    })),
  };
}

/** Aggregate measured per-rollout cost records (e.g. from telemetry). */
export function aggregateRolloutCosts(rows: { rolloutId: string; component: string; cost: number }[]) {
  const byRollout = new Map<string, Decimal>();
  const byComponent = new Map<string, Decimal>();
  for (const r of rows) {
    byRollout.set(r.rolloutId, (byRollout.get(r.rolloutId) ?? D(0)).add(r.cost));
    byComponent.set(r.component, (byComponent.get(r.component) ?? D(0)).add(r.cost));
  }
  const total = sum([...byRollout.values()]);
  return { total, rollouts: byRollout.size, perRollout: byRollout.size ? total.div(byRollout.size) : D(0), byComponent };
}
