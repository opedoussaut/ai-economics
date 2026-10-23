import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { getGpuSnapshot } from "@/lib/data/store";
import { ratePresets } from "@/lib/rate-presets";
import { FinetuneCalculator } from "./calculator";

export const metadata: Metadata = { title: "Fine-Tuning Economics" };
export const revalidate = 300;

export default async function FineTuningPage() {
  const gpus = await getGpuSnapshot();
  return (
    <>
      <PageHeader
        eyebrow="Fine-Tuning Economics"
        title="SFT, LoRA & QLoRA cost comparison"
        description="Compare self-hosted full-parameter fine-tuning, LoRA and QLoRA — which differ in compute and memory, not just price — and a managed fine-tuning API at a price you enter from the provider's official page."
        actions={<ValueClassBadge kind="modeled" />}
      />
      <FinetuneCalculator rates={gpus ? ratePresets(gpus.offerings) : []} />
    </>
  );
}
