import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { RLCalculator } from "./calculator";

export const metadata: Metadata = { title: "Reinforcement Learning" };

export default function RLPage() {
  return (
    <>
      <PageHeader
        eyebrow="Reinforcement Learning & Post-Training"
        title="RLHF, PPO, GRPO, RLOO, DPO & agent-RL cost model"
        description="Online RL pays for rollout generation, scoring and optimisation every step; offline preference optimisation (DPO) and reward-model training are supervised passes over fixed data. This model keeps those structures separate."
        actions={<ValueClassBadge kind="modeled" />}
      />
      <RLCalculator />
    </>
  );
}
