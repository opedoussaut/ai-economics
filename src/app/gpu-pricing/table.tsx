"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { GpuOffering } from "@/lib/data/schemas";
import { D } from "@/lib/money";
import { Money } from "@/components/currency";
import { Badge, Button, Card, CardHeader, EmptyState, cn, inputClass, td, th } from "@/components/ui";
import { downloadFile, toCsv } from "@/lib/url-state";
import { fmtDate } from "@/lib/format";

const perGpu = (v: number | null, n: number) => (v === null ? null : D(v).div(n).toDecimalPlaces(4).toNumber());

export function GpuTable({ offerings }: { offerings: GpuOffering[] }) {
  const [family, setFamily] = useState("all");
  const [kind, setKind] = useState("all");
  const [region, setRegion] = useState("all");
  const [sortSpot, setSortSpot] = useState(false);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("family");
    if (f) setFamily(f);
  }, []);
  const families = useMemo(() => [...new Set(offerings.map((o) => o.gpuFamily))].sort(), [offerings]);
  const regions = useMemo(() => [...new Set(offerings.filter((o) => o.kind === "list-price").map((o) => o.region))].sort(), [offerings]);
  const rows = useMemo(() => {
    const xs = offerings.filter((o) => o.listed && (family === "all" || o.gpuFamily === family) && (kind === "all" || o.kind === kind) && (region === "all" || o.region === region || o.kind !== "list-price"));
    const key = (o: GpuOffering) =>
      o.perGpuHourStats ? o.perGpuHourStats.median : (perGpu(sortSpot ? o.spotPerHour : o.onDemandPerHour, o.gpuCount) ?? Infinity);
    return xs.sort((a, b) => key(a) - key(b));
  }, [offerings, family, kind, region, sortSpot]);

  const exportCsv = () =>
    downloadFile(`ai-economics-gpu-prices-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((o) => ({
      offering_id: o.id, source: o.sourceId, provider: o.provider, kind: o.kind, price_scope: o.priceScope, gpu_model: o.gpuModel, gpu_count: o.gpuCount,
      region: o.region, instance_type: o.instanceType ?? "", on_demand_instance_hour: o.onDemandPerHour ?? "", spot_instance_hour: o.spotPerHour ?? "",
      reserved_1y_instance_hour: o.reserved1yPerHour ?? "", reserved_3y_instance_hour: o.reserved3yPerHour ?? "",
      on_demand_per_gpu_hour: perGpu(o.onDemandPerHour, o.gpuCount) ?? "", market_median_per_gpu_hour: o.perGpuHourStats?.median ?? "",
      market_offers: o.perGpuHourStats?.n ?? "", observed_at: o.observedAt, source_url: o.sourceUrl,
    }))));

  return (
    <Card>
      <CardHeader
        title={`GPU offerings · ${rows.length}`}
        subtitle="Per-GPU-hour = instance price ÷ GPU count. Reserved prices are the term total amortised per hour."
        actions={<Button onClick={exportCsv}><Download className="size-3.5" /> CSV</Button>}
      />
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-4">
        <select aria-label="GPU family" className={inputClass} value={family} onChange={(e) => setFamily(e.target.value)}>
          <option value="all">All GPU families</option>
          {families.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select aria-label="Offer type" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Cloud list prices + marketplace</option>
          <option value="list-price">Cloud list prices (Azure)</option>
          <option value="marketplace-aggregate">Marketplace (Vast.ai)</option>
        </select>
        <select aria-label="Region" className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="all">All Azure regions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={sortSpot} onChange={(e) => setSortSpot(e.target.checked)} /> sort cloud rows by spot price</label>
      </div>
      {rows.length === 0 ? (
        <div className="p-4"><EmptyState title="No GPU offerings match" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-panel-2/50">
              <tr>
                <th className={th}>GPU</th><th className={th}>Provider / config</th><th className={th}>Region</th>
                <th className={cn(th, "text-right")}>On-demand /GPU-h</th><th className={cn(th, "text-right")}>Spot /GPU-h</th>
                <th className={cn(th, "text-right")}>1-yr reserved /GPU-h</th><th className={cn(th, "text-right")}>Instance on-demand</th><th className={th}>Observed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border/60 last:border-0 hover:bg-panel-2/60">
                  <td className={td}>
                    <div className="font-medium">{o.gpuModel}</div>
                    <div className="text-[11px] text-muted">{o.gpuMemoryGb ? `${o.gpuMemoryGb} GB` : "memory n/a"}{o.interconnect ? ` · ${o.interconnect}` : ""}</div>
                  </td>
                  <td className={td}>
                    <div>{o.provider}</div>
                    <div className="flex flex-wrap gap-1 text-[11px] text-muted">
                      {o.kind === "marketplace-aggregate" ? <Badge tone="violet">marketplace · {o.perGpuHourStats?.n} offers</Badge> : <Badge>{o.gpuCount}× GPU · {o.vcpus ?? "?"} vCPU</Badge>}
                      {o.instanceType && <code className="text-[10px]">{o.instanceType}</code>}
                    </div>
                  </td>
                  <td className={cn(td, "text-muted")}>{o.region}</td>
                  {o.perGpuHourStats ? (
                    <>
                      <td className={cn(td, "text-right")} title="Median of live offers">
                        <Money usd={o.perGpuHourStats.median} /> <span className="text-[10px] text-faint">median</span>
                        <div className="text-[11px] text-muted">IQR <Money usd={o.perGpuHourStats.p25} />–<Money usd={o.perGpuHourStats.p75} /></div>
                      </td>
                      <td className={cn(td, "text-right text-faint")} colSpan={3}>min <Money usd={o.perGpuHourStats.min} /> · max <Money usd={o.perGpuHourStats.max} /> · per-second billing, independent hosts</td>
                    </>
                  ) : (
                    <>
                      <td className={cn(td, "text-right")}><Money usd={perGpu(o.onDemandPerHour, o.gpuCount)} /></td>
                      <td className={cn(td, "text-right text-muted")}>{o.spotPerHour !== null ? <Money usd={perGpu(o.spotPerHour, o.gpuCount)} /> : "—"}</td>
                      <td className={cn(td, "text-right text-muted")}>{o.reserved1yPerHour !== null ? <Money usd={perGpu(o.reserved1yPerHour, o.gpuCount)} /> : "—"}</td>
                      <td className={cn(td, "text-right text-muted")}><Money usd={o.onDemandPerHour} /></td>
                    </>
                  )}
                  <td className={cn(td, "whitespace-nowrap text-[11px] text-faint")}>
                    <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">source</a>
                    <div>since {fmtDate(o.observedAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
