import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { FactorySimulator } from "./simulator";

export const metadata: Metadata = { title: "AI Factory Simulator" };

export default function FactoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="AI Factory Simulator"
        title="Build-and-operate financial model for an inference AI factory"
        description="CAPEX, OPEX, total cost of ownership, token capacity, revenue, margins, break-even utilization and payback from your assumptions. Scenarios are sensitivity cases, not predictions."
        actions={<ValueClassBadge kind="modeled" />}
      />
      <FactorySimulator />
    </>
  );
}
