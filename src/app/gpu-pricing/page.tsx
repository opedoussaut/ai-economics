import type { Metadata } from "next";
import { Card, CardBody, CardHeader, EmptyState, ExternalLink, Note, PageHeader } from "@/components/ui";
import { ValueClassBadge } from "@/components/value-class";
import { TimeSeriesChart } from "@/components/charts";
import { getDailyIndex, getGpuSnapshot } from "@/lib/data/store";
import { gpuFamilies, pivotIndex } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";
import { GpuTable } from "./table";
import { FamilyChart } from "./family-chart";

export const metadata: Metadata = { title: "GPU Pricing" };
export const revalidate = 300;

export default async function GpuPricingPage() {
  const [snap, index] = await Promise.all([getGpuSnapshot(), getDailyIndex()]);
  if (!snap) return <EmptyState title="No GPU price data yet">Run <code>npm run refresh</code>.</EmptyState>;
  const families = gpuFamilies(snap.offerings);
  const trend = pivotIndex(index, [
    { key: "gpu:H100:marketplace", metric: "perGpuHour", as: "H100 marketplace" },
    { key: "gpu:H200:marketplace", metric: "perGpuHour", as: "H200 marketplace" },
    { key: "gpu:B200:marketplace", metric: "perGpuHour", as: "B200 marketplace" },
    { key: "gpu:H100:cloud-list", metric: "perGpuHour", as: "H100 Azure on-demand (median)" },
  ]);
  return (
    <>
      <PageHeader
        eyebrow="GPU Pricing"
        title="AI accelerator rental prices"
        description={
          <>
            Azure list prices via the official Retail Prices API (collected {fmtDate(snap.sources.azure?.fetchedAt, true)}) and live Vast.ai marketplace statistics
            (collected {fmtDate(snap.sources.vast?.fetchedAt, true)}). Normalised to USD per GPU-hour; full-instance prices include CPUs, RAM and local storage and are
            divided by the GPU count, so configurations differ — see each row.
          </>
        }
        actions={<ValueClassBadge kind="published" />}
      />
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Per-GPU-hour price by family" subtitle="Marketplace median (Vast.ai) vs cheapest and median Azure on-demand region. USD per GPU-hour." />
          <CardBody><FamilyChart families={families} /></CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="GPU price history" subtitle="Daily snapshots since collection began. Marketplace = median of offer medians; cloud = median across regions." />
          <CardBody>
            <TimeSeriesChart data={trend} series={[{ key: "H100 marketplace", label: "H100 marketplace" }, { key: "H200 marketplace", label: "H200 marketplace" }, { key: "B200 marketplace", label: "B200 marketplace" }, { key: "H100 Azure on-demand (median)", label: "H100 Azure on-demand", dashed: true }]} />
          </CardBody>
        </Card>
      </div>
      <Note className="my-4">
        <strong>Not covered by automated collection:</strong> AWS (Price List bulk files are multi-GB; the Query API needs credentials), Google Cloud (Billing Catalog API needs
        an API key), RunPod and Lambda (pricing APIs need account keys), CoreWeave (no public price API). These are linked for manual comparison:{" "}
        <ExternalLink href="https://aws.amazon.com/ec2/instance-types/p5/">AWS P5</ExternalLink> ·{" "}
        <ExternalLink href="https://cloud.google.com/compute/gpus-pricing">Google Cloud</ExternalLink> ·{" "}
        <ExternalLink href="https://www.runpod.io/pricing">RunPod</ExternalLink> ·{" "}
        <ExternalLink href="https://lambda.ai/pricing">Lambda</ExternalLink> ·{" "}
        <ExternalLink href="https://www.coreweave.com/pricing">CoreWeave</ExternalLink>. Prices on these pages are not shown here because we do not scrape them.
      </Note>
      <GpuTable offerings={snap.offerings} />
    </>
  );
}
