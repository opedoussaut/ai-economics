import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getLinkCheck, getTools } from "@/lib/data/store";
import { fmtDate } from "@/lib/format";
import { ToolDirectory } from "./directory";

export const metadata: Metadata = { title: "Cost Measurement Tools" };
export const revalidate = 300;

export default async function ToolsPage() {
  const [tools, links] = await Promise.all([getTools(), getLinkCheck()]);
  const broken = new Set(
    Object.entries(links?.results ?? {}).filter(([, rs]) => rs.some((r) => !r.ok)).map(([slug]) => slug),
  );
  return (
    <>
      <PageHeader
        eyebrow="Cost Measurement Tools"
        title="Tools that measure real AI workloads"
        description={
          <>
            {tools.length} tools for measuring token usage, GPU consumption, energy and cost while workloads run. Each entry separates what the tool
            <strong> measures directly</strong> from what it <strong>estimates</strong> in money. Links last checked {fmtDate(links?.checkedAt, true)}.
          </>
        }
      />
      <ToolDirectory tools={tools} broken={[...broken]} />
    </>
  );
}
