"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GpuFamilySummary } from "@/lib/analytics";
import { useCurrency } from "@/components/currency";
import { fmtMoney } from "@/lib/format";

export function FamilyChart({ families }: { families: GpuFamilySummary[] }) {
  const { convert, currency, usdPerEur } = useCurrency();
  const cur = currency === "EUR" && usdPerEur ? "EUR" : "USD";
  const data = families.map((f) => ({
    family: f.family,
    marketplace: convert(f.marketplace?.median ?? null),
    cloudMin: convert(f.cloudOnDemand?.min ?? null),
    cloudMedian: convert(f.cloudOnDemand?.median ?? null),
  }));
  const fmt = (v: number) => fmtMoney(v, cur, { digits: 2 });
  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="family" stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
          <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => (typeof v === "number" ? fmt(v) : "n/a")} cursor={{ fill: "var(--panel-2)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="marketplace" name="Vast.ai median" fill="var(--chart-1)" maxBarSize={16} />
          <Bar dataKey="cloudMin" name="Azure on-demand (cheapest region)" fill="var(--chart-2)" maxBarSize={16} />
          <Bar dataKey="cloudMedian" name="Azure on-demand (median region)" fill="var(--chart-3)" maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
