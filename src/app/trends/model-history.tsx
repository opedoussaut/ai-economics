"use client";

import { useState } from "react";
import { TimeSeriesChart } from "@/components/charts";
import { EmptyState, inputClass, td, th } from "@/components/ui";
import { Money } from "@/components/currency";

export interface HistoryOption {
  id: string;
  label: string;
  rows: { at: string; input: number | null; output: number | null; origin: string }[];
}

export function ModelHistory({ options }: { options: HistoryOption[] }) {
  const [id, setId] = useState(options[0]?.id ?? "");
  const opt = options.find((o) => o.id === id);
  if (options.length === 0) return <EmptyState title="No offering has more than one recorded price yet" />;
  // Extend the last observed price to today so the step line shows its current level.
  const data = opt ? [...opt.rows.map((r) => ({ date: r.at, Input: r.input, Output: r.output })), { date: new Date().toISOString().slice(0, 10), Input: opt.rows.at(-1)!.input, Output: opt.rows.at(-1)!.output }] : [];
  return (
    <div className="space-y-4">
      <select aria-label="Offering" className={`${inputClass} max-w-xl`} value={id} onChange={(e) => setId(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label} ({o.rows.length} observations)</option>)}
      </select>
      {opt && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <TimeSeriesChart data={data} step series={[{ key: "Input", label: "Input $/1M" }, { key: "Output", label: "Output $/1M" }]} />
          <table className="h-fit w-full text-xs">
            <thead className="border-b border-border"><tr><th className={th}>Observed</th><th className={th}>Input</th><th className={th}>Output</th><th className={th}>Origin</th></tr></thead>
            <tbody>
              {opt.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className={td}>{r.at}</td><td className={td}><Money usd={r.input} /></td><td className={td}><Money usd={r.output} /></td>
                  <td className={`${td} text-faint`}>{r.origin.replace("backfill:", "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
