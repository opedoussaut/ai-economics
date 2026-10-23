import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { getGpuSnapshot, getTokenSnapshot } from "@/lib/data/store";
import { apiPresets, ratePresets } from "@/lib/rate-presets";
import { InferenceCalculator } from "./calculator";

export const metadata: Metadata = { title: "Inference Economics" };
export const revalidate = 300;

export default async function InferencePage() {
  const [gpus, tokens] = await Promise.all([getGpuSnapshot(), getTokenSnapshot()]);
  return (
    <>
      <PageHeader
        eyebrow="Inference Economics"
        title="Self-hosted & rented-GPU inference cost simulator"
        description="Model the cost of serving tokens on your own or rented GPUs, compare it with a published API price for the same workload, and find the break-even utilization. Throughputs are your measurements or assumptions — this page does not invent benchmarks."
        actions={<ValueClassBadge kind="modeled" />}
      />
      <InferenceCalculator rates={gpus ? ratePresets(gpus.offerings) : []} apis={tokens ? apiPresets(tokens.offerings) : []} />
    </>
  );
}
