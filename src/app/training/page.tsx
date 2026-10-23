import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { getGpuSnapshot } from "@/lib/data/store";
import { ratePresets } from "@/lib/rate-presets";
import { TrainingCalculator } from "./calculator";

export const metadata: Metadata = { title: "Training Economics" };
export const revalidate = 300;

export default async function TrainingPage() {
  const gpus = await getGpuSnapshot();
  return (
    <>
      <PageHeader
        eyebrow="Training Economics"
        title="Pretraining & full-parameter training cost"
        description="Estimate GPU-hours, wall-clock and fully loaded cost from model size, tokens and assumed efficiency — or compute cost to date from a run's actual measurements. Estimates and measurements are kept in separate modes."
        actions={<ValueClassBadge kind="modeled" />}
      />
      <TrainingCalculator rates={gpus ? ratePresets(gpus.offerings) : []} />
    </>
  );
}
