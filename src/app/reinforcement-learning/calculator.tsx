"use client";

import { useMemo } from "react";
import { RL_METHODS, computeRL, type RLInputs, type RLMethod } from "@/lib/calc/rl";
import { useUrlState } from "@/lib/url-state";
import { fmtNum } from "@/lib/format";
import { Money } from "@/components/currency";
import { Card, CardBody, CardHeader, ExternalLink, Formula, Note, Stat, td, th } from "@/components/ui";
import { FieldGroup, NumberField, PercentField, SelectField } from "@/components/fields";
import { HBarChart, StackedBarChart } from "@/components/charts";
import { ValueClassBadge } from "@/components/value-class";

const DEFAULTS = {
  method: "grpo",
  steps: 500,
  prompts: 64,
  group: 8,
  promptTok: 600,
  genTok: 1500,
  rate: 2.5,
  genTps: 2500,
  prefillTps: 20000,
  trainTps: 3000,
  fwdTps: 9000,
  scoring: "verifier",
  judgeIn: 2000,
  judgeOut: 200,
  judgeInPrice: 0.5,
  judgeOutPrice: 2,
  envCpuSec: 2,
  cpuHour: 0.05,
  toolCalls: 0,
  toolCost: 0.001,
  idle: 0.15,
  ckptEvery: 50,
  ckptCost: 5,
  evalEvery: 50,
  evalSamples: 500,
  evalCost: 0.002,
  success: 0.35,
};

const GROUP_LABEL = { generation: "Policy generation", scoring: "Scoring & reference", optimization: "Optimisation", environment: "Environment & tools", overhead: "Checkpoint & eval" } as const;

export function RLCalculator() {
  const [s, set, reset] = useUrlState(DEFAULTS);
  const inputs: RLInputs = {
    method: s.method as RLMethod, steps: s.steps, promptsPerStep: s.prompts, rolloutsPerPrompt: Math.max(1, s.group), promptTokens: s.promptTok,
    generatedTokensPerRollout: s.genTok, ratePerGpuHour: s.rate, rolloutGenTokensPerSecPerGpu: Math.max(1, s.genTps), rolloutPrefillTokensPerSecPerGpu: Math.max(1, s.prefillTps),
    trainTokensPerSecPerGpu: Math.max(1, s.trainTps), forwardTokensPerSecPerGpu: Math.max(1, s.fwdTps), scoring: s.scoring as RLInputs["scoring"],
    judgeInputTokens: s.judgeIn, judgeOutputTokens: s.judgeOut, judgeInputPerM: s.judgeInPrice, judgeOutputPerM: s.judgeOutPrice,
    envCpuSecondsPerRollout: s.envCpuSec, cpuPerHour: s.cpuHour, toolCallsPerRollout: s.toolCalls, costPerToolCall: s.toolCost,
    idleFraction: Math.min(0.9, Math.max(0, s.idle)), checkpointEveryNSteps: s.ckptEvery, costPerCheckpoint: s.ckptCost, evalEveryNSteps: s.evalEvery,
    evalSamples: s.evalSamples, costPerEvalSample: s.evalCost, successRate: s.success > 0 ? s.success : null,
  };
  const r = useMemo(() => computeRL(inputs), [JSON.stringify(inputs)]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = RL_METHODS[s.method as RLMethod];
  // Method comparison under the same inputs.
  const comparison = (Object.keys(RL_METHODS) as RLMethod[]).map((k) => {
    const x = computeRL({ ...inputs, method: k });
    const row: Record<string, number | string> = { label: RL_METHODS[k].label.replace(/ \(.*\)/, "") };
    for (const g of x.byGroup) row[g.group] = g.perStep.toNumber();
    return row;
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardHeader title="Inputs" actions={<button onClick={reset} className="text-xs text-accent">Reset</button>} />
        <CardBody className="space-y-6">
          <FieldGroup title="Method">
            <SelectField label="Algorithm" value={s.method} onChange={(v) => set({ method: v })} options={Object.entries(RL_METHODS).map(([k, v]) => ({ value: k, label: `${v.label}${v.online ? "" : " — offline"}` }))}
              hint={m.online ? `Online: rollouts every step${m.valueModel ? "; PPO trains a value model" : "; group-relative baseline, no value model"}.` : "Offline: fixed preference pairs (chosen + rejected); no rollout generation."} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Training steps" value={s.steps} onChange={(v) => set({ steps: v })} />
              <NumberField label={m.online ? "Prompts / step" : "Pairs / step"} value={s.prompts} onChange={(v) => set({ prompts: v })} />
              {m.online && <NumberField label="Rollouts / prompt" value={s.group} onChange={(v) => set({ group: v })} hint="GRPO/RLOO group size" />}
              <NumberField label="Prompt tokens" value={s.promptTok} onChange={(v) => set({ promptTok: v })} />
              <NumberField label={m.online ? "Generated tokens / rollout" : "Response tokens"} value={s.genTok} onChange={(v) => set({ genTok: v })} />
            </div>
          </FieldGroup>
          <FieldGroup title="Compute">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="$/GPU-hour" value={s.rate} onChange={(v) => set({ rate: v })} />
              {m.online && <NumberField label="Rollout decode tok/s/GPU" value={s.genTps} onChange={(v) => set({ genTps: v })} />}
              {m.online && <NumberField label="Rollout prefill tok/s/GPU" value={s.prefillTps} onChange={(v) => set({ prefillTps: v })} />}
              <NumberField label="Trainer tok/s/GPU (fwd+bwd)" value={s.trainTps} onChange={(v) => set({ trainTps: v })} />
              <NumberField label="Forward-only tok/s/GPU" value={s.fwdTps} onChange={(v) => set({ fwdTps: v })} hint="Reference / reward model" />
            </div>
            <PercentField label="Sync / idle GPU time" value={s.idle} max={90} onChange={(v) => set({ idle: v })} hint="Generation ↔ training hand-offs, weight sync, stragglers" />
          </FieldGroup>
          {m.online && (
            <FieldGroup title="Scoring & environment">
              <SelectField label="Reward source" value={s.scoring} onChange={(v) => set({ scoring: v })} options={[{ value: "verifier", label: "Rule-based verifier / unit tests" }, { value: "reward-model", label: "Reward model (GPU)" }, { value: "judge-api", label: "Judge model via API" }]} />
              {s.scoring === "judge-api" && (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Judge input tok/call" value={s.judgeIn} onChange={(v) => set({ judgeIn: v })} />
                  <NumberField label="Judge output tok/call" value={s.judgeOut} onChange={(v) => set({ judgeOut: v })} />
                  <NumberField label="Judge $/1M in" value={s.judgeInPrice} onChange={(v) => set({ judgeInPrice: v })} />
                  <NumberField label="Judge $/1M out" value={s.judgeOutPrice} onChange={(v) => set({ judgeOutPrice: v })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Env CPU-s / rollout" value={s.envCpuSec} onChange={(v) => set({ envCpuSec: v })} />
                <NumberField label="$/CPU-hour" value={s.cpuHour} onChange={(v) => set({ cpuHour: v })} />
                <NumberField label="Tool calls / rollout" value={s.toolCalls} onChange={(v) => set({ toolCalls: v })} />
                <NumberField label="$ / tool call" value={s.toolCost} onChange={(v) => set({ toolCost: v })} />
              </div>
              <PercentField label="Successful trajectory rate" value={s.success} onChange={(v) => set({ success: v })} hint="Only meaningful if success is defined (e.g. tests pass)" />
            </FieldGroup>
          )}
          <FieldGroup title="Checkpointing & evaluation">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Checkpoint every N steps" value={s.ckptEvery} onChange={(v) => set({ ckptEvery: v })} />
              <NumberField label="$ / checkpoint" value={s.ckptCost} onChange={(v) => set({ ckptCost: v })} />
              <NumberField label="Eval every N steps" value={s.evalEvery} onChange={(v) => set({ evalEvery: v })} />
              <NumberField label="Samples / eval" value={s.evalSamples} onChange={(v) => set({ evalSamples: v })} />
              <NumberField label="$ / evaluated sample" value={s.evalCost} onChange={(v) => set({ evalCost: v })} />
            </div>
          </FieldGroup>
        </CardBody>
      </Card>
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <Stat label="End-to-end training cost" value={<Money usd={r.total.toNumber()} />} sub={`${s.steps} steps`} badge={<ValueClassBadge kind="modeled" />} />
          <Stat label="Cost per training step" value={<Money usd={r.perStep.toNumber()} />} sub={`${fmtNum(r.rolloutsPerStep.toNumber(), 0)} ${m.online ? "rollouts" : "sequences"} per step`} />
          <Stat label={m.online ? "Cost per rollout" : "Cost per sequence"} value={<Money usd={r.costPerRollout?.toNumber()} digits={5} />} sub={`${fmtNum(r.totalRollouts.toNumber(), 0, true)} total`} />
          <Stat label="Cost per successful trajectory" value={<Money usd={r.costPerSuccessfulTrajectory?.toNumber()} />} sub={m.online ? `at ${(s.success * 100).toFixed(0)}% success` : "n/a for offline methods"} />
        </div>
        <div className="grid gap-4 2xl:grid-cols-2">
          <Card>
            <CardHeader title="Per-step cost breakdown" subtitle="Generation vs scoring vs optimisation" actions={<ValueClassBadge kind="modeled" />} />
            <CardBody><HBarChart colorByIndex data={r.components.map((c) => ({ label: c.label, value: c.perStep.toNumber() }))} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Method comparison (same inputs)" subtitle="Per-step cost by phase" />
            <CardBody>
              <StackedBarChart data={comparison} series={(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => ({ key: g, label: GROUP_LABEL[g] }))} />
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Components" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border"><tr><th className={th}>Component</th><th className={th}>Phase</th><th className={th}>Per step</th><th className={th}>Whole run</th><th className={th}>Share</th></tr></thead>
              <tbody>
                {r.components.map((c) => (
                  <tr key={c.key} className="border-b border-border/60">
                    <td className={td}>{c.label}</td>
                    <td className={`${td} text-muted`}>{GROUP_LABEL[c.group]}</td>
                    <td className={td}><Money usd={c.perStep.toNumber()} /></td>
                    <td className={td}><Money usd={c.perStep.mul(s.steps).toNumber()} /></td>
                    <td className={`${td} num text-muted`}>{r.perStep.isZero() ? "—" : `${c.perStep.div(r.perStep).mul(100).toFixed(1)}%`}</td>
                  </tr>
                ))}
                <tr><td className={`${td} text-muted`} colSpan={2}>of which GPU sync/idle time</td><td className={td}><Money usd={r.idleCostPerStep.toNumber()} /></td><td className={td}><Money usd={r.idleCostPerStep.mul(s.steps).toNumber()} /></td><td /></tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Note>
          Reference implementations: <ExternalLink href="https://huggingface.co/docs/trl/index">Hugging Face TRL</ExternalLink> (GRPOTrainer, PPOTrainer, RLOOTrainer, DPOTrainer, RewardTrainer).
          Measure your actual rollout and trainer throughput (e.g. from TRL logs in W&amp;B or MLflow) and replace these assumptions.
        </Note>
        <Formula>{`rollouts/step = prompts × group size  (offline: pairs × 2 sequences)
generation GPU-s = gen tokens ÷ decode rate + prompt tokens ÷ prefill rate   (per rollout)
reference / reward-model GPU-s = (prompt+gen) tokens ÷ forward rate
policy (and PPO value model) GPU-s = (prompt+gen) tokens ÷ trainer rate
GPU components × $/GPU-s ÷ (1 − idle fraction)
judge API = calls × (in tokens × in price + out tokens × out price)
per-step = Σ components + checkpoint/N + eval samples × cost/N
cost per successful trajectory = total ÷ (rollouts × success rate)`}</Formula>
      </div>
    </div>
  );
}
